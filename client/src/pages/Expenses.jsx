import React, { useEffect, useState } from 'react';
import { api, money, today, toCSV, downloadCSV } from '../api.js';
import { Modal, Field, ErrorMsg, useConfirm } from '../ui.jsx';

const METHODS = ['cash', 'transfer', 'mobile'];

export default function Expenses() {
  const [rows, setRows] = useState([]);
  const [cats, setCats] = useState([]);
  const [from, setFrom] = useState(today().slice(0, 8) + '01');
  const [to, setTo] = useState(today());
  const [editing, setEditing] = useState(null);
  const [confirmNode, confirm] = useConfirm();

  function load() {
    api(`/expenses?from=${from}&to=${to}`).then(setRows).catch(() => {});
  }
  useEffect(() => { load(); }, [from, to]);
  useEffect(() => { api('/categories').then((c) => setCats(c.filter((x) => x.kind === 'expense'))).catch(() => {}); }, []);

  const total = rows.reduce((a, r) => a + r.amount, 0);

  function exportCsv() {
    const csv = toCSV(rows, [
      { label: 'Date', value: 'date' },
      { label: 'Category', value: 'category' },
      { label: 'Description', value: 'description' },
      { label: 'Amount', value: 'amount' },
      { label: 'Method', value: 'method' },
      { label: 'By', value: 'created_by' },
    ]);
    downloadCSV(`expenses_${from}_to_${to}.csv`, csv);
  }

  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <h3>Expenses · <span style={{ color: 'var(--red)' }}>{money(total)}</span></h3>
          <div className="toolbar">
            <div><label>From</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><label>To</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            <button className="btn ghost" onClick={exportCsv}>⬇ CSV</button>
            <button className="btn" onClick={() => setEditing({ date: today(), method: 'cash', category: cats[0]?.name || 'General' })}>+ Add Expense</button>
          </div>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr><th>Date</th><th>Category</th><th>Description</th><th>Method</th><th className="num">Amount</th><th></th></tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={6} className="empty">No expenses in this period</td></tr>}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td><span className="badge gray">{r.category}</span></td>
                  <td>{r.description}</td>
                  <td>{r.method}</td>
                  <td className="num">{money(r.amount)}</td>
                  <td className="num" style={{ whiteSpace: 'nowrap' }}>
                    <button className="icon-btn" onClick={() => setEditing(r)}>✏️</button>
                    <button className="icon-btn" onClick={() => confirm('Delete this expense?', async () => { await api(`/expenses/${r.id}`, { method: 'DELETE' }); load(); })}>🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <ExpenseForm
          row={editing}
          cats={cats}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
      {confirmNode}
    </>
  );
}

function ExpenseForm({ row, cats, onClose, onSaved }) {
  const [f, setF] = useState({ description: '', amount: '', ...row });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setErr('');
    try {
      if (row.id) await api(`/expenses/${row.id}`, { method: 'PUT', body: f });
      else await api('/expenses', { method: 'POST', body: f });
      onSaved();
    } catch (e) { setErr(e.message); }
  }

  return (
    <Modal
      title={row.id ? 'Edit expense' : 'Add expense'}
      onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>Save</button></>}
    >
      <ErrorMsg>{err}</ErrorMsg>
      <div className="form-row">
        <Field label="Date"><input type="date" value={f.date} onChange={set('date')} /></Field>
        <Field label="Amount (SSP)"><input type="number" step="0.01" value={f.amount} onChange={set('amount')} autoFocus /></Field>
      </div>
      <div className="form-row">
        <Field label="Category">
          <select value={f.category} onChange={set('category')}>
            {cats.map((c) => <option key={c.id}>{c.name}</option>)}
            <option>General</option>
          </select>
        </Field>
        <Field label="Method">
          <select value={f.method} onChange={set('method')}>{METHODS.map((m) => <option key={m}>{m}</option>)}</select>
        </Field>
      </div>
      <Field label="Description"><input value={f.description} onChange={set('description')} placeholder="What was it for?" /></Field>
    </Modal>
  );
}
