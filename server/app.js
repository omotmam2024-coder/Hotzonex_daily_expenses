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
