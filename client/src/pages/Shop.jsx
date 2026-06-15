import React, { useEffect, useMemo, useState } from 'react';
import { api, money, today, toCSV, downloadCSV } from '../api.js';
import { Modal, Field, ErrorMsg, useConfirm } from '../ui.jsx';

export default function Shop() {
  const [tab, setTab] = useState('pos');
  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button className={'btn ' + (tab === 'pos' ? '' : 'ghost')} onClick={() => setTab('pos')}>🧾 New Sale</button>
        <button className={'btn ' + (tab === 'tabs' ? '' : 'ghost')} onClick={() => setTab('tabs')}>💳 Open Tabs</button>
        <button className={'btn ' + (tab === 'orders' ? '' : 'ghost')} onClick={() => setTab('orders')}>Sales History</button>
        <button className={'btn ' + (tab === 'products' ? '' : 'ghost')} onClick={() => setTab('products')}>Products / Stock</button>
        <button className={'btn ' + (tab === 'intake' ? '' : 'ghost')} onClick={() => setTab('intake')}>📋 Stock Entry</button>
      </div>
      {tab === 'pos' && <POS />}
      {tab === 'tabs' && <Tabs />}
      {tab === 'orders' && <Orders />}
      {tab === 'products' && <Products />}
      {tab === 'intake' && <StockIntake />}
    </>
  );
}

/* ----------------------------- Point of sale ----------------------------- */
function POS() {
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [cart, setCart] = useState([]);
  const [date, setDate] = useState(today());
  const [credit, setCredit] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [err, setErr] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [search, setSearch] = useState('');

  function loadProducts() { api('/products').then(setProducts).catch(() => {}); }
  useEffect(() => { loadProducts(); api('/customers').then(setCustomers).catch(() => {}); }, []);

  const total = useMemo(() => cart.reduce((a, l) => a + l.qty * Number(l.price || 0), 0), [cart]);

  function addProduct(p) {
    setCart((c) => {
      const i = c.findIndex((x) => x.product_id === p.id);
      if (i >= 0) { const n = [...c]; n[i] = { ...n[i], qty: n[i].qty + 1 }; return n; }
      return [...c, { key: 'p' + p.id, product_id: p.id, name: p.name, price: p.price, qty: 1, stock: p.stock }];
    });
  }
  function addCustom() {
    setCart((c) => [...c, { key: 'c' + Date.now(), product_id: null, name: '', price: '', qty: 1 }]);
  }
  function setLine(key, patch) { setCart((c) => c.map((l) => (l.key === key ? { ...l, ...patch } : l))); }
  function removeLine(key) { setCart((c) => c.filter((l) => l.key !== key)); }

  async function checkout() {
    setErr('');
    if (cart.length === 0) { setErr('Add at least one item'); return; }
    if (cart.some((l) => !l.name)) { setErr('Every custom item needs a name'); return; }
    if (credit && !customerId) { setErr('Choose the customer whose tab this goes on'); return; }
    try {
      const body = {
        date, is_credit: credit, customer_id: customerId || null, due_date: dueDate || null,
        items: cart.map((l) => ({ product_id: l.product_id, product_name: l.name, qty: Number(l.qty), unit_price: Number(l.price) })),
      };
      const res = await api('/orders', { method: 'POST', body });
      setReceipt({
        id: res.id, date, total: res.total, credit,
        customer: customers.find((c) => String(c.id) === String(customerId))?.name,
        lines: cart.map((l) => ({ name: l.name, qty: Number(l.qty), price: Number(l.price) })),
      });
      setCart([]); setCredit(false); setCustomerId(''); setDueDate('');
      loadProducts();
    } catch (e) { setErr(e.message); }
  }

  const visible = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="pos">
      <div className="pos-products panel">
        <div className="panel-head">
          <h3>Tap an item to add it</h3>
          <input placeholder="Search items…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 200 }} />
        </div>
        <div className="panel-body">
          {products.length === 0 && <p style={{ color: 'var(--muted)' }}>No products yet — add some under “Products / Stock”, or use “+ Custom item”.</p>}
          <div className="prod-grid">
            {visible.map((p) => (
              <button key={p.id} className="prod-tile" onClick={() => addProduct(p)} disabled={p.stock <= 0} title={p.stock <= 0 ? 'Out of stock' : ''}>
                <span className="pt-name">{p.name}</span>
                <span className="pt-price">{money(p.price)}</span>
                <span className={'pt-stock ' + (p.stock <= 5 ? 'low' : '')}>{p.stock} in stock</span>
              </button>
            ))}
          </div>
          <button className="btn ghost" style={{ marginTop: 14 }} onClick={addCustom}>+ Custom item</button>
        </div>
      </div>

      <div className="pos-cart panel">
        <div className="panel-head"><h3>Current bill</h3>{cart.length > 0 && <button className="btn ghost sm" onClick={() => setCart([])}>Clear</button>}</div>
        <div className="panel-body" style={{ paddingBottom: 0 }}>
          <ErrorMsg>{err}</ErrorMsg>
          {cart.length === 0 && <p className="empty" style={{ padding: 20 }}>No items yet</p>}
          {cart.map((l) => (
            <div key={l.key} className="cart-line">
              <div style={{ flex: 1 }}>
                {l.product_id
                  ? <div className="cl-name">{l.name}</div>
                  : <input placeholder="Item name" value={l.name} onChange={(e) => setLine(l.key, { name: e.target.value })} style={{ marginBottom: 4 }} />}
                <input type="number" step="0.01" value={l.price} onChange={(e) => setLine(l.key, { price: e.target.value })} style={{ width: 90, fontSize: 12, padding: '4px 8px' }} /> <span style={{ color: 'var(--muted)', fontSize: 12 }}>each</span>
              </div>
              <div className="qty-stepper">
                <button onClick={() => setLine(l.key, { qty: Math.max(1, l.qty - 1) })}>−</button>
                <input value={l.qty} onChange={(e) => setLine(l.key, { qty: Math.max(1, Number(e.target.value) || 1) })} />
                <button onClick={() => setLine(l.key, { qty: l.qty + 1 })}>+</button>
              </div>
              <div className="cl-total">{money(l.qty * Number(l.price || 0))}</div>
              <button className="icon-btn" onClick={() => removeLine(l.key)}>✕</button>
            </div>
          ))}
        </div>
        <div className="cart-foot">
          <div className="cart-total"><span>Total</span><strong>{money(total)}</strong></div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0', cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={credit} onChange={(e) => setCredit(e.target.checked)} />
            Put on a customer's tab (credit)
          </label>
          {credit && (
            <div className="form-row" style={{ marginBottom: 8 }}>
              <Field label="Customer">
                <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                  <option value="">— select —</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
                </select>
              </Field>
              <Field label="Due date"><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
            </div>
          )}
          <div className="form-row" style={{ marginBottom: 10 }}>
            <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          </div>
          <button className="btn success" style={{ width: '100%', padding: 12, fontSize: 16 }} onClick={checkout} disabled={cart.length === 0}>
            {credit ? 'Save to tab' : 'Complete sale'} · {money(total)}
          </button>
        </div>
      </div>

      {receipt && <Receipt r={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}

function Receipt({ r, onClose }) {
  function print() {
    const w = window.open('', '_blank', 'width=380,height=600');
    const rows = r.lines.map((l) => `<tr><td>${l.qty} × ${l.name}</td><td style="text-align:right">${money(l.qty * l.price)}</td></tr>`).join('');
    w.document.write(`<html><head><title>Receipt #${r.id}</title><style>
      body{font-family:monospace;padding:16px;font-size:13px;color:#000}
      h2{text-align:center;margin:0 0 2px} .muted{text-align:center;color:#555;margin:0 0 12px}
      table{width:100%;border-collapse:collapse} td{padding:3px 0}
      .tot{border-top:1px dashed #000;font-weight:bold;font-size:15px}
    </style></head><body>
      <h2>HOTZONEX</h2><p class="muted">Sales Receipt · #${r.id}<br/>${r.date}</p>
      <table>${rows}<tr class="tot"><td>TOTAL</td><td style="text-align:right">${money(r.total)}</td></tr></table>
      <p class="muted" style="margin-top:12px">${r.credit ? 'ON TAB — ' + (r.customer || '') : 'PAID — Cash'}</p>
      <p class="muted">Thank you!</p>
      <script>window.print();</script></body></html>`);
    w.document.close();
  }
  return (
    <Modal title="✅ Sale recorded" onClose={onClose}
      footer={<><button className="btn ghost" onClick={print}>🖨 Print receipt</button><button className="btn" onClick={onClose}>New sale</button></>}>
      <p style={{ marginTop: 0, color: 'var(--muted)' }}>Bill #{r.id} · {r.date} · {r.credit ? <span className="badge amber">On {r.customer}'s tab</span> : <span className="badge green">Cash</span>}</p>
      <table>
        <tbody>
          {r.lines.map((l, i) => <tr key={i}><td>{l.qty} × {l.name}</td><td className="num">{money(l.qty * l.price)}</td></tr>)}
          <tr><td style={{ fontWeight: 700 }}>Total</td><td className="num" style={{ fontWeight: 700 }}>{money(r.total)}</td></tr>
        </tbody>
      </table>
    </Modal>
  );
}

/* ------------------------------- Open tabs ------------------------------- */
function Tabs() {
  const [rows, setRows] = useState([]);
  const [paying, setPaying] = useState(null);
  const [confirmNode, confirm] = useConfirm();

  function load() { api('/customers').then((cs) => setRows(cs.filter((c) => c.balance > 0.0001))).catch(() => {}); }
  useEffect(() => { load(); }, []);

  const total = rows.reduce((a, c) => a + c.balance, 0);

  async function clearTab(c) {
    await api(`/customers/${c.id}/pay-tab`, { method: 'POST', body: { date: today() } });
    load();
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Open Tabs · <span style={{ color: 'var(--amber)' }}>{money(total)}</span></h3>
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>{rows.length} customer(s) owing</span>
      </div>
      <div className="panel-body" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Customer</th><th>Phone</th><th className="num">Owing</th><th></th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={4} className="empty">🎉 No open tabs — everyone is paid up</td></tr>}
            {rows.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.phone}</td>
                <td className="num"><span className="badge amber">{money(c.balance)}</span></td>
                <td className="num" style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn ghost sm" onClick={() => setPaying(c)}>Part-pay</button>
                  <button className="btn success sm" onClick={() => confirm(`Clear ${c.name}'s whole tab of ${money(c.balance)}? (records it as fully paid)`, () => clearTab(c))}>Clear tab</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {paying && <PayTabForm customer={paying} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); load(); }} />}
      {confirmNode}
    </div>
  );
}

function PayTabForm({ customer, onClose, onSaved }) {
  const [f, setF] = useState({ date: today(), amount: '' });
  const [err, setErr] = useState('');

  async function save() {
    setErr('');
    const amt = Number(f.amount);
    if (!amt || amt <= 0) { setErr('Enter an amount'); return; }
    if (amt > customer.balance + 0.0001) { setErr(`Cannot pay more than the ${money(customer.balance)} owing`); return; }
    try { await api(`/customers/${customer.id}/pay-tab`, { method: 'POST', body: f }); onSaved(); }
    catch (e) { setErr(e.message); }
  }

  return (
    <Modal title={`Part-pay tab · ${customer.name}`} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn success" onClick={save}>Record payment</button></>}>
      <ErrorMsg>{err}</ErrorMsg>
      <p style={{ marginTop: 0, color: 'var(--muted)' }}>Owing: <strong style={{ color: 'var(--amber)' }}>{money(customer.balance)}</strong> · applied to oldest items first.</p>
      <div className="form-row">
        <Field label="Date"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Amount paid (SSP)"><input type="number" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} autoFocus /></Field>
      </div>
    </Modal>
  );
}

/* ----------------------------- Sales history ----------------------------- */
function Orders() {
  const [rows, setRows] = useState([]);
  const [from, setFrom] = useState(today().slice(0, 8) + '01');
  const [to, setTo] = useState(today());
  const [detail, setDetail] = useState(null);
  const [confirmNode, confirm] = useConfirm();

  function load() { api(`/orders?from=${from}&to=${to}`).then(setRows).catch(() => {}); }
  useEffect(() => { load(); }, [from, to]);

  const total = rows.reduce((a, r) => a + r.total, 0);
  const credit = rows.filter((r) => r.is_credit).reduce((a, r) => a + r.total, 0);

  function exportCsv() {
    const csv = toCSV(rows, [
      { label: 'Bill', value: 'id' }, { label: 'Date', value: 'date' },
      { label: 'Items', value: 'item_count' }, { label: 'Total', value: 'total' },
      { label: 'Type', value: (r) => (r.is_credit ? 'Credit' : 'Cash') }, { label: 'Customer', value: 'customer_name' },
    ]);
    downloadCSV(`sales_${from}_to_${to}.csv`, csv);
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Sales · <span style={{ color: 'var(--green)' }}>{money(total)}</span> {credit > 0 && <span className="badge amber" style={{ marginLeft: 8 }}>on tab {money(credit)}</span>}</h3>
        <div className="toolbar">
          <div><label>From</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><label>To</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <button className="btn ghost" onClick={exportCsv}>⬇ CSV</button>
        </div>
      </div>
      <div className="panel-body" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Bill</th><th>Date</th><th className="num">Items</th><th className="num">Total</th><th>Type</th><th></th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="empty">No sales in this period</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>#{r.id}</td>
                <td>{r.date}</td>
                <td className="num">{r.item_count}</td>
                <td className="num">{money(r.total)}</td>
                <td>{r.is_credit ? <span className="badge amber">Tab · {r.customer_name}</span> : <span className="badge green">Cash</span>}</td>
                <td className="num" style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn ghost sm" onClick={() => api(`/orders/${r.id}`).then(setDetail)}>View</button>
                  <button className="icon-btn" onClick={() => confirm('Delete this whole bill? Stock is restored and any linked tab/debt removed.', async () => { await api(`/orders/${r.id}`, { method: 'DELETE' }); load(); })}>🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {detail && (
        <Modal title={`Bill #${detail.id} · ${detail.date}`} onClose={() => setDetail(null)} footer={<button className="btn" onClick={() => setDetail(null)}>Close</button>}>
          <table><tbody>
            {detail.items.map((it) => <tr key={it.id}><td>{it.qty} × {it.product_name}</td><td className="num">{money(it.total)}</td></tr>)}
            <tr><td style={{ fontWeight: 700 }}>Total</td><td className="num" style={{ fontWeight: 700 }}>{money(detail.total)}</td></tr>
          </tbody></table>
        </Modal>
      )}
      {confirmNode}
    </div>
  );
}

/* ----------------------------- Products / stock -------------------------- */
function Products() {
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [restock, setRestock] = useState(null);
  const [confirmNode, confirm] = useConfirm();

  function load() { api('/products').then(setRows).catch(() => {}); }
  useEffect(() => { load(); }, []);

  const t = rows.reduce((a, p) => ({
    cost: a.cost + p.total_cost, sales: a.sales + p.exp_sales, profit: a.profit + p.profit,
  }), { cost: 0, sales: 0, profit: 0 });

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Products / Stock</h3>
        <button className="btn" onClick={() => setEditing({ blank: true })}>+ Add Item</button>
      </div>
      <div className="panel-body" style={{ padding: 0, overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Item</th><th className="num">Units</th><th className="num">Cost / Unit</th>
              <th className="num">Pieces / Unit</th><th className="num">Price / Piece</th>
              <th className="num">Total Cost</th><th className="num">Exp. Sales</th>
              <th className="num">Profit</th><th className="num">In Stock</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={10} className="empty">No items yet — click “+ Add Item”</td></tr>}
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td className="num">{p.units}</td>
                <td className="num">{money(p.cost_per_unit)}</td>
                <td className="num">{p.pieces_per_unit}</td>
                <td className="num">{money(p.price)}</td>
                <td className="num">{money(p.total_cost)}</td>
                <td className="num" style={{ color: 'var(--brand)' }}>{money(p.exp_sales)}</td>
                <td className="num" style={{ color: 'var(--green)', fontWeight: 600 }}>{money(p.profit)}</td>
                <td className="num">{p.stock <= 5 ? <span className="badge amber">{p.stock}</span> : p.stock}</td>
                <td className="num" style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn ghost sm" onClick={() => setRestock(p)}>+ Stock</button>
                  <button className="icon-btn" onClick={() => setEditing(p)}>✏️</button>
                  <button className="icon-btn" onClick={() => confirm(`Remove ${p.name}?`, async () => { await api(`/products/${p.id}`, { method: 'DELETE' }); load(); })}>🗑️</button>
                </td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr style={{ background: 'var(--surface-2)', fontWeight: 700 }}>
                <td colSpan={5}>TOTAL</td>
                <td className="num">{money(t.cost)}</td>
                <td className="num" style={{ color: 'var(--brand)' }}>{money(t.sales)}</td>
                <td className="num" style={{ color: 'var(--green)' }}>{money(t.profit)}</td>
                <td colSpan={2}></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editing && <ProductForm row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {restock && <RestockForm product={restock} onClose={() => setRestock(null)} onSaved={() => { setRestock(null); load(); }} />}
      {confirmNode}
    </div>
  );
}

/* --------------------- Stock Entry (spreadsheet form) -------------------- */
function StockIntake() {
  const blank = () => ({ key: Math.random().toString(36).slice(2), name: '', units: '', cost_per_unit: '', pieces_per_unit: '', price_per_piece: '' });
  const [rows, setRows] = useState([blank(), blank(), blank()]);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(0);

  const calc = (r) => {
    const u = Number(r.units) || 0, cpu = Number(r.cost_per_unit) || 0, ppu = Number(r.pieces_per_unit) || 0, pp = Number(r.price_per_piece) || 0;
    const total_cost = u * cpu, exp_sales = u * ppu * pp;
    return { total_cost, exp_sales, profit: exp_sales - total_cost };
  };
  const totals = rows.reduce((a, r) => { const c = calc(r); return { tc: a.tc + c.total_cost, es: a.es + c.exp_sales, pr: a.pr + c.profit }; }, { tc: 0, es: 0, pr: 0 });

  const set = (key, k, v) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [k]: v } : r)));
  const addRow = () => setRows((rs) => [...rs, blank()]);
  const removeRow = (key) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));

  async function saveAll() {
    setErr(''); setSaved(0);
    const toSave = rows.filter((r) => r.name.trim());
    if (toSave.length === 0) { setErr('Type at least one item name first'); return; }
    try {
      for (const r of toSave) await api('/products', { method: 'POST', body: r });
      setSaved(toSave.length);
      setRows([blank(), blank(), blank()]);
    } catch (e) { setErr(e.message); }
  }

  const cell = { padding: '4px 6px' };
  const inp = { padding: '6px 8px', textAlign: 'right', minWidth: 84 };

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>📋 Stock Entry — add items in rows</h3>
        <div className="toolbar">
          <button className="btn ghost" onClick={addRow}>+ Add row</button>
          <button className="btn success" onClick={saveAll}>Save all items</button>
        </div>
      </div>
      <div className="panel-body" style={{ padding: 0, overflowX: 'auto' }}>
        {saved > 0 && <div className="error" style={{ margin: 12, background: '#dcfce7', color: '#15803d' }}>✅ Saved {saved} item(s) — they're now in Products, the POS and the daily sheet.</div>}
        {err && <div className="error" style={{ margin: 12 }}>{err}</div>}
        <table style={{ minWidth: 920 }}>
          <thead>
            <tr>
              <th style={{ minWidth: 150 }}>Item</th><th className="num">Units</th><th className="num">Cost / Unit</th>
              <th className="num">Pieces / Unit</th><th className="num">Price / Piece</th>
              <th className="num">Total Cost</th><th className="num">Exp. Sales</th><th className="num">Profit</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const c = calc(r);
              return (
                <tr key={r.key}>
                  <td style={cell}><input value={r.name} onChange={(e) => set(r.key, 'name', e.target.value)} placeholder="Item name" /></td>
                  <td style={cell}><input type="number" min="0" value={r.units} onChange={(e) => set(r.key, 'units', e.target.value)} placeholder="0" style={inp} /></td>
                  <td style={cell}><input type="number" step="0.01" value={r.cost_per_unit} onChange={(e) => set(r.key, 'cost_per_unit', e.target.value)} placeholder="0" style={inp} /></td>
                  <td style={cell}><input type="number" min="1" value={r.pieces_per_unit} onChange={(e) => set(r.key, 'pieces_per_unit', e.target.value)} placeholder="0" style={inp} /></td>
                  <td style={cell}><input type="number" step="0.01" value={r.price_per_piece} onChange={(e) => set(r.key, 'price_per_piece', e.target.value)} placeholder="0" style={inp} /></td>
                  <td className="num">{c.total_cost ? money(c.total_cost) : '—'}</td>
                  <td className="num" style={{ color: 'var(--brand)' }}>{c.exp_sales ? money(c.exp_sales) : '—'}</td>
                  <td className="num" style={{ color: c.profit >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{c.exp_sales ? money(c.profit) : '—'}</td>
                  <td className="num"><button className="icon-btn" onClick={() => removeRow(r.key)}>✕</button></td>
                </tr>
              );
            })}
            <tr style={{ background: 'var(--surface-2)', fontWeight: 700 }}>
              <td colSpan={5} style={{ padding: '10px 14px' }}>TOTAL ({rows.filter((r) => r.name.trim()).length} item(s))</td>
              <td className="num">{money(totals.tc)}</td>
              <td className="num" style={{ color: 'var(--brand)' }}>{money(totals.es)}</td>
              <td className="num" style={{ color: 'var(--green)' }}>{money(totals.pr)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ padding: 14, borderTop: '1px solid var(--border)', color: 'var(--muted)', fontSize: 12.5 }}>
        Each item starts with stock = Units × Pieces/Unit. Leave a row blank to skip it.
      </div>
    </div>
  );
}

// shared live summary of total cost / expected sales / profit
function CalcSummary({ units, costPerUnit, piecesPerUnit, pricePerPiece }) {
  const u = Number(units) || 0, cpu = Number(costPerUnit) || 0, ppu = Number(piecesPerUnit) || 0, pp = Number(pricePerPiece) || 0;
  const totalCost = u * cpu;
  const expSales = u * ppu * pp;
  const profit = expSales - totalCost;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 6 }}>
      <div className="card" style={{ padding: 12 }}><div className="label">Total cost</div><div style={{ fontSize: 18, fontWeight: 700 }}>{money(totalCost)}</div></div>
      <div className="card" style={{ padding: 12 }}><div className="label">Exp. sales</div><div style={{ fontSize: 18, fontWeight: 700, color: 'var(--brand)' }}>{money(expSales)}</div></div>
      <div className="card" style={{ padding: 12 }}><div className="label">Profit</div><div style={{ fontSize: 18, fontWeight: 700, color: profit >= 0 ? 'var(--green)' : 'var(--red)' }}>{money(profit)}</div></div>
    </div>
  );
}

function ProductForm({ row, onClose, onSaved }) {
  const [f, setF] = useState({
    name: row.name || '',
    units: row.units ?? '',
    cost_per_unit: row.cost_per_unit ?? '',
    pieces_per_unit: row.pieces_per_unit ?? '',
    price_per_piece: row.price ?? '',
  });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const isNew = !row.id;

  async function save() {
    setErr('');
    if (!f.name.trim()) { setErr('Item name is required'); return; }
    try {
      if (row.id) await api(`/products/${row.id}`, { method: 'PUT', body: f });
      else await api('/products', { method: 'POST', body: f });
      onSaved();
    } catch (e) { setErr(e.message); }
  }

  return (
    <Modal wide title={isNew ? 'Add item' : 'Edit item'} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>{isNew ? 'Add item' : 'Save'}</button></>}>
      <ErrorMsg>{err}</ErrorMsg>
      <Field label="Item name"><input value={f.name} onChange={set('name')} autoFocus placeholder="e.g. Tusker" /></Field>
      <div className="form-row">
        <Field label="Units (cartons/crates)"><input type="number" min="0" value={f.units} onChange={set('units')} placeholder="0" /></Field>
        <Field label="Cost / Unit (SSP)"><input type="number" step="0.01" value={f.cost_per_unit} onChange={set('cost_per_unit')} placeholder="0" /></Field>
      </div>
      <div className="form-row">
        <Field label="Pieces / Unit"><input type="number" min="1" value={f.pieces_per_unit} onChange={set('pieces_per_unit')} placeholder="e.g. 24" /></Field>
        <Field label="Price / Piece (SSP)"><input type="number" step="0.01" value={f.price_per_piece} onChange={set('price_per_piece')} placeholder="0" /></Field>
      </div>
      <CalcSummary units={f.units} costPerUnit={f.cost_per_unit} piecesPerUnit={f.pieces_per_unit} pricePerPiece={f.price_per_piece} />
      {isNew
        ? <p style={{ color: 'var(--muted)', fontSize: 12.5, marginBottom: 0 }}>Stock will start at units × pieces = <strong>{(Number(f.units) || 0) * (Number(f.pieces_per_unit) || 0)}</strong> pieces.</p>
        : <p style={{ color: 'var(--muted)', fontSize: 12.5, marginBottom: 0 }}>Editing these figures won’t change the <strong>{row.stock}</strong> pieces already in stock — use “+ Stock” to add more.</p>}
    </Modal>
  );
}

function RestockForm({ product, onClose, onSaved }) {
  const [f, setF] = useState({ units: '', cost_per_unit: product.cost_per_unit || '', record_expense: true, date: today() });
  const [err, setErr] = useState('');
  const piecesAdded = (Number(f.units) || 0) * (product.pieces_per_unit || 1);
  const totalCost = (Number(f.units) || 0) * (Number(f.cost_per_unit) || 0);

  async function save() {
    setErr('');
    try { await api(`/products/${product.id}/restock`, { method: 'POST', body: f }); onSaved(); }
    catch (e) { setErr(e.message); }
  }

  return (
    <Modal title={`Add stock · ${product.name}`} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>Add stock</button></>}>
      <ErrorMsg>{err}</ErrorMsg>
      <p style={{ marginTop: 0, color: 'var(--muted)' }}>Currently {product.stock} pieces in stock · {product.pieces_per_unit} pieces per unit.</p>
      <div className="form-row">
        <Field label="Units bought"><input type="number" min="1" value={f.units} onChange={(e) => setF({ ...f, units: e.target.value })} autoFocus /></Field>
        <Field label="Cost / Unit (SSP)"><input type="number" step="0.01" value={f.cost_per_unit} onChange={(e) => setF({ ...f, cost_per_unit: e.target.value })} /></Field>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 13 }}>Adds <strong>{piecesAdded}</strong> pieces to stock.</p>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer' }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={f.record_expense} onChange={(e) => setF({ ...f, record_expense: e.target.checked })} />
        Also record {money(totalCost)} as a “Stock Purchase” expense
      </label>
      {f.record_expense && <Field label="Expense date"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>}
    </Modal>
  );
}
