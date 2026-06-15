import React, { useEffect, useState } from 'react';
import { api, money } from '../api.js';
import { Modal, Field, ErrorMsg, useConfirm } from '../ui.jsx';

export default function Customers({ goto }) {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [confirmNode, confirm] = useConfirm();

  function load() { api('/customers').then(setRows).catch(() => {}); }
  useEffect(() => { load(); }, []);

  const filtered = rows.filter((r) => (r.name + ' ' + (r.phone || '')).toLowerCase().includes(q.toLowerCase()));
  const totalOwed = rows.reduce((a, r) => a + Math.max(0, r.balance), 0);

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Customers · <span style={{ color: 'var(--amber)' }}>{money(totalOwed)} owed</span></h3>
        <div className="toolbar">
          <input placeholder="Search name / phone" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 200 }} />
          <button className="btn" onClick={() => setEditing({ name: '', phone: '', note: '' })}>+ Add Customer</button>
        </div>
      </div>
      <div className="panel-body" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Name</th><th>Phone</th><th>Note</th><th className="num">Owes</th><th></th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={5} className="empty">No customers</td></tr>}
            {filtered.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.phone}</td>
                <td style={{ color: 'var(--muted)' }}>{c.note}</td>
                <td className="num">{c.balance > 0.0001 ? <span className="badge amber">{money(c.balance)}</span> : <span className="badge green">clear</span>}</td>
                <td className="num" style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn ghost sm" onClick={() => goto('debts')}>Debt book</button>
                  <button className="icon-btn" onClick={() => setEditing(c)}>✏️</button>
                  <button className="icon-btn" onClick={() => confirm(`Delete ${c.name}? (only allowed if they owe nothing)`, async () => {
                    try { await api(`/customers/${c.id}`, { method: 'DELETE' }); load(); }
                    catch (e) { alert(e.message); }
                  })}>🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <CustomerForm row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {confirmNode}
    </div>
  );
}

function CustomerForm({ row, onClose, onSaved }) {
  const [f, setF] = useState({ ...row });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setErr('');
    try {
      if (row.id) await api(`/customers/${row.id}`, { method: 'PUT', body: f });
      else await api('/customers', { method: 'POST', body: f });
      onSaved();
    } catch (e) { setErr(e.message); }
  }

  return (
    <Modal title={row.id ? 'Edit customer' : 'Add customer'} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>Save</button></>}>
      <ErrorMsg>{err}</ErrorMsg>
      <Field label="Name"><input value={f.name} onChange={set('name')} autoFocus /></Field>
      <Field label="Phone"><input value={f.phone} onChange={set('phone')} /></Field>
      <Field label="Note"><input value={f.note} onChange={set('note')} placeholder="optional" /></Field>
    </Modal>
  );
}
