import React, { useEffect, useMemo, useState } from 'react';
import { api, money, today } from '../api.js';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function Reports() {
  const [from, setFrom] = useState(today().slice(0, 8) + '01');
  const [to, setTo] = useState(today());
  const [expenses, setExpenses] = useState([]);
  const [income, setIncome] = useState([]);
  const [sales, setSales] = useState([]);

  useEffect(() => {
    api(`/expenses?from=${from}&to=${to}`).then(setExpenses).catch(() => {});
    api(`/income?from=${from}&to=${to}`).then(setIncome).catch(() => {});
    api(`/sales?from=${from}&to=${to}`).then(setSales).catch(() => {});
  }, [from, to]);

  const totalExpense = expenses.reduce((a, r) => a + r.amount, 0);
  const totalIncome = income.reduce((a, r) => a + r.amount, 0);
  const totalSales = sales.reduce((a, r) => a + r.total, 0);
  const moneyIn = totalIncome + totalSales;
  const net = moneyIn - totalExpense;

  const byCategory = useMemo(() => {
    const m = {};
    expenses.forEach((e) => { m[e.category] = (m[e.category] || 0) + e.amount; });
    return Object.entries(m).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
  }, [expenses]);

  function preset(kind) {
    const t = today();
    if (kind === 'month') { setFrom(t.slice(0, 8) + '01'); setTo(t); }
    if (kind === 'week') { setFrom(new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)); setTo(t); }
    if (kind === 'year') { setFrom(t.slice(0, 4) + '-01-01'); setTo(t); }
    if (kind === 'today') { setFrom(t); setTo(t); }
  }

  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <h3>Profit / Loss report</h3>
          <div className="toolbar">
            <button className="btn ghost sm" onClick={() => preset('today')}>Today</button>
            <button className="btn ghost sm" onClick={() => preset('week')}>7 days</button>
            <button className="btn ghost sm" onClick={() => preset('month')}>This month</button>
            <button className="btn ghost sm" onClick={() => preset('year')}>This year</button>
            <div><label>From</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><label>To</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          </div>
        </div>
        <div className="panel-body">
          <div className="cards" style={{ marginBottom: 0 }}>
            <div className="card"><div className="label">Other income</div><div className="value green">{money(totalIncome)}</div></div>
            <div className="card"><div className="label">Shop sales</div><div className="value green">{money(totalSales)}</div></div>
            <div className="card"><div className="label">Total expenses</div><div className="value red">{money(totalExpense)}</div></div>
            <div className="card"><div className="label">Net {net >= 0 ? 'profit' : 'loss'}</div><div className={'value ' + (net >= 0 ? 'green' : 'red')}>{money(net)}</div></div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Money in vs out</h3></div>
        <div className="panel-body" style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={[{ name: 'This period', In: moneyIn, Out: totalExpense }]}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fill: 'var(--muted)' }} />
              <YAxis tick={{ fill: 'var(--muted)' }} width={60} />
              <Tooltip formatter={(v) => money(v)} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }} />
              <Legend />
              <Bar dataKey="In" fill="#16a34a" radius={[6, 6, 0, 0]} />
              <Bar dataKey="Out" fill="#dc2626" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Expenses by category</h3></div>
        <div className="panel-body" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>Category</th><th className="num">Amount</th><th className="num">Share</th></tr></thead>
            <tbody>
              {byCategory.length === 0 && <tr><td colSpan={3} className="empty">No expenses in this period</td></tr>}
              {byCategory.map((c) => (
                <tr key={c.name}>
                  <td>{c.name}</td>
                  <td className="num">{money(c.amount)}</td>
                  <td className="num">{totalExpense ? Math.round((c.amount / totalExpense) * 100) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
