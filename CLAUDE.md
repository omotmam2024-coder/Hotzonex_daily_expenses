# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Hotzonex Daily Expenses — a web app for a networking company + bar/shop to track expenses, income, shop sales (POS + a daily-entry sheet), stock, and a customer debt/credit book. Amounts are in **South Sudanese Pound (SSP)**. Single shared admin login (JWT). Default credentials: `admin` / `admin123`.

## Commands

```bash
npm install            # server deps (root)
npm run build          # installs client deps AND builds the Vite UI into client/dist
npm start              # serve UI + API on http://localhost:4100  (run build first, or the UI 404s)
npm run desktop        # launch as a windowed desktop app (Windows: starts server + opens Edge in --app mode)

# Dev with hot reload (two terminals):
npm run dev:server     # API on :4100
npm run dev:client     # Vite UI on :5174, proxies /api -> :4100
```

There is **no test suite and no linter configured** — do not invent `npm test`/`npm run lint`. Verify changes by running the app (`npm run build && npm start`, or the Claude preview tools) and exercising the affected endpoints/pages.

`node:sqlite` is experimental, so the npm scripts pass `--disable-warning=ExperimentalWarning`. Running `node server/index.js` directly works but prints a warning.

## Architecture

Two tiers, one repo:
- **`server/`** — Express API (root `package.json`, ESM, `"type": "module"`).
- **`client/`** — React 18 + Vite SPA (its **own** `package.json`/`package-lock.json`). The client fetches the API at the **relative** path `/api` (see `client/src/api.js`), so it works on any origin.

### The data layer is the thing to understand first

`server/db.js` exports a tiny **async** `db` helper used by every route:
```js
await db.get(sql, ...args)   // first row (or undefined)
await db.all(sql, ...args)   // array of rows
await db.run(sql, ...args)   // { lastInsertRowid, changes }
await db.exec(sql)           // multiple statements (schema)
```
It picks a backend at startup from an env var, but the **SQL is identical SQLite either way**:
- **Local / desktop:** built-in `node:sqlite` writing to `data.db` in the repo root.
- **Cloud (Vercel):** Turso / libSQL over HTTP (`@libsql/client/web`) when **`TURSO_DATABASE_URL`** (+ `TURSO_AUTH_TOKEN`) is set.

**Do not reintroduce the synchronous `db.prepare(...).get()` style** — it was removed in the Vercel/Turso migration. Every route handler is `async` and wrapped in `h(fn)` (in `server/app.js`) which routes promise rejections to the JSON error handler so a thrown handler can never hang the serverless function. `db.run().lastInsertRowid` is normalized to a `Number` (libSQL returns BigInt).

Schema + seed live in `initDb()` in `db.js`. Columns are added with the idempotent `ensureColumn()` (ALTER TABLE only if missing) — add new columns there, not by editing the CREATE TABLE blocks, so existing DBs migrate. `initDb()` runs once at module load as the exported `ready` promise; a top-level middleware `await ready` before handling requests.

### Three entry points share one app

- `server/app.js` — builds the Express app, **all routes**, error handler, and (locally) static-serves `client/dist`. Exports `{ app, ready }`. **This is where you edit/add routes.**
- `server/index.js` — thin local launcher: `await ready` then `app.listen(4100)`.
- `api/index.js` — Vercel serverless entry: `export default app`.

### Domain model (SQLite tables)

- **products** use a bar **stock-intake model**: `units` (cartons) × `pieces_per_unit` pieces, bought at `cost_per_unit`. Per-piece `price`/`cost` and the live piece `stock` are *derived* on write; the API also computes `total_cost`/`exp_sales`/`profit` on read.
- **orders** = one bill; line items are rows in **sales** (`sales.order_id`). Stock decrements per line. A **credit** order (`is_credit=1`) auto-creates one **debts** row (`debts.order_id`). Repayments go in **debt_payments**; "outstanding" is computed (`SUM(debts.amount) - SUM(debt_payments.amount)`), never stored.
- The legacy single-item `POST /sales` and the multi-item `POST /orders` both exist; the UI uses `/orders`. The itemized debt form and the daily/POS sheets all post `/orders`.

### Frontend structure

`client/src/App.jsx` holds a `NAV` array and renders the selected page from React state (**no router/URLs**; `goto(id, subTab)` switches pages and an optional sub-tab via `initialTab`). Several sidebar items are thin tab-wrappers grouping pages: `Money.jsx` (Expenses+Income), `People.jsx` (Customers+Debts), `ReportsHub.jsx` (Reports+Cashup). `Shop.jsx` is the bar hub with its own tabs (Daily Bar Entry, New Sale/POS, Open Tabs, Sales History, Products/Stock incl. bulk "Stock Entry"). Shared modal/field/confirm primitives are in `client/src/ui.jsx`; all theming uses CSS variables in `client/src/styles.css` (light/dark).

## Data, deployment & gotchas

- **`data.db` is git-ignored.** Deleting it reseeds `admin`/`admin123` + default categories on next start. On Windows the file is locked while a server is running — **stop the server first** (`Stop-Hotzonex.bat`, or kill the process on port 4100) before deleting/copying it.
- **Deployment is GitHub → Vercel auto-deploy.** Pushing to `main` triggers a production build for the `hotzonex-daily-expenses` Vercel project. `vercel.json` uses `buildCommand`/`outputDirectory: client/dist` + a rewrite of `/api/(.*)` to the `api/` function and an SPA fallback to `/index.html`. The deployed API returns a clean **503 "Database not configured"** until the Turso env vars exist.
- The cloud (Turso) and local (`data.db`) are **separate databases** — local desktop data does not appear in the cloud and vice versa.
- Windows desktop packaging is a launcher, not Electron: `desktop.mjs` + `Hotzonex.vbs` (run hidden) + `Create-Desktop-Shortcut.ps1`. It reuses the system Node (which has `node:sqlite`).
