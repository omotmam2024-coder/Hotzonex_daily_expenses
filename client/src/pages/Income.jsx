import React, { useEffect, useState } from 'react';
import { api, money, today, toCSV, downloadCSV } from '../api.js';
import { Modal, Field, ErrorMsg, useConfirm } from '../ui.jsx';

const METHODS = ['cash', 'transfer', 'mobile'];

export default function Income() {
  const [rows, setRows] = useState([]);
  const [cats, setCats] = useState([]);
  const [from, setFrom] = useState(today().slice(0, 8) + '01');
  const [to, setTo] = useState(today());
  const [adding, setAdding] = useState(null);
  const [confirmNode, confirm] = useConfirm();

  function load() { api(`/income?from=${from}&to=${to}`).then(setRows).catch(() => {}); }
  useEffect(() => { load(); }, [from, to]);
  useEffect(() => { api('/categories').then((c) => setCats(c.filter((x) => x.kind === 'income'))).catch(() => {}); }, []);

  const total = rows.reduce((a, r) => a + r.amount, 0);

  function exportCsv() {
    const csv = toCSV(rows, [
      { label: 'Date', value: 'date' }, { label: 'Source', value: 'source' },
      { label: 'Description', value: 'description' }, { label: 'Amount', value: 'amount' },
      { label: 'Method', value: 'method' },
    ]);
    downloadCSV(`income_${from}_to_${to}.csv`, csv);
  }

  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <h3>Income · <span style={{ color: 'var(--green)' }}>{money(total)}</span></h3>
          <div className="toolbar">
            <div><label>From</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><label>To</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            <button className="btn ghost" onClick={exportCsv}>⬇ CSV</button>
            <button className="btn" onClick={() => setAdding({ date: today(), method: 'cash', source: cats[0]?.name || 'General' })}>+ Add Income</button>
          </div>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>Date</th><th>Source</th><th>Description</th><th>Method</th><th className="num">Amount</th><th></th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={6} className="empty">No income in this period</td></tr>}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td><span className="badge green">{r.source}</span></td>
                  <td>{r.description}</td>
                  <td>{r.method}</td>
                  <td className="num">{money(r.amount)}</td>
                  <td className="num"><button className="icon-btn" onClick={() => confirm('Delete this income entry?', async () => { await api(`/income/${r.id}`, { method: 'DELETE' }); load(); })}>🗑️</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {adding && <IncomeForm row={adding} cats={cats} onClose={() => setAdding(null)} onSaved={() => { setAdding(null); load(); }} />}
      {confirmNode}
    </>
  );
}

function IncomeForm({ row, cats, onClose, onSaved }) {
  const [f, setF] = useState({ description: '', amount: '', ...row });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setErr('');
    try { await api('/income', { method: 'POST', body: f }); onSaved(); }
    catch (e) { setErr(e.message); }
  }

  return (
    <Modal title="Add income" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>Save</button></>}>
      <ErrorMsg>{err}</ErrorMsg>
      <div className="form-row">
        <Field label="Date"><input type="date" value={f.date} onChange={set('date')} /></Field>
        <Field label="Amount (SSP)"><input type="number" step="0.01" value={f.amount} onChange={set('amount')} autoFocus /></Field>
      </div>
      <div className="form-row">
        <Field label="Source">
          <select value={f.source} onChange={set('source')}>
            {cats.map((c) => <option key={c.id}>{c.name}</option>)}<option>General</option>
          </select>
        </Field>
        <Field label="Method"><select value={f.method} onChange={set('method')}>{METHODS.map((m) => <option key={m}>{m}</option>)}</select></Field>
      </div>
      <Field label="Description"><input value={f.description} onChange={set('description')} /></Field>
    </Modal>
  );
}
