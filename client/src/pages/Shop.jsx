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
      </div>
      {tab === 'pos' && <POS />}
      {tab === 'tabs' && <Tabs />}
      {tab === 'orders' && <Orders />}
      {tab === 'products' && <Products />}
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

  const stockValue = rows.reduce((a, p) => a + p.stock * p.cost, 0);

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Products / Stock <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 13 }}>· stock worth {money(stockValue)}</span></h3>
        <button className="btn" onClick={() => setEditing({ name: '', price: '', cost: '', stock: '' })}>+ Add Product</button>
      </div>
      <div className="panel-body" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Name</th><th className="num">Cost</th><th className="num">Price</th><th className="num">Margin</th><th className="num">Stock</th><th></th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="empty">No products yet</td></tr>}
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td className="num">{money(p.cost)}</td>
                <td className="num">{money(p.price)}</td>
                <td className="num">{money(p.price - p.cost)}</td>
                <td className="num">{p.stock <= 5 ? <span className="badge amber">{p.stock}</span> : p.stock}</td>
                <td className="num" style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn ghost sm" onClick={() => setRestock(p)}>+ Stock</button>
                  <button className="icon-btn" onClick={() => setEditing(p)}>✏️</button>
                  <button className="icon-btn" onClick={() => confirm(`Remove ${p.name}?`, async () => { await api(`/products/${p.id}`, { method: 'DELETE' }); load(); })}>🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <ProductForm row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {restock && <RestockForm product={restock} onClose={() => setRestock(null)} onSaved={() => { setRestock(null); load(); }} />}
      {confirmNode}
    </div>
  );
}

function ProductForm({ row, onClose, onSaved }) {
  const [f, setF] = useState({ ...row });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setErr('');
    try {
      if (row.id) await api(`/products/${row.id}`, { method: 'PUT', body: f });
      else await api('/products', { method: 'POST', body: f });
      onSaved();
    } catch (e) { setErr(e.message); }
  }

  return (
    <Modal title={row.id ? 'Edit product' : 'Add product'} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>Save</button></>}>
      <ErrorMsg>{err}</ErrorMsg>
      <Field label="Name"><input value={f.name} onChange={set('name')} autoFocus placeholder="e.g. Coca-Cola 50cl" /></Field>
      <div className="form-row">
        <Field label="Cost price (SSP)"><input type="number" step="0.01" value={f.cost} onChange={set('cost')} /></Field>
        <Field label="Selling price (SSP)"><input type="number" step="0.01" value={f.price} onChange={set('price')} /></Field>
        <Field label="Stock qty"><input type="number" value={f.stock} onChange={set('stock')} /></Field>
      </div>
    </Modal>
  );
}

function RestockForm({ product, onClose, onSaved }) {
  const [f, setF] = useState({ qty: '', cost: product.cost, record_expense: true, date: today() });
  const [err, setErr] = useState('');

  async function save() {
    setErr('');
    try { await api(`/products/${product.id}/restock`, { method: 'POST', body: f }); onSaved(); }
    catch (e) { setErr(e.message); }
  }
  const totalCost = (Number(f.qty) || 0) * (Number(f.cost) || 0);

  return (
    <Modal title={`Add stock · ${product.name}`} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>Add stock</button></>}>
      <ErrorMsg>{err}</ErrorMsg>
      <p style={{ marginTop: 0, color: 'var(--muted)' }}>Currently {product.stock} in stock.</p>
      <div className="form-row">
        <Field label="Quantity added"><input type="number" min="1" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} autoFocus /></Field>
        <Field label="Unit cost (SSP)"><input type="number" step="0.01" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} /></Field>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer' }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={f.record_expense} onChange={(e) => setF({ ...f, record_expense: e.target.checked })} />
        Also record {money(totalCost)} as a “Stock Purchase” expense
      </label>
      {f.record_expense && <Field label="Expense date"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>}
    </Modal>
  );
}
