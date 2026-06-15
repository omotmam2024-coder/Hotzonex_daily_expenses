# Hotzonex — Daily Expense Tracker

A web app to track Hotzonex's daily money: **expenses**, **income**, **shop sales
(drinks)**, **stock**, and a **customer debt book** for items taken on credit.
Amounts are in **South Sudanese Pound (SSP)**.

Same stack as the Hotzonex billing system: Express + `node:sqlite` backend, React +
Vite frontend, single shared admin login (JWT). No native build tools required.

## Features

- **Dashboard** — today / month money in vs out, net, outstanding debt, low-stock alerts, 30-day chart.
- **Expenses** — record daily expenses by category & payment method, edit/delete, date filter, CSV export.
- **Income** — record networking jobs, installations and other income.
- **Shop & Sales (POS / bar tab)** — a point-of-sale screen: tap items to build a
  bill, the **total adds up automatically**, adjust quantities with +/−, then check
  out as **Cash** or **Credit** (puts the whole bill on a customer's tab → debt
  book). Prints a receipt. Selling reduces stock automatically.
  - **Products / Stock** — manage products (cost, price, stock) and **restock** when
    you buy inventory; restocking can auto-log a "Stock Purchase" expense.
  - **Sales History** — every bill, expandable to its line items, CSV export.
- **Customers** — customer list with each person's running balance.
- **Debt Book** — every debt, partial payments, due dates, **overdue** flags,
  filter by customer / open / settled, CSV export. Credit sales appear here
  automatically.
- **Reports** — profit/loss for any period (today, 7 days, month, year, custom),
  expenses-by-category breakdown.
- **Settings** — manage categories, change the admin password.

## Run it

### First time
```bash
npm install            # server deps
npm run build          # installs client deps and builds the UI
npm start              # serves UI + API on http://localhost:4100
```
Open **http://localhost:4100** and log in with:

- Username: `admin`
- Password: `admin123`  ← change this under **Settings** after first login.

### Development (hot reload)
```bash
npm run dev:server     # API on :4100
npm run dev:client     # Vite UI on :5174 (proxies /api to :4100)
```

## Data

All data lives in a single SQLite file `data.db` in the project root (created on
first run, seeded with a default admin and starter categories). Back it up by
copying that file. It is git-ignored.

Change the port with `PORT=...` and set a real `JWT_SECRET` in production.
