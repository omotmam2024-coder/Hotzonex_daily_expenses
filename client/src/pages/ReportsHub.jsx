import React, { useState } from 'react';
import Reports from './Reports.jsx';
import Cashup from './Cashup.jsx';

export default function ReportsHub() {
  const [tab, setTab] = useState('reports');
  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button className={'btn ' + (tab === 'reports' ? '' : 'ghost')} onClick={() => setTab('reports')}>📈 Reports</button>
        <button className={'btn ' + (tab === 'cashup' ? '' : 'ghost')} onClick={() => setTab('cashup')}>🧮 Daily Cash-up</button>
      </div>
      {tab === 'reports' ? <Reports /> : <Cashup />}
    </>
  );
}
