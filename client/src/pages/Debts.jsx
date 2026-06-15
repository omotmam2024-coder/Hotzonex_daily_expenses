import React, { useEffect, useState } from 'react';
import { api, money, today, toCSV, downloadCSV } from '../api.js';
import { Modal, Field, ErrorMsg, useConfirm } from '../ui.jsx';

export default function Debts() {
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [status, setStatus] = useState('open');
  const [customerId, setCustomerId] = useState('');
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState(null);
  const [history, setHistory] = useState(null);
  const [confirmNode, confirm] = useConfirm();

  function load() {
    const qs = new URLSearchParams();
    if (status) qs.set('status', status);
    if (customerId) qs.set('customer_id', customerId);
    api('/debts?' + qs.toString()).then(setRows).catch(() => {});
  }
  useEffect(() => { load(); }, [status, customerId]);
  useEffect(() => { api('/customers').then(setCustomers).catch(() => {}); }, []);

  const totalOut = rows.reduce((a, r) => a + r.outstanding, 0);

  function isOverdue(r) {
    return r.due_date && r.outstanding > 0.0001 && r.due_date < today();
  }

  function exportCsv() {
    const csv = toCSV(rows, [
      { label: 'Date', value: 'date' }, { label: 'Customer', value: 'customer_name' },
      { label: 'Description', value: 'description' }, { label: 'Amount', value: 'amount' },
      { label: 'Paid', value: 'paid' }, { label: 'Outstanding', value: 'outstanding' },
      { label: 'Due', value: 'due_date' },
    ]);
    downloadCSV('debt_book.csv', csv);
  }

  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <h3>Debt Book · <span style={{ color: 'var(--amber)' }}>{money(totalOut)} outstanding</span></h3>
          <div className="toolbar">
            <div>
              <label>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="open">Open</option><option value="paid">Settled</option><option value="">All</option>
              </select>
            </div>
            <div>
              <label>Customer</label>
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">Everyone</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <button className="btn ghost" onClick={exportCsv}>⬇ CSV</button>
            <button className="btn" onClick={() => setAdding(true)}>+ Add Debt</button>
          </div>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>Date</th><th>Customer</th><th>Item / Reason</th><th className="num">Amount</th><th className="num">Paid</th><th className="num">Owing</th><th>Due</th><th></th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={8} className="empty">Nothing here</td></tr>}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td>{r.customer_name}{r.customer_phone ? <div style={{ fontSize: 11, color: 'var(--muted)' }}>{r.customer_phone}</div> : null}</td>
                  <td>{r.description}</td>
                  <td className="num">{money(r.amount)}</td>
                  <td className="num">{money(r.paid)}</td>
                  <td className="num">
                    {r.outstanding <= 0.0001
                      ? <span className="badge green">settled</span>
                      : <span className={'badge ' + (isOverdue(r) ? 'red' : 'amber')}>{money(r.outstanding)}{isOverdue(r) ? ' · overdue' : ''}</span>}
                  </td>
                  <td>{r.due_date || '—'}</td>
                  <td className="num" style={{ whiteSpace: 'nowrap' }}>
                    {r.outstanding > 0.0001 && <button className="btn success sm" onClick={() => setPaying(r)}>Pay</button>}
                    <button className="icon-btn" title="History" onClick={() => api(`/debts/${r.id}/payments`).then((h) => setHistory({ debt: r, payments: h }))}>🧾</button>
                    <button className="icon-btn" onClick={() => confirm('Delete this debt and its payment records?', async () => { await api(`/debts/${r.id}`, { method: 'DELETE' }); load(); })}>🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {adding && <DebtForm customers={customers} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
      {paying && <PayForm debt={paying} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); load(); }} />}
      {history && <HistoryModal data={history} onClose={() => setHistory(null)} />}
      {confirmNode}
    </>
  );
}

function DebtForm({ customers, onClose, onSaved }) {
  const [f, setF] = useState({ date: today(), customer_id: '', description: '', amount: '', due_date: '' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setErr('');
    try { await api('/debts', { method: 'POST', body: f }); onSaved(); }
    catch (e) { setErr(e.message); }
  }

  return (
    <Modal title="Add debt (owed by customer)" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>Save</button></>}>
      <ErrorMsg>{err}</ErrorMsg>
      <Field label="Customer">
        <select value={f.customer_id} onChange={set('customer_id')}>
          <option value="">— select —</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
        </select>
      </Field>
      <div className="form-row">
        <Field label="Date"><input type="date" value={f.date} onChange={set('date')} /></Field>
        <Field label="Amount (SSP)"><input type="number" step="0.01" value={f.amount} onChange={set('amount')} /></Field>
        <Field label="Due date"><input type="date" value={f.due_date} onChange={set('due_date')} /></Field>
      </div>
      <Field label="Item / reason"><input value={f.description} onChange={set('description')} placeholder="e.g. 2 crates of soda, or cash loan" /></Field>
    </Modal>
  );
}

function PayForm({ debt, onClose, onSaved }) {
  const [f, setF] = useState({ date: today(), amount: debt.outstanding });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setErr('');
    if (Number(f.amount) > debt.outstanding + 0.0001) { setErr(`Cannot pay more than the ${money(debt.outstanding)} owing`); return; }
    try { await api(`/debts/${debt.id}/payments`, { method: 'POST', body: f }); onSaved(); }
    catch (e) { setErr(e.message); }
  }

  return (
    <Modal title={`Record payment · ${debt.customer_name}`} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn success" onClick={save}>Record payment</button></>}>
      <ErrorMsg>{err}</ErrorMsg>
      <p style={{ marginTop: 0, color: 'var(--muted)' }}>Owing now: <strong style={{ color: 'var(--amber)' }}>{money(debt.outstanding)}</strong></p>
      <div className="form-row">
        <Field label="Date"><input type="date" value={f.date} onChange={set('date')} /></Field>
        <Field label="Amount paid (SSP)"><input type="number" step="0.01" value={f.amount} onChange={set('amount')} autoFocus /></Field>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn ghost sm" onClick={() => setF({ ...f, amount: debt.outstanding })}>Full amount</button>
        <button className="btn ghost sm" onClick={() => setF({ ...f, amount: (debt.outstanding / 2).toFixed(2) })}>Half</button>
      </div>
    </Modal>
  );
}

function HistoryModal({ data, onClose }) {
  const { debt, payments } = data;
  return (
    <Modal title={`Payments · ${debt.description || debt.customer_name}`} onClose={onClose}
      footer={<button className="btn" onClick={onClose}>Close</button>}>
      <p style={{ marginTop: 0 }}>Original: <strong>{money(debt.amount)}</strong> · Outstanding: <strong style={{ color: 'var(--amber)' }}>{money(debt.outstanding)}</strong></p>
      <table>
        <thead><tr><th>Date</th><th className="num">Amount</th><th>By</th></tr></thead>
        <tbody>
          {payments.length === 0 && <tr><td colSpan={3} className="empty">No payments yet</td></tr>}
          {payments.map((p) => <tr key={p.id}><td>{p.date}</td><td className="num">{money(p.amount)}</td><td>{p.created_by}</td></tr>)}
        </tbody>
      </table>
    </Modal>
  );
}
