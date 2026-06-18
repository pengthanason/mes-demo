import { useMemo, useState } from 'react';
import { usePpProjects, usePpDelete, PP_STATUS, PP_STATUS_LABEL, ppYield, type PpProject, type PpFilters } from '../lib/ppApi';
import { useIsViewer } from '../lib/useMockStore';
import { showToast } from '../lib/toast';
import { Paginator } from '../components/Paginator';
import {
  STATUS_STYLE, StatusBadge, fmtDate, exportXlsx, StatCard, BarRow, ChartCard, ProjectFormModal,
} from '../components/ppParts';

/* ── พิมพ์เป็น PDF (เปิดหน้าต่างใหม่ + print → save as PDF) ── */
function printPdf(rows: PpProject[]) {
  const esc = (v: any) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const head = ['Status', 'WK', 'Date', 'Product P/N', 'Model', 'Customer', 'QTY', 'WO', "Mat'l coming", 'Expected', 'Yield%', 'PIC'];
  const trs = rows.map(p => {
    const y = ppYield(p);
    return `<tr><td>${esc(PP_STATUS_LABEL[p.status] ?? p.status)}</td><td>${esc(p.wk ?? '')}</td><td>${esc(fmtDate(p.date_record))}</td><td>${esc(p.product_pn)}</td><td>${esc(p.model)}</td><td>${esc(p.customer)}</td><td style="text-align:right">${esc(p.qty)}</td><td>${esc(p.work_order)}</td><td>${esc(p.matl_coming)}</td><td>${esc(fmtDate(p.expected_date))}</td><td>${y == null ? '-' : y.toFixed(0) + '%'}</td><td>${esc(p.pd_pic)}</td></tr>`;
  }).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Production Plan</title>
    <style>body{font-family:'Segoe UI',Tahoma,sans-serif;padding:24px;color:#1e293b}h1{font-size:20px}
    table{width:100%;border-collapse:collapse;font-size:11px;margin-top:12px}
    th,td{border:1px solid #cbd5e1;padding:4px 6px;text-align:left}th{background:#f1f5f9}</style></head>
    <body><h1>Production Plan — ${new Date().toLocaleDateString('th-TH')}</h1>
    <table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${trs}</tbody></table>
    <script>window.onload=()=>{window.print()}</script></body></html>`;
  const w = window.open('', '_blank');
  if (!w) { showToast('เบราว์เซอร์บล็อก popup — อนุญาตก่อนพิมพ์', 'error'); return; }
  w.document.write(html); w.document.close();
}

export function DashboardPage() {
  const isViewer = useIsViewer();
  const [filters, setFilters] = useState<PpFilters>({});
  const { data: rows = [], isLoading } = usePpProjects(filters);
  const del = usePpDelete();
  const [edit, setEdit] = useState<PpProject | null>(null);
  const [adding, setAdding] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE = 12;

  const customers = useMemo(() => [...new Set(rows.map(r => r.customer).filter(Boolean))], [rows]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE));
  const paged = rows.slice((page - 1) * PAGE, page * PAGE);
  const setF = (k: keyof PpFilters, v: string) => { setFilters(p => ({ ...p, [k]: v || undefined })); setPage(1); };
  const hasFilter = Object.values(filters).some(Boolean);

  // aggregates สำหรับกราฟ
  const agg = useMemo(() => {
    const by = (s: string) => rows.filter(r => r.status === s).length;
    const totalOk = rows.reduce((s, r) => s + (r.total_ok || 0), 0);
    const totalNg = rows.reduce((s, r) => s + (r.total_ng || 0), 0);
    const ys = rows.map(ppYield).filter((v): v is number => v != null);
    const avgYield = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : null;
    const byStatus = PP_STATUS.map(s => ({ label: PP_STATUS_LABEL[s], value: by(s), color: STATUS_STYLE[s].text }));
    const cm: Record<string, number> = {};
    rows.forEach(r => { const c = r.customer || '(ไม่ระบุ)'; cm[c] = (cm[c] || 0) + 1; });
    const byCustomer = Object.entries(cm).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
    return { total: rows.length, done: by('DONE'), onProc: by('ON_PROCESS'), late: by('LATE'), matl: by('MATL_COMING'), totalOk, totalNg, avgYield, byStatus, byCustomer };
  }, [rows]);

  function handleDelete(p: PpProject) {
    if (!confirm(`ลบโปรเจกต์ "${p.product_pn || p.model}"?\nลบแล้วกู้ไม่ได้`)) return;
    del.mutate(p.id, { onSuccess: () => showToast('ลบแล้ว', 'info'), onError: (e: any) => showToast(e.message, 'error') });
  }

  const maxStatus = Math.max(1, ...agg.byStatus.map(x => x.value));
  const maxCust = Math.max(1, ...agg.byCustomer.map(x => x.value));

  return (
    <section className="stack-lg">
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 className="panel__title">Production Plan Dashboard</h1>
            <p className="panel__subtitle">ภาพรวมและตรวจสอบงานผลิต — ข้อมูลจาก Add Project</p>
          </div>
          {!isViewer && (
            <button type="button" className="btn" onClick={() => setAdding(true)}
              style={{ background: '#6366f1', borderColor: '#6366f1', color: '#fff', fontWeight: 600 }}>+ เพิ่มโปรเจกต์</button>
          )}
        </div>

        {/* KPI */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
          <StatCard icon="📦" label="ทั้งหมด" value={agg.total} accent="#6366f1" />
          <StatCard icon="✅" label="Done" value={agg.done} accent="#16a34a" />
          <StatCard icon="⚙️" label="On process" value={agg.onProc} accent="#2563eb" />
          <StatCard icon="⏰" label="Late" value={agg.late} accent="#dc2626" />
          <StatCard icon="📥" label="Mat'l coming" value={agg.matl} accent="#d97706" />
          <StatCard icon="🎯" label="Yield เฉลี่ย" value={agg.avgYield == null ? '—' : `${agg.avgYield.toFixed(1)}%`} accent="#7c3aed" />
        </div>
      </div>

      {/* กราฟ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
        <ChartCard title="จำนวนงานตามสถานะ">
          {agg.byStatus.map(s => <BarRow key={s.label} label={s.label} value={s.value} max={maxStatus} color={s.color} />)}
        </ChartCard>
        <ChartCard title="จำนวนงานตามลูกค้า (Top 8)">
          {agg.byCustomer.length ? agg.byCustomer.map(c => <BarRow key={c.label} label={c.label} value={c.value} max={maxCust} color="#6366f1" />) : <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>—</div>}
        </ChartCard>
        <ChartCard title="ผลผลิตรวม (OK vs NG)">
          <BarRow label="Total OK" value={agg.totalOk} max={Math.max(1, agg.totalOk + agg.totalNg)} color="#16a34a" />
          <BarRow label="Total NG" value={agg.totalNg} max={Math.max(1, agg.totalOk + agg.totalNg)} color="#dc2626" />
        </ChartCard>
      </div>

      {/* ตาราง + filter + export */}
      <div className="panel">
        <div className="filters-grid">
          <label className="field"><span>สถานะ</span>
            <select value={filters.status ?? ''} onChange={e => setF('status', e.target.value)}>
              <option value="">ทั้งหมด</option>
              {PP_STATUS.map(s => <option key={s} value={s}>{PP_STATUS_LABEL[s]}</option>)}
            </select>
          </label>
          <label className="field"><span>Customer</span>
            <input list="dash-customers" value={filters.customer ?? ''} onChange={e => setF('customer', e.target.value)} placeholder="ทั้งหมด" />
            <datalist id="dash-customers">{customers.map(c => <option key={c} value={c} />)}</datalist>
          </label>
          <label className="field"><span>Product P/N</span><input value={filters.product_pn ?? ''} onChange={e => setF('product_pn', e.target.value)} placeholder="ค้นหา..." /></label>
          <label className="field"><span>Model</span><input value={filters.model ?? ''} onChange={e => setF('model', e.target.value)} placeholder="ค้นหา..." /></label>
          <label className="field"><span>ตั้งแต่วันที่</span><input type="date" value={filters.date_from ?? ''} onChange={e => setF('date_from', e.target.value)} /></label>
          <label className="field"><span>ถึงวันที่</span><input type="date" value={filters.date_to ?? ''} onChange={e => setF('date_to', e.target.value)} /></label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{rows.length} โปรเจกต์</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {hasFilter && <button type="button" className="btn secondary" style={{ fontSize: '0.82rem' }} onClick={() => { setFilters({}); setPage(1); }}>ล้าง filter</button>}
            <button type="button" className="btn secondary" style={{ fontSize: '0.82rem' }} disabled={rows.length === 0} onClick={() => { void exportXlsx(rows); }}>⬇️ Excel</button>
            <button type="button" className="btn secondary" style={{ fontSize: '0.82rem' }} disabled={rows.length === 0} onClick={() => printPdf(rows)}>🖨️ PDF</button>
          </div>
        </div>

        <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 8 }}>
          <table className="table table-readonly" style={{ minWidth: 1950, width: '100%', fontSize: '0.78rem' }}>
            <thead>
              <tr>
                <th rowSpan={2}>Status</th>
                <th rowSpan={2}>WK</th>
                <th rowSpan={2}>DATE Record</th>
                <th rowSpan={2}>Product P/N</th>
                <th rowSpan={2}>MODEL</th>
                <th rowSpan={2} style={{ textAlign: 'center' }}>QTY</th>
                <th rowSpan={2}>Customer</th>
                <th rowSpan={2}>WO</th>
                <th>SC</th>
                <th colSpan={4} style={{ textAlign: 'center' }}>4M Check</th>
                <th colSpan={5} style={{ textAlign: 'center' }}>PD Plan</th>
                <th colSpan={2} style={{ textAlign: 'center' }}>QA</th>
                <th style={{ textAlign: 'center' }}>Store</th>
                <th rowSpan={2} style={{ textAlign: 'center' }}>Expected</th>
                <th rowSpan={2} style={{ textAlign: 'center' }}>Revised</th>
                <th rowSpan={2} style={{ textAlign: 'center' }}>DONE</th>
                <th rowSpan={2}>PD PIC</th>
                <th rowSpan={2} style={{ textAlign: 'center' }}>Team</th>
                <th rowSpan={2} style={{ textAlign: 'center' }}>OK/DAY</th>
                <th rowSpan={2} style={{ textAlign: 'center' }}>NG</th>
                <th rowSpan={2} style={{ textAlign: 'center' }}>OK</th>
                <th rowSpan={2} style={{ textAlign: 'center' }}>Yield</th>
                <th rowSpan={2}>Remark</th>
                {!isViewer && <th rowSpan={2} style={{ textAlign: 'center' }}>จัดการ</th>}
              </tr>
              <tr>
                <th>Mat'l coming</th>
                <th style={{ textAlign: 'center' }}>Man</th><th style={{ textAlign: 'center' }}>Mac</th><th style={{ textAlign: 'center' }}>Med</th><th style={{ textAlign: 'center' }}>Mat</th>
                <th style={{ textAlign: 'center' }}>PCBA</th><th style={{ textAlign: 'center' }}>BBAS</th><th style={{ textAlign: 'center' }}>TEST</th><th>Start</th><th>Finish</th>
                <th>Rate%</th><th>Finish</th>
                <th>Received</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={isViewer ? 31 : 32} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>กำลังโหลด...</td></tr>
              ) : paged.length === 0 ? (
                <tr><td colSpan={isViewer ? 31 : 32} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>ยังไม่มีข้อมูล — กด "+ เพิ่มโปรเจกต์"</td></tr>
              ) : paged.map(p => {
                const y = ppYield(p);
                const ck = (b: boolean) => b ? <span style={{ color: '#16a34a', fontWeight: 700 }}>✓</span> : <span style={{ color: '#cbd5e1' }}>·</span>;
                return (
                  <tr key={p.id}>
                    <td><StatusBadge status={p.status} /></td>
                    <td>{p.wk ?? '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(p.date_record)}</td>
                    <td style={{ fontWeight: 600 }}>{p.product_pn || '—'}</td>
                    <td>{p.model || '—'}</td>
                    <td style={{ textAlign: 'center' }}>{p.qty.toLocaleString()}</td>
                    <td>{p.customer || '—'}</td>
                    <td>{p.work_order || '—'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{p.matl_coming || '—'}</td>
                    <td style={{ textAlign: 'center' }}>{ck(p.chk_man)}</td><td style={{ textAlign: 'center' }}>{ck(p.chk_mac)}</td><td style={{ textAlign: 'center' }}>{ck(p.chk_med)}</td><td style={{ textAlign: 'center' }}>{ck(p.chk_mat)}</td>
                    <td style={{ textAlign: 'center' }}>{ck(p.pd_pcba)}</td><td style={{ textAlign: 'center' }}>{ck(p.pd_bbas)}</td><td style={{ textAlign: 'center' }}>{ck(p.pd_test)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(p.pd_start_date)}</td><td style={{ whiteSpace: 'nowrap' }}>{fmtDate(p.pd_finish_date)}</td>
                    <td>{p.qa_test_rate || '—'}</td><td style={{ whiteSpace: 'nowrap' }}>{fmtDate(p.qa_finish_date)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(p.store_received)}</td>
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>{fmtDate(p.expected_date)}</td>
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>{fmtDate(p.revised_date)}</td>
                    <td style={{ textAlign: 'center' }}>{ck(p.done)}</td>
                    <td>{p.pd_pic || '—'}</td>
                    <td style={{ textAlign: 'center' }}>{p.team_member || '—'}</td>
                    <td style={{ textAlign: 'center' }}>{p.ok_per_day || '—'}</td>
                    <td style={{ textAlign: 'center', color: '#dc2626' }}>{p.total_ng || 0}</td>
                    <td style={{ textAlign: 'center', color: '#16a34a' }}>{p.total_ok || 0}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600, color: y == null ? '#94a3b8' : y >= 95 ? '#16a34a' : y >= 80 ? '#d97706' : '#dc2626' }}>{y == null ? '—' : `${y.toFixed(0)}%`}</td>
                    <td style={{ minWidth: 160, color: 'var(--text-muted)' }}>{p.remark || '—'}</td>
                    {!isViewer && (
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                          <button type="button" className="btn secondary" style={{ padding: '3px 10px', fontSize: '0.75rem' }} onClick={() => setEdit(p)}>แก้ไข</button>
                          <button type="button" className="btn danger" style={{ padding: '3px 10px', fontSize: '0.75rem' }} onClick={() => handleDelete(p)}>ลบ</button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Paginator page={page} totalPages={totalPages} onPage={setPage} total={rows.length} />
      </div>

      {adding && <ProjectFormModal initial={null} onClose={() => setAdding(false)} />}
      {edit && <ProjectFormModal initial={edit} onClose={() => setEdit(null)} />}
    </section>
  );
}
