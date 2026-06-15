import { DatabaseSync } from 'node:sqlite';
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'data.db');

export const db = new DatabaseSync(DB_PATH);

// ---- password helpers (pure built-in crypto, no native build needed) ----
export function hashPassword(plain) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(plain, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(plain, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const hashBuf = Buffer.from(hash, 'hex');
  const test = scryptSync(plain, salt, 64);
  return hashBuf.length === test.length && timingSafeEqual(hashBuf, test);
}

// ---------------------------- schema ----------------------------
export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      username   TEXT UNIQUE NOT NULL,
      password   TEXT NOT NULL,
      role       TEXT NOT NULL DEFAULT 'admin',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      kind TEXT NOT NULL DEFAULT 'expense'  -- expense | income
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      date        TEXT NOT NULL,
      category    TEXT NOT NULL DEFAULT 'General',
      description TEXT,
      amount      REAL NOT NULL,
      method      TEXT NOT NULL DEFAULT 'cash',  -- cash | transfer | mobile
      created_by  TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS income (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      date        TEXT NOT NULL,
      source      TEXT NOT NULL DEFAULT 'General',
      description TEXT,
      amount      REAL NOT NULL,
      method      TEXT NOT NULL DEFAULT 'cash',
      created_by  TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      price      REAL NOT NULL DEFAULT 0,   -- selling price
      cost       REAL NOT NULL DEFAULT 0,   -- buying/cost price
      stock      INTEGER NOT NULL DEFAULT 0,
      active     INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS customers (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      phone      TEXT,
      note       TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sales (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      date        TEXT NOT NULL,
      product_id  INTEGER,
      product_name TEXT NOT NULL,
      qty         INTEGER NOT NULL DEFAULT 1,
      unit_price  REAL NOT NULL DEFAULT 0,
      total       REAL NOT NULL DEFAULT 0,
      is_credit   INTEGER NOT NULL DEFAULT 0,  -- 1 = taken on debt
      customer_id INTEGER,
      created_by  TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- a debt is money a customer owes. It can come from a credit sale or be entered manually.
    CREATE TABLE IF NOT EXISTS debts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      date        TEXT NOT NULL,
      description TEXT,
      amount      REAL NOT NULL,            -- original amount owed
      due_date    TEXT,
      sale_id     INTEGER,                  -- linked credit sale, if any
      created_by  TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS debt_payments (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      debt_id    INTEGER NOT NULL,
      date       TEXT NOT NULL,
      amount     REAL NOT NULL,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- an order is one bill / tab: many sale line-items, one total, one payment
    CREATE TABLE IF NOT EXISTS orders (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      date        TEXT NOT NULL,
      total       REAL NOT NULL DEFAULT 0,
      is_credit   INTEGER NOT NULL DEFAULT 0,
      customer_id INTEGER,
      note        TEXT,
      created_by  TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // migrations for DBs created by an earlier version
  const ensureColumn = (table, col, def) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!cols.some((c) => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  };
  ensureColumn('sales', 'order_id', 'INTEGER');
  ensureColumn('debts', 'order_id', 'INTEGER');

  // seed default admin
  const admin = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!admin) {
    db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)')
      .run('admin', hashPassword('admin123'), 'admin');
    console.log('Seeded default admin: admin / admin123');
  }

  // seed a few sensible categories
  const catCount = db.prepare('SELECT COUNT(*) AS n FROM categories').get().n;
  if (catCount === 0) {
    const insert = db.prepare('INSERT INTO categories (name, kind) VALUES (?, ?)');
    [
      ['Rent', 'expense'], ['Electricity', 'expense'], ['Fuel/Generator', 'expense'],
      ['Internet/Bandwidth', 'expense'], ['Salaries', 'expense'], ['Equipment', 'expense'],
      ['Stock Purchase', 'expense'], ['Transport', 'expense'], ['Maintenance', 'expense'],
      ['Miscellaneous', 'expense'],
      ['Networking Job', 'income'], ['Shop Sales', 'income'], ['Installation', 'income'],
      ['Other Income', 'income'],
    ].forEach(([n, k]) => insert.run(n, k));
  }
}
