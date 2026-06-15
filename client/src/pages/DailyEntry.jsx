import React, { useEffect, useMemo, useState } from 'react';
import { api, money, today } from '../api.js';
import { ErrorMsg } from '../ui.jsx';

const rand = () => Math.random().toString(36).slice(2);
const emptyRow = () => ({ key: rand(), product_id: '', name: '', qty: '', unit_price: '' });

export default function DailyEntry() {
  const [date, setDate] = useState(today());
  const [products, setProducts] = useState([]);
  const [rows, setRows] = useState([emptyRow()]);
  const [recorded, setRecorded] = useState(0);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(null);

  function loadProducts() { api('/products').then(setProducts).catch(() => {}); }
  function loadRecorded() {
    api(`/orders?from=${date}&to=${date}`).then((os) => setRecorded(os.reduce((a, o) => a + o.total, 0))).catch(() => {});
  }
  useEffect(() => { loadProducts(); }, []);
  useEffect(() => { loadRecorded(); }, [date]);

  // choose a product (or custom) for a row — auto-fills name & price
  function pick(key, val) {
    setRows((rs) => rs.map((r) => {
      if (r.key !== key) return r;
      if (val === '') return { ...r, product_id: '', name: '', unit_price: '' };
      if (val === '__custom__') return { ...r, product_id: '__custom__', name: '', unit_price: '' };
      const p = products.find((x) => String(x.id) === String(val));
      return { ...r, product_id: Number(val), name: p ? p.name : '', unit_price: p ? p.price : r.unit_price };
    }));
  }
  const setRow = (key, k, v) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [k]: v } : r)));
  const addRow = () => setRows((rs) => [...rs, emptyRow()]);
  const removeRow = (key) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : [emptyRow()]));

  const computed = rows.map((r) => ({ ...r, amount: (Number(r.qty) || 0) * (Number(r.unit_price) || 0) }));
  const total = useMemo(() => computed.reduce((a, r) => a + r.amount, 0), [computed]);
  const stockOf = (id) => products.find((p) => p.id === id)?.stock;

  function validRows() {
    return rows.filter((r) => Number(r.qty) > 0 && (typeof r.product_id === 'number' || r.name.trim()));
  }

  async function save() {
    setErr('');
    const vr = validRows();
    if (vr.length === 0) { setErr('Add at least one item with a quantity'); return; }
    const items = vr.map((r) => typeof r.product_id === 'number'
      ? { product_id: r.product_id, qty: Number(r.qty), unit_price: Number(r.unit_price) }
      : { product_name: r.name.trim(), qty: Number(r.qty), unit_price: Number(r.unit_price) });
    try {
      const res = await api('/orders', { method: 'POST', body: { date, is_credit: false, note: 'Daily bar sheet', items } });
      setSaved({ date, total: res.total, lines: vr.map((r) => ({ name: r.name || '(custom)', qty: Number(r.qty), amount: (Number(r.qty) || 0) * (Number(r.unit_price) || 0) })) });
      setRows([emptyRow()]);
      loadProducts();
      loadRecorded();
    } catch (e) { setErr(e.message); }
  }

  function printSheet() {
    const list = computed.filter((r) => r.amount > 0);
    const body = list.map((r) => `<tr><td>${r.name || '(custom)'}</td><td style="text-align:right">${r.qty}</td><td style="text-align:right">${money(r.unit_price)}</td><td style="text-align:right">${money(r.amount)}</td></tr>`).join('');
    const w = window.open('', '_blank', 'width=460,height=680');
    w.document.write(`<html><head><title>Bar sheet ${date}</title><style>
      body{font-family:monospace;padding:16px;font-size:12px;color:#000}
      h2{text-align:center;margin:0} .muted{text-align:center;color:#555;margin:2px 0 12px}
      table{width:100%;border-collapse:collapse} td,th{padding:3px 4px;border-bottom:1px solid #ddd}
      th{text-align:left;border-bottom:1px solid #000} .tot td{border-top:2px solid #000;font-weight:bold;font-size:14px}
    </style></head><body>
      <h2>HOTZONEX BAR</h2><p class="muted">Daily Sales Sheet · ${date}</p>
      <table><tr><th>Item</th><th style="text-align:right">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Amount</th></tr>
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
            <button className="btn ghost" onClick={printSheet}>🖨 Print</button>
          </div>
        </div>

        {recorded > 0 && (
          <div style={{ padding: '10px 18px', background: 'var(--surface-2)', color: 'var(--muted)', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
            Already recorded for {date}: <strong>{money(recorded)}</strong>. New rows below add on top.
          </div>
        )}

        <div className="panel-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ minWidth: 720 }}>
            <thead>
              <tr><th style={{ minWidth: 220 }}>Item</th><th className="num">Qty sold</th><th className="num">Price (SSP)</th><th className="num">Amount</th><th></th></tr>
            </thead>
            <tbody>
              {computed.map((r) => {
                const stock = typeof r.product_id === 'number' ? stockOf(r.product_id) : undefined;
                const over = stock !== undefined && Number(r.qty) > stock;
                return (
                  <tr key={r.key}>
                    <td style={{ padding: '6px' }}>
                      <select value={r.product_id === '' ? '' : r.product_id} onChange={(e) => pick(r.key, e.target.value)}>
                        <option value="">— choose item —</option>
                        {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.stock} in stock)</option>)}
                        <option value="__custom__">+ custom item…</option>
                      </select>
                      {r.product_id === '__custom__' && (
                        <input value={r.name} onChange={(e) => setRow(r.key, 'name', e.target.value)} placeholder="Custom item name" style={{ marginTop: 6 }} />
                      )}
                      {over && <div style={{ color: 'var(--amber)', fontSize: 11, marginTop: 3 }}>Only {stock} in stock</div>}
                    </td>
                    <td style={{ padding: '6px' }}><input type="number" min="0" value={r.qty} onChange={(e) => setRow(r.key, 'qty', e.target.value)} placeholder="0" style={{ textAlign: 'right' }} /></td>
                    <td style={{ padding: '6px' }}><input type="number" step="0.01" value={r.unit_price} onChange={(e) => setRow(r.key, 'unit_price', e.target.value)} placeholder="0" style={{ textAlign: 'right' }} /></td>
                    <td className="num" style={{ fontWeight: r.amount ? 700 : 400 }}>{r.amount ? money(r.amount) : '—'}</td>
                    <td className="num"><button className="icon-btn" onClick={() => removeRow(r.key)}>✕</button></td>
                  </tr>
                );
              })}
              <tr style={{ background: 'var(--surface-2)', fontWeight: 700 }}>
                <td colSpan={3} style={{ padding: '10px 14px' }}>TOTAL — {validRows().length} item(s)</td>
                <td className="num" style={{ fontSize: 16, color: 'var(--brand)' }}>{money(total)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn ghost" onClick={addRow}>+ Add item row</button>
          <div style={{ flex: 1 }} />
          <ErrorMsg>{err}</ErrorMsg>
          <button className="btn success" style={{ padding: 12, fontSize: 16 }} onClick={save} disabled={total <= 0}>
            Save day's sales · {money(total)}
          </button>
        </div>
      </div>

      {saved && (
        <div className="panel">
          <div className="panel-head"><h3>✅ Saved — {saved.date}</h3></div>
          <div className="panel-body" style={{ padding: 0 }}>
            <table>
              <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {saved.lines.map((l, i) => <tr key={i}><td>{l.name}</td><td className="num">{l.qty}</td><td className="num">{money(l.amount)}</td></tr>)}
                <tr><td style={{ fontWeight: 700 }}>Total recorded</td><td></td><td className="num" style={{ fontWeight: 700 }}>{money(saved.total)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
