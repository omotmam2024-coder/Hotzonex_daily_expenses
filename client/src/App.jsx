import React, { useEffect, useState } from 'react';
import { getToken, getUser, clearSession } from './api.js';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import DailyEntry from './pages/DailyEntry.jsx';
import Expenses from './pages/Expenses.jsx';
import Income from './pages/Income.jsx';
import Shop from './pages/Shop.jsx';
import Customers from './pages/Customers.jsx';
import Debts from './pages/Debts.jsx';
import Reports from './pages/Reports.jsx';
import Cashup from './pages/Cashup.jsx';
import Settings from './pages/Settings.jsx';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊', C: Dashboard },
  { id: 'daily', label: 'Bar Daily Entry', icon: '🍺', C: DailyEntry },
  { id: 'expenses', label: 'Expenses', icon: '💸', C: Expenses },
  { id: 'income', label: 'Income', icon: '💰', C: Income },
  { id: 'shop', label: 'Shop & Sales', icon: '🥤', C: Shop },
  { id: 'customers', label: 'Customers', icon: '👥', C: Customers },
  { id: 'debts', label: 'Debt Book', icon: '📒', C: Debts },
  { id: 'reports', label: 'Reports', icon: '📈', C: Reports },
  { id: 'cashup', label: 'Cash-up', icon: '🧮', C: Cashup },
  { id: 'settings', label: 'Settings', icon: '⚙️', C: Settings },
];

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [page, setPage] = useState('dashboard');
  const [theme, setTheme] = useState(localStorage.getItem('hx_theme') || 'light');
  const [open, setOpen] = useState(false);

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
              onClick={() => { setPage(n.id); setOpen(false); }}
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
          <Page goto={setPage} />
        </main>
      </div>
    </div>
  );
}
