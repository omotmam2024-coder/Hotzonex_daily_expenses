import React, { useEffect, useState } from 'react';
import { api, money, today } from '../../api.js';
import { Modal, Field, ErrorMsg, useConfirm } from '../../ui.jsx';

const STATUS_BADGE = { active: 'green', expired: 'red', suspended: 'gray' };

export default function Subscribers() {
  const [rows, setRows] = useState([]);
  const [plans, setPlans] = useState([]);
  const [routers, setRouters] = useState([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState(null);
  const [renewing, setRenewing] = useState(null);
  const [confirmNode, confirm] = useConfirm();

  function load() {
    const qs = new URLSearchParams();
    if (status) qs.set('status', status);
    if (q) qs.set('q', q);
    api('/isp/subscribers?' + qs.toString()).then(setRows).catch(() => {});
  }
  function loadLookups() {
    api('/isp/plans').then(setPlans).catch(() => {});
    api('/isp/routers').then(setRouters).catch(() => {});
  }
  useEffect(() => { load(); }, [status, q]);
  useEffect(() => { loadLookups(); }, []);

  const active = rows.filter((r) => r.live_status === 'active').length;
  const totalOut = rows.reduce((a, r) => a + Math.max(0, r.outstanding || 0), 0);

  function daysLabel(r) {
    if (r.live_status === 'suspended') return <span className="badge gray">suspended</span>;
    if (r.days_left === null) return <span style={{ color: 'var(--muted)' }}>—</span>;
    if (r.days_left < 0) return <span className="badge red">expired {-r.days_left}d ago</span>;
    if (r.days_left <= 3) return <span className="badge amber">{r.days_left}d left</span>;
    return <span style={{ color: 'var(--muted)' }}>{r.days_left}d left</span>;
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Subscribers · <span style={{ color: 'var(--green)' }}>{active} active</span>
          {totalOut > 0.0001 && <span className="badge amber" style={{ marginLeft: 8 }}>{money(totalOut)} owing</span>}</h3>
        <div className="toolbar">
          <input placeholder="Search name / phone / PPPoE" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 200 }} />
          <div>
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option><option value="active">Active</option>
              <option value="expired">Expired</option><option value="suspended">Suspended</option>
            </select>
          </div>
          <button className="btn ghost" onClick={() => setEditing({ routers: true })}>📡 Routers</button>
          <button className="btn" onClick={() => setEditing({ blank: true })}>+ Add Subscriber</button>
        </div>
      </div>
      <div className="panel-body" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ minWidth: 760 }}>
          <thead><tr><th>Name</th><th>Plan</th><th>Status</th><th>Expiry</th><th className="num">Owing</th><th></th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="empty">No subscribers — click “+ Add Subscriber”.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{r.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                    {r.pppoe_user ? r.pppoe_user + ' · ' : ''}{r.phone || ''}{r.router_name ? ' · ' + r.router_name : ''}
                  </div>
                </td>
                <td>{r.plan_name ? <span>{r.plan_name}{r.speed_mbps ? <span style={{ color: 'var(--muted)' }}> · {r.speed_mbps}M</span> : ''}</span> : <span style={{ color: 'var(--muted)' }}>no plan</span>}</td>
                <td><span className={'badge ' + (STATUS_BADGE[r.live_status] || 'gray')}>{r.live_status}</span></td>
                <td>{r.expiry_date || '—'}<div style={{ marginTop: 2 }}>{daysLabel(r)}</div></td>
                <td className="num">{r.outstanding > 0.0001 ? <span className="badge amber">{money(r.outstanding)}</span> : <span className="badge green">clear</span>}</td>
                <td className="num" style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn success sm" onClick={() => setRenewing(r)}>Renew</button>
                  <button className="icon-btn" title="Edit" onClick={() => setEditing(r)}>✏️</button>
                  <button className="icon-btn" title="Remove" onClick={() => confirm(`Remove subscriber ${r.name}?`, async () => {
                    try { await api(`/isp/subscribers/${r.id}`, { method: 'DELETE' }); load(); } catch (e) { alert(e.message); }
                  })}>🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && editing.routers && <RoutersModal routers={routers} onClose={() => setEditing(null)} onChanged={loadLookups} />}
      {editing && !editing.routers && (
        <SubscriberForm row={editing} plans={plans} routers={routers}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
      {renewing && <RenewForm sub={renewing} plans={plans} onClose={() => setRenewing(null)} onSaved={() => { setRenewing(null); load(); }} />}
      {confirmNode}
    </div>
  );
}

function SubscriberForm({ row, plans, routers, onClose, onSaved }) {
  const isNew = !row.id;
  const [f, setF] = useState({
    name: row.name || '', phone: row.phone || '', pppoe_user: row.pppoe_user || '',
    location: row.location || '', router_id: row.router_id || '', plan_id: row.plan_id || '',
    status: row.status === 'suspended' ? 'suspended' : 'active', note: row.note || '',
    start_date: today(),
  });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setErr('');
    if (!f.name.trim()) { setErr('Name is required'); return; }
    try {
      if (row.id) await api(`/isp/subscribers/${row.id}`, { method: 'PUT', body: f });
      else await api('/isp/subscribers', { method: 'POST', body: f });
      onSaved();
    } catch (e) { setErr(e.message); }
  }

  return (
    <Modal wide title={isNew ? 'Add subscriber' : 'Edit subscriber'} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>{isNew ? 'Add' : 'Save'}</button></>}>
      <ErrorMsg>{err}</ErrorMsg>
      <div className="form-row">
        <Field label="Name"><input value={f.name} onChange={set('name')} autoFocus placeholder="Customer name" /></Field>
        <Field label="Phone"><input value={f.phone} onChange={set('phone')} placeholder="optional" /></Field>
      </div>
      <div className="form-row">
        <Field label="PPPoE username"><input value={f.pppoe_user} onChange={set('pppoe_user')} placeholder="optional" /></Field>
        <Field label="Location / area"><input value={f.location} onChange={set('location')} placeholder="optional" /></Field>
      </div>
      <div className="form-row">
        <Field label="Plan">
          <select value={f.plan_id} onChange={set('plan_id')}>
            <option value="">— no plan —</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name} · {money(p.price)} / {p.validity_days}d</option>)}
          </select>
        </Field>
        <Field label="Router">
          <select value={f.router_id} onChange={set('router_id')}>
            <option value="">— none —</option>
            {routers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
      </div>
      {isNew
        ? <Field label="Start date"><input type="date" value={f.start_date} onChange={set('start_date')} /></Field>
        : (
          <Field label="Status">
            <select value={f.status} onChange={set('status')}>
              <option value="active">Active</option>
              <option value="suspended">Suspended (paused)</option>
            </select>
          </Field>
        )}
      <Field label="Note"><input value={f.note} onChange={set('note')} placeholder="optional" /></Field>
      {isNew && f.plan_id
        ? <p style={{ color: 'var(--muted)', fontSize: 12.5, marginBottom: 0 }}>Expiry will be set from the start date + the plan's validity. Record the first payment with “Renew”.</p>
        : null}
    </Modal>
  );
}

function RenewForm({ sub, plans, onClose, onSaved }) {
  const plan = plans.find((p) => String(p.id) === String(sub.plan_id));
  const [f, setF] = useState({ date: today(), amount: plan ? plan.price : '', method: 'cash' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setErr('');
    if (!sub.plan_id) { setErr('This subscriber has no plan — edit them to assign one first.'); return; }
    try { await api(`/isp/subscribers/${sub.id}/renew`, { method: 'POST', body: f }); onSaved(); }
    catch (e) { setErr(e.message); }
  }

  return (
    <Modal title={`Renew · ${sub.name}`} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn success" onClick={save}>Record renewal</button></>}>
      <ErrorMsg>{err}</ErrorMsg>
      <p style={{ marginTop: 0, color: 'var(--muted)' }}>
        {plan ? <>Plan <strong>{plan.name}</strong> · {money(plan.price)} for {plan.validity_days} days.</> : 'No plan assigned.'}
        {sub.expiry_date ? <> Current expiry <strong>{sub.expiry_date}</strong>.</> : null}
      </p>
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

function RoutersModal({ routers, onClose, onChanged }) {
  const [rows, setRows] = useState(routers);
  const [adding, setAdding] = useState({ name: '', location: '', host: '', note: '' });
  const [err, setErr] = useState('');

  function reload() { api('/isp/routers').then((r) => { setRows(r); onChanged(); }).catch(() => {}); }

  async function add() {
    setErr('');
    if (!adding.name.trim()) { setErr('Router name required'); return; }
    try { await api('/isp/routers', { method: 'POST', body: adding }); setAdding({ name: '', location: '', host: '', note: '' }); reload(); }
    catch (e) { setErr(e.message); }
  }
  async function remove(id) {
    try { await api(`/isp/routers/${id}`, { method: 'DELETE' }); reload(); } catch (e) { alert(e.message); }
  }

  return (
    <Modal wide title="Routers" onClose={onClose} footer={<button className="btn" onClick={onClose}>Done</button>}>
      <p style={{ marginTop: 0, color: 'var(--muted)', fontSize: 12.5 }}>
        A list of your MikroTik routers / sites. (Live router control isn't wired up yet — this is the registry it will use.)
      </p>
      <table>
        <thead><tr><th>Name</th><th>Location</th><th>Host / IP</th><th></th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={4} className="empty">No routers yet</td></tr>}
          {rows.map((r) => (
            <tr key={r.id}>
              <td style={{ fontWeight: 600 }}>{r.name}</td><td>{r.location}</td><td>{r.host}</td>
              <td className="num"><button className="icon-btn" onClick={() => remove(r.id)}>🗑️</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <ErrorMsg>{err}</ErrorMsg>
      <div className="form-row" style={{ marginTop: 12 }}>
        <Field label="Name"><input value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} placeholder="e.g. Main tower" /></Field>
        <Field label="Location"><input value={adding.location} onChange={(e) => setAdding({ ...adding, location: e.target.value })} placeholder="optional" /></Field>
        <Field label="Host / IP"><input value={adding.host} onChange={(e) => setAdding({ ...adding, host: e.target.value })} placeholder="optional" /></Field>
      </div>
      <button className="btn ghost sm" onClick={add}>+ Add router</button>
    </Modal>
  );
}
