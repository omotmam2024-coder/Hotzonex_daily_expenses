import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Field, ErrorMsg, useConfirm } from '../ui.jsx';

export default function Settings() {
  const [cats, setCats] = useState([]);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('expense');
  const [confirmNode, confirm] = useConfirm();

  // password change
  const [pw, setPw] = useState({ current: '', next: '' });
  const [pwMsg, setPwMsg] = useState('');
  const [pwErr, setPwErr] = useState('');

  function load() { api('/categories').then(setCats).catch(() => {}); }
  useEffect(() => { load(); }, []);

  async function addCat() {
    if (!name.trim()) return;
    try { await api('/categories', { method: 'POST', body: { name, kind } }); setName(''); load(); }
    catch (e) { alert(e.message); }
  }

  async function changePw() {
    setPwMsg(''); setPwErr('');
    try {
      await api('/change-password', { method: 'POST', body: { current: pw.current, next: pw.next } });
      setPwMsg('Password updated.'); setPw({ current: '', next: '' });
    } catch (e) { setPwErr(e.message); }
  }

  return (
    <>
      <div className="panel">
        <div className="panel-head"><h3>Categories</h3></div>
        <div className="panel-body">
          <div className="toolbar" style={{ marginBottom: 16 }}>
            <div style={{ flex: 1 }}><label>New category</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Internet, Repairs" /></div>
            <div><label>Type</label><select value={kind} onChange={(e) => setKind(e.target.value)}><option value="expense">Expense</option><option value="income">Income</option></select></div>
            <button className="btn" onClick={addCat}>Add</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            {['expense', 'income'].map((k) => (
              <div key={k}>
                <h4 style={{ marginTop: 0, textTransform: 'capitalize' }}>{k} categories</h4>
                {cats.filter((c) => c.kind === k).map((c) => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                    <span>{c.name}</span>
                    <button className="icon-btn" onClick={() => confirm(`Delete category "${c.name}"?`, async () => { await api(`/categories/${c.id}`, { method: 'DELETE' }); load(); })}>🗑️</button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Change password</h3></div>
        <div className="panel-body" style={{ maxWidth: 420 }}>
          {pwMsg && <div className="error" style={{ background: '#dcfce7', color: '#15803d' }}>{pwMsg}</div>}
          <ErrorMsg>{pwErr}</ErrorMsg>
          <Field label="Current password"><input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
          <Field label="New password"><input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
          <button className="btn" onClick={changePw}>Update password</button>
        </div>
      </div>
      {confirmNode}
    </>
  );
}
