import express from 'express';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { db, initDb, hashPassword, verifyPassword } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const JWT_SECRET = process.env.JWT_SECRET || 'hotzonex-expenses-secret-change-me';

// run schema setup once; every request waits on this (cheap & idempotent)
export const ready = initDb();
// never let the init promise become an "unhandled rejection" (crashes the lambda)
ready.catch((e) => console.error('Database initialization failed:', e));

// wrap async handlers so a rejected promise becomes a clean 500 instead of a hang
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const today = () => new Date().toISOString().slice(0, 10);
// add n days to a YYYY-MM-DD string, returning a YYYY-MM-DD string
const addDays = (date, n) =>
  new Date(new Date((date || today()) + 'T00:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);
// the later of two YYYY-MM-DD strings (string compare works for ISO dates)
const maxDate = (a, b) => (a > b ? a : b);

export const app = express();
app.use(express.json());
app.use(async (req, res, next) => {
  try {
    await ready;
    next();
  } catch (e) {
    res.status(503).json({ error: 'Database not configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.' });
  }
});

// ----------------------------- auth -----------------------------
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
}

const api = express.Router();

api.post('/login', h(async (req, res) => {
  const { username, password } = req.body || {};
  const user = await db.get('SELECT * FROM users WHERE username = ?', username || '');
  if (!user || !verifyPassword(password || '', user.password)) {
    return res.status(401).json({ error: 'Wrong username or password' });
  }
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
}));

api.use(auth); // everything below requires a valid token

api.get('/me', (req, res) => res.json({ user: req.user }));

api.post('/change-password', h(async (req, res) => {
  const { current, next } = req.body || {};
  const user = await db.get('SELECT * FROM users WHERE id = ?', req.user.id);
  if (!verifyPassword(current || '', user.password)) return res.status(400).json({ error: 'Current password is wrong' });
  if (!next || next.length < 4) return res.status(400).json({ error: 'New password too short' });
  await db.run('UPDATE users SET password = ? WHERE id = ?', hashPassword(next), user.id);
  res.json({ ok: true });
}));

// --------------------------- categories ---------------------------
api.get('/categories', h(async (req, res) => {
  res.json(await db.all('SELECT * FROM categories ORDER BY kind, name'));
}));
api.post('/categories', h(async (req, res) => {
  const { name, kind } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const info = await db.run('INSERT INTO categories (name, kind) VALUES (?, ?)', name, kind === 'income' ? 'income' : 'expense');
    res.json({ id: info.lastInsertRowid });
  } catch {
    res.status(400).json({ error: 'Category already exists' });
  }
}));
api.delete('/categories/:id', h(async (req, res) => {
  await db.run('DELETE FROM categories WHERE id = ?', req.params.id);
  res.json({ ok: true });
}));

// ---------------------------- expenses ----------------------------
api.get('/expenses', h(async (req, res) => {
  const { from, to } = req.query;
  let sql = 'SELECT * FROM expenses';
  const params = [];
  if (from && to) { sql += ' WHERE date BETWEEN ? AND ?'; params.push(from, to); }
  sql += ' ORDER BY date DESC, id DESC';
  res.json(await db.all(sql, ...params));
}));
api.post('/expenses', h(async (req, res) => {
  const { date, category, description, amount, method } = req.body || {};
  if (!date || !amount) return res.status(400).json({ error: 'Date and amount required' });
  const info = await db.run(
    'INSERT INTO expenses (date, category, description, amount, method, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    date, category || 'General', description || '', Number(amount), method || 'cash', req.user.username);
  res.json({ id: info.lastInsertRowid });
}));
api.put('/expenses/:id', h(async (req, res) => {
  const { date, category, description, amount, method } = req.body || {};
  await db.run('UPDATE expenses SET date=?, category=?, description=?, amount=?, method=? WHERE id=?',
    date, category, description, Number(amount), method, req.params.id);
  res.json({ ok: true });
}));
api.delete('/expenses/:id', h(async (req, res) => {
  await db.run('DELETE FROM expenses WHERE id = ?', req.params.id);
  res.json({ ok: true });
}));

// ----------------------------- income -----------------------------
api.get('/income', h(async (req, res) => {
  const { from, to } = req.query;
  let sql = 'SELECT * FROM income';
  const params = [];
  if (from && to) { sql += ' WHERE date BETWEEN ? AND ?'; params.push(from, to); }
  sql += ' ORDER BY date DESC, id DESC';
  res.json(await db.all(sql, ...params));
}));
api.post('/income', h(async (req, res) => {
  const { date, source, description, amount, method } = req.body || {};
  if (!date || !amount) return res.status(400).json({ error: 'Date and amount required' });
  const info = await db.run(
    'INSERT INTO income (date, source, description, amount, method, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    date, source || 'General', description || '', Number(amount), method || 'cash', req.user.username);
  res.json({ id: info.lastInsertRowid });
}));
api.delete('/income/:id', h(async (req, res) => {
  await db.run('DELETE FROM income WHERE id = ?', req.params.id);
  res.json({ ok: true });
}));

// ---------------------------- products ----------------------------
function pieceFields(body) {
  const units = Number(body.units) || 0;
  const cost_per_unit = Number(body.cost_per_unit) || 0;
  const pieces_per_unit = Number(body.pieces_per_unit) || 1;
  const price = Number(body.price_per_piece ?? body.price) || 0;
  const cost = body.cost !== undefined && body.units === undefined
    ? Number(body.cost) || 0
    : (pieces_per_unit ? cost_per_unit / pieces_per_unit : 0);
  return { units, cost_per_unit, pieces_per_unit, price, cost };
}

api.get('/products', h(async (req, res) => {
  const rows = await db.all('SELECT * FROM products WHERE active = 1 ORDER BY name');
  rows.forEach((p) => {
    p.total_cost = p.units * p.cost_per_unit;
    p.exp_sales = p.units * p.pieces_per_unit * p.price;
    p.profit = p.exp_sales - p.total_cost;
  });
  res.json(rows);
}));
api.post('/products', h(async (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Name required' });
  const f = pieceFields(req.body || {});
  const stock = req.body.stock !== undefined && req.body.stock !== '' ? Number(req.body.stock) || 0 : f.units * f.pieces_per_unit;
  const info = await db.run(
    'INSERT INTO products (name, price, cost, stock, units, cost_per_unit, pieces_per_unit) VALUES (?, ?, ?, ?, ?, ?, ?)',
    name, f.price, f.cost, stock, f.units, f.cost_per_unit, f.pieces_per_unit);
  res.json({ id: info.lastInsertRowid });
}));
api.put('/products/:id', h(async (req, res) => {
  const { name } = req.body || {};
  const f = pieceFields(req.body || {});
  if (req.body.stock !== undefined && req.body.stock !== '') {
    await db.run('UPDATE products SET name=?, price=?, cost=?, stock=?, units=?, cost_per_unit=?, pieces_per_unit=? WHERE id=?',
      name, f.price, f.cost, Number(req.body.stock) || 0, f.units, f.cost_per_unit, f.pieces_per_unit, req.params.id);
  } else {
    await db.run('UPDATE products SET name=?, price=?, cost=?, units=?, cost_per_unit=?, pieces_per_unit=? WHERE id=?',
      name, f.price, f.cost, f.units, f.cost_per_unit, f.pieces_per_unit, req.params.id);
  }
  res.json({ ok: true });
}));
api.delete('/products/:id', h(async (req, res) => {
  await db.run('UPDATE products SET active = 0 WHERE id = ?', req.params.id);
  res.json({ ok: true });
}));

// ------------------------------ sales -----------------------------
api.get('/sales', h(async (req, res) => {
  const { from, to } = req.query;
  let sql = 'SELECT s.*, c.name AS customer_name FROM sales s LEFT JOIN customers c ON c.id = s.customer_id';
  const params = [];
  if (from && to) { sql += ' WHERE s.date BETWEEN ? AND ?'; params.push(from, to); }
  sql += ' ORDER BY s.date DESC, s.id DESC';
  res.json(await db.all(sql, ...params));
}));

api.post('/sales', h(async (req, res) => {
  const { date, product_id, qty, unit_price, is_credit, customer_id, due_date } = req.body || {};
  const q = Number(qty) || 1;
  let name = req.body.product_name;
  let price = Number(unit_price);
  if (product_id) {
    const p = await db.get('SELECT * FROM products WHERE id = ?', product_id);
    if (!p) return res.status(400).json({ error: 'Product not found' });
    name = p.name;
    if (!price && price !== 0) price = p.price;
    if (Number.isNaN(price)) price = p.price;
    if (p.stock < q) return res.status(400).json({ error: `${p.name} has only ${p.stock} in stock` });
  }
  if (!name) return res.status(400).json({ error: 'Product required' });
  if (Number.isNaN(price)) price = 0;
  const total = q * price;
  const credit = is_credit ? 1 : 0;
  if (credit && !customer_id) return res.status(400).json({ error: 'Credit sales need a customer' });

  const info = await db.run(
    'INSERT INTO sales (date, product_id, product_name, qty, unit_price, total, is_credit, customer_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    date, product_id || null, name, q, price, total, credit, customer_id || null, req.user.username);
  if (product_id) await db.run('UPDATE products SET stock = stock - ? WHERE id = ?', q, product_id);
  if (credit) {
    await db.run('INSERT INTO debts (customer_id, date, description, amount, due_date, sale_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      customer_id, date, `${q} x ${name}`, total, due_date || null, info.lastInsertRowid, req.user.username);
  }
  res.json({ id: info.lastInsertRowid });
}));
api.delete('/sales/:id', h(async (req, res) => {
  const sale = await db.get('SELECT * FROM sales WHERE id = ?', req.params.id);
  if (sale && sale.product_id) await db.run('UPDATE products SET stock = stock + ? WHERE id = ?', sale.qty, sale.product_id);
  await db.run('DELETE FROM debts WHERE sale_id = ?', req.params.id);
  await db.run('DELETE FROM sales WHERE id = ?', req.params.id);
  res.json({ ok: true });
}));

// ------------------------------ orders (POS) -----------------------------
api.post('/orders', h(async (req, res) => {
  const { date, items, is_credit, customer_id, due_date, note } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Add at least one item' });
  const credit = is_credit ? 1 : 0;
  if (credit && !customer_id) return res.status(400).json({ error: 'A credit bill needs a customer' });

  const d = date || today();
  const lines = [];
  const stockNeeded = new Map();
  let total = 0;
  for (const it of items) {
    let name = it.product_name;
    let price = Number(it.unit_price);
    const qty = Number(it.qty) || 1;
    if (it.product_id) {
      const p = await db.get('SELECT * FROM products WHERE id = ?', it.product_id);
      if (!p) return res.status(400).json({ error: 'Product not found' });
      name = p.name;
      if (Number.isNaN(price)) price = p.price;
      const nextNeeded = (stockNeeded.get(p.id) || 0) + qty;
      if (nextNeeded > p.stock) return res.status(400).json({ error: `${p.name} has only ${p.stock} in stock` });
      stockNeeded.set(p.id, nextNeeded);
    }
    if (!name) return res.status(400).json({ error: 'Each item needs a name' });
    if (Number.isNaN(price)) price = 0;
    const line = qty * price;
    total += line;
    lines.push({ product_id: it.product_id || null, name, qty, price, line });
  }

  const orderInfo = await db.run(
    'INSERT INTO orders (date, total, is_credit, customer_id, note, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    d, total, credit, customer_id || null, note || '', req.user.username);
  const orderId = orderInfo.lastInsertRowid;

  for (const l of lines) {
    await db.run(
      'INSERT INTO sales (date, product_id, product_name, qty, unit_price, total, is_credit, customer_id, order_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      d, l.product_id, l.name, l.qty, l.price, l.line, credit, customer_id || null, orderId, req.user.username);
    if (l.product_id) await db.run('UPDATE products SET stock = stock - ? WHERE id = ?', l.qty, l.product_id);
  }

  if (credit) {
    const desc = `Tab #${orderId} · ${lines.map((l) => `${l.qty}×${l.name}`).join(', ')}`;
    await db.run('INSERT INTO debts (customer_id, date, description, amount, due_date, order_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      customer_id, d, desc, total, due_date || null, orderId, req.user.username);
  }
  res.json({ id: orderId, total, lines });
}));

api.get('/orders', h(async (req, res) => {
  const { from, to } = req.query;
  let sql = `SELECT o.*, c.name AS customer_name,
      (SELECT COUNT(*) FROM sales WHERE order_id = o.id) AS item_count
    FROM orders o LEFT JOIN customers c ON c.id = o.customer_id`;
  const params = [];
  if (from && to) { sql += ' WHERE o.date BETWEEN ? AND ?'; params.push(from, to); }
  sql += ' ORDER BY o.date DESC, o.id DESC';
  res.json(await db.all(sql, ...params));
}));

api.get('/orders/:id', h(async (req, res) => {
  const order = await db.get('SELECT * FROM orders WHERE id = ?', req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  order.items = await db.all('SELECT * FROM sales WHERE order_id = ? ORDER BY id', req.params.id);
  res.json(order);
}));

api.delete('/orders/:id', h(async (req, res) => {
  const items = await db.all('SELECT * FROM sales WHERE order_id = ?', req.params.id);
  for (const s of items) {
    if (s.product_id) await db.run('UPDATE products SET stock = stock + ? WHERE id = ?', s.qty, s.product_id);
  }
  await db.run('DELETE FROM debts WHERE order_id = ?', req.params.id);
  await db.run('DELETE FROM sales WHERE order_id = ?', req.params.id);
  await db.run('DELETE FROM orders WHERE id = ?', req.params.id);
  res.json({ ok: true });
}));

api.post('/products/:id/restock', h(async (req, res) => {
  const { units, cost_per_unit, record_expense, date } = req.body || {};
  const p = await db.get('SELECT * FROM products WHERE id = ?', req.params.id);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  const u = Number(units) || 0;
  if (u <= 0) return res.status(400).json({ error: 'Number of units required' });
  const ppu = p.pieces_per_unit || 1;
  const piecesAdded = u * ppu;
  const cpu = cost_per_unit === undefined || cost_per_unit === '' ? p.cost_per_unit : Number(cost_per_unit);
  await db.run('UPDATE products SET stock = stock + ?, units = units + ?, cost_per_unit = ?, cost = ? WHERE id = ?',
    piecesAdded, u, cpu, ppu ? cpu / ppu : 0, p.id);
  if (record_expense && cpu > 0) {
    await db.run('INSERT INTO expenses (date, category, description, amount, method, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      date || today(), 'Stock Purchase', `Restock ${u} unit(s) × ${p.name}`, u * cpu, 'cash', req.user.username);
  }
  res.json({ ok: true, pieces_added: piecesAdded });
}));

// ---------------------------- customers ---------------------------
api.get('/customers', h(async (req, res) => {
  const rows = await db.all(`
    SELECT c.*,
      COALESCE((SELECT SUM(amount) FROM debts WHERE customer_id = c.id), 0) AS total_debt,
      COALESCE((SELECT SUM(p.amount) FROM debt_payments p JOIN debts d ON d.id = p.debt_id WHERE d.customer_id = c.id), 0) AS total_paid
    FROM customers c ORDER BY c.name`);
  rows.forEach((r) => { r.balance = r.total_debt - r.total_paid; });
  res.json(rows);
}));
api.post('/customers', h(async (req, res) => {
  const { name, phone, note } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Name required' });
  const info = await db.run('INSERT INTO customers (name, phone, note) VALUES (?, ?, ?)', name, phone || '', note || '');
  res.json({ id: info.lastInsertRowid });
}));
api.put('/customers/:id', h(async (req, res) => {
  const { name, phone, note } = req.body || {};
  await db.run('UPDATE customers SET name=?, phone=?, note=? WHERE id=?', name, phone || '', note || '', req.params.id);
  res.json({ ok: true });
}));
api.delete('/customers/:id', h(async (req, res) => {
  const owed = (await db.get('SELECT COALESCE(SUM(amount),0) AS n FROM debts WHERE customer_id = ?', req.params.id)).n;
  if (owed > 0) return res.status(400).json({ error: 'Customer still has debts on record' });
  await db.run('DELETE FROM customers WHERE id = ?', req.params.id);
  res.json({ ok: true });
}));

// ------------------------------ debts -----------------------------
api.get('/debts', h(async (req, res) => {
  const { customer_id, status } = req.query;
  let sql = `
    SELECT d.*, c.name AS customer_name, c.phone AS customer_phone,
      COALESCE((SELECT SUM(amount) FROM debt_payments WHERE debt_id = d.id), 0) AS paid
    FROM debts d JOIN customers c ON c.id = d.customer_id`;
  const params = [];
  if (customer_id) { sql += ' WHERE d.customer_id = ?'; params.push(customer_id); }
  sql += ' ORDER BY d.date DESC, d.id DESC';
  let rows = await db.all(sql, ...params);
  rows = rows.map((r) => ({ ...r, outstanding: r.amount - r.paid }));
  if (status === 'open') rows = rows.filter((r) => r.outstanding > 0.0001);
  if (status === 'paid') rows = rows.filter((r) => r.outstanding <= 0.0001);
  res.json(rows);
}));
api.post('/debts', h(async (req, res) => {
  const { customer_id, date, description, amount, due_date } = req.body || {};
  if (!customer_id || !date || !amount) return res.status(400).json({ error: 'Customer, date and amount required' });
  const info = await db.run('INSERT INTO debts (customer_id, date, description, amount, due_date, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    customer_id, date, description || '', Number(amount), due_date || null, req.user.username);
  res.json({ id: info.lastInsertRowid });
}));
api.delete('/debts/:id', h(async (req, res) => {
  await db.run('DELETE FROM debt_payments WHERE debt_id = ?', req.params.id);
  await db.run('DELETE FROM debts WHERE id = ?', req.params.id);
  res.json({ ok: true });
}));

api.post('/debts/:id/payments', h(async (req, res) => {
  const { date, amount } = req.body || {};
  const debt = await db.get('SELECT * FROM debts WHERE id = ?', req.params.id);
  if (!debt) return res.status(404).json({ error: 'Debt not found' });
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'Amount required' });
  const info = await db.run('INSERT INTO debt_payments (debt_id, date, amount, created_by) VALUES (?, ?, ?, ?)',
    req.params.id, date || today(), Number(amount), req.user.username);
  res.json({ id: info.lastInsertRowid });
}));
api.get('/debts/:id/payments', h(async (req, res) => {
  res.json(await db.all('SELECT * FROM debt_payments WHERE debt_id = ? ORDER BY date, id', req.params.id));
}));

api.post('/customers/:id/pay-tab', h(async (req, res) => {
  const { date, amount } = req.body || {};
  const d = date || today();
  const debts = (await db.all(`
    SELECT d.*, COALESCE((SELECT SUM(amount) FROM debt_payments WHERE debt_id = d.id), 0) AS paid
    FROM debts d WHERE d.customer_id = ? ORDER BY d.date, d.id`, req.params.id))
    .map((x) => ({ ...x, outstanding: x.amount - x.paid }))
    .filter((x) => x.outstanding > 0.0001);

  const totalOut = debts.reduce((a, x) => a + x.outstanding, 0);
  if (totalOut <= 0) return res.status(400).json({ error: 'This customer has no open tab' });

  let remaining = amount === undefined || amount === '' || amount === null ? totalOut : Number(amount);
  if (Number.isNaN(remaining) || remaining <= 0) return res.status(400).json({ error: 'Amount required' });
  if (remaining > totalOut) remaining = totalOut;

  let applied = 0;
  for (const dbt of debts) {
    if (remaining <= 0.0001) break;
    const pay = Math.min(dbt.outstanding, remaining);
    await db.run('INSERT INTO debt_payments (debt_id, date, amount, created_by) VALUES (?, ?, ?, ?)', dbt.id, d, pay, req.user.username);
    remaining -= pay;
    applied += pay;
  }
  res.json({ applied, remaining_tab: totalOut - applied });
}));

// --------------------------- dashboard ----------------------------
api.get('/summary', h(async (req, res) => {
  const t = today();
  const monthStart = t.slice(0, 8) + '01';
  const sum = async (sql, ...p) => (await db.get(sql, ...p)).n || 0;

  res.json({
    today: {
      expense: await sum('SELECT COALESCE(SUM(amount),0) n FROM expenses WHERE date = ?', t),
      income: await sum('SELECT COALESCE(SUM(amount),0) n FROM income WHERE date = ?', t),
      sales: await sum('SELECT COALESCE(SUM(total),0) n FROM sales WHERE date = ?', t),
    },
    month: {
      expense: await sum('SELECT COALESCE(SUM(amount),0) n FROM expenses WHERE date >= ?', monthStart),
      income: await sum('SELECT COALESCE(SUM(amount),0) n FROM income WHERE date >= ?', monthStart),
      sales: await sum('SELECT COALESCE(SUM(total),0) n FROM sales WHERE date >= ?', monthStart),
    },
    debt: {
      outstanding: (await sum('SELECT COALESCE(SUM(amount),0) n FROM debts')) - (await sum('SELECT COALESCE(SUM(amount),0) n FROM debt_payments')),
      customers_owing: (await db.get(`
        SELECT COUNT(*) n FROM (
          SELECT d.customer_id,
            SUM(d.amount) - COALESCE((SELECT SUM(p.amount) FROM debt_payments p JOIN debts d2 ON d2.id=p.debt_id WHERE d2.customer_id=d.customer_id),0) AS bal
          FROM debts d GROUP BY d.customer_id HAVING bal > 0.0001
        )`)).n,
    },
    low_stock: await db.all('SELECT id, name, stock FROM products WHERE active = 1 AND stock <= 5 ORDER BY stock'),
  });
}));

api.get('/series', h(async (req, res) => {
  const days = Math.min(Number(req.query.days) || 30, 180);
  const start = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
  const byDay = async (table, col) =>
    Object.fromEntries((await db.all(`SELECT date, COALESCE(SUM(${col}),0) n FROM ${table} WHERE date >= ? GROUP BY date`, start)).map((r) => [r.date, r.n]));
  const exp = await byDay('expenses', 'amount');
  const inc = await byDay('income', 'amount');
  const sal = await byDay('sales', 'total');
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - (days - 1 - i) * 86400000).toISOString().slice(0, 10);
    out.push({ date: d, expense: exp[d] || 0, income: (inc[d] || 0) + (sal[d] || 0), sales: sal[d] || 0 });
  }
  res.json(out);
}));

api.get('/cashup', h(async (req, res) => {
  const date = req.query.date || today();
  const one = async (sql) => (await db.get(sql, date)).n || 0;
  const cash_sales = await one('SELECT COALESCE(SUM(total),0) n FROM orders WHERE date = ? AND is_credit = 0');
  const credit_sales = await one('SELECT COALESCE(SUM(total),0) n FROM orders WHERE date = ? AND is_credit = 1');
  const other_income_cash = await one("SELECT COALESCE(SUM(amount),0) n FROM income WHERE date = ? AND method = 'cash'");
  const other_income_total = await one('SELECT COALESCE(SUM(amount),0) n FROM income WHERE date = ?');
  const tab_payments = await one('SELECT COALESCE(SUM(amount),0) n FROM debt_payments WHERE date = ?');
  const cash_expenses = await one("SELECT COALESCE(SUM(amount),0) n FROM expenses WHERE date = ? AND method = 'cash'");
  const total_expenses = await one('SELECT COALESCE(SUM(amount),0) n FROM expenses WHERE date = ?');
  const cash_in = cash_sales + other_income_cash + tab_payments;
  res.json({
    date, cash_sales, credit_sales, total_sales: cash_sales + credit_sales,
    other_income_cash, other_income_total, tab_payments,
    cash_expenses, total_expenses, cash_in, cash_out: cash_expenses, drawer: cash_in - cash_expenses,
  });
}));

// ======================= ISP / internet billing =======================

// ----- service plans -----
api.get('/isp/plans', h(async (req, res) => {
  res.json(await db.all('SELECT * FROM isp_plans WHERE active = 1 ORDER BY price'));
}));
api.post('/isp/plans', h(async (req, res) => {
  const { name, speed_mbps, price, validity_days, kind } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Name required' });
  const info = await db.run(
    'INSERT INTO isp_plans (name, speed_mbps, price, validity_days, kind) VALUES (?, ?, ?, ?, ?)',
    name, Number(speed_mbps) || 0, Number(price) || 0, Number(validity_days) || 30, kind === 'hotspot' ? 'hotspot' : 'pppoe');
  res.json({ id: info.lastInsertRowid });
}));
api.put('/isp/plans/:id', h(async (req, res) => {
  const { name, speed_mbps, price, validity_days, kind } = req.body || {};
  await db.run('UPDATE isp_plans SET name=?, speed_mbps=?, price=?, validity_days=?, kind=? WHERE id=?',
    name, Number(speed_mbps) || 0, Number(price) || 0, Number(validity_days) || 30, kind === 'hotspot' ? 'hotspot' : 'pppoe', req.params.id);
  res.json({ ok: true });
}));
api.delete('/isp/plans/:id', h(async (req, res) => {
  const inUse = (await db.get('SELECT COUNT(*) n FROM isp_subscribers WHERE plan_id = ?', req.params.id)).n;
  if (inUse > 0) return res.status(400).json({ error: 'Plan is still assigned to subscribers' });
  await db.run('UPDATE isp_plans SET active = 0 WHERE id = ?', req.params.id);
  res.json({ ok: true });
}));

// ----- routers (registry only; future MikroTik hook) -----
api.get('/isp/routers', h(async (req, res) => {
  res.json(await db.all('SELECT * FROM isp_routers WHERE active = 1 ORDER BY name'));
}));
api.post('/isp/routers', h(async (req, res) => {
  const { name, location, host, note } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Name required' });
  const info = await db.run('INSERT INTO isp_routers (name, location, host, note) VALUES (?, ?, ?, ?)',
    name, location || '', host || '', note || '');
  res.json({ id: info.lastInsertRowid });
}));
api.put('/isp/routers/:id', h(async (req, res) => {
  const { name, location, host, note } = req.body || {};
  await db.run('UPDATE isp_routers SET name=?, location=?, host=?, note=? WHERE id=?',
    name, location || '', host || '', note || '', req.params.id);
  res.json({ ok: true });
}));
api.delete('/isp/routers/:id', h(async (req, res) => {
  await db.run('UPDATE isp_routers SET active = 0 WHERE id = ?', req.params.id);
  res.json({ ok: true });
}));

// derive a live status from the stored status + expiry date
const subStatus = (s) => {
  if (s.status === 'suspended') return 'suspended';
  if (s.expiry_date && s.expiry_date < today()) return 'expired';
  return 'active';
};

// ----- subscribers -----
api.get('/isp/subscribers', h(async (req, res) => {
  const { status, q } = req.query;
  let rows = await db.all(`
    SELECT s.*, p.name AS plan_name, p.price AS plan_price, p.speed_mbps, r.name AS router_name,
      COALESCE((SELECT SUM(i.amount) FROM isp_invoices i WHERE i.subscriber_id = s.id AND i.status != 'paid'), 0)
        - COALESCE((SELECT SUM(pm.amount) FROM isp_payments pm JOIN isp_invoices i2 ON i2.id = pm.invoice_id
                    WHERE i2.subscriber_id = s.id AND i2.status != 'paid'), 0) AS outstanding
    FROM isp_subscribers s
    LEFT JOIN isp_plans p ON p.id = s.plan_id
    LEFT JOIN isp_routers r ON r.id = s.router_id
    ORDER BY s.name`);
  rows = rows.map((s) => {
    const live = subStatus(s);
    const days_left = s.expiry_date
      ? Math.round((new Date(s.expiry_date + 'T00:00:00Z') - new Date(today() + 'T00:00:00Z')) / 86400000)
      : null;
    return { ...s, live_status: live, days_left };
  });
  if (status) rows = rows.filter((s) => s.live_status === status);
  if (q) {
    const needle = String(q).toLowerCase();
    rows = rows.filter((s) => (s.name + ' ' + (s.phone || '') + ' ' + (s.pppoe_user || '')).toLowerCase().includes(needle));
  }
  res.json(rows);
}));
api.post('/isp/subscribers', h(async (req, res) => {
  const { name, phone, pppoe_user, location, router_id, plan_id, note, start_date } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Name required' });
  let expiry = null;
  if (plan_id) {
    const plan = await db.get('SELECT * FROM isp_plans WHERE id = ?', plan_id);
    if (plan) expiry = addDays(start_date || today(), plan.validity_days);
  }
  const info = await db.run(
    'INSERT INTO isp_subscribers (name, phone, pppoe_user, location, router_id, plan_id, status, expiry_date, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    name, phone || '', pppoe_user || '', location || '', router_id || null, plan_id || null, 'active', expiry, note || '', req.user.username);
  res.json({ id: info.lastInsertRowid });
}));
api.put('/isp/subscribers/:id', h(async (req, res) => {
  const { name, phone, pppoe_user, location, router_id, plan_id, status, note } = req.body || {};
  await db.run(
    'UPDATE isp_subscribers SET name=?, phone=?, pppoe_user=?, location=?, router_id=?, plan_id=?, status=?, note=? WHERE id=?',
    name, phone || '', pppoe_user || '', location || '', router_id || null, plan_id || null,
    status === 'suspended' ? 'suspended' : 'active', note || '', req.params.id);
  res.json({ ok: true });
}));
api.delete('/isp/subscribers/:id', h(async (req, res) => {
  const out = (await db.get(`SELECT
    COALESCE((SELECT SUM(amount) FROM isp_invoices WHERE subscriber_id = ? AND status != 'paid'), 0) AS n`, req.params.id)).n;
  if (out > 0.0001) return res.status(400).json({ error: 'Subscriber still has unpaid invoices' });
  await db.run('DELETE FROM isp_subscribers WHERE id = ?', req.params.id);
  res.json({ ok: true });
}));

// renew/activate a subscriber: take payment now, extend expiry, record income
api.post('/isp/subscribers/:id/renew', h(async (req, res) => {
  const { date, amount, method } = req.body || {};
  const s = await db.get('SELECT * FROM isp_subscribers WHERE id = ?', req.params.id);
  if (!s) return res.status(404).json({ error: 'Subscriber not found' });
  if (!s.plan_id) return res.status(400).json({ error: 'Assign a plan before renewing' });
  const plan = await db.get('SELECT * FROM isp_plans WHERE id = ?', s.plan_id);
  if (!plan) return res.status(400).json({ error: 'Plan not found' });

  const d = date || today();
  const pay = amount === undefined || amount === '' || amount === null ? plan.price : Number(amount);
  if (Number.isNaN(pay) || pay < 0) return res.status(400).json({ error: 'Amount invalid' });

  // extend from whichever is later: today or the current (not-yet-expired) expiry
  const base = s.expiry_date && s.expiry_date > d ? s.expiry_date : d;
  const newExpiry = addDays(base, plan.validity_days);
  const period = d.slice(0, 7);

  const inv = await db.run(
    'INSERT INTO isp_invoices (subscriber_id, plan_id, date, due_date, amount, period, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    s.id, plan.id, d, d, plan.price, period, pay >= plan.price - 0.0001 ? 'paid' : 'unpaid', req.user.username);
  if (pay > 0) {
    await db.run('INSERT INTO isp_payments (invoice_id, subscriber_id, date, amount, method, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      inv.lastInsertRowid, s.id, d, pay, method || 'cash', req.user.username);
    await db.run('INSERT INTO income (date, source, description, amount, method, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      d, 'Internet', `${plan.name} · ${s.name}`, pay, method || 'cash', req.user.username);
  }
  await db.run('UPDATE isp_subscribers SET status = ?, expiry_date = ? WHERE id = ?', 'active', newExpiry, s.id);
  res.json({ ok: true, expiry_date: newExpiry, invoice_id: inv.lastInsertRowid });
}));

// ----- invoices -----
api.get('/isp/invoices', h(async (req, res) => {
  const { status, subscriber_id } = req.query;
  let sql = `
    SELECT i.*, s.name AS subscriber_name, s.phone AS subscriber_phone, p.name AS plan_name,
      COALESCE((SELECT SUM(amount) FROM isp_payments WHERE invoice_id = i.id), 0) AS paid
    FROM isp_invoices i
    JOIN isp_subscribers s ON s.id = i.subscriber_id
    LEFT JOIN isp_plans p ON p.id = i.plan_id`;
  const params = [];
  if (subscriber_id) { sql += ' WHERE i.subscriber_id = ?'; params.push(subscriber_id); }
  sql += ' ORDER BY i.date DESC, i.id DESC';
  let rows = await db.all(sql, ...params);
  rows = rows.map((r) => ({ ...r, outstanding: r.amount - r.paid }));
  if (status === 'unpaid') rows = rows.filter((r) => r.outstanding > 0.0001);
  if (status === 'paid') rows = rows.filter((r) => r.outstanding <= 0.0001);
  res.json(rows);
}));

// bulk-create this month's invoices for active subscribers (skip ones already billed for the period)
api.post('/isp/invoices/generate', h(async (req, res) => {
  const d = (req.body && req.body.date) || today();
  const period = d.slice(0, 7);
  const subs = await db.all('SELECT * FROM isp_subscribers WHERE plan_id IS NOT NULL AND status != ?', 'suspended');
  let created = 0;
  for (const s of subs) {
    const exists = await db.get('SELECT id FROM isp_invoices WHERE subscriber_id = ? AND period = ?', s.id, period);
    if (exists) continue;
    const plan = await db.get('SELECT * FROM isp_plans WHERE id = ?', s.plan_id);
    if (!plan) continue;
    await db.run(
      'INSERT INTO isp_invoices (subscriber_id, plan_id, date, due_date, amount, period, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      s.id, plan.id, d, addDays(d, 7), plan.price, period, 'unpaid', req.user.username);
    created += 1;
  }
  res.json({ created, period });
}));

// pay an invoice: record payment + income; if fully paid, extend the subscriber's expiry
api.post('/isp/invoices/:id/pay', h(async (req, res) => {
  const { date, amount, method } = req.body || {};
  const inv = await db.get('SELECT * FROM isp_invoices WHERE id = ?', req.params.id);
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  const paidSoFar = (await db.get('SELECT COALESCE(SUM(amount),0) n FROM isp_payments WHERE invoice_id = ?', inv.id)).n;
  const outstanding = inv.amount - paidSoFar;
  if (outstanding <= 0.0001) return res.status(400).json({ error: 'Invoice already settled' });

  const d = date || today();
  let pay = amount === undefined || amount === '' || amount === null ? outstanding : Number(amount);
  if (Number.isNaN(pay) || pay <= 0) return res.status(400).json({ error: 'Amount required' });
  if (pay > outstanding) pay = outstanding;

  const s = await db.get('SELECT * FROM isp_subscribers WHERE id = ?', inv.subscriber_id);
  await db.run('INSERT INTO isp_payments (invoice_id, subscriber_id, date, amount, method, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    inv.id, inv.subscriber_id, d, pay, method || 'cash', req.user.username);
  await db.run('INSERT INTO income (date, source, description, amount, method, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    d, 'Internet', `Invoice #${inv.id} · ${s ? s.name : ''}`, pay, method || 'cash', req.user.username);

  const fullyPaid = paidSoFar + pay >= inv.amount - 0.0001;
  if (fullyPaid) {
    await db.run('UPDATE isp_invoices SET status = ? WHERE id = ?', 'paid', inv.id);
    const plan = inv.plan_id ? await db.get('SELECT * FROM isp_plans WHERE id = ?', inv.plan_id) : null;
    if (s && plan) {
      const base = s.expiry_date && s.expiry_date > d ? s.expiry_date : d;
      await db.run('UPDATE isp_subscribers SET status = ?, expiry_date = ? WHERE id = ?',
        'active', addDays(base, plan.validity_days), s.id);
    }
  }
  res.json({ ok: true, applied: pay, fully_paid: fullyPaid });
}));

api.delete('/isp/invoices/:id', h(async (req, res) => {
  await db.run('DELETE FROM isp_payments WHERE invoice_id = ?', req.params.id);
  await db.run('DELETE FROM isp_invoices WHERE id = ?', req.params.id);
  res.json({ ok: true });
}));

// ----- hotspot vouchers -----
api.get('/isp/vouchers', h(async (req, res) => {
  const { batch, status } = req.query;
  let sql = 'SELECT * FROM isp_vouchers';
  const where = [];
  const params = [];
  if (batch) { where.push('batch = ?'); params.push(batch); }
  if (status) { where.push('status = ?'); params.push(status); }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY created_at DESC, id DESC';
  res.json(await db.all(sql, ...params));
}));
api.post('/isp/vouchers/generate', h(async (req, res) => {
  const { count, price, validity_days } = req.body || {};
  const n = Math.min(Math.max(Number(count) || 0, 1), 500);
  const p = Number(price) || 0;
  const v = Number(validity_days) || 1;
  const batch = 'B' + Date.now().toString(36).toUpperCase();
  const gen = () => Array.from({ length: 8 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
  const codes = [];
  for (let i = 0; i < n; i++) {
    let code = gen();
    // extremely unlikely collision; retry a couple times rather than fail the batch
    for (let tries = 0; tries < 3; tries++) {
      const dup = await db.get('SELECT id FROM isp_vouchers WHERE code = ?', code);
      if (!dup) break;
      code = gen();
    }
    await db.run('INSERT INTO isp_vouchers (batch, code, price, validity_days, status, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      batch, code, p, v, 'unused', req.user.username);
    codes.push(code);
  }
  res.json({ batch, count: codes.length, codes });
}));
// mark a voucher sold/used → counts its price as Internet income
api.post('/isp/vouchers/:id/use', h(async (req, res) => {
  const vch = await db.get('SELECT * FROM isp_vouchers WHERE id = ?', req.params.id);
  if (!vch) return res.status(404).json({ error: 'Voucher not found' });
  if (vch.status === 'used') return res.status(400).json({ error: 'Voucher already used' });
  const d = (req.body && req.body.date) || today();
  await db.run('UPDATE isp_vouchers SET status = ?, used_date = ? WHERE id = ?', 'used', d, vch.id);
  if (vch.price > 0) {
    await db.run('INSERT INTO income (date, source, description, amount, method, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      d, 'Internet', `Hotspot voucher ${vch.code}`, vch.price, 'cash', req.user.username);
  }
  res.json({ ok: true });
}));
api.delete('/isp/vouchers/:id', h(async (req, res) => {
  await db.run('DELETE FROM isp_vouchers WHERE id = ?', req.params.id);
  res.json({ ok: true });
}));

// ----- ISP dashboard stats -----
api.get('/isp/stats', h(async (req, res) => {
  const t = today();
  const monthStart = t.slice(0, 8) + '01';
  const soon = addDays(t, 7);
  const subs = await db.all('SELECT s.*, p.price AS plan_price, p.name AS plan_name FROM isp_subscribers s LEFT JOIN isp_plans p ON p.id = s.plan_id');

  let active = 0, expired = 0, suspended = 0, mrr = 0;
  const expiringSoon = [];
  for (const s of subs) {
    const live = subStatus(s);
    if (live === 'active') { active += 1; mrr += s.plan_price || 0; }
    else if (live === 'expired') expired += 1;
    else if (live === 'suspended') suspended += 1;
    if (live === 'active' && s.expiry_date && s.expiry_date <= soon) {
      expiringSoon.push({ id: s.id, name: s.name, plan_name: s.plan_name, expiry_date: s.expiry_date });
    }
  }
  expiringSoon.sort((a, b) => (a.expiry_date < b.expiry_date ? -1 : 1));

  const sum = async (sql, ...p) => (await db.get(sql, ...p)).n || 0;
  const revenue_month = await sum('SELECT COALESCE(SUM(amount),0) n FROM isp_payments WHERE date >= ?', monthStart);
  const overdue = (await db.all(`
    SELECT i.*, s.name AS subscriber_name,
      COALESCE((SELECT SUM(amount) FROM isp_payments WHERE invoice_id = i.id), 0) AS paid
    FROM isp_invoices i JOIN isp_subscribers s ON s.id = i.subscriber_id
    WHERE i.status != 'paid' AND i.due_date IS NOT NULL AND i.due_date < ?
    ORDER BY i.due_date`, t))
    .map((r) => ({ ...r, outstanding: r.amount - r.paid }))
    .filter((r) => r.outstanding > 0.0001);

  const vouchers = {
    unused: await sum("SELECT COUNT(*) n FROM isp_vouchers WHERE status = 'unused'"),
    revenue_month: await sum("SELECT COALESCE(SUM(price),0) n FROM isp_vouchers WHERE status = 'used' AND used_date >= ?", monthStart),
  };

  res.json({ active, expired, suspended, mrr, revenue_month, expiring_soon: expiringSoon, overdue, vouchers });
}));

app.use('/api', api);

// JSON error handler (so a thrown handler returns 500 JSON, never hangs)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

// ------------------------ serve built client (local only) ----------------------
const clientDist = join(__dirname, '..', 'client', 'dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(join(clientDist, 'index.html')));
}
