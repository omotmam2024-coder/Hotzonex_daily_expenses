import React, { useState } from 'react';
import Expenses from './Expenses.jsx';
import Income from './Income.jsx';

export default function Money() {
  const [tab, setTab] = useState('expenses');
  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button className={'btn ' + (tab === 'expenses' ? '' : 'ghost')} onClick={() => setTab('expenses')}>💸 Expenses</button>
        <button className={'btn ' + (tab === 'income' ? '' : 'ghost')} onClick={() => setTab('income')}>💰 Income</button>
      </div>
      {tab === 'expenses' ? <Expenses /> : <Income />}
    </>
  );
}
