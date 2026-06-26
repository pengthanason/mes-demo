import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePpProjects, usePpDelete, PP_STATUS, PP_STATUS_LABEL, ppYield, type PpProject, type PpFilters } from '../lib/ppApi';
import { useIsViewer } from '../lib/useMockStore';
import { showToast } from '../lib/toast';
import { Paginator } from '../components/Paginator';
import { FactoryOverview } from '../components/FactoryOverview';
import { FlowGuide } from '../components/FlowGuide';
import { SYNTECH_LOGO_PNG_BASE64 } from '../assets/syntechLogo';
import {
  STATUS_STYLE, StatusBadge, exportXlsx, StatCard, BarRow, ChartCard, Donut, ProjectFormModal,
  XLSX_COLUMNS, buildHeaderRows, type PpCol, type HeaderCell,
} from '../components/ppParts';

// หัวคอลัมน์: สีพิเศษ (Expected/Revised/DONE/SYN) + จัดกึ่งกลาง
const hdrStyle = (h: HeaderCell): React.CSSProperties => ({
  textAlign: 'center',
  ...(h.headerColor ? { background: `#${h.headerColor}`, color: (h.headerColor === '00B050' || h.headerColor === '4472C4') ? '#fff' : undefined } : {}),
});

const CHECK_KEYS = new Set(['chk_man', 'chk_mac', 'chk_med', 'chk_mat', 'pd_pcba', 'pd_bbas', 'pd_test', 'pd_rma', 'pd_prep', 'done']);
const ckEl = (b: boolean) => b ? <span style={{ color: '#16a34a', fontWeight: 700 }}>✓</span> : <span style={{ color: '#cbd5e1' }}>·</span>;

// เรนเดอร์ 1 เซลล์ตาราง Dashboard ตามนิยามคอลัมน์ Excel (ลำดับ/หัว = แหล่งเดียวกับ Excel)
function renderCell(c: PpCol, p: PpProject, y: number | null) {
  if (c.key === 'status') return <td key={c.key}><StatusBadge status={p.status} /></td>;
  if (CHECK_KEYS.has(c.key)) return <td key={c.key} style={{ textAlign: 'center' }}>{ckEl(!!(p as any)[c.key])}</td>;
  if (c.key === 'yield') return <td key={c.key} style={{ textAlign: 'center', fontWeight: 600, color: y == null ? '#94a3b8' : y >= 95 ? '#16a34a' : y >= 80 ? '#d97706' : '#dc2626' }}>{y == null ? '—' : `${y.toFixed(2)}%`}</td>;
  if (c.key === 'total_ng') return <td key={c.key} style={{ textAlign: 'center', color: '#dc2626' }}>{p.total_ng || 0}</td>;
  if (c.key === 'total_ok') return <td key={c.key} style={{ textAlign: 'center', color: '#16a34a' }}>{p.total_ok || 0}</td>;
  if (c.key === 'product_pn') return <td key={c.key} style={{ fontWeight: 600 }}>{p.product_pn || '—'}</td>;
  const v = c.value(p);
  return <td key={c.key} style={c.center ? { textAlign: 'center', whiteSpace: 'nowrap' } : { color: c.key === 'remark' || c.key === 'matl_coming' ? 'var(--text-muted)' : undefined }}>{v || '—'}</td>;
}

/* ── พิมพ์เป็น PDF — โครงเดียวกับ Excel (XLSX_COLUMNS + หัวซ้อน 2 ชั้น) + โลโก้/สี SYNTECH ── */
function printPdf(rows: PpProject[]) {
  const esc = (v: any) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const hStyle = (c?: string) => c ? ` style="background:#${c}${c === '00B050' || c === '4472C4' ? ';color:#fff' : ''}"` : '';
  const { groupRow, subRow } = buildHeaderRows(XLSX_COLUMNS);
  const hr1 = groupRow.map(h => `<th colspan="${h.colSpan}" rowspan="${h.rowSpan}"${hStyle(h.headerColor)}>${esc(h.label)}</th>`).join('');
  const hr2 = subRow.map(h => `<th${hStyle(h.headerColor)}>${esc(h.label)}</th>`).join('');
  const trs = rows.map(p => {
    const st = STATUS_STYLE[p.status] ?? STATUS_STYLE.ON_PROCESS;
    const tds = XLSX_COLUMNS.map(c => {
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
      <thead><tr>${hr1}</tr><tr>${hr2}</tr></thead>
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

// เลื่อนหน้าจอแบบ custom (easeOutCubic) — คุม duration เองให้ค่อย ๆ เลื่อน ไม่พึ่ง behavior:'smooth'
function smoothScrollTo(targetY: number, duration: number) {
  const startY = window.scrollY;
  const dist = targetY - startY;
  if (Math.abs(dist) < 2) return;
  let start: number | null = null;
  const step = (now: number) => {
    if (start === null) start = now;
    const p = Math.min(1, (now - start) / duration);
    const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
    window.scrollTo(0, startY + dist * e);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function DashboardPage() {
  const isViewer = useIsViewer();
  const [filters, setFilters] = useState<PpFilters>({});
  const { data: rows = [], isLoading } = usePpProjects(filters);        // ตาราง — ตามตัวกรอง
  const { data: allRows = [] } = usePpProjects({});                     // KPI การ์ด + กราฟ — ภาพรวมทั้งหมด (ไม่ขึ้นกับตัวกรอง)
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

  const customers = useMemo(() => [...new Set(allRows.map(r => r.customer).filter(Boolean))], [allRows]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE));
  const paged = rows.slice((page - 1) * PAGE, page * PAGE);
  const setF = (k: keyof PpFilters, v: string) => { setFilters(p => ({ ...p, [k]: v || undefined })); setPage(1); };
  const hasFilter = Object.values(filters).some(Boolean);

  // กดการ์ด → ตั้งตัวกรองสถานะ + ค่อยๆ เลื่อนหน้าจอลงมาให้เห็นกราฟ+ตารางที่ถูกกรอง
  const chartsRef = useRef<HTMLDivElement>(null);
  const selectStatus = (v: string) => {
    setF('status', v);
    // รอ 1 เฟรมให้ DOM อัปเดตก่อน แล้วค่อย ๆ เลื่อน (custom smooth — กัน behavior:'smooth' วาป/ไม่ทำงาน)
    requestAnimationFrame(() => {
      const el = chartsRef.current;
      if (!el) return;
      const headerOffset = 72; // topbar 60px + เผื่อระยะ
      const target = Math.max(0, el.getBoundingClientRect().top + window.scrollY - headerOffset);
      smoothScrollTo(target, 700);
    });
  };

  // การ์ด KPI — คิดจาก allRows (ภาพรวมทั้งหมด) เสมอ เพื่อให้ตัวเลขไม่หายตอนกดกรอง
  const agg = useMemo(() => {
    const by = (s: string) => allRows.filter(r => r.status === s).length;
    const ys = allRows.map(ppYield).filter((v): v is number => v != null);
    const avgYield = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : null;
    return { total: allRows.length, done: by('DONE'), onProc: by('ON_PROCESS'), late: by('LATE'), matl: by('MATL_COMING'), avgYield };
  }, [allRows]);

  // กราฟ — คิดจาก rows (ตามตัวกรองที่เลือก) เพื่อให้กราฟตรงกับสิ่งที่กรองในตาราง
  const chart = useMemo(() => {
    const by = (s: string) => rows.filter(r => r.status === s).length;
    const totalOk = rows.reduce((s, r) => s + (r.total_ok || 0), 0);
    const totalNg = rows.reduce((s, r) => s + (r.total_ng || 0), 0);
    const byStatus = PP_STATUS.map(s => ({ label: PP_STATUS_LABEL[s], value: by(s), color: STATUS_STYLE[s].text }));
    const cm: Record<string, number> = {};
    rows.forEach(r => { const c = r.customer || '(ไม่ระบุ)'; cm[c] = (cm[c] || 0) + 1; });
    const byCustomer = Object.entries(cm).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
    return { totalOk, totalNg, byStatus, byCustomer };
  }, [rows]);

  function handleDelete(p: PpProject) {
    if (!confirm(`ลบโปรเจกต์ "${p.product_pn || p.model}"?\nลบแล้วกู้ไม่ได้`)) return;
    del.mutate(p.id, { onSuccess: () => showToast('ลบแล้ว', 'info'), onError: (e: any) => showToast(e.message, 'error') });
  }

  const maxCust = Math.max(1, ...chart.byCustomer.map(x => x.value));
  const { groupRow, subRow } = buildHeaderRows(XLSX_COLUMNS);
  const colCount = XLSX_COLUMNS.length + (isViewer ? 0 : 1);

  return (
    <section className="stack-lg">
      {/* แถบหัว Dashboard แบรนด์ SYNTECH — โลโก้ + เขียว + ข้อมูลสด */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, background: 'linear-gradient(90deg, var(--brand), var(--brand-dark))', color: '#fff', padding: '14px 20px', borderRadius: 12, boxShadow: '0 4px 14px rgba(46,125,79,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ background: '#fff', borderRadius: 8, padding: '6px 12px', display: 'inline-flex', alignItems: 'center' }}>
            <img src={`data:image/png;base64,${SYNTECH_LOGO_PNG_BASE64}`} alt="SYNTECH" style={{ height: 26, display: 'block' }} />
          </span>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.3px' }}>Production Dashboard</h1>
        </div>
        <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.92)', display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          <span style={{ width: 9, height: 9, borderRadius: 99, background: '#86efac', display: 'inline-block', boxShadow: '0 0 0 3px rgba(134,239,172,0.3)' }} />
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
              style={{ background: 'var(--brand)', borderColor: 'var(--brand)', color: '#fff', fontWeight: 600 }}>+ เพิ่มโปรเจกต์</button>
          )}
        </div>

        {/* KPI — กดเพื่อกรองสถานะ (เลื่อนหน้าจอลงมาให้เห็นกราฟ+ตารางที่กรอง) */}
        <div className="dash-grid-3" style={{ marginTop: '1.5rem' }}>
          <KpiCard icon="📦" label="ทั้งหมด" value={agg.total} accent="#2e7d4f" onClick={() => selectStatus('')} active={!filters.status} />
          <KpiCard icon="✅" label="Done" value={agg.done} accent="#16a34a" onClick={() => selectStatus('DONE')} active={filters.status === 'DONE'} />
          <KpiCard icon="⚙️" label="On process" value={agg.onProc} accent="#2563eb" onClick={() => selectStatus('ON_PROCESS')} active={filters.status === 'ON_PROCESS'} />
          <KpiCard icon="⏰" label="Late" value={agg.late} accent="#dc2626" onClick={() => selectStatus('LATE')} active={filters.status === 'LATE'} />
          <KpiCard icon="📥" label="Mat'l coming" value={agg.matl} accent="#d97706" onClick={() => selectStatus('MATL_COMING')} active={filters.status === 'MATL_COMING'} />
          <StatCard icon="🎯" label="Yield เฉลี่ย" value={agg.avgYield == null ? '—' : `${agg.avgYield.toFixed(1)}%`} accent="#b58100" />
        </div>
      </div>

      {/* กราฟ — ตามตัวกรองที่เลือก (ref ไว้เลื่อนหน้าจอมาตรงนี้ตอนกดการ์ด) */}
      <div className="dash-grid-3" ref={chartsRef} style={{ scrollMarginTop: 'calc(var(--topbar-h) + 12px)' }}>
        <ChartCard title="สัดส่วนงานตามสถานะ">
          <Donut data={chart.byStatus} />
        </ChartCard>
        <ChartCard title="จำนวนงานตามลูกค้า (Top 8)">
          {chart.byCustomer.length ? chart.byCustomer.map(c => <BarRow key={c.label} label={c.label} value={c.value} max={maxCust} color="#2e7d4f" />) : <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>—</div>}
        </ChartCard>
        <ChartCard title="ผลผลิตรวม (OK vs NG)">
          <BarRow label="Total OK" value={chart.totalOk} max={Math.max(1, chart.totalOk + chart.totalNg)} color="#16a34a" />
          <BarRow label="Total NG" value={chart.totalNg} max={Math.max(1, chart.totalOk + chart.totalNg)} color="#dc2626" />
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
                {groupRow.map((h, i) => <th key={i} colSpan={h.colSpan} rowSpan={h.rowSpan} style={hdrStyle(h)}>{h.label}</th>)}
                {!isViewer && <th rowSpan={2} style={{ textAlign: 'center' }}>จัดการ</th>}
              </tr>
              <tr>
                {subRow.map((h, i) => <th key={i} style={hdrStyle(h)}>{h.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={colCount} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>กำลังโหลด...</td></tr>
              ) : paged.length === 0 ? (
                <tr><td colSpan={colCount} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>{hasFilter ? 'ไม่พบรายการตามตัวกรอง — กด “ล้าง filter” เพื่อดูทั้งหมด' : 'ยังไม่มีข้อมูล — กด “+ เพิ่มโปรเจกต์” เพื่อเริ่ม'}</td></tr>
              ) : paged.map(p => {
                const y = ppYield(p);
                return (
                  <tr key={p.id} style={p.status === 'LATE' ? { background: '#fef2f2', boxShadow: 'inset 3px 0 0 #dc2626' } : undefined}>
                    {XLSX_COLUMNS.map(c => renderCell(c, p, y))}
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
