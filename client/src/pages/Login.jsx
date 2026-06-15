import React, { useState } from 'react';
import { api, setSession } from '../api.js';
import { ErrorMsg } from '../ui.jsx';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const { token, user } = await api('/login', { method: 'POST', body: { username, password } });
      setSession(token, user);
      onLogin();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span className="dot" style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg,#1f6feb,#0b3d91)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700 }}>HX</span>
          <div>
            <h1>Hotzonex</h1>
            <p style={{ margin: 0 }}>Daily Expense Tracker</p>
          </div>
        </div>
        <ErrorMsg>{err}</ErrorMsg>
        <div className="field">
          <label>Username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className="btn" style={{ width: '100%', marginTop: 8 }} disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
