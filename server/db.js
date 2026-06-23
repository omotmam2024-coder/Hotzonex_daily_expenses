import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCAL_PATH = join(__dirname, '..', 'data.db');

// Two backends behind one tiny async API:
//   • Cloud (Vercel): Turso / libSQL over HTTP  — when TURSO_DATABASE_URL is set.
//   • Local / desktop: built-in node:sqlite file — otherwise.
// Both speak the same SQLite SQL, so the queries below are unchanged.
const useTurso = !!process.env.TURSO_DATABASE_URL;
const norm = (args) => args.map((a) => (a === undefined ? null : a));

async function makeImpl() {
  if (useTurso) {
    const { createClient } = await import('@libsql/client/web');
    const client = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    // libSQL rows are array-like; turn each into a plain { column: value } object
    const plain = (result, row) => {
      const o = {};
      result.columns.forEach((c, i) => { o[c] = row[i]; });
      return o;
    };
    return {
      get: async (sql, args) => {
        const r = await client.execute({ sql, args: norm(args) });
        return r.rows[0] ? plain(r, r.rows[0]) : undefined;
      },
      all: async (sql, args) => {
        const r = await client.execute({ sql, args: norm(args) });
        return r.rows.map((row) => plain(r, row));
      },
      run: async (sql, args) => {
        const r = await client.execute({ sql, args: norm(args) });
        return { lastInsertRowid: r.lastInsertRowid != null ? Number(r.lastInsertRowid) : undefined, changes: Number(r.rowsAffected) };
      },
      exec: async (sql) => { await client.executeMultiple(sql); },
    };
  }
  const { DatabaseSync } = await import('node:sqlite');
  const d = new DatabaseSync(LOCAL_PATH);
  return {
    get: async (sql, args) => d.prepare(sql).get(...norm(args)),
    all: async (sql, args) => d.prepare(sql).all(...norm(args)),
    run: async (sql, args) => {
      const r = d.prepare(sql).run(...norm(args));
      return { lastInsertRowid: r.lastInsertRowid != null ? Number(r.lastInsertRowid) : undefined, changes: Number(r.changes) };
    },
    exec: async (sql) => d.exec(sql),
  };
}

const implPromise = makeImpl();

export const db = {
  get: async (sql, ...args) => (await implPromise).get(sql, args),
  all: async (sql, ...args) => (await implPromise).all(sql, args),
  run: async (sql, ...args) => (await implPromise).run(sql, args),
  exec: async (sql) => (await implPromise).exec(sql),
};

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
export async function initDb() {
  await db.exec(`
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
      kind TEXT NOT NULL DEFAULT 'expense'
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      date        TEXT NOT NULL,
      category    TEXT NOT NULL DEFAULT 'General',
      description TEXT,
      amount      REAL NOT NULL,
      method      TEXT NOT NULL DEFAULT 'cash',
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
      price      REAL NOT NULL DEFAULT 0,
      cost       REAL NOT NULL DEFAULT 0,
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
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      date         TEXT NOT NULL,
      product_id   INTEGER,
      product_name TEXT NOT NULL,
      qty          INTEGER NOT NULL DEFAULT 1,
      unit_price   REAL NOT NULL DEFAULT 0,
      total        REAL NOT NULL DEFAULT 0,
      is_credit    INTEGER NOT NULL DEFAULT 0,
      customer_id  INTEGER,
      created_by   TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS debts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      date        TEXT NOT NULL,
      description TEXT,
      amount      REAL NOT NULL,
      due_date    TEXT,
      sale_id     INTEGER,
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
  const ensureColumn = async (table, col, def) => {
    const cols = await db.all(`PRAGMA table_info(${table})`);
    if (!cols.some((c) => c.name === col)) await db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  };
  await ensureColumn('sales', 'order_id', 'INTEGER');
  await ensureColumn('debts', 'order_id', 'INTEGER');
  await ensureColumn('products', 'units', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('products', 'cost_per_unit', 'REAL NOT NULL DEFAULT 0');
  await ensureColumn('products', 'pieces_per_unit', 'INTEGER NOT NULL DEFAULT 1');

  // seed default admin
  const admin = await db.get('SELECT id FROM users WHERE username = ?', 'admin');
  if (!admin) {
    await db.run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', 'admin', hashPassword('admin123'), 'admin');
    console.log('Seeded default admin: admin / admin123');
  }

  // seed a few sensible categories
  const catCount = (await db.get('SELECT COUNT(*) AS n FROM categories')).n;
  if (catCount === 0) {
    const cats = [
      ['Rent', 'expense'], ['Electricity', 'expense'], ['Fuel/Generator', 'expense'],
      ['Internet/Bandwidth', 'expense'], ['Salaries', 'expense'], ['Equipment', 'expense'],
      ['Stock Purchase', 'expense'], ['Transport', 'expense'], ['Maintenance', 'expense'],
      ['Miscellaneous', 'expense'],
      ['Networking Job', 'income'], ['Shop Sales', 'income'], ['Installation', 'income'],
      ['Other Income', 'income'],
    ];
    for (const [n, k] of cats) await db.run('INSERT INTO categories (name, kind) VALUES (?, ?)', n, k);
  }
}
