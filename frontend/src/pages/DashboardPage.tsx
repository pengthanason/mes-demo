import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePpProjects, usePpDelete, PP_STATUS, PP_STATUS_LABEL, ppYield, type PpProject, type PpFilters } from '../lib/ppApi';
import { useIsViewer } from '../lib/useMockStore';
import { showToast } from '../lib/toast';
import { Paginator } from '../components/Paginator';
import { FactoryOverview } from '../components/FactoryOverview';
import { FlowGuide } from '../components/FlowGuide';
import { SYNTECH_LOGO_PNG_BASE64 } from '../assets/syntechLogo';
import {
  STATUS_STYLE, StatusBadge, fmtDate, exportXlsx, StatCard, BarRow, ChartCard, Donut, ProjectFormModal, PP_COLUMNS,
} from '../components/ppParts';

/* ── พิมพ์เป็น PDF — เรียงคอลัมน์ตาม Dashboard (PP_COLUMNS) + โลโก้/สี SYNTECH ── */
function printPdf(rows: PpProject[]) {
  const esc = (v: any) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const ths = PP_COLUMNS.map(c => {
    const style = c.headerColor ? ` style="background:#${c.headerColor}${c.headerColor === '00B050' ? ';color:#fff' : ''}"` : '';
    return `<th${style}>${esc(c.header)}</th>`;
  }).join('');
  const trs = rows.map(p => {
    const st = STATUS_STYLE[p.status] ?? STATUS_STYLE.ON_PROCESS;
    const tds = PP_COLUMNS.map(c => {
      const val = esc(c.value(p));
      if (c.key === 'status') return `<td style="background:${st.bg};color:${st.text};font-weight:700;text-align:center">${val}</td>`;
      if (c.key === 'done' && p.done) return `<td class="c" style="color:#16a34a;font-weight:700">${val}</td>`;
      return `<td${c.center ? ' class="c"' : ''}>${val}</td>`;
    }).join('');
    return `<tr>${tds}</tr>`;
  }).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Production Plan</title>
    <style>
      @page { size: A4 landscape; margin: 7mm; }
      body{font-family:'Segoe UI',Tahoma,sans-serif;color:#1e293b;margin:0}
      .hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
      .hd img{height:40px}
      .hd .t{font-size:22px;font-weight:800;color:#2e7d32}
      .hd .code{font-size:9px;color:#64748b}
      table{width:100%;border-collapse:collapse;font-size:7.5px;table-layout:fixed}
      th,td{border:1px solid #b0b8c4;padding:2px 3px;text-align:left;word-break:break-word;overflow:hidden}
      th{background:#d9ead3;color:#1b4332;text-align:center;font-size:7.5px}
      td.c{text-align:center}
    </style></head>
    <body>
    <div class="hd">
      <img src="data:image/png;base64,${SYNTECH_LOGO_PNG_BASE64}" alt="SYNTECH"/>
      <div class="t">Production Plan</div>
      <div class="code">FM03 Rev.01 Ref.EN-P-01<br/>${new Date().toLocaleDateString('th-TH')}</div>
    </div>
    <table>
      <thead><tr>${ths}</tr></thead>
      <tbody>${trs}</tbody>
    </table>
    <script>window.onload=()=>{window.print()}</script></body></html>`;
  const w = window.open('', '_blank');
  if (!w) { showToast('เบราว์เซอร์บล็อก popup — อนุญาตก่อนพิมพ์', 'error'); return; }
  w.document.write(html); w.document.close();
}

/* การ์ด KPI ที่กดเพื่อกรองสถานะในตารางได้ */
function KpiCard({ icon, label, value, accent, onClick, active }: {
  icon: string; label: string; value: number | string; accent: string; onClick: () => void; active: boolean;
}) {
  return (
    <div onClick={onClick} title="กดเพื่อกรองตารางตามสถานะนี้"
      style={{ cursor: 'pointer', borderRadius: 12, outline: active ? `2px solid ${accent}` : '2px solid transparent', transition: 'transform 0.12s, box-shadow 0.12s' }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(0,0,0,0.10)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}>
      <StatCard icon={icon} label={label} value={value} accent={accent} />
    </div>
  );
}

export function DashboardPage() {
  const isViewer = useIsViewer();
  const [filters, setFilters] = useState<PpFilters>({});
  const { data: rows = [], isLoading } = usePpProjects(filters);
  const del = usePpDelete();
  const queryClient = useQueryClient();
  const [updatedAt, setUpdatedAt] = useState(() => new Date());
  // รีเฟรชข้อมูลทั้ง dashboard ทุก 10 วินาที + อัปเดตเวลา
  useEffect(() => {
    const t = setInterval(() => { void queryClient.invalidateQueries(); setUpdatedAt(new Date()); }, 10000);
    return () => clearInterval(t);
  }, [queryClient]);
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

  const maxCust = Math.max(1, ...agg.byCustomer.map(x => x.value));

  return (
    <section className="stack-lg">
      {/* แถบหัว Dashboard — บอกว่าเป็นข้อมูลสด + เวลาอัปเดต (เหมาะกับจอมอนิเตอร์) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>📊 Production Dashboard</h1>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          <span style={{ width: 9, height: 9, borderRadius: 99, background: '#22c55e', display: 'inline-block', boxShadow: '0 0 0 3px rgba(34,197,94,0.18)' }} />
          อัปเดต {updatedAt.toLocaleTimeString('th-TH')}
        </span>
      </div>

      <FactoryOverview />

      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 className="panel__title">📋 Production Plan</h1>
            <p className="panel__subtitle">ภาพรวมและตรวจสอบงานผลิต — ข้อมูลจาก Add Project</p>
          </div>
          {!isViewer && (
            <button type="button" className="btn" title="เพิ่มโปรเจกต์ใหม่เข้าตาราง Production Plan" onClick={() => setAdding(true)}
              style={{ background: '#6366f1', borderColor: '#6366f1', color: '#fff', fontWeight: 600 }}>+ เพิ่มโปรเจกต์</button>
          )}
        </div>

        {/* KPI — กดเพื่อกรองสถานะในตารางด้านล่าง */}
        <div className="dash-grid-3" style={{ marginTop: '1.5rem' }}>
          <KpiCard icon="📦" label="ทั้งหมด" value={agg.total} accent="#6366f1" onClick={() => setF('status', '')} active={!filters.status} />
          <KpiCard icon="✅" label="Done" value={agg.done} accent="#16a34a" onClick={() => setF('status', 'DONE')} active={filters.status === 'DONE'} />
          <KpiCard icon="⚙️" label="On process" value={agg.onProc} accent="#2563eb" onClick={() => setF('status', 'ON_PROCESS')} active={filters.status === 'ON_PROCESS'} />
          <KpiCard icon="⏰" label="Late" value={agg.late} accent="#dc2626" onClick={() => setF('status', 'LATE')} active={filters.status === 'LATE'} />
          <KpiCard icon="📥" label="Mat'l coming" value={agg.matl} accent="#d97706" onClick={() => setF('status', 'MATL_COMING')} active={filters.status === 'MATL_COMING'} />
          <StatCard icon="🎯" label="Yield เฉลี่ย" value={agg.avgYield == null ? '—' : `${agg.avgYield.toFixed(1)}%`} accent="#7c3aed" />
        </div>
      </div>

      {/* กราฟ */}
      <div className="dash-grid-3">
        <ChartCard title="สัดส่วนงานตามสถานะ">
          <Donut data={agg.byStatus} />
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
            <button type="button" className="btn secondary" title="ดาวน์โหลดเป็นไฟล์ Excel ตามฟอร์ม FM03 (โลโก้+สี)" style={{ fontSize: '0.82rem' }} disabled={rows.length === 0} onClick={() => { void exportXlsx(rows); }}>⬇️ Excel</button>
            <button type="button" className="btn secondary" title="พิมพ์/บันทึกเป็น PDF ตามฟอร์ม" style={{ fontSize: '0.82rem' }} disabled={rows.length === 0} onClick={() => printPdf(rows)}>🖨️ PDF</button>
          </div>
        </div>

        <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 8 }}>
          <table className="table table-readonly" style={{ minWidth: 1950, width: '100%', fontSize: '0.78rem' }}>
            <thead>
              <tr>
                {/* ── สำคัญ: ขึ้นก่อน ── */}
                <th>Status</th>
                <th>Product P/N</th>
                <th>MODEL</th>
                <th>Customer</th>
                <th style={{ textAlign: 'center' }}>QTY</th>
                <th>DATE Record</th>
                <th style={{ textAlign: 'center' }}>Expected</th>
                <th style={{ textAlign: 'center' }}>Revised</th>
                <th style={{ textAlign: 'center' }}>OK/DAY</th>
                <th style={{ textAlign: 'center' }}>NG</th>
                <th style={{ textAlign: 'center' }}>OK</th>
                <th style={{ textAlign: 'center' }}>Yield</th>
                <th style={{ textAlign: 'center' }}>DONE</th>
                {/* ── รายละเอียด ── */}
                <th style={{ textAlign: 'center' }}>WW</th>
                <th>WO</th>
                <th style={{ textAlign: 'center' }}>Man</th><th style={{ textAlign: 'center' }}>Mac</th><th style={{ textAlign: 'center' }}>Med</th><th style={{ textAlign: 'center' }}>Mat</th>
                <th style={{ textAlign: 'center' }}>PCBA</th><th style={{ textAlign: 'center' }}>BBAS</th><th style={{ textAlign: 'center' }}>TEST</th><th style={{ textAlign: 'center' }}>RMA</th>
                <th style={{ textAlign: 'center' }}>Sampling%</th>
                <th>PD Start</th><th>PD Finish</th>
                <th>QA Finish</th>
                <th>Store</th>
                <th>Mat'l coming</th>
                <th>PD PIC</th>
                <th style={{ textAlign: 'center' }}>Team</th>
                <th>Remark</th>
                {!isViewer && <th style={{ textAlign: 'center' }}>จัดการ</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={isViewer ? 32 : 33} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>กำลังโหลด...</td></tr>
              ) : paged.length === 0 ? (
                <tr><td colSpan={isViewer ? 32 : 33} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>{hasFilter ? 'ไม่พบรายการตามตัวกรอง — กด “ล้าง filter” เพื่อดูทั้งหมด' : 'ยังไม่มีข้อมูล — กด “+ เพิ่มโปรเจกต์” เพื่อเริ่ม'}</td></tr>
              ) : paged.map(p => {
                const y = ppYield(p);
                const ck = (b: boolean) => b ? <span style={{ color: '#16a34a', fontWeight: 700 }}>✓</span> : <span style={{ color: '#cbd5e1' }}>·</span>;
                return (
                  <tr key={p.id} style={p.status === 'LATE' ? { background: '#fef2f2', boxShadow: 'inset 3px 0 0 #dc2626' } : undefined}>
                    {/* ── สำคัญ: ขึ้นก่อน ── */}
                    <td><StatusBadge status={p.status} /></td>
                    <td style={{ fontWeight: 600 }}>{p.product_pn || '—'}</td>
                    <td>{p.model || '—'}</td>
                    <td>{p.customer || '—'}</td>
                    <td style={{ textAlign: 'center' }}>{p.qty.toLocaleString()}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(p.date_record)}</td>
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>{fmtDate(p.expected_date)}</td>
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>{fmtDate(p.revised_date)}</td>
                    <td style={{ textAlign: 'center' }}>{p.ok_per_day || '—'}</td>
                    <td style={{ textAlign: 'center', color: '#dc2626' }}>{p.total_ng || 0}</td>
                    <td style={{ textAlign: 'center', color: '#16a34a' }}>{p.total_ok || 0}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600, color: y == null ? '#94a3b8' : y >= 95 ? '#16a34a' : y >= 80 ? '#d97706' : '#dc2626' }}>{y == null ? '—' : `${y.toFixed(0)}%`}</td>
                    <td style={{ textAlign: 'center' }}>{ck(p.done)}</td>
                    {/* ── รายละเอียด ── */}
                    <td style={{ textAlign: 'center' }}>{p.wk ?? '—'}</td>
                    <td>{p.work_order || '—'}</td>
                    <td style={{ textAlign: 'center' }}>{ck(p.chk_man)}</td><td style={{ textAlign: 'center' }}>{ck(p.chk_mac)}</td><td style={{ textAlign: 'center' }}>{ck(p.chk_med)}</td><td style={{ textAlign: 'center' }}>{ck(p.chk_mat)}</td>
                    <td style={{ textAlign: 'center' }}>{ck(p.pd_pcba)}</td><td style={{ textAlign: 'center' }}>{ck(p.pd_bbas)}</td><td style={{ textAlign: 'center' }}>{ck(p.pd_test)}</td><td style={{ textAlign: 'center' }}>{ck(p.pd_rmaprep)}</td>
                    <td>{p.qa_test_rate || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(p.pd_start_date)}</td><td style={{ whiteSpace: 'nowrap' }}>{fmtDate(p.pd_finish_date)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(p.qa_finish_date)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(p.store_received)}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{p.matl_coming || '—'}</td>
                    <td>{p.pd_pic || '—'}</td>
                    <td style={{ textAlign: 'center' }}>{p.team_member || '—'}</td>
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

      {/* คู่มือขั้นตอน — ล่างสุด */}
      <FlowGuide />

      {adding && <ProjectFormModal initial={null} onClose={() => setAdding(false)} />}
      {edit && <ProjectFormModal initial={edit} onClose={() => setEdit(null)} />}
    </section>
  );
}
