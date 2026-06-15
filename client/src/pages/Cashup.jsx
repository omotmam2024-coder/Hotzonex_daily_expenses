import React, { useEffect, useState } from 'react';
import { api, money, today } from '../api.js';

export default function Cashup() {
  const [date, setDate] = useState(today());
  const [d, setD] = useState(null);

  useEffect(() => { api(`/cashup?date=${date}`).then(setD).catch(() => {}); }, [date]);

  function print() {
    if (!d) return;
    const w = window.open('', '_blank', 'width=400,height=640');
    const row = (l, v, b) => `<tr><td>${l}</td><td style="text-align:right${b ? ';font-weight:bold' : ''}">${money(v)}</td></tr>`;
    w.document.write(`<html><head><title>Cash-up ${d.date}</title><style>
      body{font-family:monospace;padding:16px;font-size:13px;color:#000}
      h2{text-align:center;margin:0} .muted{text-align:center;color:#555;margin:2px 0 12px}
      table{width:100%;border-collapse:collapse} td{padding:3px 0}
      .sec{border-top:1px dashed #000;font-weight:bold;padding-top:6px}
      .big{border-top:2px solid #000;border-bottom:2px solid #000;font-size:16px}
    </style></head><body>
      <h2>HOTZONEX</h2><p class="muted">Daily Cash-up · ${d.date}</p>
      <table>
        <tr class="sec"><td>CASH IN</td><td></td></tr>
        ${row('Cash sales', d.cash_sales)}
        ${row('Tab repayments', d.tab_payments)}
        ${row('Other income (cash)', d.other_income_cash)}
        ${row('Total cash in', d.cash_in, true)}
        <tr class="sec"><td>CASH OUT</td><td></td></tr>
        ${row('Expenses (cash)', d.cash_expenses)}
        <tr class="big">${'<td>EXPECTED IN DRAWER</td><td style="text-align:right;font-weight:bold">' + money(d.drawer) + '</td>'}</tr>
        <tr class="sec"><td>FOR INFO</td><td></td></tr>
        ${row('Sales on tab (credit)', d.credit_sales)}
        ${row('Total sales', d.total_sales)}
      </table>
      <p class="muted" style="margin-top:14px">Counted by: ____________</p>
      <script>window.print();</script></body></html>`);
    w.document.close();
  }

  if (!d) return <div className="empty">Loading…</div>;

  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <h3>Daily Cash-up</h3>
          <div className="toolbar">
            <div><label>Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <button className="btn ghost" onClick={() => setDate(today())}>Today</button>
            <button className="btn" onClick={print}>🖨 Print Z-report</button>
          </div>
        </div>
        <div className="panel-body">
          <div className="cards" style={{ marginBottom: 0 }}>
            <div className="card"><div className="label">Cash in</div><div className="value green">{money(d.cash_in)}</div><div className="sub">sales + tabs paid + income</div></div>
            <div className="card"><div className="label">Cash out</div><div className="value red">{money(d.cash_out)}</div><div className="sub">cash expenses</div></div>
            <div className="card" style={{ borderColor: 'var(--brand)', borderWidth: 2 }}><div className="label">Expected in drawer</div><div className={'value ' + (d.drawer >= 0 ? '' : 'red')} style={{ color: d.drawer >= 0 ? 'var(--brand)' : undefined }}>{money(d.drawer)}</div><div className="sub">count cash & compare</div></div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="panel">
          <div className="panel-head"><h3>Cash in — breakdown</h3></div>
          <div className="panel-body" style={{ padding: 0 }}>
            <table><tbody>
              <Line label="Cash sales (drinks etc.)" value={d.cash_sales} />
              <Line label="Tab repayments collected" value={d.tab_payments} />
              <Line label="Other income (cash)" value={d.other_income_cash} />
              <Line label="Total cash in" value={d.cash_in} bold />
            </tbody></table>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><h3>Other figures</h3></div>
          <div className="panel-body" style={{ padding: 0 }}>
            <table><tbody>
              <Line label="Cash expenses" value={d.cash_expenses} />
              <Line label="All expenses (any method)" value={d.total_expenses} />
              <Line label="Sales put on tab (credit)" value={d.credit_sales} />
              <Line label="Total sales (cash + tab)" value={d.total_sales} bold />
            </tbody></table>
          </div>
        </div>
      </div>
    </>
  );
}

function Line({ label, value, bold }) {
  return (
    <tr>
      <td style={bold ? { fontWeight: 700 } : undefined}>{label}</td>
      <td className="num" style={bold ? { fontWeight: 700 } : undefined}>{money(value)}</td>
    </tr>
  );
}
