import React, { useEffect, useState } from 'react';
import { api, money } from '../../api.js';

export default function IspDashboard({ goto }) {
  const [s, setS] = useState(null);

  useEffect(() => { api('/isp/stats').then(setS).catch(() => {}); }, []);

  if (!s) return <div className="empty">Loading…</div>;

  return (
    <>
      <div className="cards">
        <div className="card" style={{ cursor: 'pointer' }} onClick={() => goto('subscribers')}>
          <div className="label">Active subscribers</div>
          <div className="value green">{s.active}</div>
          <div className="sub">{s.expired} expired · {s.suspended} suspended →</div>
        </div>
        <div className="card">
          <div className="label">Monthly recurring (MRR)</div>
          <div className="value" style={{ color: 'var(--brand)' }}>{money(s.mrr)}</div>
          <div className="sub">if all active plans renew</div>
        </div>
        <div className="card">
          <div className="label">Collected this month</div>
          <div className="value green">{money(s.revenue_month)}</div>
          <div className="sub">subscriptions paid</div>
        </div>
        <div className="card" style={{ cursor: 'pointer' }} onClick={() => goto('vouchers')}>
          <div className="label">Vouchers</div>
          <div className="value">{s.vouchers.unused}</div>
          <div className="sub">unused · {money(s.vouchers.revenue_month)} sold this month →</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>⏳ Expiring within 7 days</h3>
          <button className="btn ghost sm" onClick={() => goto('subscribers')}>All subscribers →</button>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>Subscriber</th><th>Plan</th><th>Expires</th></tr></thead>
            <tbody>
              {s.expiring_soon.length === 0 && <tr><td colSpan={3} className="empty">🎉 Nobody expiring soon</td></tr>}
              {s.expiring_soon.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td style={{ color: 'var(--muted)' }}>{r.plan_name || '—'}</td>
                  <td><span className="badge amber">{r.expiry_date}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>⚠️ Overdue invoices</h3>
          <button className="btn ghost sm" onClick={() => goto('invoices')}>Invoices →</button>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>Invoice</th><th>Subscriber</th><th>Due</th><th className="num">Owing</th></tr></thead>
            <tbody>
              {s.overdue.length === 0 && <tr><td colSpan={4} className="empty">No overdue invoices</td></tr>}
              {s.overdue.map((r) => (
                <tr key={r.id}>
                  <td>#{r.id}</td>
                  <td>{r.subscriber_name}</td>
                  <td>{r.due_date}</td>
                  <td className="num"><span className="badge red">{money(r.outstanding)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
