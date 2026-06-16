import React, { useEffect, useState } from 'react';
import { api, money, today, toCSV, downloadCSV } from '../api.js';
import { Modal, Field, ErrorMsg, useConfirm } from '../ui.jsx';

export default function Debts() {
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [status, setStatus] = useState('open');
  const [customerId, setCustomerId] = useState('');
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState(null);
  const [history, setHistory] = useState(null);
  const [confirmNode, confirm] = useConfirm();

  function load() {
    const qs = new URLSearchParams();
    if (status) qs.set('status', status);
    if (customerId) qs.set('customer_id', customerId);
    api('/debts?' + qs.toString()).then(setRows).catch(() => {});
  }
  useEffect(() => { load(); }, [status, customerId]);
  useEffect(() => { api('/customers').then(setCustomers).catch(() => {}); }, []);

  const totalOut = rows.reduce((a, r) => a + r.outstanding, 0);

  function isOverdue(r) {
    return r.due_date && r.outstanding > 0.0001 && r.due_date < today();
  }

  function exportCsv() {
    const csv = toCSV(rows, [
      { label: 'Date', value: 'date' }, { label: 'Customer', value: 'customer_name' },
      { label: 'Description', value: 'description' }, { label: 'Amount', value: 'amount' },
      { label: 'Paid', value: 'paid' }, { label: 'Outstanding', value: 'outstanding' },
      { label: 'Due', value: 'due_date' },
    ]);
    downloadCSV('debt_book.csv', csv);
  }

  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <h3>Debt Book · <span style={{ color: 'var(--amber)' }}>{money(totalOut)} outstanding</span></h3>
          <div className="toolbar">
            <div>
              <label>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="open">Open</option><option value="paid">Settled</option><option value="">All</option>
              </select>
            </div>
            <div>
              <label>Customer</label>
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">Everyone</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <button className="btn ghost" onClick={exportCsv}>⬇ CSV</button>
            <button className="btn" onClick={() => setAdding(true)}>+ Add Debt</button>
          </div>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>Date</th><th>Customer</th><th>Item / Reason</th><th className="num">Amount</th><th className="num">Paid</th><th className="num">Owing</th><th>Due</th><th></th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={8} className="empty">Nothing here</td></tr>}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td>{r.customer_name}{r.customer_phone ? <div style={{ fontSize: 11, color: 'var(--muted)' }}>{r.customer_phone}</div> : null}</td>
                  <td>{r.description}</td>
                  <td className="num">{money(r.amount)}</td>
                  <td className="num">{money(r.paid)}</td>
                  <td className="num">
                    {r.outstanding <= 0.0001
                      ? <span className="badge green">settled</span>
                      : <span className={'badge ' + (isOverdue(r) ? 'red' : 'amber')}>{money(r.outstanding)}{isOverdue(r) ? ' · overdue' : ''}</span>}
                  </td>
                  <td>{r.due_date || '—'}</td>
                  <td className="num" style={{ whiteSpace: 'nowrap' }}>
                    {r.outstanding > 0.0001 && <button className="btn success sm" onClick={() => setPaying(r)}>Pay</button>}
                    <button className="icon-btn" title="History" onClick={() => api(`/debts/${r.id}/payments`).then((h) => setHistory({ debt: r, payments: h }))}>🧾</button>
                    <button className="icon-btn" onClick={() => confirm('Delete this debt and its payment records?', async () => { await api(`/debts/${r.id}`, { method: 'DELETE' }); load(); })}>🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {adding && <DebtForm customers={customers} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
      {paying && <PayForm debt={paying} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); load(); }} />}
      {history && <HistoryModal data={history} onClose={() => setHistory(null)} />}
      {confirmNode}
    </>
  );
}

const rand = () => Math.random().toString(36).slice(2);
const emptyItem = () => ({ key: rand(), product_id: '', name: '', qty: '', unit_price: '' });

// Record what a customer took on credit: list the goods + how many of each, and
// the amount borrowed adds up automatically. Saved as a credit bill so it also
// reduces stock and shows on the customer's tab.
function DebtForm({ customers, onClose, onSaved }) {
  const [products, setProducts] = useState([]);
  const [f, setF] = useState({ date: today(), customer_id: '', due_date: '' });
  const [rows, setRows] = useState([emptyItem()]);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  useEffect(() => { api('/products').then(setProducts).catch(() => {}); }, []);

  function pick(key, val) {
    setRows((rs) => rs.map((r) => {
      if (r.key !== key) return r;
      if (val === '') return { ...r, product_id: '', name: '', unit_price: '' };
      if (val === '__custom__') return { ...r, product_id: '__custom__', name: '', unit_price: '' };
      const p = products.find((x) => String(x.id) === String(val));
      return { ...r, product_id: Number(val), name: p ? p.name : '', unit_price: p ? p.price : r.unit_price };
    }));
  }
  const setRow = (key, k, v) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [k]: v } : r)));
  const addRow = () => setRows((rs) => [...rs, emptyItem()]);
  const removeRow = (key) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : [emptyItem()]));

  const computed = rows.map((r) => ({ ...r, amount: (Number(r.qty) || 0) * (Number(r.unit_price) || 0) }));
  const total = computed.reduce((a, r) => a + r.amount, 0);
  const validRows = () => rows.filter((r) => Number(r.qty) > 0 && (typeof r.product_id === 'number' || r.name.trim()));

  async function save() {
    setErr('');
    if (!f.customer_id) { setErr('Choose the customer'); return; }
    const vr = validRows();
    if (vr.length === 0) { setErr('Add at least one item with a quantity'); return; }
    const items = vr.map((r) => (typeof r.product_id === 'number'
      ? { product_id: r.product_id, qty: Number(r.qty), unit_price: Number(r.unit_price) }
      : { product_name: r.name.trim(), qty: Number(r.qty), unit_price: Number(r.unit_price) }));
    try {
      await api('/orders', {
        method: 'POST',
        body: { date: f.date, is_credit: true, customer_id: f.customer_id, due_date: f.due_date || null, note: 'Goods taken on credit', items },
      });
      onSaved();
    } catch (e) { setErr(e.message); }
  }

  return (
    <Modal wide title="Goods taken on credit" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn success" onClick={save} disabled={total <= 0}>Save debt · {money(total)}</button></>}>
      <ErrorMsg>{err}</ErrorMsg>
      <div className="form-row">
        <Field label="Customer">
          <select value={f.customer_id} onChange={set('customer_id')}>
            <option value="">— select —</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
          </select>
        </Field>
        <Field label="Date"><input type="date" value={f.date} onChange={set('date')} /></Field>
        <Field label="Due date"><input type="date" value={f.due_date} onChange={set('due_date')} /></Field>
      </div>

      <label style={{ marginBottom: 6 }}>Items taken</label>
      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
        <table style={{ minWidth: 460 }}>
          <thead><tr><th style={{ minWidth: 180 }}>Item</th><th className="num">Qty</th><th className="num">Price</th><th className="num">Amount</th><th></th></tr></thead>
          <tbody>
            {computed.map((r) => (
              <tr key={r.key}>
                <td style={{ padding: '6px' }}>
                  <select value={r.product_id === '' ? '' : r.product_id} onChange={(e) => pick(r.key, e.target.value)}>
                    <option value="">— choose item —</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.stock} in stock)</option>)}
                    <option value="__custom__">+ custom / cash loan…</option>
                  </select>
                  {r.product_id === '__custom__' && (
                    <input value={r.name} onChange={(e) => setRow(r.key, 'name', e.target.value)} placeholder="Describe it (e.g. Cash loan)" style={{ marginTop: 6 }} />
                  )}
                </td>
                <td style={{ padding: '6px' }}><input type="number" min="0" value={r.qty} onChange={(e) => setRow(r.key, 'qty', e.target.value)} placeholder="0" style={{ textAlign: 'right' }} /></td>
                <td style={{ padding: '6px' }}><input type="number" step="0.01" value={r.unit_price} onChange={(e) => setRow(r.key, 'unit_price', e.target.value)} placeholder="0" style={{ textAlign: 'right' }} /></td>
                <td className="num" style={{ fontWeight: 700 }}>{r.amount ? money(r.amount) : '-'}</td>
                <td className="num"><button className="icon-btn" onClick={() => removeRow(r.key)}>✕</button></td>
              </tr>
            ))}
            <tr style={{ background: 'var(--surface-2)', fontWeight: 700 }}>
              <td colSpan={3} style={{ padding: '10px 8px' }}>Total borrowed</td>
              <td className="num" style={{ color: 'var(--amber)', fontSize: 15 }}>{money(total)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
      <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={addRow}>+ Add item</button>
    </Modal>
  );
}

function PayForm({ debt, onClose, onSaved }) {
  const [f, setF] = useState({ date: today(), amount: debt.outstanding });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setErr('');
    if (Number(f.amount) > debt.outstanding + 0.0001) { setErr(`Cannot pay more than the ${money(debt.outstanding)} owing`); return; }
    try { await api(`/debts/${debt.id}/payments`, { method: 'POST', body: f }); onSaved(); }
    catch (e) { setErr(e.message); }
  }

  return (
    <Modal title={`Record payment · ${debt.customer_name}`} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn success" onClick={save}>Record payment</button></>}>
      <ErrorMsg>{err}</ErrorMsg>
      <p style={{ marginTop: 0, color: 'var(--muted)' }}>Owing now: <strong style={{ color: 'var(--amber)' }}>{money(debt.outstanding)}</strong></p>
      <div className="form-row">
        <Field label="Date"><input type="date" value={f.date} onChange={set('date')} /></Field>
        <Field label="Amount paid (SSP)"><input type="number" step="0.01" value={f.amount} onChange={set('amount')} autoFocus /></Field>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn ghost sm" onClick={() => setF({ ...f, amount: debt.outstanding })}>Full amount</button>
        <button className="btn ghost sm" onClick={() => setF({ ...f, amount: (debt.outstanding / 2).toFixed(2) })}>Half</button>
      </div>
    </Modal>
  );
}

function HistoryModal({ data, onClose }) {
  const { debt, payments } = data;
  return (
    <Modal title={`Payments · ${debt.description || debt.customer_name}`} onClose={onClose}
      footer={<button className="btn" onClick={onClose}>Close</button>}>
      <p style={{ marginTop: 0 }}>Original: <strong>{money(debt.amount)}</strong> · Outstanding: <strong style={{ color: 'var(--amber)' }}>{money(debt.outstanding)}</strong></p>
      <table>
        <thead><tr><th>Date</th><th className="num">Amount</th><th>By</th></tr></thead>
        <tbody>
          {payments.length === 0 && <tr><td colSpan={3} className="empty">No payments yet</td></tr>}
          {payments.map((p) => <tr key={p.id}><td>{p.date}</td><td className="num">{money(p.amount)}</td><td>{p.created_by}</td></tr>)}
        </tbody>
      </table>
    </Modal>
  );
}
