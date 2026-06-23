import React, { useEffect, useState } from 'react';
import { api, money, today, toCSV, downloadCSV } from '../../api.js';
import { Modal, Field, ErrorMsg, useConfirm } from '../../ui.jsx';

export default function Invoices() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('unpaid');
  const [paying, setPaying] = useState(null);
  const [msg, setMsg] = useState('');
  const [confirmNode, confirm] = useConfirm();

  function load() {
    const qs = new URLSearchParams();
    if (status) qs.set('status', status);
    api('/isp/invoices?' + qs.toString()).then(setRows).catch(() => {});
  }
  useEffect(() => { load(); }, [status]);

  const totalOut = rows.reduce((a, r) => a + Math.max(0, r.outstanding), 0);

  function isOverdue(r) {
    return r.due_date && r.outstanding > 0.0001 && r.due_date < today();
  }

  async function generate() {
    setMsg('');
    try {
      const res = await api('/isp/invoices/generate', { method: 'POST', body: { date: today() } });
      setMsg(res.created > 0 ? `Generated ${res.created} invoice(s) for ${res.period}.` : `Everyone is already billed for ${res.period}.`);
      load();
    } catch (e) { setMsg(e.message); }
  }

  function exportCsv() {
    const csv = toCSV(rows, [
      { label: 'Invoice', value: 'id' }, { label: 'Date', value: 'date' }, { label: 'Subscriber', value: 'subscriber_name' },
      { label: 'Plan', value: 'plan_name' }, { label: 'Amount', value: 'amount' }, { label: 'Paid', value: 'paid' },
      { label: 'Outstanding', value: 'outstanding' }, { label: 'Due', value: 'due_date' },
    ]);
    downloadCSV('isp_invoices.csv', csv);
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Invoices · <span style={{ color: 'var(--amber)' }}>{money(totalOut)} outstanding</span></h3>
        <div className="toolbar">
          <div>
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="unpaid">Unpaid</option><option value="paid">Paid</option><option value="">All</option>
            </select>
          </div>
          <button className="btn ghost" onClick={exportCsv}>⬇ CSV</button>
          <button className="btn" onClick={generate}>＋ Generate this month</button>
        </div>
      </div>
      <div className="panel-body" style={{ padding: 0, overflowX: 'auto' }}>
        {msg && <div className="success-msg" style={{ margin: 12 }}>{msg}</div>}
        <table style={{ minWidth: 720 }}>
          <thead><tr><th>Invoice</th><th>Date</th><th>Subscriber</th><th>Plan</th><th className="num">Amount</th><th className="num">Owing</th><th>Due</th><th></th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="empty">No invoices — use “Generate this month” or renew a subscriber.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>#{r.id}</td>
                <td>{r.date}</td>
                <td>{r.subscriber_name}{r.subscriber_phone ? <div style={{ fontSize: 11, color: 'var(--muted)' }}>{r.subscriber_phone}</div> : null}</td>
                <td>{r.plan_name || '—'}</td>
                <td className="num">{money(r.amount)}</td>
                <td className="num">
                  {r.outstanding <= 0.0001
                    ? <span className="badge green">paid</span>
                    : <span className={'badge ' + (isOverdue(r) ? 'red' : 'amber')}>{money(r.outstanding)}{isOverdue(r) ? ' · overdue' : ''}</span>}
                </td>
                <td>{r.due_date || '—'}</td>
                <td className="num" style={{ whiteSpace: 'nowrap' }}>
                  {r.outstanding > 0.0001 && <button className="btn success sm" onClick={() => setPaying(r)}>Pay</button>}
                  <button className="icon-btn" title="Delete" onClick={() => confirm('Delete this invoice and its payments?', async () => { await api(`/isp/invoices/${r.id}`, { method: 'DELETE' }); load(); })}>🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {paying && <PayForm invoice={paying} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); load(); }} />}
      {confirmNode}
    </div>
  );
}

function PayForm({ invoice, onClose, onSaved }) {
  const [f, setF] = useState({ date: today(), amount: invoice.outstanding, method: 'cash' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setErr('');
    if (Number(f.amount) > invoice.outstanding + 0.0001) { setErr(`Cannot pay more than the ${money(invoice.outstanding)} owing`); return; }
    try { await api(`/isp/invoices/${invoice.id}/pay`, { method: 'POST', body: f }); onSaved(); }
    catch (e) { setErr(e.message); }
  }

  return (
    <Modal title={`Pay invoice #${invoice.id} · ${invoice.subscriber_name}`} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn success" onClick={save}>Record payment</button></>}>
      <ErrorMsg>{err}</ErrorMsg>
      <p style={{ marginTop: 0, color: 'var(--muted)' }}>Owing: <strong style={{ color: 'var(--amber)' }}>{money(invoice.outstanding)}</strong>. Paying in full extends the subscriber's expiry.</p>
      <div className="form-row">
        <Field label="Date"><input type="date" value={f.date} onChange={set('date')} /></Field>
        <Field label="Amount paid (SSP)"><input type="number" step="0.01" value={f.amount} onChange={set('amount')} autoFocus /></Field>
      </div>
      <Field label="Method">
        <select value={f.method} onChange={set('method')}>
          <option value="cash">Cash</option><option value="mobile">Mobile money</option><option value="bank">Bank</option>
        </select>
      </Field>
    </Modal>
  );
}
