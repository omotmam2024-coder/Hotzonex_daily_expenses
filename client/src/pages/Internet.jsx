import React, { useState } from 'react';
import IspDashboard from './isp/IspDashboard.jsx';
import Subscribers from './isp/Subscribers.jsx';
import ServicePlans from './isp/ServicePlans.jsx';
import Invoices from './isp/Invoices.jsx';
import Vouchers from './isp/Vouchers.jsx';

const TABS = ['dashboard', 'subscribers', 'plans', 'invoices', 'vouchers'];

export default function Internet({ goto, initialTab }) {
  const [tab, setTab] = useState(TABS.includes(initialTab) ? initialTab : 'dashboard');
  // sub-pages can jump within the ISP hub, or out to another sidebar section
  const childGoto = (id, sub) => { if (TABS.includes(id)) setTab(id); else goto(id, sub); };

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button className={'btn ' + (tab === 'dashboard' ? '' : 'ghost')} onClick={() => setTab('dashboard')}>📡 Overview</button>
        <button className={'btn ' + (tab === 'subscribers' ? '' : 'ghost')} onClick={() => setTab('subscribers')}>👥 Subscribers</button>
        <button className={'btn ' + (tab === 'plans' ? '' : 'ghost')} onClick={() => setTab('plans')}>📋 Service Plans</button>
        <button className={'btn ' + (tab === 'invoices' ? '' : 'ghost')} onClick={() => setTab('invoices')}>📄 Invoices</button>
        <button className={'btn ' + (tab === 'vouchers' ? '' : 'ghost')} onClick={() => setTab('vouchers')}>🎫 Hotspot Vouchers</button>
      </div>
      {tab === 'dashboard' && <IspDashboard goto={childGoto} />}
      {tab === 'subscribers' && <Subscribers goto={childGoto} />}
      {tab === 'plans' && <ServicePlans goto={childGoto} />}
      {tab === 'invoices' && <Invoices goto={childGoto} />}
      {tab === 'vouchers' && <Vouchers />}
    </>
  );
}
