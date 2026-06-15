import React, { useEffect, useMemo, useState } from 'react';
import { api, money, today } from '../api.js';
import { ErrorMsg } from '../ui.jsx';

export default function DailyEntry() {
  const [date, setDate] = useState(today());
  const [products, setProducts] = useState([]);
  const [qty, setQty] = useState({});      // productId -> qty sold
  const [price, setPrice] = useState({});  // productId -> unit price for the day
  const [recorded, setRecorded] = useState(0);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(null);

  function loadProducts() {
    api('/products').then((ps) => {
      setProducts(ps);
      setPrice((p) => { const n = { ...p }; ps.forEach((x) => { if (n[x.id] === undefined) n[x.id] = x.price; }); return n; });
    }).catch(() => {});
  }
  function loadRecorded() {
    api(`/orders?from=${date}&to=${date}`).then((os) => setRecorded(os.reduce((a, o) => a + o.total, 0))).catch(() => {});
  }
  useEffect(() => { loadProducts(); }, []);
  useEffect(() => { loadRecorded(); }, [date]);

  const rows = products.map((p) => {
    const sold = Number(qty[p.id]) || 0;
    const unit = price[p.id] === undefined || price[p.id] === '' ? p.price : Number(price[p.id]);
    return { ...p, sold, unit, amount: sold * unit };
  });
  const total = useMemo(() => rows.reduce((a, r) => a + r.amount, 0), [rows]);
  const itemsSold = rows.filter((r) => r.sold > 0).length;

  async function save() {
    setErr('');
    const items = rows.filter((r) => r.sold > 0).map((r) => ({ product_id: r.id, qty: r.sold, unit_price: r.unit }));
    if (items.length === 0) { setErr('Enter how many of at least one item were sold'); return; }
    try {
      const res = await api('/orders', { method: 'POST', body: { date, is_credit: false, note: 'Daily bar sheet', items } });
      setSaved({ total: res.total, lines: rows.filter((r) => r.sold > 0).map((r) => ({ name: r.name, sold: r.sold, unit: r.unit, amount: r.amount })), date });
      setQty({});
      loadProducts();
      loadRecorded();
    } catch (e) { setErr(e.message); }
  }

  function printSheet() {
    const list = rows.filter((r) => r.sold > 0);
    const body = (list.length ? list : rows).map((r) =>
      `<tr><td>${r.name}</td><td style="text-align:right">${money(r.unit)}</td><td style="text-align:right">${r.sold || ''}</td><td style="text-align:right">${r.amount ? money(r.amount) : ''}</td></tr>`
    ).join('');
    const w = window.open('', '_blank', 'width=460,height=680');
    w.document.write(`<html><head><title>Bar sheet ${date}</title><style>
      body{font-family:monospace;padding:16px;font-size:12px;color:#000}
      h2{text-align:center;margin:0} .muted{text-align:center;color:#555;margin:2px 0 12px}
      table{width:100%;border-collapse:collapse} td,th{padding:3px 4px;border-bottom:1px solid #ddd}
      th{text-align:left;border-bottom:1px solid #000} .tot td{border-top:2px solid #000;font-weight:bold;font-size:14px}
    </style></head><body>
      <h2>HOTZONEX BAR</h2><p class="muted">Daily Sales Sheet · ${date}</p>
      <table><tr><th>Item</th><th style="text-align:right">Price</th><th style="text-align:right">Sold</th><th style="text-align:right">Amount</th></tr>
      ${body}<tr class="tot"><td colspan="3">TOTAL</td><td style="text-align:right">${money(total)}</td></tr></table>
      <script>window.print();</script></body></html>`);
    w.document.close();
  }

  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <h3>🍺 Bar Daily Entry · <span style={{ color: 'var(--green)' }}>{money(total)}</span></h3>
          <div className="toolbar">
            <div><label>Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <button className="btn ghost" onClick={() => setDate(today())}>Today</button>
            <button className="btn ghost" onClick={printSheet}>🖨 Print sheet</button>
          </div>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {recorded > 0 && (
            <div style={{ padding: '10px 18px', background: 'var(--surface-2)', color: 'var(--muted)', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
              Already recorded for {date}: <strong>{money(recorded)}</strong>. New entries below are added on top.
            </div>
          )}
          {products.length === 0 ? (
            <p className="empty" style={{ padding: 28 }}>No goods yet — add your bar's items under <strong>Shop → Products / Stock</strong> first.</p>
          ) : (
            <table>
              <thead>
                <tr><th>Item</th><th className="num">Price (SSP)</th><th className="num">In stock</th><th className="num" style={{ width: 110 }}>Sold today</th><th className="num">Amount</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td className="num">
                      <input type="number" step="0.01" value={price[r.id] ?? r.price} onChange={(e) => setPrice({ ...price, [r.id]: e.target.value })}
                        style={{ width: 90, textAlign: 'right', padding: '5px 8px' }} />
                    </td>
                    <td className="num">{r.stock <= 5 ? <span className="badge amber">{r.stock}</span> : r.stock}</td>
                    <td className="num">
                      <input type="number" min="0" value={qty[r.id] ?? ''} placeholder="0" onChange={(e) => setQty({ ...qty, [r.id]: e.target.value })}
                        style={{ width: 90, textAlign: 'right', padding: '5px 8px' }} />
                    </td>
                    <td className="num" style={{ fontWeight: r.amount ? 700 : 400 }}>{r.amount ? money(r.amount) : '—'}</td>
                  </tr>
                ))}
                <tr style={{ background: 'var(--surface-2)' }}>
                  <td colSpan={3} style={{ fontWeight: 700 }}>TOTAL — {itemsSold} item{itemsSold === 1 ? '' : 's'}</td>
                  <td></td>
                  <td className="num" style={{ fontWeight: 700, fontSize: 16, color: 'var(--brand)' }}>{money(total)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
        {products.length > 0 && (
          <div style={{ padding: 18, borderTop: '1px solid var(--border)' }}>
            <ErrorMsg>{err}</ErrorMsg>
            <button className="btn success" style={{ padding: 12, fontSize: 16 }} onClick={save} disabled={total <= 0}>
              Save day's sales · {money(total)}
            </button>
          </div>
        )}
      </div>

      {saved && (
        <div className="panel">
          <div className="panel-head"><h3>✅ Saved — {saved.date}</h3></div>
          <div className="panel-body" style={{ padding: 0 }}>
            <table>
              <thead><tr><th>Item</th><th className="num">Sold</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {saved.lines.map((l, i) => <tr key={i}><td>{l.name}</td><td className="num">{l.sold}</td><td className="num">{money(l.amount)}</td></tr>)}
                <tr><td style={{ fontWeight: 700 }}>Total recorded</td><td></td><td className="num" style={{ fontWeight: 700 }}>{money(saved.total)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
