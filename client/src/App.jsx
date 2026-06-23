import React, { useEffect, useState } from 'react';
import { getToken, getUser, clearSession } from './api.js';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Shop from './pages/Shop.jsx';
import Internet from './pages/Internet.jsx';
import Money from './pages/Money.jsx';
import People from './pages/People.jsx';
import ReportsHub from './pages/ReportsHub.jsx';
import Settings from './pages/Settings.jsx';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊', C: Dashboard },
  { id: 'shop', label: 'Shop & Bar', icon: '🍺', C: Shop },
  { id: 'internet', label: 'Internet / ISP', icon: '🌐', C: Internet },
  { id: 'money', label: 'Expenses & Income', icon: '💸', C: Money },
  { id: 'people', label: 'Customers & Debts', icon: '📒', C: People },
  { id: 'reports', label: 'Reports & Cash-up', icon: '📈', C: ReportsHub },
  { id: 'settings', label: 'Settings', icon: '⚙️', C: Settings },
];

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [page, setPage] = useState('dashboard');
  const [sub, setSub] = useState(null); // optional sub-tab for grouped pages
  const [theme, setTheme] = useState(localStorage.getItem('hx_theme') || 'light');
  const [open, setOpen] = useState(false);

  const goto = (id, subTab = null) => { setPage(id); setSub(subTab); setOpen(false); };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('hx_theme', theme);
  }, [theme]);

  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  const user = getUser();
  const current = NAV.find((n) => n.id === page) || NAV[0];
  const Page = current.C;

  return (
    <div className="app">
      <aside className={'sidebar' + (open ? ' open' : '')}>
        <div className="brand">
          <span className="dot">HX</span> Hotzonex
        </div>
        <nav className="nav">
          {NAV.map((n) => (
            <button
              key={n.id}
              className={page === n.id ? 'active' : ''}
              onClick={() => goto(n.id)}
            >
              <span>{n.icon}</span> {n.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className="btn ghost sm" style={{ flex: 1 }} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
            {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
          </button>
          <button className="btn ghost sm" style={{ flex: 1 }} onClick={() => { clearSession(); setAuthed(false); }}>
            Logout
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="menu-btn" onClick={() => setOpen(!open)}>☰</button>
            <h2>{current.label}</h2>
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>👤 {user?.username}</div>
        </header>
        <main className="content">
          <Page goto={goto} initialTab={sub} />
        </main>
      </div>
    </div>
  );
}
