import React, { useEffect, useState } from 'react';
import { api, money } from '../../api.js';
import { Modal, Field, ErrorMsg, useConfirm } from '../../ui.jsx';

export default function Vouchers() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('');
  const [generating, setGenerating] = useState(false);
  const [confirmNode, confirm] = useConfirm();

  function load() {
    const qs = new URLSearchParams();
    if (status) qs.set('status', status);
    api('/isp/vouchers?' + qs.toString()).then(setRows).catch(() => {});
  }
  useEffect(() => { load(); }, [status]);

  const unused = rows.filter((r) => r.status === 'unused');
  const unusedValue = unused.reduce((a, r) => a + r.price, 0);

  function printBatch(batch) {
    const list = rows.filter((r) => r.batch === batch);
    if (list.length === 0) return;
    const w = window.open('', '_blank', 'width=420,height=640');
    const cards = list.map((v) => `<div class="v"><div class="code">${v.code}</div><div class="meta">${money(v.price)} · ${v.validity_days} day(s)</div></div>`).join('');
    w.document.write(`<html><head><title>Vouchers ${batch}</title><style>
      body{font-family:monospace;padding:14px;color:#000}
      h2{text-align:center;margin:0 0 10px}
      .grid{display:flex;flex-wrap:wrap;gap:8px}
      .v{border:1px dashed #000;border-radius:6px;padding:10px 12px;width:150px;text-align:center}
      .code{font-size:18px;font-weight:bold;letter-spacing:2px}
      .meta{font-size:11px;color:#444;margin-top:4px}
    </style></head><body>
      <h2>HOTZONEX WiFi · ${batch}</h2>
      <div class="grid">${cards}</div>
      <script>window.print();</script></body></html>`);
    w.document.close();
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Hotspot Vouchers · <span style={{ color: 'var(--green)' }}>{unused.length} unused</span>
          {unusedValue > 0 && <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 13 }}> · {money(unusedValue)} value</span>}</h3>
        <div className="toolbar">
          <div>
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option><option value="unused">Unused</option><option value="used">Used</option>
            </select>
          </div>
          <button className="btn" onClick={() => setGenerating(true)}>＋ Generate batch</button>
        </div>
      </div>
      <div className="panel-body" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Code</th><th>Batch</th><th className="num">Price</th><th className="num">Validity</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="empty">No vouchers — click “Generate batch”.</td></tr>}
            {rows.map((v) => (
              <tr key={v.id}>
                <td style={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: 1 }}>{v.code}</td>
                <td style={{ color: 'var(--muted)', fontSize: 12 }}>
                  {v.batch}
                  <button className="icon-btn" title="Print this batch" onClick={() => printBatch(v.batch)}>🖨</button>
                </td>
                <td className="num">{money(v.price)}</td>
                <td className="num">{v.validity_days}d</td>
                <td>{v.status === 'used' ? <span className="badge gray">used {v.used_date || ''}</span> : <span className="badge green">unused</span>}</td>
                <td className="num" style={{ whiteSpace: 'nowrap' }}>
                  {v.status === 'unused' && <button className="btn ghost sm" onClick={() => confirm(`Mark ${v.code} as sold? Adds ${money(v.price)} to Internet income.`, async () => { await api(`/isp/vouchers/${v.id}/use`, { method: 'POST', body: {} }); load(); })}>Mark sold</button>}
                  <button className="icon-btn" title="Delete" onClick={() => confirm(`Delete voucher ${v.code}?`, async () => { await api(`/isp/vouchers/${v.id}`, { method: 'DELETE' }); load(); })}>🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {generating && <GenerateForm onClose={() => setGenerating(false)} onSaved={(batch) => { setGenerating(false); load(); }} />}
      {confirmNode}
    </div>
  );
}

function GenerateForm({ onClose, onSaved }) {
  const [f, setF] = useState({ count: 10, price: '', validity_days: 1 });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setErr('');
    if (!Number(f.count) || Number(f.count) < 1) { setErr('How many vouchers?'); return; }
    try { const res = await api('/isp/vouchers/generate', { method: 'POST', body: f }); onSaved(res.batch); }
    catch (e) { setErr(e.message); }
  }

  return (
    <Modal title="Generate voucher batch" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>Generate</button></>}>
      <ErrorMsg>{err}</ErrorMsg>
      <div className="form-row">
        <Field label="How many"><input type="number" min="1" max="500" value={f.count} onChange={set('count')} autoFocus /></Field>
        <Field label="Price each (SSP)"><input type="number" step="0.01" value={f.price} onChange={set('price')} placeholder="0" /></Field>
        <Field label="Validity (days)"><input type="number" min="1" value={f.validity_days} onChange={set('validity_days')} /></Field>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 12.5, marginBottom: 0 }}>Codes are random 8-character strings. Revenue is counted when you mark each one sold.</p>
    </Modal>
  );
}
