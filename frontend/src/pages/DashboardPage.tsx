import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { usePpProjects, usePpDelete, usePpUpdate, PP_STATUS, PP_STATUS_LABEL, ppYield, type PpProject, type PpFilters } from '../lib/ppApi';
import { useIsViewer } from '../lib/useMockStore';
import { showToast } from '../lib/toast';
import { confirmDialog } from '../lib/confirm';
import { Paginator } from '../components/Paginator';
import { FactoryOverview } from '../components/FactoryOverview';
import { TableState } from '../components/DataStates';
import { SYNTECH_LOGO_PNG_BASE64 } from '../assets/syntechLogo';
import {
  STATUS_STYLE, StatusBadge, statusView, exportXlsx, exportGanttXlsx, StatCard, BarRow, ChartCard, Donut, GanttChart, ProjectFormModal,
  XLSX_COLUMNS, DASH_COLUMNS, PROCESS_STEPS, PROCESS_KEYS, PROC_STATUS, PROC_STATUS_LABEL, buildHeaderRows, type PpCol, type HeaderCell,
} from '../components/ppParts';

// หัวคอลัมน์: สีพิเศษ (Expected/Actual shipping/Owner) + จัดกึ่งกลาง · WO No. ไม่ให้ตกบรรทัด
const hdrStyle = (h: HeaderCell): React.CSSProperties => ({
  textAlign: 'center',
  ...(h.label === 'CAP / DAY' ? { whiteSpace: 'nowrap', minWidth: 90 } : {}),
  ...(h.headerColor ? { background: `#${h.headerColor}`, color: (h.headerColor === '00B050' || h.headerColor === '4472C4') ? '#fff' : undefined } : {}),
});

// เซลล์ว่าง — ขีด "—" จัดกึ่งกลาง (สีจาง)
const DASH_STYLE: React.CSSProperties = { textAlign: 'center', color: '#cbd5e1' };
// ช่องที่ "เสร็จแล้ว/มีข้อมูล" → พื้นเขียว (PD Done, QA Finish)
const DONE_KEYS = new Set(['pd_finish', 'qa_finish']);
const GREEN_CELL: React.CSSProperties = { background: '#dcfce7', color: '#166534', fontWeight: 600 };
// วนสถานะตอนคลิกช่อง Process: ว่าง → รอ (Waiting) → On process → Done → Delay → (วนกลับ)
const PROC_CYCLE = ['', 'WAIT', 'ON_PROCESS', 'DONE', 'DELAY'];

// เรนเดอร์ 1 เซลล์ตาราง Dashboard ตามนิยามคอลัมน์ (ลำดับ/หัว = แหล่งเดียวกับ Excel)
function renderCell(c: PpCol, p: PpProject, y: number | null, onOpen?: () => void, onToggle?: (key: string) => void) {
  // Status (คอลัมน์แรก) — ชื่อสถานะสีล้วน (ไม่มีกรอบ) · คลิกในตารางเพื่อวนสี/สถานะ
  if (c.key === 'status') { const sv = statusView(p); const s = STATUS_STYLE[sv.colorKey] ?? STATUS_STYLE.ON_PROCESS; return (
    <td key={c.key} onClick={onToggle ? () => onToggle('status') : undefined} title={onToggle ? 'คลิกเพื่อเปลี่ยนสีของสถานะ (ชื่อสถานะคงเดิม)' : undefined}
      style={{ textAlign: 'center', cursor: onToggle ? 'pointer' : undefined, background: s.bg, color: s.text, fontWeight: 700, whiteSpace: 'nowrap', userSelect: 'none' }}>
      {sv.label}
    </td>
  ); }
  if (c.key === 'qa_status') return <td key={c.key} style={{ textAlign: 'center' }}>{p.qa_status ? <StatusBadge status={p.qa_status} /> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>;
  if (c.key === 'date_record') {
    const [d, ww] = c.value(p).split('\n');   // value = "DD/MM/YYYY\n(WWxx)" — วันที่บรรทัดบน / (WW) บรรทัดล่าง
    if (!d) return <td key={c.key} style={DASH_STYLE}>—</td>;
    return (
      <td key={c.key} style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
        <div>{d}</div>
        {ww && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>{ww}</div>}
      </td>
    );
  }
  // Process — ช่องสีล้วนตามสถานะ · คลิกวนสี (ว่าง=ขาวโล่ง → On process → Done → Delay → Cancel → ว่าง)
  if (PROCESS_KEYS.has(c.key)) {
    const v = (p as any)[c.key] as string;
    const stl = v ? STATUS_STYLE[v] : null;
    const idx = PROCESS_STEPS.findIndex(s => s.key === c.key);
    const filled = PROCESS_STEPS.map((s, i) => ((p as any)[s.key] ? i : -1)).filter(i => i >= 0);   // index ของ step ที่มีข้อมูล
    const firstIdx = filled.length ? filled[0] : -1;             // process แรกที่มีข้อมูล
    const lastIdx = filled.length ? filled[filled.length - 1] : -1;   // process สุดท้ายที่มีข้อมูล
    const showLine = firstIdx >= 0 && idx >= firstIdx && idx <= lastIdx;   // วาดเส้นเฉพาะช่วงแรก→สุดท้ายที่มีข้อมูล
    const lastNote = (Array.isArray(p.process_log) ? p.process_log : []).filter(e => e.step === c.key).slice(-1)[0]?.note;
    return (
      <td key={c.key} onClick={onToggle ? () => onToggle(c.key) : undefined}
        title={lastNote || ''}
        style={{ padding: 0, minWidth: 44, borderLeft: 'none', borderRight: 'none', cursor: onToggle ? 'pointer' : undefined, userSelect: 'none' }}>
        <div style={{ position: 'relative', height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {showLine && <div style={{ position: 'absolute', left: idx === firstIdx ? '50%' : 0, right: idx === lastIdx ? '50%' : 0, top: '50%', height: 3, background: '#cbd5e1', transform: 'translateY(-50%)' }} />}
          {stl && <div style={{ position: 'relative', width: 17, height: 17, borderRadius: '50%', background: stl.bg, border: `2px solid ${stl.border}`, zIndex: 1, boxShadow: '0 0 0 2px #fff' }} />}
          {lastNote && <span title={lastNote} style={{ position: 'absolute', top: -2, left: '50%', transform: 'translateX(-50%)', color: '#dc2626', fontWeight: 900, fontSize: '0.95rem', lineHeight: 1, zIndex: 2, pointerEvents: 'none' }}>*</span>}
        </div>
      </td>
    );
  }
  if (c.key === 'remark') return <td key={c.key} style={{ minWidth: 280, color: 'var(--text-muted)', whiteSpace: 'pre-wrap', textAlign: 'center' }}>{p.remark || <span style={{ color: '#cbd5e1' }}>—</span>}</td>;
  if (c.key === 'model') return <td key={c.key} style={{ minWidth: 200, textAlign: 'center' }}>{p.model || <span style={{ color: '#cbd5e1' }}>—</span>}</td>;
  if (c.key === 'yield') return <td key={c.key} style={{ textAlign: 'center', fontWeight: 600, color: y == null ? '#94a3b8' : y >= 95 ? '#16a34a' : y >= 80 ? '#d97706' : '#dc2626' }}>{y == null ? '—' : `${y.toFixed(2)}%`}</td>;
  if (c.key === 'total_ng') return <td key={c.key} style={{ textAlign: 'center', color: '#dc2626' }}>{p.total_ng || 0}</td>;
  if (c.key === 'total_ok') return <td key={c.key} style={{ textAlign: 'center', color: '#16a34a' }}>{p.total_ok || 0}</td>;
  if (c.key === 'product_pn') return (
    <td key={c.key} style={{ minWidth: 150, textAlign: 'center' }}>
      {p.product_pn
        ? <button type="button" onClick={onOpen} title="ดูรายละเอียดสินค้า"
            style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontWeight: 600, color: '#2563eb', cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 2 }}>
            {p.product_pn}
          </button>
        : <span style={{ color: '#cbd5e1' }}>—</span>}
    </td>
  );
  const v = c.value(p);
  if (!v) return <td key={c.key} style={DASH_STYLE}>—</td>;
  const base: React.CSSProperties = { textAlign: 'center', ...(c.center ? { whiteSpace: 'nowrap' } : {}) };
  return <td key={c.key} style={DONE_KEYS.has(c.key) ? { ...base, ...GREEN_CELL } : base}>{v}</td>;
}

/* ── Popup รายละเอียดสินค้า — คลิก Product P/N ในตาราง → รูป (placeholder) + ข้อมูลทั้งหมดของรายการ ── */
function ProductDetailModal({ p, onClose }: { p: PpProject; onClose: () => void }) {
  const y = ppYield(p);
  const fmtD = (v: string | null | undefined) => { if (!v) return '—'; const d = new Date(v); return isNaN(+d) ? String(v) : d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }); };
  const val = (v: any) => (v === null || v === undefined || v === '' ? '—' : v);
  const groups: { title: string; items: [string, React.ReactNode][] }[] = [
    { title: '📋 ข้อมูลงาน', items: [
      ['Customer', val(p.customer)], ['Qty', p.qty ? p.qty.toLocaleString() : '—'], ['Week (WK)', val(p.wk)], ['วันที่บันทึก', fmtD(p.date_record)],
      ['WO', val(p.work_order)], ['Owner', val(p.syn_requestor)],
    ] },
    { title: '👤 ผู้รับผิดชอบ', items: [
      ['PD PIC', val(p.pd_pic)], ['PIC Responsible', val(p.pic_responsible)], ['CAP / วัน', p.target_per_day || '—'],
    ] },
    { title: '📅 กำหนดการ', items: [
      ['PD Start', fmtD(p.pd_start_date)], ['PD Finish', fmtD(p.pd_finish_date)], ['Expected', fmtD(p.expected_date)], ['Actual shipping', fmtD(p.revised_date)],
      ['CAP / วัน', p.target_per_day || '—'], ['Store Received', fmtD(p.store_received)], ['QA Finish', fmtD(p.qa_finish_date)], ['QA Test Rate', val(p.qa_test_rate)],
      ['QA Status', p.qa_status ? <StatusBadge status={p.qa_status} /> : '—'],
    ] },
    { title: '📊 ผลผลิต', items: [
      ['Produce', (p.produce || 0).toLocaleString()], ['Balance', ((p.qty || 0) - (p.produce || 0)).toLocaleString()],
      ['Total FG', <span style={{ color: '#16a34a', fontWeight: 700 }}>{p.total_ok || 0}</span>],
      ['Total NG', <span style={{ color: '#dc2626', fontWeight: 700 }}>{p.total_ng || 0}</span>],
      ['Yield', y == null ? '—' : <span style={{ fontWeight: 700, color: y >= 95 ? '#16a34a' : y >= 80 ? '#d97706' : '#dc2626' }}>{y.toFixed(2)}%</span>],
    ] },
  ];
  const sectionTitle: React.CSSProperties = { fontSize: '0.8rem', fontWeight: 700, color: '#475569', margin: '16px 0 8px' };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 'min(100%, 680px)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', wordBreak: 'break-word' }}>{p.product_pn || '—'}</div>
            <div style={{ fontSize: '0.9rem', color: '#64748b', marginTop: 2 }}>{[p.model, p.customer].filter(Boolean).join(' · ') || '—'}</div>
          </div>
          <button type="button" aria-label="ปิด" className="btn secondary" style={{ padding: '4px 12px', flexShrink: 0 }} onClick={onClose}>✕</button>
        </div>
        <div style={{ marginTop: 10 }}><StatusBadge status={statusView(p).colorKey} label={statusView(p).label} /></div>
        {/* รูปสินค้า (placeholder — ของจริงจะแนบภายหลัง) */}
        <div style={{ marginTop: 14, height: 180, borderRadius: 10, border: '2px dashed #cbd5e1', background: 'linear-gradient(135deg,#f8fafc,#eef2f7)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: '#94a3b8' }}>
          <span style={{ fontSize: 40, lineHeight: 1 }}>🖼️</span>
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>ยังไม่มีรูปสินค้า</span>
          <span style={{ fontSize: '0.75rem' }}>รูปจริงของโปรดักต์จะถูกแนบเมื่อใช้งานจริง</span>
        </div>
        {groups.map(g => (
          <div key={g.title}>
            <div style={sectionTitle}>{g.title}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px 16px' }}>
              {g.items.map(([label, value], i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</span>
                  <span style={{ fontSize: '0.9rem', color: '#1e293b', fontWeight: 500, wordBreak: 'break-word' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div style={sectionTitle}>🔧 Process (สถานะแต่ละขั้น)</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {PROCESS_STEPS.map(s => { const v = (p as any)[s.key] as string; const stl = v ? STATUS_STYLE[v] : null; return (
            <span key={s.key as string} style={{ padding: '3px 11px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 600, border: `1px solid ${stl ? stl.border : '#e5e9f0'}`, background: stl ? stl.bg : '#f8fafc', color: stl ? stl.text : '#94a3b8' }}>{s.label}{v ? `: ${PP_STATUS_LABEL[v] ?? v}` : ''}</span>
          ); })}
        </div>
        {p.special_request && (<><div style={sectionTitle}>⭐ Special request</div><div style={{ fontSize: '0.9rem', color: '#475569', whiteSpace: 'pre-wrap' }}>{p.special_request}</div></>)}
        {p.remark && (<><div style={sectionTitle}>📝 หมายเหตุ</div><div style={{ fontSize: '0.9rem', color: '#475569', whiteSpace: 'pre-wrap' }}>{p.remark}</div></>)}
        <div style={{ marginTop: 18, paddingTop: 10, borderTop: '1px solid #eef2f7', fontSize: '0.72rem', color: '#94a3b8', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {p.created_at && <span>สร้าง: {fmtD(p.created_at)}</span>}
          {p.updated_at && <span>แก้ไขล่าสุด: {fmtD(p.updated_at)}</span>}
        </div>
      </div>
    </div>
  );
}

/* ── พิมพ์เป็น PDF — โครงเดียวกับ Excel (XLSX_COLUMNS + หัวซ้อน 2 ชั้น) + โลโก้/สี SYNTECH ── */
function printPdf(rows: PpProject[], filename?: string) {
  const esc = (v: any) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const docTitle = (filename || 'Production Plan').replace(/\.pdf$/i, '');   // ชื่อที่ขึ้นเป็น default ตอน Save as PDF
  const hStyle = (c?: string) => c ? ` style="background:#${c}${c === '00B050' || c === '4472C4' ? ';color:#fff' : ''}"` : '';
  const { groupRow, subRow } = buildHeaderRows(XLSX_COLUMNS);
  const hr1 = groupRow.map(h => `<th colspan="${h.colSpan}" rowspan="${h.rowSpan}"${hStyle(h.headerColor)}>${esc(h.label)}</th>`).join('');
  const hr2 = subRow.map(h => `<th${hStyle(h.headerColor)}>${esc(h.label)}</th>`).join('');
  const trs = rows.map(p => {
    const rowSt = STATUS_STYLE[statusView(p).colorKey] ?? STATUS_STYLE.ON_PROCESS;
    const qaSt = STATUS_STYLE[p.qa_status] ?? STATUS_STYLE.ON_PROCESS;
    const tds = XLSX_COLUMNS.map(c => {
      const val = esc(c.value(p));
      if (c.key === 'status') return `<td style="background:${rowSt.bg};color:${rowSt.text};font-weight:700;text-align:center">${val}</td>`;
      if (c.key === 'date_record') return `<td class="c">${val.replace(/\n/g, '<br>')}</td>`;
      if (c.key === 'qa_status') return p.qa_status ? `<td style="background:${qaSt.bg};color:${qaSt.text};font-weight:700;text-align:center">${val}</td>` : `<td class="c">—</td>`;
      if (PROCESS_KEYS.has(c.key)) { const pv = (p as any)[c.key] as string; const s = pv ? STATUS_STYLE[pv] : null; return `<td class="c"${s ? ` style="background:${s.bg}"` : ''}>&nbsp;</td>`; }
      if ((c.key === 'pd_finish' || c.key === 'qa_finish') && val) return `<td style="background:#dcfce7;color:#166534;font-weight:600;text-align:center">${val}</td>`;
      return `<td${c.center ? ' class="c"' : ''}>${val}</td>`;
    }).join('');
    return `<tr>${tds}</tr>`;
  }).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=1120"><title>${esc(docTitle)}</title>
    <style>
      @page { size: A4 landscape; margin: 7mm; }
      body{font-family:'Segoe UI',Tahoma,sans-serif;color:#1e293b;margin:0}
      .hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
      .hd img{height:40px}
      .hd .t{font-size:22px;font-weight:800;color:#2e7d32}
      .hd .code{font-size:9px;color:#64748b}
      table{width:100%;border-collapse:collapse;font-size:7.5px;table-layout:fixed}
      th,td{border:1px solid #b0b8c4;padding:2px 3px;text-align:center;word-break:break-word;overflow:hidden}
      th{background:#d9ead3;color:#1b4332;text-align:center;font-size:7.5px}
      td.c{text-align:center}
    </style></head>
    <body>
    <div class="hd">
      <img src="data:image/png;base64,${SYNTECH_LOGO_PNG_BASE64}" alt="SYNTECH"/>
      <div class="t">Production Plan Internal</div>
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

// ป๊อปอัพตั้งชื่อไฟล์ก่อนดาวน์โหลด — เติมชื่อปัจจุบันให้ + คลุมไฮไลต์เฉพาะชื่อ (ไม่รวมนามสกุล) เหมือนตอน rename ไฟล์
function FileNamePromptModal({ title, defaultBase, ext, onConfirm, onCancel }: {
  title: string; defaultBase: string; ext: string; onConfirm: (name: string) => void; onCancel: () => void;
}) {
  const [name, setName] = useState(`${defaultBase}.${ext}`);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    const dot = el.value.lastIndexOf('.');                 // คลุมเฉพาะส่วนชื่อ ไม่รวม ".ext"
    el.setSelectionRange(0, dot > 0 ? dot : el.value.length);
  }, []);
  const confirm = () => {
    let v = name.trim();
    if (!v) return;
    if (!v.toLowerCase().endsWith(`.${ext}`)) v = `${v.replace(/\.+$/, '')}.${ext}`;   // กันลืมนามสกุล → เติมให้
    onConfirm(v);
  };
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 'min(100%, 440px)' }}>
        <h2 className="panel__title" style={{ marginBottom: '0.3rem' }}>{title}</h2>
        <p className="panel__subtitle" style={{ marginBottom: '1rem' }}>ตั้งชื่อไฟล์ แล้วกด “ตกลง” เพื่อดาวน์โหลด</p>
        <label className="field"><span>ชื่อไฟล์</span>
          <input ref={inputRef} value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirm(); } else if (e.key === 'Escape') onCancel(); }} />
        </label>
        <div className="modal-actions" style={{ marginTop: '1.2rem' }}>
          <button type="button" className="btn secondary" onClick={onCancel}>ยกเลิก</button>
          <button type="button" className="btn" onClick={confirm}>ตกลง</button>
        </div>
      </div>
    </div>
  );
}

/* ── Popup บันทึก process 1 step (เลือกสถานะ + วันที่) → เก็บลง process_log เพื่อวาด Gantt หลายสี ── */
function ProcessEventPopup({ p, stepKey, onClose, onSave }: { p: PpProject; stepKey: string; onClose: () => void; onSave: (status: string, date: string, note: string) => void }) {
  const step = PROCESS_STEPS.find(s => (s.key as string) === stepKey);
  const [status, setStatus] = useState<string>((p as any)[stepKey] || '');
  // วันที่ default = ต่อจาก event ล่าสุดใน log → ถ้าไม่มีใช้ PD Start → ถ้าไม่มีใช้วันนี้ (จะได้ไม่กองที่วันนี้หมด)
  const lastDate = Array.isArray(p.process_log) && p.process_log.length ? p.process_log[p.process_log.length - 1].date : '';
  const [date, setDate] = useState(lastDate || (p.pd_start_date ? String(p.pd_start_date).slice(0, 10) : '') || new Date().toISOString().slice(0, 10));
  // remark เริ่มต้น = remark ล่าสุดของ step นี้ (จะได้เห็น/แก้ค่าปัจจุบันได้)
  const lastEv = (Array.isArray(p.process_log) ? p.process_log : []).filter(e => e.step === stepKey).slice(-1)[0];
  const [note, setNote] = useState(lastEv?.note || '');
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 'min(100%, 380px)' }}>
        <h2 className="panel__title" style={{ marginBottom: '0.3rem' }}>Process: {step?.label ?? stepKey}</h2>
        <p className="panel__subtitle" style={{ marginBottom: '1rem' }}>เลือกสถานะ + วันที่ที่เกิดขึ้น (บันทึกลงประวัติเพื่อวาด Gantt)</p>
        <label className="field"><span>สถานะ</span>
          <select value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">— ว่าง —</option>
            {PROC_STATUS.map(s => <option key={s} value={s}>{PROC_STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <label className="field" style={{ marginTop: 10 }}><span>วันที่</span>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </label>
        <label className="field" style={{ marginTop: 10 }}><span>Remark</span>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} />
        </label>
        <div className="modal-actions" style={{ marginTop: '1.2rem' }}>
          <button type="button" className="btn secondary" onClick={onClose}>ยกเลิก</button>
          <button type="button" className="btn" onClick={() => onSave(status, date, note)}>บันทึก</button>
        </div>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const isViewer = useIsViewer();
  const [filters, setFilters] = useState<PpFilters>({});
  const { data: rows = [], isLoading } = usePpProjects(filters);        // ตาราง — ตามตัวกรอง
  const { data: allRows = [] } = usePpProjects({});                     // KPI การ์ด + กราฟ — ภาพรวมทั้งหมด (ไม่ขึ้นกับตัวกรอง)
  const del = usePpDelete();
  const ppUpdate = usePpUpdate();
  // คลิกช่อง Status/Process ในตาราง → เปลี่ยนสี + บันทึกลง backend (my-api) · optimistic ให้เปลี่ยนทันที
  const [procEdit, setProcEdit] = useState<{ p: PpProject; key: string } | null>(null);   // popup บันทึก process 1 step
  const toggleCheck = (p: PpProject, key: string) => {
    const change: any = {};
    if (key === 'status') {        // Status — เปลี่ยน "สี" เท่านั้น (ชื่อสถานะคงเดิม) วน Done→On process→Delay→Cancel
      const cur = p.status_color || p.status || 'DONE';
      change.status_color = PP_STATUS[(PP_STATUS.indexOf(cur as any) + 1) % PP_STATUS.length];
    } else if (PROCESS_KEYS.has(key)) {   // Process — วนสี (ว่าง→On process→Done→Delay→Cancel→ว่าง)
      const cur = (p as any)[key] || '';
      change[key] = PROC_CYCLE[(PROC_CYCLE.indexOf(cur) + 1) % PROC_CYCLE.length];
    } else {
      change[key] = !(p as any)[key];
    }
    const merged = { ...p, ...change };
    queryClient.setQueriesData({ queryKey: ['pp-projects'] }, (old: any) => Array.isArray(old) ? old.map((r: any) => r.id === p.id ? merged : r) : old);
    ppUpdate.mutate(merged, { onError: (e: any) => { showToast(e?.message || 'อัปเดตไม่สำเร็จ', 'error'); void queryClient.invalidateQueries({ queryKey: ['pp-projects'] }); } });
  };
  // คลิกช่อง Process → เปิด popup เลือกสถานะ+วันที่ · คลิกช่อง Status → วนสี (toggleCheck)
  const onCellClick = (p: PpProject, key: string) => {
    if (PROCESS_KEYS.has(key)) setProcEdit({ p, key });
    else toggleCheck(p, key);
  };
  // บันทึก process 1 step: ตั้งค่าสถานะปัจจุบัน + เพิ่ม event (วันที่) ลง process_log → PUT
  const saveProc = (p: PpProject, key: string, status: string, date: string, note: string) => {
    const log = Array.isArray(p.process_log) ? [...p.process_log] : [];
    log.push({ date, step: key, status, ...(note.trim() ? { note: note.trim() } : {}) });
    const merged = { ...p, [key]: status, process_log: log };
    queryClient.setQueriesData({ queryKey: ['pp-projects'] }, (old: any) => Array.isArray(old) ? old.map((r: any) => r.id === p.id ? merged : r) : old);
    ppUpdate.mutate(merged, { onError: (e: any) => { showToast(e?.message || 'บันทึกไม่สำเร็จ', 'error'); void queryClient.invalidateQueries({ queryKey: ['pp-projects'] }); } });
    setProcEdit(null);
  };
  const queryClient = useQueryClient();
  const [updatedAt, setUpdatedAt] = useState(() => new Date());
  // รีเฟรชข้อมูลทั้ง dashboard ทุก 10 วินาที + อัปเดตเวลา
  useEffect(() => {
    const t = setInterval(() => { void queryClient.invalidateQueries(); setUpdatedAt(new Date()); }, 10000);
    return () => clearInterval(t);
  }, [queryClient]);
  const [edit, setEdit] = useState<PpProject | null>(null);
  const [detail, setDetail] = useState<PpProject | null>(null);   // ป๊อปอัพรายละเอียดสินค้า (คลิก Product P/N)
  const [saveAs, setSaveAs] = useState<'xlsx' | 'pdf' | null>(null);   // เปิดป๊อปอัพตั้งชื่อไฟล์ก่อนโหลด
  const [page, setPage] = useState(1);
  const PAGE = 10;

  // เปิดรายละเอียดสินค้าอัตโนมัติเมื่อมากับ ?pp=<id> (ลิงก์จากหน้า Activities)
  const [params, setParams] = useSearchParams();
  const ppParam = params.get('pp');
  useEffect(() => {
    if (!ppParam) return;
    const proj = allRows.find(r => String(r.id) === ppParam);
    if (proj) { setDetail(proj); const n = new URLSearchParams(params); n.delete('pp'); setParams(n, { replace: true }); }
  }, [ppParam, allRows]);   // eslint-disable-line react-hooks/exhaustive-deps

  const customers = useMemo(() => [...new Set(allRows.map(r => r.customer).filter(Boolean))], [allRows]);
  // เรียงตามวันที่สร้าง (created_at) — ใหม่สุดขึ้นก่อน
  const sortedRows = useMemo(() => [...rows].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))), [rows]);
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE));
  const paged = sortedRows.slice((page - 1) * PAGE, page * PAGE);
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
    return { total: allRows.length, done: by('DONE'), onProc: by('ON_PROCESS'), delay: by('DELAY'), cancel: by('CANCEL'), avgYield };
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

  async function handleDelete(p: PpProject) {
    if (!(await confirmDialog(`ลบโปรเจกต์ "${p.product_pn || p.model}"?\nลบแล้วกู้ไม่ได้`, { title: 'ลบโปรเจกต์' }))) return;
    del.mutate(p.id, { onSuccess: () => { showToast('ลบแล้ว', 'info'); setPage(1); }, onError: (e: any) => showToast(e.message, 'error') });
  }

  const maxCust = Math.max(1, ...chart.byCustomer.map(x => x.value));
  const { groupRow, subRow } = buildHeaderRows(DASH_COLUMNS);   // ตาราง Dashboard ตัด STATUS pipeline (excelOnly) ออก
  const colCount = DASH_COLUMNS.length + 1 + (isViewer ? 0 : 1);   // +1 = คอลัมน์ลำดับ (#)

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

      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 className="panel__title">📋 Production Plan</h1>
            <p className="panel__subtitle">ภาพรวมและตรวจสอบงานผลิต — ข้อมูลจาก Add Project</p>
          </div>
        </div>

        {/* KPI — กดเพื่อกรองสถานะ (เลื่อนหน้าจอลงมาให้เห็นกราฟ+ตารางที่กรอง) */}
        <div className="dash-grid-3" style={{ marginTop: '1.5rem' }}>
          <KpiCard icon="📦" label="ทั้งหมด" value={agg.total} accent="#2e7d4f" onClick={() => selectStatus('')} active={!filters.status} />
          <KpiCard icon="✅" label="Done" value={agg.done} accent="#16a34a" onClick={() => selectStatus('DONE')} active={filters.status === 'DONE'} />
          <KpiCard icon="⚙️" label="On process" value={agg.onProc} accent="#2563eb" onClick={() => selectStatus('ON_PROCESS')} active={filters.status === 'ON_PROCESS'} />
          <KpiCard icon="⏰" label="Delay" value={agg.delay} accent="#ea580c" onClick={() => selectStatus('DELAY')} active={filters.status === 'DELAY'} />
          <KpiCard icon="🚫" label="Cancel" value={agg.cancel} accent="#64748b" onClick={() => selectStatus('CANCEL')} active={filters.status === 'CANCEL'} />
          <StatCard icon="🎯" label="Yield Good เฉลี่ย" value={agg.avgYield == null ? '—' : `${agg.avgYield.toFixed(1)}%`} accent="#b58100" />
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
        <div className="dash-grid-3">   {/* filter แถวละ 3 เท่าๆ กัน (6 ช่อง = 2 แถวสมส่วน ซ้าย-กลาง-ขวา) */}
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
          <label className="field"><span>WO</span><input value={filters.work_order ?? ''} onChange={e => setF('work_order', e.target.value)} placeholder="ค้นหา WO..." /></label>
          <label className="field"><span>Model</span><input value={filters.model ?? ''} onChange={e => setF('model', e.target.value)} placeholder="ค้นหา..." /></label>
          <label className="field"><span>ตั้งแต่วันที่</span><input type="date" value={filters.date_from ?? ''} onChange={e => setF('date_from', e.target.value)} /></label>
          <label className="field"><span>ถึงวันที่</span><input type="date" value={filters.date_to ?? ''} onChange={e => setF('date_to', e.target.value)} /></label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', margin: '12px 0 0.75rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{rows.length} โปรเจกต์</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {hasFilter && <button type="button" className="btn secondary" style={{ fontSize: '0.82rem' }} onClick={() => { setFilters({}); setPage(1); }}>ล้าง filter</button>}
            <button type="button" className="btn secondary" title="ดาวน์โหลดเป็นไฟล์ Excel ตามฟอร์ม FM03 (โลโก้+สี)" style={{ fontSize: '0.82rem' }} disabled={rows.length === 0} onClick={() => setSaveAs('xlsx')}>⬇️ Export to Excel</button>
          </div>
        </div>

        <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 8 }}>
          <table className="table table--grid table--dense" style={{ minWidth: 1408, width: '100%' }}>
            <thead>
              <tr>
                <th rowSpan={2} style={{ textAlign: 'center' }}>#</th>
                {groupRow.map((h, i) => <th key={i} colSpan={h.colSpan} rowSpan={h.rowSpan} style={hdrStyle(h)}>{h.label}</th>)}
                {!isViewer && <th rowSpan={2} style={{ textAlign: 'center' }}>จัดการ</th>}
              </tr>
              <tr>
                {subRow.map((h, i) => <th key={i} style={hdrStyle(h)}>{h.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableState colSpan={colCount} state="loading" />
              ) : paged.length === 0 ? (
                <TableState colSpan={colCount} state="empty" emptyText={hasFilter ? 'ไม่พบรายการตามตัวกรอง — กด “ล้าง filter” เพื่อดูทั้งหมด' : 'ยังไม่มีข้อมูล — กด “+ เพิ่มโปรเจกต์” เพื่อเริ่ม'} />
              ) : paged.map((p, idx) => {
                const y = ppYield(p);
                const no = (page - 1) * PAGE + idx + 1;   // ลำดับต่อเนื่องข้ามหน้า
                return (
                  <tr key={p.id} style={p.status === 'DELAY' ? { background: '#fff7ed', boxShadow: 'inset 3px 0 0 #ea580c' } : undefined}>
                    <td style={{ textAlign: 'center', color: '#94a3b8', fontWeight: 700 }}>{no}</td>
                    {DASH_COLUMNS.map(c => renderCell(c, p, y, () => setDetail(p), isViewer ? undefined : (key) => onCellClick(p, key)))}
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

      {/* Gantt — ไทม์ไลน์การผลิตรายวัน (ใต้ตาราง Production Plan · ตามตัวกรองปัจจุบัน) */}
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: '1rem' }}>
          <div>
            <h1 className="panel__title">📊 Gantt Chart — Production Plan</h1>
          </div>
          {/* คำอธิบายสี (legend) + ปุ่ม export */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {PP_STATUS.map(s => (
              <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: STATUS_STYLE[s].bg, border: `1px solid ${STATUS_STYLE[s].border}` }} />
                {PP_STATUS_LABEL[s]}
              </span>
            ))}
            <button type="button" className="btn secondary" style={{ fontSize: '0.82rem' }} disabled={sortedRows.length === 0} onClick={() => exportGanttXlsx(sortedRows, `gantt-${new Date().toISOString().slice(0, 10)}.xlsx`)}>⬇️ Export Gantt</button>
          </div>
        </div>
        <GanttChart rows={sortedRows} />
      </div>

      {/* สรุปข้ามโมดูล — ใต้ Production Plan */}
      <FactoryOverview />

      {edit && <ProjectFormModal initial={edit} onClose={() => setEdit(null)} />}
      {detail && <ProductDetailModal p={detail} onClose={() => setDetail(null)} />}
      {procEdit && <ProcessEventPopup p={procEdit.p} stepKey={procEdit.key} onClose={() => setProcEdit(null)} onSave={(status, date, note) => saveProc(procEdit.p, procEdit.key, status, date, note)} />}
      {saveAs && (
        <FileNamePromptModal
          title={saveAs === 'xlsx' ? '⬇️ บันทึกเป็น Excel' : '🖨️ บันทึกเป็น PDF'}
          defaultBase={`production-plan-${new Date().toISOString().slice(0, 10)}`}
          ext={saveAs}
          onCancel={() => setSaveAs(null)}
          onConfirm={(name) => { if (saveAs === 'xlsx') void exportXlsx(sortedRows, name); else printPdf(sortedRows, name); setSaveAs(null); }}
        />
      )}
    </section>
  );
}
