import React, { useEffect, useState } from 'react';
import { api, money } from '../../api.js';
import { Modal, Field, ErrorMsg, useConfirm } from '../../ui.jsx';

export default function ServicePlans() {
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [confirmNode, confirm] = useConfirm();

  function load() { api('/isp/plans').then(setRows).catch(() => {}); }
  useEffect(() => { load(); }, []);

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Service Plans</h3>
        <div className="toolbar">
          <button className="btn" onClick={() => setEditing({ name: '', speed_mbps: '', price: '', validity_days: 30, kind: 'pppoe' })}>+ Add Plan</button>
        </div>
      </div>
      <div className="panel-body" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Plan</th><th>Type</th><th className="num">Speed</th><th className="num">Price</th><th className="num">Validity</th><th></th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="empty">No plans yet — add one to start signing up subscribers.</td></tr>}
            {rows.map((p) => (
              <tr key={p.id}>
                <td style={{ fontWeight: 600 }}>{p.name}</td>
                <td><span className={'badge ' + (p.kind === 'hotspot' ? 'gray' : 'green')}>{p.kind}</span></td>
                <td className="num">{p.speed_mbps ? p.speed_mbps + ' Mbps' : '—'}</td>
                <td className="num" style={{ fontWeight: 600 }}>{money(p.price)}</td>
                <td className="num">{p.validity_days} days</td>
                <td className="num" style={{ whiteSpace: 'nowrap' }}>
                  <button className="icon-btn" title="Edit" onClick={() => setEditing(p)}>✏️</button>
                  <button className="icon-btn" title="Remove" onClick={() => confirm(`Remove plan ${p.name}?`, async () => {
                    try { await api(`/isp/plans/${p.id}`, { method: 'DELETE' }); load(); } catch (e) { alert(e.message); }
                  })}>🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <PlanForm row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {confirmNode}
    </div>
  );
}

function PlanForm({ row, onClose, onSaved }) {
  const [f, setF] = useState({
    name: row.name || '', speed_mbps: row.speed_mbps ?? '', price: row.price ?? '',
    validity_days: row.validity_days ?? 30, kind: row.kind || 'pppoe',
  });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const isNew = !row.id;

  async function save() {
    setErr('');
    if (!f.name.trim()) { setErr('Plan name is required'); return; }
    try {
      if (row.id) await api(`/isp/plans/${row.id}`, { method: 'PUT', body: f });
      else await api('/isp/plans', { method: 'POST', body: f });
      onSaved();
    } catch (e) { setErr(e.message); }
  }

  return (
    <Modal title={isNew ? 'Add plan' : 'Edit plan'} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>{isNew ? 'Add plan' : 'Save'}</button></>}>
      <ErrorMsg>{err}</ErrorMsg>
      <Field label="Plan name"><input value={f.name} onChange={set('name')} autoFocus placeholder="e.g. 5Mbps Home" /></Field>
      <div className="form-row">
        <Field label="Type">
          <select value={f.kind} onChange={set('kind')}>
            <option value="pppoe">PPPoE (monthly)</option>
            <option value="hotspot">Hotspot</option>
          </select>
        </Field>
        <Field label="Speed (Mbps)"><input type="number" min="0" value={f.speed_mbps} onChange={set('speed_mbps')} placeholder="0" /></Field>
      </div>
      <div className="form-row">
        <Field label="Price (SSP)"><input type="number" step="0.01" value={f.price} onChange={set('price')} placeholder="0" /></Field>
        <Field label="Validity (days)"><input type="number" min="1" value={f.validity_days} onChange={set('validity_days')} placeholder="30" /></Field>
      </div>
    </Modal>
  );
}
