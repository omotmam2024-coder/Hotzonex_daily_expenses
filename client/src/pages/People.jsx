import React, { useState } from 'react';
import Customers from './Customers.jsx';
import Debts from './Debts.jsx';

export default function People({ goto, initialTab }) {
  const [tab, setTab] = useState(initialTab === 'debts' ? 'debts' : 'customers');
  // intercept in-page navigation (e.g. a customer's "Debt book" button) as a tab switch
  const childGoto = (id) => {
    if (id === 'debts' || id === 'customers') setTab(id);
    else goto(id);
  };
  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button className={'btn ' + (tab === 'customers' ? '' : 'ghost')} onClick={() => setTab('customers')}>👥 Customers</button>
        <button className={'btn ' + (tab === 'debts' ? '' : 'ghost')} onClick={() => setTab('debts')}>📒 Debt Book</button>
      </div>
      {tab === 'customers' ? <Customers goto={childGoto} /> : <Debts />}
    </>
  );
}
