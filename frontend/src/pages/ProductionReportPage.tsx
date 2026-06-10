import React, { useMemo, useState, useEffect } from 'react';

type ReportItem = { id: string, code: string, customer: string, status: string, qty: number, delivery: string, stage: string, isCompleted: boolean };

const INITIAL_REPORT: ReportItem[] = [
  { id: '1', code: 'E13A_STD', customer: 'THS', status: 'ทดสอบการทำงาน (เช็คสี LED)', qty: 270, delivery: '2026-03-30', stage: 'Test', isCompleted: false },
  { id: '2', code: 'ZSZ003-081A', customer: 'TAD', status: 'SMT เสร็จ เหลือ Depanel/Packing', qty: 1200, delivery: '2026-04-06', stage: 'Packing', isCompleted: false },
  { id: '3', code: '01489E-081', customer: 'TAD', status: 'ขึ้นงานผลิต', qty: 90, delivery: '2026-04-06', stage: 'SMT', isCompleted: false },
  { id: '4', code: '5K45', customer: 'THS', status: 'Depanel PCBA, ส่งมอบแล้ว', qty: 500, delivery: '2026-03-27', stage: 'Depanel', isCompleted: true },
];

const getStageStyle = (stage: string) => {
  switch (stage.toLowerCase()) {
    case 'smt': return { bg: '#dbeafe', text: '#0284c7', border: '#bae6fd' };
    case 'test': return { bg: '#fef08a', text: '#b45309', border: '#fde047' };
    case 'packing': return { bg: '#dcfce7', text: '#0f766e', border: '#a7f3d0' };
    case 'depanel': return { bg: '#f3e8ff', text: '#7e22ce', border: '#e9d5ff' };
    default: return { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0' };
  }
};

const formatDateAndCheckOverdue = (dateString: string) => {
  const targetDate = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0); 
  
  const isOverdue = targetDate < today;
  
  const diffTime = targetDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const isDueThisWeek = diffDays >= 0 && diffDays <= 7;

  return {
    formatted: targetDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    isOverdue,
    isDueThisWeek
  };
};

export function ProductionReportPage() {
  const [reports, setReports] = useState<ReportItem[]>(() => {
    try {
      const saved = localStorage.getItem('mes_production_report_mock');
      return saved ? JSON.parse(saved) : INITIAL_REPORT;
    } catch {
      return INITIAL_REPORT;
    }
  });

  useEffect(() => {
    localStorage.setItem('mes_production_report_mock', JSON.stringify(reports));
  }, [reports]);

  const [searchText, setSearchText] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [completionFilter, setCompletionFilter] = useState('PENDING');

  function addReport() {
    const newItem: ReportItem = {
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      code: '', customer: '', status: '', qty: 0, delivery: '', stage: 'Planning', isCompleted: false
    };
    setReports([newItem, ...reports]);
  }

  function updateReport(id: string, field: keyof ReportItem, value: any) {
    setReports(reports.map(r => r.id === id ? { ...r, [field]: value } : r));
  }

  function removeReport(id: string) {
    const itemToDelete = reports.find(r => r.id === id);
    if (!itemToDelete) return;

    const isEmpty = itemToDelete.code.trim() === '' && 
                    itemToDelete.customer.trim() === '' && 
                    itemToDelete.status.trim() === '' && 
                    itemToDelete.qty === 0;

    if (isEmpty || window.confirm('ยืนยันการลบรายการที่มีข้อมูลนี้ทิ้งใช่หรือไม่?')) {
      setReports(reports.filter(r => r.id !== id));
    }
  }

  const allCustomers = useMemo(() => {
    return Array.from(new Set(reports.map(item => item.customer).filter(c => c.trim() !== ''))).sort();
  }, [reports]);

  const filteredData = useMemo(() => {
    const filtered = reports.filter(item => {
      const matchSearch = item.code.toLowerCase().includes(searchText.toLowerCase());
      const matchCustomer = customerFilter === '' || item.customer === customerFilter;
      const matchCompletion = completionFilter === 'ALL' ? true : completionFilter === 'COMPLETED' ? item.isCompleted : !item.isCompleted;
      return matchSearch && matchCustomer && matchCompletion;
    });

    return filtered.sort((a, b) => {
      if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
      const dateA = a.delivery ? new Date(a.delivery).getTime() : 0;
      const dateB = b.delivery ? new Date(b.delivery).getTime() : 0;
      return dateA - dateB;
    });
  }, [reports, searchText, customerFilter, completionFilter]);

  const summary = useMemo(() => {
    let totalQty = 0;
    let dueThisWeekCount = 0;

    filteredData.forEach(item => {
      if (item.isCompleted) return;
      totalQty += item.qty;
      const dateInfo = formatDateAndCheckOverdue(item.delivery);
      if (dateInfo.isDueThisWeek) dueThisWeekCount++;
    });

    return { totalProjects: filteredData.length, totalQty, dueThisWeekCount };
  }, [filteredData]);

  return (
    <section className="stack-lg">
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
          <div>
            <h1 className="panel__title">Daily Production Report</h1>
            <p className="panel__subtitle">บันทึกและสรุปสถานะงานผลิตรายวัน (Mock Data Editable)</p>
          </div>
          <button type="button" className="btn" onClick={addReport} style={{ background: '#3498db', color: '#ffffff', border: 'none' }}>
            + Add Project
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
          <div className="glass-panel" style={{ padding: '1rem', borderLeft: '4px solid var(--primary)' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase' }}>Total Projects</div>
            <strong style={{ fontSize: '1.5rem', color: 'white' }}>{summary.totalProjects}</strong>
          </div>
          <div className="glass-panel" style={{ padding: '1rem', borderLeft: '4px solid #f59e0b' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase' }}>Pending Due This Week</div>
            <strong style={{ fontSize: '1.5rem', color: 'white' }}>{summary.dueThisWeekCount}</strong>
          </div>
          <div className="glass-panel" style={{ padding: '1rem', borderLeft: '4px solid #10b981' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase' }}>Pending Qty (pcs)</div>
            <strong style={{ fontSize: '1.5rem', color: 'white' }}>{summary.totalQty.toLocaleString()}</strong>
          </div>
        </div>

        <div className="filters-grid" style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>
          <label className="field">
            <span>Search Project</span>
            <input type="text" placeholder="พิมพ์ Project Code..." value={searchText} onChange={e => setSearchText(e.target.value)} />
          </label>
          <label className="field">
            <span>Filter Customer</span>
            <select value={customerFilter} onChange={e => setCustomerFilter(e.target.value)}>
              <option value="">All Customers</option>
              {allCustomers.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Filter Status</span>
            <select value={completionFilter} onChange={e => setCompletionFilter(e.target.value)}>
              <option value="PENDING">🕒 กำลังดำเนินการ (Pending)</option>
              <option value="COMPLETED">✅ เสร็จสิ้นแล้ว (Completed)</option>
              <option value="ALL">รวมทั้งหมด (All)</option>
            </select>
          </label>
        </div>

        <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
          <table className="table table-readonly">
            <thead>
              <tr>
                <th style={{ width: '50px', textAlign: 'center' }}>No.</th>
                <th>Project Code</th>
                <th>Customer</th>
                <th>Stage</th>
                <th style={{ width: '30%' }}>Status Update</th>
                <th>Qty (pcs)</th>
                <th>Delivery Date</th>
                <th style={{ textAlign: 'center' }}>Done?</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>ไม่พบข้อมูลโปรเจกต์ที่ค้นหา</td></tr>
              ) : (
                filteredData.map((item, index) => {
                  const stageStyle = getStageStyle(item.stage);
                  const dateInfo = formatDateAndCheckOverdue(item.delivery);

                  return (
                    <tr key={item.id} style={{ opacity: item.isCompleted ? 0.6 : 1, transition: 'opacity 0.2s' }}>
                      <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{index + 1}</td>
                      <td>
                        <input type="text" value={item.code} onChange={e => updateReport(item.id, 'code', e.target.value)} placeholder="E13A..." style={{ width: '100px', padding: '4px', border: '1px solid #ccc', borderRadius: '4px' }} />
                      </td>
                      <td>
                        <input type="text" value={item.customer} onChange={e => updateReport(item.id, 'customer', e.target.value)} placeholder="Customer..." style={{ width: '80px', padding: '4px', border: '1px solid #ccc', borderRadius: '4px' }} />
                      </td>
                      <td>
                        <select 
                          value={item.stage} 
                          onChange={e => updateReport(item.id, 'stage', e.target.value)}
                          style={{ backgroundColor: stageStyle.bg, color: stageStyle.text, border: `1px solid ${stageStyle.border}`, borderRadius: '4px', padding: '4px', fontWeight: 600, outline: 'none' }}
                        >
                          <option value="Planning">Planning</option>
                          <option value="SMT">SMT</option>
                          <option value="Test">Test</option>
                          <option value="Packing">Packing</option>
                          <option value="Depanel">Depanel</option>
                        </select>
                      </td>
                      <td>
                        <input type="text" value={item.status} onChange={e => updateReport(item.id, 'status', e.target.value)} placeholder="รายละเอียดสถานะปัจจุบัน..." style={{ width: '100%', minWidth: '150px', padding: '4px', border: '1px solid #ccc', borderRadius: '4px' }} />
                      </td>
                      <td>
                        <input type="number" min="0" value={item.qty} onChange={e => updateReport(item.id, 'qty', Number(e.target.value))} style={{ width: '80px', padding: '4px', border: '1px solid #ccc', borderRadius: '4px' }} />
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <input type="date" value={item.delivery} onChange={e => updateReport(item.id, 'delivery', e.target.value)} style={{ padding: '4px', border: '1px solid #ccc', borderRadius: '4px', color: !item.isCompleted && dateInfo.isOverdue ? '#ef4444' : 'inherit' }} />
                          {!item.isCompleted && item.delivery && (
                            <span style={{ fontSize: '0.75rem', color: dateInfo.isOverdue ? '#ef4444' : 'var(--text-muted)' }}>
                              {dateInfo.isOverdue ? '⚠️ เลยกำหนด' : 'ในกำหนด'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input type="checkbox" checked={item.isCompleted} onChange={e => updateReport(item.id, 'isCompleted', e.target.checked)} style={{ transform: 'scale(1.5)', cursor: 'pointer' }} title="ทำเครื่องหมายว่าเสร็จสิ้น" />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button className="btn danger" onClick={() => removeReport(item.id)} style={{ padding: '4px 8px', fontSize: '0.8rem' }}>Delete</button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}