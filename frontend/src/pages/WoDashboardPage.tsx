import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchWoList, WoSummary } from '../lib/dashboardApi';
import { useAutoRefresh } from '../lib/useAutoRefresh';
import { buildSteps } from '../lib/woLifecycle';
import { StatusStepper } from '../components/StatusStepper';

// --- Component ย่อย 1: KPI Card ---
function KpiCard({ label, value, tone }: { label: string, value: number, tone: 'neutral' | 'busy' | 'warn' | 'done' }) {
  const getToneStyle = () => {
    switch (tone) {
      case 'busy': return { borderLeft: '4px solid #3b82f6', color: '#eff6ff' }; // ฟ้า
      case 'warn': return { borderLeft: '4px solid #f59e0b', color: '#fffbeb' }; // ส้ม
      case 'done': return { borderLeft: '4px solid #10b981', color: '#ecfdf5' }; // เขียว
      default: return { borderLeft: '4px solid #94a3b8', color: '#f8fafc' }; // เทา
    }
  };
  
  const style = getToneStyle();

  return (
    <div className="glass-panel" style={{ padding: '1.2rem', borderLeft: style.borderLeft, background: 'var(--bg-panel)' }}>
      <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.5rem' }}>
        {label}
      </div>
      <strong style={{ fontSize: '2rem', color: 'var(--text-main)', lineHeight: 1 }}>{value}</strong>
    </div>
  );
}

// --- Component ย่อย 2: WO Row ---
function WoRow({ wo }: { wo: WoSummary }) {
  const getBadgeStyle = (step: string) => {
    switch (step) {
      case 'RUNNING': return { bg: '#dbeafe', text: '#0284c7', border: '#bae6fd' }; // ฟ้า
      case 'WAIT_FAI': return { bg: '#ffedd5', text: '#d97706', border: '#fed7aa' }; // ส้ม (เด่นมากให้หัวหน้าเห็น)
      case 'CLOSED': return { bg: '#dcfce7', text: '#0f766e', border: '#a7f3d0' }; // เขียว
      default: return { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0' }; // OPEN / เทา
    }
  };
  const badge = getBadgeStyle(wo.currentStep);

  return (
    <tr>
      <td style={{ fontWeight: 'bold', color: 'var(--primary)', textAlign: 'center' }}>{wo.woId}</td>
      <td style={{ textAlign: 'center' }}>{wo.productCode}</td>
      <td style={{ textAlign: 'center' }}>{wo.customer}</td>
      <td style={{ textAlign: 'center' }}>{wo.qty.toLocaleString()}</td>
      <td style={{ textAlign: 'center' }}>
        <span style={{ backgroundColor: badge.bg, color: badge.text, border: `1px solid ${badge.border}`, padding: '4px 8px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
          {wo.currentStep}
        </span>
        
        {/* โบนัสก้าวที่ 6: นำ Stepper ย่อส่วนมาแสดงใต้ Badge */}
        <div style={{ marginTop: '8px', maxWidth: '120px', marginInline: 'auto' }}>
          <StatusStepper steps={buildSteps(wo.currentStep)} size="mini" />
        </div>
      </td>
      <td style={{ textAlign: 'center' }}>{wo.station}</td>
      <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>{wo.updatedAt}</td>
    </tr>
  );
}

export function WoDashboardPage() {
  const [woList, setWoList] = useState<WoSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  // Filters
  const [customerFilter, setCustomerFilter] = useState('');
  const [hideClosed, setHideClosed] = useState(false);

  // ฟังก์ชันโหลดข้อมูล
  const loadData = useCallback(async () => {
    try {
      const data = await fetchWoList();
      setWoList(data);
      setLastUpdate(new Date());
    } catch (error) {
      console.error("Failed to load WO list", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // เรียกโหลดครั้งแรกเมื่อเปิดหน้า
  useEffect(() => { loadData(); }, [loadData]);

  // ใช้งาน Custom Hook เพื่อให้ดึงข้อมูลอัตโนมัติทุกๆ 30 วินาที (30000 ms)
  useAutoRefresh(loadData, 30000);

  // คำนวณ KPI โดยตรงจากข้อมูลดิบ
  const kpis = useMemo(() => {
    return {
      total: woList.length,
      running: woList.filter(w => w.currentStep === 'RUNNING').length,
      waitFai: woList.filter(w => w.currentStep === 'WAIT_FAI').length,
      closed: woList.filter(w => w.currentStep === 'CLOSED').length,
    };
  }, [woList]);

  const allCustomers = useMemo(() => Array.from(new Set(woList.map(w => w.customer))).sort(), [woList]);

  // ประมวลผลตาราง: Filter + Smart Sort
  const processedList = useMemo(() => {
    let filtered = woList.filter(wo => {
      const matchCustomer = customerFilter === '' || wo.customer === customerFilter;
      const matchHideClosed = hideClosed ? wo.currentStep !== 'CLOSED' : true;
      return matchCustomer && matchHideClosed;
    });

    // Smart Sort: ดันงานที่มีปัญหา/ต้องรีบดู (WAIT_FAI, RUNNING) ขึ้นบนสุด
    const severityMap: Record<string, number> = { 'WAIT_FAI': 1, 'RUNNING': 2, 'OPEN': 3, 'CLOSED': 4 };
    
    return filtered.sort((a, b) => { // Multi-level sort
      const scoreA = severityMap[a.currentStep] || 99;
      const scoreB = severityMap[b.currentStep] || 99;

      // 1. Sort by currentStep priority (WAIT_FAI, RUNNING, OPEN, CLOSED)
      if (scoreA !== scoreB) {
        return scoreA - scoreB;
      }

      // 2. If currentStep is the same, sort by updatedAt (latest first)
      const dateA = new Date(a.updatedAt).getTime();
      const dateB = new Date(b.updatedAt).getTime();
      return dateB - dateA; // Descending order (latest time first)
    });
  }, [woList, customerFilter, hideClosed]);

  return (
    <section className="stack-lg" style={{ minHeight: '100vh' }}> {/* Added minHeight to prevent overall layout shift */}
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 className="panel__title">WO Status Dashboard</h1>
            <p className="panel__subtitle">ภาพรวมสถานะ Work Order ทั้งโรงงานแบบ Real-time</p>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}> {/* Added whiteSpace: 'nowrap' to prevent wrapping */}
            Last updated: {lastUpdate.toLocaleTimeString()} 
            {isLoading && <span style={{ marginLeft: '8px', color: '#3b82f6' }}>⏳</span>}
          </div>
        </div>

        {/* ก้าวที่ 2: การ์ด KPI วางแบบ Grid (รองรับมือถือ 360px จะตกลงมาเรียงกัน) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
          <KpiCard label="Total WOs" value={kpis.total} tone="neutral" />
          <KpiCard label="Running" value={kpis.running} tone="busy" />
          <KpiCard label="Wait FAI" value={kpis.waitFai} tone="warn" />
          <KpiCard label="Closed (Today)" value={kpis.closed} tone="done" />
        </div>

        {/* ก้าวที่ 5: Filters */}
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

        {/* ก้าวที่ 3: ตาราง WO */}
        <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
          <table className="table table-readonly" style={{ minWidth: '750px', width: '100%', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '14%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '12%' }} />
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
                /* ใช้ key เป็น wo.woId เพื่อประสิทธิภาพสูงสุด */
                processedList.map((wo) => <WoRow key={wo.woId} wo={wo} />)
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}