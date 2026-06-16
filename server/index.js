import express from 'express';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { db, initDb, hashPassword, verifyPassword } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4100;
const JWT_SECRET = process.env.JWT_SECRET || 'hotzonex-expenses-secret-change-me';

initDb();

const app = express();
app.use(express.json());

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

api.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username || '');
  if (!user || !verifyPassword(password || '', user.password)) {
    return res.status(401).json({ error: 'Wrong username or password' });
  }
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, {
    expiresIn: '30d',
  });
  res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
});

api.use(auth); // everything below requires a valid token

api.get('/me', (req, res) => res.json({ user: req.user }));

api.post('/change-password', (req, res) => {
  const { current, next } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(current || '', user.password)) {
    return res.status(400).json({ error: 'Current password is wrong' });
  }
  if (!next || next.length < 4) return res.status(400).json({ error: 'New password too short' });
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashPassword(next), user.id);
  res.json({ ok: true });
});

// --------------------------- categories ---------------------------
api.get('/categories', (req, res) => {
  res.json(db.prepare('SELECT * FROM categories ORDER BY kind, name').all());
});
api.post('/categories', (req, res) => {
  const { name, kind } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const info = db.prepare('INSERT INTO categories (name, kind) VALUES (?, ?)').run(name, kind === 'income' ? 'income' : 'expense');
    res.json({ id: info.lastInsertRowid });
  } catch {
    res.status(400).json({ error: 'Category already exists' });
  }
});
api.delete('/categories/:id', (req, res) => {
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------------------------- expenses ----------------------------
api.get('/expenses', (req, res) => {
  const { from, to } = req.query;
  let sql = 'SELECT * FROM expenses';
  const params = [];
  if (from && to) { sql += ' WHERE date BETWEEN ? AND ?'; params.push(from, to); }
  sql += ' ORDER BY date DESC, id DESC';
  res.json(db.prepare(sql).all(...params));
});
api.post('/expenses', (req, res) => {
  const { date, category, description, amount, method } = req.body || {};
  if (!date || !amount) return res.status(400).json({ error: 'Date and amount required' });
  const info = db.prepare(
    'INSERT INTO expenses (date, category, description, amount, method, created_by) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(date, category || 'General', description || '', Number(amount), method || 'cash', req.user.username);
  res.json({ id: info.lastInsertRowid });
});
api.put('/expenses/:id', (req, res) => {
  const { date, category, description, amount, method } = req.body || {};
  db.prepare('UPDATE expenses SET date=?, category=?, description=?, amount=?, method=? WHERE id=?')
    .run(date, category, description, Number(amount), method, req.params.id);
  res.json({ ok: true });
});
api.delete('/expenses/:id', (req, res) => {
  db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ----------------------------- income -----------------------------
api.get('/income', (req, res) => {
  const { from, to } = req.query;
  let sql = 'SELECT * FROM income';
  const params = [];
  if (from && to) { sql += ' WHERE date BETWEEN ? AND ?'; params.push(from, to); }
  sql += ' ORDER BY date DESC, id DESC';
  res.json(db.prepare(sql).all(...params));
});
api.post('/income', (req, res) => {
  const { date, source, description, amount, method } = req.body || {};
  if (!date || !amount) return res.status(400).json({ error: 'Date and amount required' });
  const info = db.prepare(
    'INSERT INTO income (date, source, description, amount, method, created_by) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(date, source || 'General', description || '', Number(amount), method || 'cash', req.user.username);
  res.json({ id: info.lastInsertRowid });
});
api.delete('/income/:id', (req, res) => {
  db.prepare('DELETE FROM income WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------------------------- products ----------------------------
// A product is stocked in `units` (cartons/crates) of `pieces_per_unit` sellable
// pieces, bought at `cost_per_unit`. We also keep per-piece price/cost and a live
// piece `stock` so the POS, daily sheet and debts all work in pieces.
function pieceFields(body) {
  const units = Number(body.units) || 0;
  const cost_per_unit = Number(body.cost_per_unit) || 0;
  const pieces_per_unit = Number(body.pieces_per_unit) || 1;
  // selling price per piece (accept price_per_piece or legacy price)
  const price = Number(body.price_per_piece ?? body.price) || 0;
  // cost per piece (derive from carton cost, or accept legacy cost)
  const cost = body.cost !== undefined && body.units === undefined
    ? Number(body.cost) || 0
    : (pieces_per_unit ? cost_per_unit / pieces_per_unit : 0);
  return { units, cost_per_unit, pieces_per_unit, price, cost };
}

api.get('/products', (req, res) => {
  const rows = db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY name').all();
  rows.forEach((p) => {
    p.total_cost = p.units * p.cost_per_unit;
    p.exp_sales = p.units * p.pieces_per_unit * p.price; // expected sales if all sold
    p.profit = p.exp_sales - p.total_cost;
  });
  res.json(rows);
});
api.post('/products', (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Name required' });
  const f = pieceFields(req.body || {});
  // initial stock (pieces) comes from the intake; allow explicit override
  const stock = req.body.stock !== undefined && req.body.stock !== ''
    ? Number(req.body.stock) || 0
    : f.units * f.pieces_per_unit;
  const info = db.prepare(
    'INSERT INTO products (name, price, cost, stock, units, cost_per_unit, pieces_per_unit) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(name, f.price, f.cost, stock, f.units, f.cost_per_unit, f.pieces_per_unit);
  res.json({ id: info.lastInsertRowid });
});
api.put('/products/:id', (req, res) => {
  const { name } = req.body || {};
  const f = pieceFields(req.body || {});
  // editing the intake numbers doesn't silently wipe pieces already sold:
  // only set stock if the caller sends one explicitly.
  if (req.body.stock !== undefined && req.body.stock !== '') {
    db.prepare('UPDATE products SET name=?, price=?, cost=?, stock=?, units=?, cost_per_unit=?, pieces_per_unit=? WHERE id=?')
      .run(name, f.price, f.cost, Number(req.body.stock) || 0, f.units, f.cost_per_unit, f.pieces_per_unit, req.params.id);
  } else {
    db.prepare('UPDATE products SET name=?, price=?, cost=?, units=?, cost_per_unit=?, pieces_per_unit=? WHERE id=?')
      .run(name, f.price, f.cost, f.units, f.cost_per_unit, f.pieces_per_unit, req.params.id);
  }
  res.json({ ok: true });
});
api.delete('/products/:id', (req, res) => {
  db.prepare('UPDATE products SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ------------------------------ sales -----------------------------
api.get('/sales', (req, res) => {
  const { from, to } = req.query;
  let sql = `SELECT s.*, c.name AS customer_name FROM sales s LEFT JOIN customers c ON c.id = s.customer_id`;
  const params = [];
  if (from && to) { sql += ' WHERE s.date BETWEEN ? AND ?'; params.push(from, to); }
  sql += ' ORDER BY s.date DESC, s.id DESC';
  res.json(db.prepare(sql).all(...params));
});

// record a sale. If is_credit, also creates a debt for the customer.
api.post('/sales', (req, res) => {
  const { date, product_id, qty, unit_price, is_credit, customer_id, due_date } = req.body || {};
  const q = Number(qty) || 1;
  let name = req.body.product_name;
  let price = Number(unit_price);

  if (product_id) {
    const p = db.prepare('SELECT * FROM products WHERE id = ?').get(product_id);
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

  if (credit && !customer_id) {
    return res.status(400).json({ error: 'Credit sales need a customer' });
  }

  const tx = db.prepare('INSERT INTO sales (date, product_id, product_name, qty, unit_price, total, is_credit, customer_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const info = tx.run(date, product_id || null, name, q, price, total, credit, customer_id || null, req.user.username);

  // decrement stock when sold from inventory
  if (product_id) {
    db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(q, product_id);
  }
  // credit sale -> create a debt automatically
  if (credit) {
    db.prepare('INSERT INTO debts (customer_id, date, description, amount, due_date, sale_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(customer_id, date, `${q} x ${name}`, total, due_date || null, info.lastInsertRowid, req.user.username);
  }
  res.json({ id: info.lastInsertRowid });
});
api.delete('/sales/:id', (req, res) => {
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(req.params.id);
  if (sale && sale.product_id) {
    db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(sale.qty, sale.product_id);
  }
  db.prepare('DELETE FROM debts WHERE sale_id = ?').run(req.params.id);
  db.prepare('DELETE FROM sales WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ------------------------------ orders (POS) -----------------------------
// One bill with many line-items. Calculates the total, records each line as a
// sale, decrements stock, and (if on credit) puts the whole bill on a tab/debt.
api.post('/orders', (req, res) => {
  const { date, items, is_credit, customer_id, due_date, note } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Add at least one item' });
  const credit = is_credit ? 1 : 0;
  if (credit && !customer_id) return res.status(400).json({ error: 'A credit bill needs a customer' });

  const d = date || new Date().toISOString().slice(0, 10);
  const lines = [];
  const stockNeeded = new Map();
  let total = 0;
  for (const it of items) {
    let name = it.product_name;
    let price = Number(it.unit_price);
    const qty = Number(it.qty) || 1;
    if (it.product_id) {
      const p = db.prepare('SELECT * FROM products WHERE id = ?').get(it.product_id);
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

  const orderInfo = db.prepare(
    'INSERT INTO orders (date, total, is_credit, customer_id, note, created_by) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(d, total, credit, customer_id || null, note || '', req.user.username);
  const orderId = orderInfo.lastInsertRowid;

  const insertSale = db.prepare(
    'INSERT INTO sales (date, product_id, product_name, qty, unit_price, total, is_credit, customer_id, order_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const l of lines) {
    insertSale.run(d, l.product_id, l.name, l.qty, l.price, l.line, credit, customer_id || null, orderId, req.user.username);
    if (l.product_id) db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(l.qty, l.product_id);
  }

  if (credit) {
    const desc = `Tab #${orderId} · ${lines.map((l) => `${l.qty}×${l.name}`).join(', ')}`;
    db.prepare('INSERT INTO debts (customer_id, date, description, amount, due_date, order_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(customer_id, d, desc, total, due_date || null, orderId, req.user.username);
  }
  res.json({ id: orderId, total, lines });
});

api.get('/orders', (req, res) => {
  const { from, to } = req.query;
  let sql = `SELECT o.*, c.name AS customer_name,
      (SELECT COUNT(*) FROM sales WHERE order_id = o.id) AS item_count
    FROM orders o LEFT JOIN customers c ON c.id = o.customer_id`;
  const params = [];
  if (from && to) { sql += ' WHERE o.date BETWEEN ? AND ?'; params.push(from, to); }
  sql += ' ORDER BY o.date DESC, o.id DESC';
  res.json(db.prepare(sql).all(...params));
});

api.get('/orders/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  order.items = db.prepare('SELECT * FROM sales WHERE order_id = ? ORDER BY id').all(req.params.id);
  res.json(order);
});

api.delete('/orders/:id', (req, res) => {
  const items = db.prepare('SELECT * FROM sales WHERE order_id = ?').all(req.params.id);
  for (const s of items) {
    if (s.product_id) db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(s.qty, s.product_id);
  }
  db.prepare('DELETE FROM debts WHERE order_id = ?').run(req.params.id);
  db.prepare('DELETE FROM sales WHERE order_id = ?').run(req.params.id);
  db.prepare('DELETE FROM orders WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// add stock when more inventory is bought, by units (cartons). Adds
// units × pieces_per_unit pieces, and can log a Stock Purchase expense.
api.post('/products/:id/restock', (req, res) => {
  const { units, cost_per_unit, record_expense, date } = req.body || {};
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  const u = Number(units) || 0;
  if (u <= 0) return res.status(400).json({ error: 'Number of units required' });
  const ppu = p.pieces_per_unit || 1;
  const piecesAdded = u * ppu;
  const cpu = cost_per_unit === undefined || cost_per_unit === '' ? p.cost_per_unit : Number(cost_per_unit);
  // keep the carton cost current and add the pieces to stock
  db.prepare('UPDATE products SET stock = stock + ?, units = units + ?, cost_per_unit = ?, cost = ? WHERE id = ?')
    .run(piecesAdded, u, cpu, ppu ? cpu / ppu : 0, p.id);
  if (record_expense && cpu > 0) {
    const d = date || new Date().toISOString().slice(0, 10);
    db.prepare('INSERT INTO expenses (date, category, description, amount, method, created_by) VALUES (?, ?, ?, ?, ?, ?)')
      .run(d, 'Stock Purchase', `Restock ${u} unit(s) × ${p.name}`, u * cpu, 'cash', req.user.username);
  }
  res.json({ ok: true, pieces_added: piecesAdded });
});

// ---------------------------- customers ---------------------------
api.get('/customers', (req, res) => {
  // include each customer's outstanding balance
  const rows = db.prepare(`
    SELECT c.*,
      COALESCE((SELECT SUM(amount) FROM debts WHERE customer_id = c.id), 0) AS total_debt,
      COALESCE((SELECT SUM(p.amount) FROM debt_payments p JOIN debts d ON d.id = p.debt_id WHERE d.customer_id = c.id), 0) AS total_paid
    FROM customers c ORDER BY c.name
  `).all();
  rows.forEach(r => { r.balance = r.total_debt - r.total_paid; });
  res.json(rows);
});
api.post('/customers', (req, res) => {
  const { name, phone, note } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Name required' });
  const info = db.prepare('INSERT INTO customers (name, phone, note) VALUES (?, ?, ?)').run(name, phone || '', note || '');
  res.json({ id: info.lastInsertRowid });
});
api.put('/customers/:id', (req, res) => {
  const { name, phone, note } = req.body || {};
  db.prepare('UPDATE customers SET name=?, phone=?, note=? WHERE id=?').run(name, phone || '', note || '', req.params.id);
  res.json({ ok: true });
});
api.delete('/customers/:id', (req, res) => {
  const owed = db.prepare('SELECT COALESCE(SUM(amount),0) AS n FROM debts WHERE customer_id = ?').get(req.params.id).n;
  if (owed > 0) return res.status(400).json({ error: 'Customer still has debts on record' });
  db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ------------------------------ debts -----------------------------
// full ledger for one customer, or all open debts
api.get('/debts', (req, res) => {
  const { customer_id, status } = req.query;
  let sql = `
    SELECT d.*, c.name AS customer_name, c.phone AS customer_phone,
      COALESCE((SELECT SUM(amount) FROM debt_payments WHERE debt_id = d.id), 0) AS paid
    FROM debts d JOIN customers c ON c.id = d.customer_id`;
  const params = [];
  const where = [];
  if (customer_id) { where.push('d.customer_id = ?'); params.push(customer_id); }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY d.date DESC, d.id DESC';
  let rows = db.prepare(sql).all(...params);
  rows = rows.map(r => ({ ...r, outstanding: r.amount - r.paid }));
  if (status === 'open') rows = rows.filter(r => r.outstanding > 0.0001);
  if (status === 'paid') rows = rows.filter(r => r.outstanding <= 0.0001);
  res.json(rows);
});
api.post('/debts', (req, res) => {
  const { customer_id, date, description, amount, due_date } = req.body || {};
  if (!customer_id || !date || !amount) return res.status(400).json({ error: 'Customer, date and amount required' });
  const info = db.prepare('INSERT INTO debts (customer_id, date, description, amount, due_date, created_by) VALUES (?, ?, ?, ?, ?, ?)')
    .run(customer_id, date, description || '', Number(amount), due_date || null, req.user.username);
  res.json({ id: info.lastInsertRowid });
});
api.delete('/debts/:id', (req, res) => {
  db.prepare('DELETE FROM debt_payments WHERE debt_id = ?').run(req.params.id);
  db.prepare('DELETE FROM debts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// record a (partial) repayment against a debt
api.post('/debts/:id/payments', (req, res) => {
  const { date, amount } = req.body || {};
  const debt = db.prepare('SELECT * FROM debts WHERE id = ?').get(req.params.id);
  if (!debt) return res.status(404).json({ error: 'Debt not found' });
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'Amount required' });
  const info = db.prepare('INSERT INTO debt_payments (debt_id, date, amount, created_by) VALUES (?, ?, ?, ?)')
    .run(req.params.id, date || new Date().toISOString().slice(0, 10), Number(amount), req.user.username);
  res.json({ id: info.lastInsertRowid });
});
api.get('/debts/:id/payments', (req, res) => {
  res.json(db.prepare('SELECT * FROM debt_payments WHERE debt_id = ? ORDER BY date, id').all(req.params.id));
});

// pay down a customer's whole tab in one go — spreads the amount across their
// open debts, oldest first. Omit `amount` to clear the full outstanding balance.
api.post('/customers/:id/pay-tab', (req, res) => {
  const { date, amount } = req.body || {};
  const d = date || new Date().toISOString().slice(0, 10);
  const debts = db.prepare(`
    SELECT d.*, COALESCE((SELECT SUM(amount) FROM debt_payments WHERE debt_id = d.id), 0) AS paid
    FROM debts d WHERE d.customer_id = ? ORDER BY d.date, d.id
  `).all(req.params.id)
    .map((x) => ({ ...x, outstanding: x.amount - x.paid }))
    .filter((x) => x.outstanding > 0.0001);

  const totalOut = debts.reduce((a, x) => a + x.outstanding, 0);
  if (totalOut <= 0) return res.status(400).json({ error: 'This customer has no open tab' });

  let remaining = amount === undefined || amount === '' || amount === null ? totalOut : Number(amount);
  if (Number.isNaN(remaining) || remaining <= 0) return res.status(400).json({ error: 'Amount required' });
  if (remaining > totalOut) remaining = totalOut; // never overpay

  const ins = db.prepare('INSERT INTO debt_payments (debt_id, date, amount, created_by) VALUES (?, ?, ?, ?)');
  let applied = 0;
  for (const dbt of debts) {
    if (remaining <= 0.0001) break;
    const pay = Math.min(dbt.outstanding, remaining);
    ins.run(dbt.id, d, pay, req.user.username);
    remaining -= pay;
    applied += pay;
  }
  res.json({ applied, remaining_tab: totalOut - applied });
});

// --------------------------- dashboard ----------------------------
api.get('/summary', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';

  const sum = (sql, ...p) => db.prepare(sql).get(...p).n || 0;

  res.json({
    today: {
      expense: sum('SELECT COALESCE(SUM(amount),0) n FROM expenses WHERE date = ?', today),
      income: sum('SELECT COALESCE(SUM(amount),0) n FROM income WHERE date = ?', today),
      sales: sum('SELECT COALESCE(SUM(total),0) n FROM sales WHERE date = ?', today),
    },
    month: {
      expense: sum('SELECT COALESCE(SUM(amount),0) n FROM expenses WHERE date >= ?', monthStart),
      income: sum('SELECT COALESCE(SUM(amount),0) n FROM income WHERE date >= ?', monthStart),
      sales: sum('SELECT COALESCE(SUM(total),0) n FROM sales WHERE date >= ?', monthStart),
    },
    debt: {
      outstanding:
        sum('SELECT COALESCE(SUM(amount),0) n FROM debts') -
        sum('SELECT COALESCE(SUM(amount),0) n FROM debt_payments'),
      customers_owing: db.prepare(`
        SELECT COUNT(*) n FROM (
          SELECT d.customer_id,
            SUM(d.amount) - COALESCE((SELECT SUM(p.amount) FROM debt_payments p JOIN debts d2 ON d2.id=p.debt_id WHERE d2.customer_id=d.customer_id),0) AS bal
          FROM debts d GROUP BY d.customer_id HAVING bal > 0.0001
        )`).get().n,
    },
    low_stock: db.prepare('SELECT id, name, stock FROM products WHERE active = 1 AND stock <= 5 ORDER BY stock').all(),
  });
});

// daily series for charts (last N days)
api.get('/series', (req, res) => {
  const days = Math.min(Number(req.query.days) || 30, 180);
  const start = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
  const byDay = (table, col) =>
    Object.fromEntries(
      db.prepare(`SELECT date, COALESCE(SUM(${col}),0) n FROM ${table} WHERE date >= ? GROUP BY date`).all(start)
        .map(r => [r.date, r.n])
    );
  const exp = byDay('expenses', 'amount');
  const inc = byDay('income', 'amount');
  const sal = byDay('sales', 'total');
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - (days - 1 - i) * 86400000).toISOString().slice(0, 10);
    out.push({ date: d, expense: exp[d] || 0, income: (inc[d] || 0) + (sal[d] || 0), sales: sal[d] || 0 });
  }
  res.json(out);
});

// daily cash-up / Z-report: what should be in the drawer at end of day
api.get('/cashup', (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const one = (sql) => db.prepare(sql).get(date).n || 0;

  const cash_sales = one('SELECT COALESCE(SUM(total),0) n FROM orders WHERE date = ? AND is_credit = 0');
  const credit_sales = one('SELECT COALESCE(SUM(total),0) n FROM orders WHERE date = ? AND is_credit = 1');
  const other_income_cash = one("SELECT COALESCE(SUM(amount),0) n FROM income WHERE date = ? AND method = 'cash'");
  const other_income_total = one('SELECT COALESCE(SUM(amount),0) n FROM income WHERE date = ?');
  const tab_payments = one('SELECT COALESCE(SUM(amount),0) n FROM debt_payments WHERE date = ?');
  const cash_expenses = one("SELECT COALESCE(SUM(amount),0) n FROM expenses WHERE date = ? AND method = 'cash'");
  const total_expenses = one('SELECT COALESCE(SUM(amount),0) n FROM expenses WHERE date = ?');

  const cash_in = cash_sales + other_income_cash + tab_payments;
  const cash_out = cash_expenses;
  res.json({
    date,
    cash_sales, credit_sales, total_sales: cash_sales + credit_sales,
    other_income_cash, other_income_total,
    tab_payments,
    cash_expenses, total_expenses,
    cash_in, cash_out, drawer: cash_in - cash_out,
  });
});

app.use('/api', api);

// ------------------------ serve built client ----------------------
const clientDist = join(__dirname, '..', 'client', 'dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(join(clientDist, 'index.html')));
}

app.listen(PORT, () => console.log(`Hotzonex Expenses running on http://localhost:${PORT}`));
