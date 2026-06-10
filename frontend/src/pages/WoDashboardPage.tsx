import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { buildSteps } from '../lib/woLifecycle';
import { StatusStepper } from '../components/StatusStepper';
import { KpiCard } from '../components/KpiCard';
import { useMockWoList } from '../lib/useMockStore';
import { addWo, generateRandomWo, seedIfEmpty, type MockWO } from '../lib/mockStore';

function WoRow({ wo }: { wo: MockWO }) {
  const getBadgeStyle = (step: string) => {
    switch (step) {
      case 'RUNNING':                              return { bg: '#dbeafe', text: '#0284c7', border: '#bae6fd' };
      case 'WAIT_FAI_QA': case 'WAIT_FAI_MGR':    return { bg: '#ffedd5', text: '#d97706', border: '#fed7aa' };
      case 'CLOSED':                               return { bg: '#dcfce7', text: '#0f766e', border: '#a7f3d0' };
      default:                                     return { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0' };
    }
  };
  const badge = getBadgeStyle(wo.currentStep);

  return (
    <tr>
      <td style={{ fontWeight: 'bold', textAlign: 'center' }}>
        <Link to={`/wo/${wo.woId}`} style={{ color: 'var(--primary)', textDecoration: 'none' }}>{wo.woId}</Link>
      </td>
      <td style={{ textAlign: 'center' }}>{wo.productCode}</td>
      <td style={{ textAlign: 'center' }}>{wo.customer}</td>
      <td style={{ textAlign: 'center' }}>{wo.qty.toLocaleString()}</td>
      <td style={{ textAlign: 'center' }}>
        <span style={{ backgroundColor: badge.bg, color: badge.text, border: `1px solid ${badge.border}`, padding: '4px 8px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
          {wo.currentStep}
        </span>
        <div style={{ marginTop: '8px', maxWidth: '120px', marginInline: 'auto' }}>
          <StatusStepper steps={buildSteps(wo.currentStep)} size="mini" />
        </div>
      </td>
      <td style={{ textAlign: 'center' }}>{wo.station}</td>
      <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>
        {new Date(wo.updatedAt).toLocaleString()}
      </td>
    </tr>
  );
}

export function WoDashboardPage() {
  useEffect(() => { seedIfEmpty(); }, []);

  const woList    = useMockWoList();
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [customerFilter, setCustomerFilter] = useState('');
  const [hideClosed, setHideClosed]         = useState(false);

  useEffect(() => { setLastUpdate(new Date()); }, [woList]);

  const kpis = useMemo(() => ({
    total:   woList.length,
    running: woList.filter(w => w.currentStep === 'RUNNING').length,
    waitFai: woList.filter(w => w.currentStep === 'WAIT_FAI_QA' || w.currentStep === 'WAIT_FAI_MGR').length,
    closed:  woList.filter(w => w.currentStep === 'CLOSED').length,
  }), [woList]);

  const allCustomers = useMemo(() => Array.from(new Set(woList.map(w => w.customer))).sort(), [woList]);

  const processedList = useMemo(() => {
    const severityMap: Record<string, number> = { WAIT_FAI_QA: 1, WAIT_FAI_MGR: 1, RUNNING: 2, OPEN: 3, READY: 5, DRAFT: 6, CLOSED: 4 };
    return woList
      .filter(wo => {
        const matchCustomer = customerFilter === '' || wo.customer === customerFilter;
        const matchHide = hideClosed ? wo.currentStep !== 'CLOSED' : true;
        return matchCustomer && matchHide;
      })
      .sort((a, b) => {
        const diff = (severityMap[a.currentStep] || 99) - (severityMap[b.currentStep] || 99);
        if (diff !== 0) return diff;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [woList, customerFilter, hideClosed]);

  return (
    <section className="stack-lg" style={{ minHeight: '100vh' }}>
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 className="panel__title">WO Status Dashboard</h1>
            <p className="panel__subtitle">ภาพรวมสถานะ Work Order ทั้งโรงงานแบบ Real-time</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Last updated: {lastUpdate.toLocaleTimeString()}
            </span>
            <button
              type="button"
              className="btn"
              style={{ background: '#0ea5e9', borderColor: '#0ea5e9', color: '#fff', fontWeight: 600, whiteSpace: 'nowrap' }}
              onClick={() => addWo(generateRandomWo())}
            >
              + Add Random WO
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
          <KpiCard label="Total WOs"  value={kpis.total}   tone="neutral" />
          <KpiCard label="Running"    value={kpis.running}  tone="busy"    />
          <KpiCard label="Wait FAI"   value={kpis.waitFai}  tone="warn"    />
          <KpiCard label="Closed"     value={kpis.closed}   tone="done"    />
        </div>

        <div className="filters-grid" style={{ marginTop: '2rem', marginBottom: '1rem' }}>
          <label className="field">
            <span>Filter Customer</span>
            <select value={customerFilter} onChange={e => setCustomerFilter(e.target.value)}>
              <option value="">All Customers</option>
              {allCustomers.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <div className="field" style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ visibility: 'hidden' }}>Spacer</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '100%', cursor: 'pointer' }}>
              <input type="checkbox" checked={hideClosed} onChange={e => setHideClosed(e.target.checked)} style={{ width: '20px', height: '20px', margin: 0, flexShrink: 0 }} />
              <span style={{ marginBottom: 0, textTransform: 'none', letterSpacing: 'normal', fontSize: '0.95rem' }}>ซ่อนงานที่ CLOSED แล้ว</span>
            </label>
          </div>
        </div>

        <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
          <table className="table table-readonly" style={{ minWidth: '750px', width: '100%', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '14%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '17%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '15%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ textAlign: 'center' }}>WO ID</th>
                <th style={{ textAlign: 'center' }}>Product</th>
                <th style={{ textAlign: 'center' }}>Customer</th>
                <th style={{ textAlign: 'center' }}>Qty</th>
                <th style={{ textAlign: 'center' }}>Current Step</th>
                <th style={{ textAlign: 'center' }}>Station</th>
                <th style={{ textAlign: 'center' }}>Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {processedList.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>ไม่พบข้อมูล Work Order</td></tr>
              ) : (
                processedList.map(wo => <WoRow key={wo.woId} wo={wo} />)
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
