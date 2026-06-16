import React, { useEffect, useState } from 'react';
import { api, money } from '../api.js';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

export default function Dashboard({ goto }) {
  const [s, setS] = useState(null);
  const [series, setSeries] = useState([]);
  const [products, setProducts] = useState([]);

  useEffect(() => {
    api('/summary').then(setS).catch(() => {});
    api('/series?days=30').then(setSeries).catch(() => {});
    api('/products').then(setProducts).catch(() => {});
  }, []);

  if (!s) return <div className="empty">Loading…</div>;

  const netToday = s.today.income + s.today.sales - s.today.expense;
  const netMonth = s.month.income + s.month.sales - s.month.expense;

  // value tied up in the goods still on the shelf (by remaining pieces)
  const stock = products.reduce((a, p) => ({
    cost: a.cost + p.stock * p.cost,
    retail: a.retail + p.stock * p.price,
  }), { cost: 0, retail: 0 });
  const stockProfit = stock.retail - stock.cost;

  return (
    <>
      <div className="cards">
        <div className="card">
          <div className="label">Today · Income + Sales</div>
          <div className="value green">{money(s.today.income + s.today.sales)}</div>
          <div className="sub">Expenses {money(s.today.expense)}</div>
        </div>
        <div className="card">
          <div className="label">Today · Net</div>
          <div className={'value ' + (netToday >= 0 ? 'green' : 'red')}>{money(netToday)}</div>
          <div className="sub">income minus expenses</div>
        </div>
        <div className="card">
          <div className="label">This Month · Net</div>
          <div className={'value ' + (netMonth >= 0 ? 'green' : 'red')}>{money(netMonth)}</div>
          <div className="sub">In {money(s.month.income + s.month.sales)} · Out {money(s.month.expense)}</div>
        </div>
        <div className="card" style={{ cursor: 'pointer' }} onClick={() => goto('debts')}>
          <div className="label">Outstanding Debt</div>
          <div className="value amber">{money(s.debt.outstanding)}</div>
          <div className="sub">{s.debt.customers_owing} customer(s) owing →</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Last 30 days · Money in vs out</h3></div>
        <div className="panel-body" style={{ height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#16a34a" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#dc2626" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} width={50} />
              <Tooltip formatter={(v) => money(v)} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }} />
              <Legend />
              <Area type="monotone" dataKey="income" name="Money In" stroke="#16a34a" fill="url(#gIn)" strokeWidth={2} />
              <Area type="monotone" dataKey="expense" name="Money Out" stroke="#dc2626" fill="url(#gOut)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {products.length > 0 && (
        <div className="panel">
          <div className="panel-head">
            <h3>🍺 Bar stock on hand</h3>
            <button className="btn ghost sm" onClick={() => goto('shop')}>Manage stock →</button>
          </div>
          <div className="panel-body">
            <div className="cards" style={{ marginBottom: 0 }}>
              <div className="card">
                <div className="label">Stock value (at cost)</div>
                <div className="value">{money(stock.cost)}</div>
                <div className="sub">what the goods on hand cost you</div>
              </div>
              <div className="card">
                <div className="label">If all sold (retail)</div>
                <div className="value" style={{ color: 'var(--brand)' }}>{money(stock.retail)}</div>
                <div className="sub">{products.reduce((a, p) => a + p.stock, 0)} pieces across {products.length} items</div>
              </div>
              <div className="card">
                <div className="label">Potential profit</div>
                <div className="value green">{money(stockProfit)}</div>
                <div className="sub">retail minus cost of stock</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {s.low_stock.length > 0 && (
        <div className="panel">
          <div className="panel-head"><h3>⚠️ Low stock</h3></div>
          <div className="panel-body">
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {s.low_stock.map((p) => (
                <span key={p.id} className="badge amber">{p.name}: {p.stock} left</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
