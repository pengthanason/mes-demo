import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { usePpProjects, usePpDelete, usePpUpdate, PP_STATUS, PP_STATUS_LABEL, ppYield, type PpProject } from '../lib/ppApi';
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

// ความกว้างคอลัมน์แบบล็อกตายตัว (px) — ใช้กับ <colgroup> + table-layout:fixed
// กันปัญหา: filter แล้วข้อมูลสั้นลง → คอลัมน์หด → ตารางทั้งตารางขยับ (ตอนนี้ล็อกไว้ ยาวเกินให้ตัดเป็น ... แทน)
const colWidthPx = (c: PpCol): number => {
  if (c.key === 'pc_packing') return 80;               // PACKING — หัวยาว
  if (c.key === 'pc_incoming') return 80;              // IN COMING — หัวยาว
  if (PROCESS_KEYS.has(c.key)) return 66;              // ช่อง Process อื่น (SMT/THR/TEST/BBAS/PR-PO/WAIT MAT'L) — เนื้อในเป็นแค่วงกลมสถานะ
  if (c.key === 'status') return 110;
  if (c.key === 'date_record') return 92;
  if (c.key === 'remark') return 220;
  if (c.key === 'model') return 190;
  if (c.key === 'product_pn') return 150;
  if (c.key === 'qa_status') return 100;
  // คอลัมน์ที่ "หัวยาวกว่าเนื้อใน" — กว้างพอให้หัวไม่ล้นไปทับช่องข้างๆ
  if (c.key === 'qty') return 86;                      // QUANTITY
  if (c.key === 'produce') return 94;                  // PRODUCED
  if (c.key === 'balanced') return 82;                 // BALANCE
  if (c.key === 'qa_test_rate') return 104;            // SAMPLING%
  if (c.key === 'bom_rec') return 92;                  // Bom Rec (วันที่)
  if (c.key === 'pic_responsible') return 122;         // Responsible
  return Math.max(72, Math.round(c.w * 8));
};

// ช่อง filter บน panel แบบเดิม แต่คลิกแล้วเปิด dropdown เลือกได้หลายค่า + เสิร์ชได้ (แทน select/input เดี่ยวแบบเก่า)
// ใช้ createPortal ไปที่ document.body + position:fixed กันไม่ให้ dropdown โดนตัดโดย overflow-x:auto ของกล่องตาราง
function ColumnFilterField({
  label, options, labelFor, selected, onToggle, onClear, colKey, openKey, setOpenKey,
  expandKey, expandItems, expandSelected, onToggleExpandItem, onToggleExpandAll, expandAllChecked,
}: {
  label: string; options: string[]; labelFor?: (v: string) => string;
  selected: Set<string>; onToggle: (v: string) => void; onClear: () => void;
  colKey: string; openKey: string | null; setOpenKey: (k: string | null) => void;
  // ตัวเลือกที่ขยายเป็น checkbox ย่อยได้ (ใช้กับ "On process" → เลือก process step) — ไม่ใส่ก็ได้ ไม่บังคับ
  expandKey?: string; expandItems?: { key: string; label: string }[];
  expandSelected?: Set<string>; onToggleExpandItem?: (key: string) => void; onToggleExpandAll?: () => void;
  expandAllChecked?: boolean;   // "เลือกทั้งหมด" = เลือกตัวหลัก (On process) — สถานะติ๊กมาจากภายนอก
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState('');
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  // ตำแหน่ง submenu ที่ผายออกไปด้านข้าง (เหมือนคลิกขวาบน Windows) — null = ปิดอยู่
  const [submenuPos, setSubmenuPos] = useState<{ top: number; left: number } | null>(null);
  const isOpen = openKey === colKey;
  const active = selected.size > 0;

  useEffect(() => {
    if (!isOpen) return;
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    setQ('');
    setSubmenuPos(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node) || submenuRef.current?.contains(e.target as Node)) return;
      setOpenKey(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenKey(null); };
    const onScroll = () => setOpenKey(null);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [isOpen, setOpenKey]);

  const shown = q.trim() ? options.filter(o => (labelFor ? labelFor(o) : o).toLowerCase().includes(q.trim().toLowerCase())) : options;
  const summary = selected.size === 0 ? 'All' : selected.size === 1 ? (labelFor ? labelFor([...selected][0]) : [...selected][0]) : `${selected.size} selected`;
  const panelWidth = Math.max(230, pos.width);
  const SUBMENU_W = 200;
  // เปิด/ปิด submenu ที่แถวนี้ — ผายออกไปทางขวาของ panel เสมอ ยกเว้นล้นขอบจอค่อยพลิกไปทางซ้าย (เหมือนเมนูคลิกขวาของ Windows)
  const toggleSubmenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (submenuPos) { setSubmenuPos(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const overflowsRight = pos.left + panelWidth + SUBMENU_W + 4 > window.innerWidth;
    setSubmenuPos({ top: rect.top, left: overflowsRight ? pos.left - SUBMENU_W - 4 : pos.left + panelWidth + 4 });
  };

  return (
    // minWidth:0 → ให้ช่องนี้ยุบได้ต่ำกว่าความยาวข้อความ (กัน grid column โตตามชื่อยาว → ดันทุกช่องขยับ)
    <label className="field" style={{ minWidth: 0 }}>
      <span>{label}</span>
      <button type="button" ref={btnRef} onClick={() => setOpenKey(isOpen ? null : colKey)} className="form-input"
        style={{
          cursor: 'pointer', textAlign: 'left', color: active ? 'var(--text-body)' : '#94a3b8',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '2rem', width: '100%', minWidth: 0,
          boxSizing: 'border-box', outline: 'none', boxShadow: 'none', lineHeight: '1.5rem',   // ล็อก line-height คงที่ กันกล่องสูงไม่เท่าตอนสลับข้อความไทย↔อังกฤษ (placeholder "ทั้งหมด" ↔ ค่าที่เลือก)
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2364748b' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
          backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.7rem center', backgroundSize: '10px 6px',
        }}>
        {summary}
      </button>
      {isOpen && createPortal(
        <div ref={panelRef} style={{
          position: 'fixed', top: pos.top, left: pos.left, zIndex: 1000, width: Math.max(230, pos.width), maxHeight: 320,
          background: '#fff', border: '1px solid var(--border-color)', borderRadius: 8, boxShadow: '0 10px 28px rgba(15,23,42,0.18)',
          display: 'flex', flexDirection: 'column', fontWeight: 400, fontSize: '0.82rem', color: '#1e293b', textAlign: 'left',
        }}>
          <div style={{ padding: 8, borderBottom: '1px solid var(--border-color)' }}>
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search..." className="filter-search-input" style={{ width: '100%', boxSizing: 'border-box' }} />
          </div>
          <div style={{ overflowY: 'auto', padding: '4px 0' }}>
            {shown.length === 0 ? (
              <div style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>Not found</div>
            ) : shown.map(opt => {
              const canExpand = opt === expandKey && expandItems && expandItems.length > 0;
              return (
                <div key={opt} style={{ display: 'flex', alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px', cursor: 'pointer', flex: 1, minWidth: 0 }}>
                    <input type="checkbox" checked={selected.has(opt)} onChange={() => onToggle(opt)} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{labelFor ? labelFor(opt) : opt}</span>
                  </label>
                  {canExpand && (
                    <button type="button" onClick={toggleSubmenu} title="Select process steps"
                      style={{ all: 'unset', cursor: 'pointer', padding: '5px 12px', color: submenuPos ? '#2563eb' : '#94a3b8', fontSize: '0.7rem' }}>
                      ▶
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: 8, borderTop: '1px solid var(--border-color)' }}>
            <button type="button" className="btn secondary" style={{ fontSize: '0.75rem', padding: '3px 10px' }} disabled={!active} onClick={onClear}>Clear</button>
            <button type="button" className="btn" style={{ fontSize: '0.75rem', padding: '3px 10px' }} onClick={() => setOpenKey(null)}>Close</button>
          </div>
        </div>,
        document.body
      )}
      {isOpen && submenuPos && expandItems && createPortal(
        <div ref={submenuRef} style={{
          position: 'fixed', top: submenuPos.top, left: submenuPos.left, zIndex: 1001, width: SUBMENU_W, maxHeight: 260,
          background: '#fff', border: '1px solid var(--border-color)', borderRadius: 8, boxShadow: '0 10px 28px rgba(15,23,42,0.18)',
          overflowY: 'auto', padding: '4px 0', fontWeight: 400, fontSize: '0.82rem', color: '#1e293b', textAlign: 'left',
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px', cursor: 'pointer', fontWeight: 600, borderBottom: '1px solid var(--border-color)' }}>
            <input type="checkbox" checked={expandAllChecked ?? false} onChange={() => onToggleExpandAll?.()} />
            <span>Select all</span>
          </label>
          {expandItems.map(it => (
            <label key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px', cursor: 'pointer' }}>
              <input type="checkbox" checked={expandSelected?.has(it.key) ?? false} onChange={() => onToggleExpandItem?.(it.key)} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
            </label>
          ))}
        </div>,
        document.body
      )}
    </label>
  );
}

// เซลล์ว่าง — ขีด "—" จัดกึ่งกลาง (สีจาง)
const DASH_STYLE: React.CSSProperties = { textAlign: 'center', color: '#cbd5e1' };
// ช่องที่ "เสร็จแล้ว/มีข้อมูล" → พื้นเขียว (PD Done, QA Finish)
const DONE_KEYS = new Set(['pd_finish', 'qa_finish']);
const GREEN_CELL: React.CSSProperties = { background: '#dcfce7', color: '#166534', fontWeight: 600 };
// นับ/กรองแบบ "กลุ่มเดียวต่อแถว" (mutually exclusive): แถวที่ยังไม่ Done/Delay/Cancel = กำลังดำเนินการ (On process)
// ครอบคลุมทั้ง status = 'ON_PROCESS' และ status ที่เป็นชื่อ process step (เช่น Wait Mat'l / PR/PO / Packing ในข้อมูลจริง)
// → KPI ไม่นับซ้ำ + filter On process เจอแถวที่ค้างอยู่ที่ step ต่างๆ ครบ
const PP_TERMINAL = ['DONE', 'DELAY', 'CANCEL'];
const rowOnProcessOnly = (r: PpProject) => !PP_TERMINAL.includes(r.status);
// แถว "ดีเลย์" = status = DELAY หรือมี process step ใดก็ได้ที่ DELAY (แม้ภาพรวมยังเป็น On process) → พื้นหลังเหลืองส้มเตือน
const rowHasDelay = (r: PpProject) => r.status === 'DELAY' || PROCESS_STEPS.some(s => (r as any)[s.key as string] === 'DELAY');

// เรนเดอร์ 1 เซลล์ตาราง Dashboard ตามนิยามคอลัมน์ (ลำดับ/หัว = แหล่งเดียวกับ Excel)
function renderCell(c: PpCol, p: PpProject, y: number | null, onOpen?: () => void, onToggle?: (key: string, e?: React.MouseEvent<HTMLElement>) => void) {
  // Status (คอลัมน์แรก) — ชื่อสถานะสีล้วน (ไม่มีกรอบ) · คลิกในตารางเพื่อวนสี/สถานะ
  if (c.key === 'status') { const sv = statusView(p); const s = STATUS_STYLE[sv.colorKey] ?? STATUS_STYLE.ON_PROCESS; return (
    <td key={c.key} onClick={onToggle ? (e) => onToggle('status', e) : undefined} title={onToggle ? 'Click to change the status color (label stays the same)' : undefined}
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
  if (c.key === 'remark') return <td key={c.key} title={p.remark || undefined} style={{ color: 'var(--text-muted)', textAlign: 'center' }}>{p.remark || <span style={{ color: '#cbd5e1' }}>—</span>}</td>;
  if (c.key === 'model') return <td key={c.key} title={p.model || undefined} style={{ textAlign: 'center' }}>{p.model || <span style={{ color: '#cbd5e1' }}>—</span>}</td>;
  if (c.key === 'yield') return <td key={c.key} style={{ textAlign: 'center', fontWeight: 600, color: y == null ? '#94a3b8' : y >= 95 ? '#16a34a' : y >= 80 ? '#d97706' : '#dc2626' }}>{y == null ? '—' : `${y.toFixed(2)}%`}</td>;
  if (c.key === 'total_ng') return <td key={c.key} style={{ textAlign: 'center', color: '#dc2626' }}>{p.total_ng || 0}</td>;
  if (c.key === 'total_ok') return <td key={c.key} style={{ textAlign: 'center', color: '#16a34a' }}>{p.total_ok || 0}</td>;
  if (c.key === 'product_pn') return (
    <td key={c.key} style={{ minWidth: 150, textAlign: 'center' }}>
      {p.product_pn
        ? <button type="button" onClick={onOpen} title="View product details"
            style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontWeight: 600, color: '#2563eb', cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 2 }}>
            {p.product_pn}
          </button>
        : <span style={{ color: '#cbd5e1' }}>—</span>}
    </td>
  );
  const v = c.value(p);
  if (!v) return <td key={c.key} style={DASH_STYLE}>—</td>;
  const base: React.CSSProperties = { textAlign: 'center', ...(c.center ? { whiteSpace: 'nowrap' } : {}) };
  return <td key={c.key} title={v.replace(/\n/g, ' ')} style={DONE_KEYS.has(c.key) ? { ...base, ...GREEN_CELL } : base}>{v}</td>;
}

/* ── Popup รายละเอียดสินค้า — คลิก Product P/N ในตาราง → รูป (placeholder) + ข้อมูลทั้งหมดของรายการ ── */
function ProductDetailModal({ p, onClose }: { p: PpProject; onClose: () => void }) {
  const y = ppYield(p);
  const fmtD = (v: string | null | undefined) => { if (!v) return '—'; const d = new Date(v); return isNaN(+d) ? String(v) : d.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' }); };
  const val = (v: any) => (v === null || v === undefined || v === '' ? '—' : v);
  const groups: { title: string; items: [string, React.ReactNode][] }[] = [
    { title: '📋 Job Info', items: [
      ['Customer', val(p.customer)], ['Qty', p.qty ? p.qty.toLocaleString() : '—'], ['Week (WK)', val(p.wk)], ['Date record', fmtD(p.date_record)],
      ['WO', val(p.work_order)], ['Owner', val(p.syn_requestor)],
    ] },
    { title: '👤 Responsible', items: [
      ['PD PIC', val(p.pd_pic)], ['PIC Responsible', val(p.pic_responsible)], ['CAP / day', p.target_per_day || '—'],
    ] },
    { title: '📅 Schedule', items: [
      ['PD Start', fmtD(p.pd_start_date)], ['PD Finish', fmtD(p.pd_finish_date)], ['Expected', fmtD(p.expected_date)], ['Revised date', fmtD(p.revised_date)],
      ['CAP / day', p.target_per_day || '—'], ['Store Received', fmtD(p.store_received)], ['QA Finish', fmtD(p.qa_finish_date)], ['QA Test Rate', val(p.qa_test_rate)],
      ['QA Status', p.qa_status ? <StatusBadge status={p.qa_status} /> : '—'],
    ] },
    { title: '📊 Output', items: [
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
          <button type="button" aria-label="Close" className="btn secondary" style={{ padding: '4px 12px', flexShrink: 0 }} onClick={onClose}>✕</button>
        </div>
        <div style={{ marginTop: 10 }}><StatusBadge status={statusView(p).colorKey} label={statusView(p).label} /></div>
        {/* รูปสินค้า (placeholder — ของจริงจะแนบภายหลัง) */}
        <div style={{ marginTop: 14, height: 180, borderRadius: 10, border: '2px dashed #cbd5e1', background: 'linear-gradient(135deg,#f8fafc,#eef2f7)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: '#94a3b8' }}>
          <span style={{ fontSize: 40, lineHeight: 1 }}>🖼️</span>
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>No product image yet</span>
          <span style={{ fontSize: '0.75rem' }}>The actual product image will be attached later</span>
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
        <div style={sectionTitle}>🔧 Process (status per step)</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {PROCESS_STEPS.map(s => { const v = (p as any)[s.key] as string; const stl = v ? STATUS_STYLE[v] : null; return (
            <span key={s.key as string} style={{ padding: '3px 11px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 600, border: `1px solid ${stl ? stl.border : '#e5e9f0'}`, background: stl ? stl.bg : '#f8fafc', color: stl ? stl.text : '#94a3b8' }}>{s.label}{v ? `: ${PP_STATUS_LABEL[v] ?? v}` : ''}</span>
          ); })}
        </div>
        {p.special_request && (<><div style={sectionTitle}>⭐ Special request</div><div style={{ fontSize: '0.9rem', color: '#475569', whiteSpace: 'pre-wrap' }}>{p.special_request}</div></>)}
        {p.remark && (<><div style={sectionTitle}>📝 Remark</div><div style={{ fontSize: '0.9rem', color: '#475569', whiteSpace: 'pre-wrap' }}>{p.remark}</div></>)}
        <div style={{ marginTop: 18, paddingTop: 10, borderTop: '1px solid #eef2f7', fontSize: '0.72rem', color: '#94a3b8', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {p.created_at && <span>Created: {fmtD(p.created_at)}</span>}
          {p.updated_at && <span>Updated: {fmtD(p.updated_at)}</span>}
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
      <div class="code">FM03 Rev.01 Ref.EN-P-01<br/>${new Date().toLocaleDateString('en-GB')}</div>
    </div>
    <table>
      <thead><tr>${hr1}</tr><tr>${hr2}</tr></thead>
      <tbody>${trs}</tbody>
    </table>
    <script>window.onload=()=>{window.print()}</script></body></html>`;
  const w = window.open('', '_blank');
  if (!w) { showToast('Browser blocked the popup — allow it before printing', 'error'); return; }
  w.document.write(html); w.document.close();
}

/* การ์ด KPI ที่กดเพื่อกรองสถานะในตารางได้ */
function KpiCard({ icon, label, value, accent, onClick, active }: {
  icon: string; label: string; value: number | string; accent: string; onClick: () => void; active: boolean;
}) {
  return (
    <div onClick={onClick} title="Click to filter the table by this status"
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
        <p className="panel__subtitle" style={{ marginBottom: '1rem' }}>Name the file, then click “OK” to download</p>
        <label className="field"><span>File name</span>
          <input ref={inputRef} value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirm(); } else if (e.key === 'Escape') onCancel(); }} />
        </label>
        <div className="modal-actions" style={{ marginTop: '1.2rem' }}>
          <button type="button" className="btn secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn" onClick={confirm}>OK</button>
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
        <p className="panel__subtitle" style={{ marginBottom: '1rem' }}>Select a status + the date it happened (saved to history for the Gantt)</p>
        <label className="field"><span>Status</span>
          <select value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">— None —</option>
            {PROC_STATUS.map(s => <option key={s} value={s}>{PROC_STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <label className="field" style={{ marginTop: 10 }}><span>Date</span>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </label>
        <label className="field" style={{ marginTop: 10 }}><span>Remark</span>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} />
        </label>
        <div className="modal-actions" style={{ marginTop: '1.2rem' }}>
          <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn" onClick={() => onSave(status, date, note)}>Save</button>
        </div>
      </div>
    </div>
  );
}

// สีที่เลือกได้ในช่อง Status — 4 สถานะหลัก + สีอิสระอีกชุดใหญ่ (ไม่ผูกความหมาย แค่เป็นตัวเลือกสี)
const STATUS_COLOR_OPTIONS = [
  ...PP_STATUS, 'PROCESS', 'RED', 'ORANGE', 'AMBER', 'YELLOW', 'LIME', 'GREEN', 'EMERALD',
  'CYAN', 'BLUE', 'INDIGO', 'VIOLET', 'PURPLE', 'FUCHSIA', 'PINK', 'ROSE', 'BROWN',
] as const;
const STATUS_COLOR_LABEL: Record<string, string> = {
  ...PP_STATUS_LABEL, PROCESS: 'Teal', RED: 'Red', ORANGE: 'Orange', AMBER: 'Amber', YELLOW: 'Yellow',
  LIME: 'Lime', GREEN: 'Green', EMERALD: 'Emerald', CYAN: 'Cyan', BLUE: 'Blue',
  INDIGO: 'Indigo', VIOLET: 'Violet', PURPLE: 'Purple', FUCHSIA: 'Fuchsia', PINK: 'Pink', ROSE: 'Rose', BROWN: 'Brown',
};

/* ── Palette เลือก "สี" ของช่อง Status — ไม่มี backdrop/กล่อง popup แค่ลอยขึ้นมาให้กด (เหมือน dropdown filter) ── */
function StatusColorPopup({ p, pos, onClose, onPick }: { p: PpProject; pos: { top: number; left: number }; onClose: () => void; onPick: (color: string) => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const current = p.status_color || p.status || 'DONE';

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (!panelRef.current?.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  return createPortal(
    <div ref={panelRef} style={{
      position: 'fixed', top: pos.top, left: pos.left, zIndex: 1000, width: 190,
      background: '#fff', border: '1px solid var(--border-color)', borderRadius: 10, boxShadow: '0 10px 28px rgba(15,23,42,0.18)',
      padding: 10, display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8,
    }}>
      {STATUS_COLOR_OPTIONS.map(key => {
        const s = STATUS_STYLE[key];
        const active = current === key;
        return (
          <button type="button" key={key} onClick={() => onPick(key)} title={STATUS_COLOR_LABEL[key] ?? key}
            style={{
              width: 24, height: 24, borderRadius: '50%', background: s.bg, cursor: 'pointer', padding: 0,
              border: active ? `3px solid ${s.border}` : '2px solid #fff',
              boxShadow: active ? `0 0 0 1px ${s.border}` : '0 0 0 1px var(--border-color)',
            }} />
        );
      })}
    </div>,
    document.body
  );
}

export function DashboardPage() {
  const isViewer = useIsViewer();
  const { data: allRows = [], isLoading } = usePpProjects({});          // แหล่งข้อมูลเดียว — กรองฝั่ง client ทั้งหมด (dropdown filter ที่หัวตาราง)
  const [colFilters, setColFilters] = useState<Record<string, Set<string>>>({});   // key: status/customer/work_order/model → ค่าที่เลือก (ว่าง = ไม่กรอง)
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [openFilterCol, setOpenFilterCol] = useState<string | null>(null);
  const toggleFilterValue = (col: string, v: string) => {
    setColFilters(prev => {
      const next = new Set(prev[col]);
      next.has(v) ? next.delete(v) : next.add(v);
      return { ...prev, [col]: next };
    });
    setPage(1);
  };
  const clearFilterCol = (col: string) => { setColFilters(prev => ({ ...prev, [col]: new Set() })); setPage(1); };
  const del = usePpDelete();
  const ppUpdate = usePpUpdate();
  // คลิกช่อง Status/Process ในตาราง → เปลี่ยนสี + บันทึกลง backend (my-api) · optimistic ให้เปลี่ยนทันที
  const [procEdit, setProcEdit] = useState<{ p: PpProject; key: string } | null>(null);   // popup บันทึก process 1 step
  const [colorPick, setColorPick] = useState<{ p: PpProject; top: number; left: number } | null>(null);   // palette เลือกสี Status
  const toggleCheck = (p: PpProject, key: string) => {
    const change: any = { [key]: !(p as any)[key] };
    const merged = { ...p, ...change };
    queryClient.setQueriesData({ queryKey: ['pp-projects'] }, (old: any) => Array.isArray(old) ? old.map((r: any) => r.id === p.id ? merged : r) : old);
    ppUpdate.mutate(merged, { onError: (e: any) => { showToast(e?.message || 'Update failed', 'error'); void queryClient.invalidateQueries({ queryKey: ['pp-projects'] }); } });
  };
  // บันทึกสี Status ที่เลือกจาก palette (ทับ status_color เท่านั้น ชื่อสถานะเดิมไม่เปลี่ยน)
  const pickStatusColor = (p: PpProject, color: string) => {
    const merged = { ...p, status_color: color };
    queryClient.setQueriesData({ queryKey: ['pp-projects'] }, (old: any) => Array.isArray(old) ? old.map((r: any) => r.id === p.id ? merged : r) : old);
    ppUpdate.mutate(merged, { onError: (e: any) => { showToast(e?.message || 'Update failed', 'error'); void queryClient.invalidateQueries({ queryKey: ['pp-projects'] }); } });
    setColorPick(null);
  };
  // คลิกช่อง Process → เปิด popup เลือกสถานะ+วันที่ · คลิกช่อง Status → เปิด palette สีลอยตรงจุดที่คลิก
  const onCellClick = (p: PpProject, key: string, e?: React.MouseEvent<HTMLElement>) => {
    if (PROCESS_KEYS.has(key)) setProcEdit({ p, key });
    else if (key === 'status') {
      const rect = e?.currentTarget.getBoundingClientRect();
      setColorPick({ p, top: rect ? rect.bottom + 4 : 100, left: rect ? rect.left : 100 });
    }
    else toggleCheck(p, key);
  };
  // บันทึก process 1 step: ตั้งค่าสถานะปัจจุบัน + เพิ่ม event (วันที่) ลง process_log → PUT
  const saveProc = (p: PpProject, key: string, status: string, date: string, note: string) => {
    const log = Array.isArray(p.process_log) ? [...p.process_log] : [];
    log.push({ date, step: key, status, ...(note.trim() ? { note: note.trim() } : {}) });
    const merged = { ...p, [key]: status, process_log: log };
    queryClient.setQueriesData({ queryKey: ['pp-projects'] }, (old: any) => Array.isArray(old) ? old.map((r: any) => r.id === p.id ? merged : r) : old);
    ppUpdate.mutate(merged, { onError: (e: any) => { showToast(e?.message || 'Save failed', 'error'); void queryClient.invalidateQueries({ queryKey: ['pp-projects'] }); } });
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
  const [ppTab, setPpTab] = useState<'internal' | 'external'>('internal');   // แท็บงานภายใน/ภายนอก (External ยังใช้ข้อมูลชุดเดียวกันไปก่อน)
  const PAGE = 20;

  // เปิดรายละเอียดสินค้าอัตโนมัติเมื่อมากับ ?pp=<id> (ลิงก์จากหน้า Activities)
  const [params, setParams] = useSearchParams();
  const ppParam = params.get('pp');
  useEffect(() => {
    if (!ppParam) return;
    const proj = allRows.find(r => String(r.id) === ppParam);
    if (proj) { setDetail(proj); const n = new URLSearchParams(params); n.delete('pp'); setParams(n, { replace: true }); }
  }, [ppParam, allRows]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ตัวเลือกที่มีอยู่จริงในข้อมูล — ใช้เติม dropdown filter ที่หัวตาราง (Status ใช้ PP_STATUS คงที่แทน)
  const customers = useMemo(() => [...new Set(allRows.map(r => r.customer).filter(Boolean))], [allRows]);
  const workOrders = useMemo(() => [...new Set(allRows.map(r => r.work_order).filter(Boolean))], [allRows]);
  const models = useMemo(() => [...new Set(allRows.map(r => r.model).filter(Boolean))], [allRows]);

  // Filter ย่อยของ "On process" — ขยายเลือกได้ว่า process step ไหนบ้างที่กำลัง ON_PROCESS อยู่
  const [procStepFilter, setProcStepFilter] = useState<Set<string>>(new Set());
  const toggleProcStep = (key: string) => {
    setProcStepFilter(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
    setPage(1);
  };
  // "เลือกทั้งหมด" ในเมนู On process = เลือก On process (สถานะ) ตรงๆ + ล้างการเลือก step ย่อย
  const toggleProcStepAll = () => {
    setProcStepFilter(new Set());
    toggleFilterValue('status', 'ON_PROCESS');   // toggle สถานะ On process (setPage(1) อยู่ในนี้แล้ว)
  };

  // กรองฝั่ง client จาก allRows ตาม colFilters (เลือกได้หลายค่า) + ช่วงวันที่ + process step ย่อย
  const rows = useMemo(() => allRows.filter(r => {
    // สถานะ: "On process" = แถวที่มี step ไหนก็ได้กำลัง ON_PROCESS (หรือ status บนสุด = ON_PROCESS) — ไม่ใช่แค่ status ตรงตัว
    // สถานะอื่น (Done/Delay/Cancel) เทียบ status ตรงตัวเหมือนเดิม · หลายสถานะ = OR กัน
    if (colFilters.status?.size) {
      const matchStatus = [...colFilters.status].some(st => st === 'ON_PROCESS' ? rowOnProcessOnly(r) : r.status === st);
      if (!matchStatus) return false;
    }
    if (colFilters.customer?.size && !colFilters.customer.has(r.customer)) return false;
    if (colFilters.work_order?.size && !colFilters.work_order.has(r.work_order)) return false;
    if (colFilters.model?.size && !colFilters.model.has(r.model)) return false;
    if (procStepFilter.size && ![...procStepFilter].some(k => (r as any)[k] === 'ON_PROCESS')) return false;
    if (dateFrom && (!r.date_record || r.date_record < dateFrom)) return false;
    if (dateTo && (!r.date_record || r.date_record > dateTo)) return false;
    return true;
  }), [allRows, colFilters, procStepFilter, dateFrom, dateTo]);
  // เรียงตามวันที่สร้าง (created_at) — ใหม่สุดขึ้นก่อน
  const sortedRows = useMemo(() => [...rows].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))), [rows]);
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE));
  const paged = sortedRows.slice((page - 1) * PAGE, page * PAGE);
  const hasFilter = Object.values(colFilters).some(s => s && s.size > 0) || procStepFilter.size > 0 || !!dateFrom || !!dateTo;
  const clearAllFilters = () => { setColFilters({}); setProcStepFilter(new Set()); setDateFrom(''); setDateTo(''); setPage(1); };

  // กดการ์ด → ตั้งตัวกรองสถานะ + ค่อยๆ เลื่อนหน้าจอลงมาให้เห็นตารางที่ถูกกรอง (กราฟย้ายไปใต้ตารางแล้ว จึงเลื่อนมาที่ตารางแทน)
  const chartsRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const isStatusOnly = (v: string) => colFilters.status?.size === 1 && colFilters.status.has(v);
  const selectStatus = (v: string) => {
    setColFilters(prev => ({ ...prev, status: v ? new Set([v]) : new Set() }));
    setPage(1);
    // รอ 1 เฟรมให้ DOM อัปเดตก่อน แล้วค่อย ๆ เลื่อน (custom smooth — กัน behavior:'smooth' วาป/ไม่ทำงาน)
    requestAnimationFrame(() => {
      const el = tableRef.current;
      if (!el) return;
      const headerOffset = 72; // topbar 60px + เผื่อระยะ
      const target = Math.max(0, el.getBoundingClientRect().top + window.scrollY - headerOffset);
      smoothScrollTo(target, 700);
    });
  };

  // การ์ด KPI — คิดจาก allRows (ภาพรวมทั้งหมด) เสมอ เพื่อให้ตัวเลขไม่หายตอนกดกรอง · On process = step ใดก็ได้ ON_PROCESS
  const agg = useMemo(() => {
    const by = (s: string) => s === 'ON_PROCESS' ? allRows.filter(rowOnProcessOnly).length : allRows.filter(r => r.status === s).length;
    const ys = allRows.map(ppYield).filter((v): v is number => v != null);
    const avgYield = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : null;
    return { total: allRows.length, done: by('DONE'), onProc: by('ON_PROCESS'), delay: by('DELAY'), cancel: by('CANCEL'), avgYield };
  }, [allRows]);

  // กราฟ — คิดจาก rows (ตามตัวกรองที่เลือก) เพื่อให้กราฟตรงกับสิ่งที่กรองในตาราง · On process = step ใดก็ได้ ON_PROCESS
  const chart = useMemo(() => {
    const by = (s: string) => s === 'ON_PROCESS' ? rows.filter(rowOnProcessOnly).length : rows.filter(r => r.status === s).length;
    const totalOk = rows.reduce((s, r) => s + (r.total_ok || 0), 0);
    const totalNg = rows.reduce((s, r) => s + (r.total_ng || 0), 0);
    const byStatus = PP_STATUS.map(s => ({ label: PP_STATUS_LABEL[s], value: by(s), color: STATUS_STYLE[s].text }));
    const cm: Record<string, number> = {};
    rows.forEach(r => { const c = r.customer || '(N/A)'; cm[c] = (cm[c] || 0) + 1; });
    const byCustomer = Object.entries(cm).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
    return { totalOk, totalNg, byStatus, byCustomer };
  }, [rows]);

  async function handleDelete(p: PpProject) {
    if (!(await confirmDialog(`Delete project "${p.product_pn || p.model}"?\nThis cannot be undone`, { title: 'Delete project' }))) return;
    del.mutate(p.id, { onSuccess: () => { showToast('Deleted', 'info'); setPage(1); }, onError: (e: any) => showToast(e.message, 'error') });
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
          Updated {updatedAt.toLocaleTimeString('en-GB')}
        </span>
      </div>

      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 className="panel__title">📋 Production Plan</h1>
          </div>
        </div>

        {/* KPI — กดเพื่อกรองสถานะ (เลื่อนหน้าจอลงมาให้เห็นกราฟ+ตารางที่กรอง) */}
        <div className="dash-grid-3" style={{ marginTop: '0.75rem' }}>
          <KpiCard icon="📦" label="All" value={agg.total} accent="#2e7d4f" onClick={() => selectStatus('')} active={!colFilters.status?.size} />
          <KpiCard icon="✅" label="Done" value={agg.done} accent="#16a34a" onClick={() => selectStatus('DONE')} active={isStatusOnly('DONE')} />
          <KpiCard icon="⚙️" label="On process" value={agg.onProc} accent="#2563eb" onClick={() => selectStatus('ON_PROCESS')} active={isStatusOnly('ON_PROCESS')} />
          <KpiCard icon="⏰" label="Delay" value={agg.delay} accent="#ea580c" onClick={() => selectStatus('DELAY')} active={isStatusOnly('DELAY')} />
          <KpiCard icon="🚫" label="Cancel" value={agg.cancel} accent="#64748b" onClick={() => selectStatus('CANCEL')} active={isStatusOnly('CANCEL')} />
          <StatCard icon="🎯" label="Avg Yield Good" value={agg.avgYield == null ? '—' : `${agg.avgYield.toFixed(1)}%`} accent="#b58100" />
        </div>
      </div>

      {/* ตาราง + filter + export */}
      <div className="panel" ref={tableRef} style={{ scrollMarginTop: 'calc(var(--topbar-h) + 12px)' }}>
        {/* Production Plan + แท็บ Internal / External (segmented control) — ตอนนี้ External ใช้ข้อมูลชุดเดียวกับ Internal ไปก่อน */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>Production Plan</h2>
          <div style={{ display: 'inline-flex', gap: 4, background: '#eef2f7', borderRadius: 9, padding: 4 }}>
            {(['internal', 'external'] as const).map(t => (
              <button key={t} type="button" onClick={() => { setPpTab(t); setPage(1); }}
                style={{
                  padding: '6px 18px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', fontFamily: 'inherit',
                  background: ppTab === t ? '#fff' : 'transparent', color: ppTab === t ? 'var(--brand)' : 'var(--text-muted)',
                  boxShadow: ppTab === t ? '0 1px 3px rgba(15,23,42,0.14)' : 'none', transition: 'all 0.12s',
                }}>
                {t === 'internal' ? 'Internal' : 'External'}
              </button>
            ))}
          </div>
        </div>

        <div className="dash-grid-3">   {/* filter แถวละ 3 เท่าๆ กัน (6 ช่อง = 2 แถวสมส่วน) — Status/Customer/WO/Model เป็น dropdown เลือกหลายค่า+เสิร์ชได้ */}
          <ColumnFilterField label="Status" options={[...PP_STATUS]} labelFor={v => PP_STATUS_LABEL[v] ?? v}
            selected={colFilters.status ?? new Set()} onToggle={v => toggleFilterValue('status', v)}
            onClear={() => { clearFilterCol('status'); setProcStepFilter(new Set()); }}
            colKey="status" openKey={openFilterCol} setOpenKey={setOpenFilterCol}
            expandKey="ON_PROCESS" expandItems={PROCESS_STEPS.map(s => ({ key: s.key as string, label: s.label }))}
            expandSelected={procStepFilter} onToggleExpandItem={toggleProcStep} onToggleExpandAll={toggleProcStepAll}
            expandAllChecked={colFilters.status?.has('ON_PROCESS') ?? false} />
          <ColumnFilterField label="Customer" options={customers}
            selected={colFilters.customer ?? new Set()} onToggle={v => toggleFilterValue('customer', v)} onClear={() => clearFilterCol('customer')}
            colKey="customer" openKey={openFilterCol} setOpenKey={setOpenFilterCol} />
          <ColumnFilterField label="WO" options={workOrders}
            selected={colFilters.work_order ?? new Set()} onToggle={v => toggleFilterValue('work_order', v)} onClear={() => clearFilterCol('work_order')}
            colKey="work_order" openKey={openFilterCol} setOpenKey={setOpenFilterCol} />
          <ColumnFilterField label="Model" options={models}
            selected={colFilters.model ?? new Set()} onToggle={v => toggleFilterValue('model', v)} onClear={() => clearFilterCol('model')}
            colKey="model" openKey={openFilterCol} setOpenKey={setOpenFilterCol} />
          <label className="field"><span>From date</span><input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} /></label>
          <label className="field"><span>To date</span><input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} /></label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', margin: '12px 0 0.75rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{rows.length} projects</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {hasFilter && <button type="button" className="btn secondary" style={{ fontSize: '0.82rem' }} onClick={clearAllFilters}>Clear filter</button>}
            <button type="button" className="btn secondary" title="Download as an Excel file in the FM03 format (logo + colors)" style={{ fontSize: '0.82rem' }} disabled={rows.length === 0} onClick={() => setSaveAs('xlsx')}>⬇️ Export to Excel</button>
          </div>
        </div>

        {/* แถบ legend สี — บอกความหมายแต่ละสีในตาราง (สีจริงจาก STATUS_STYLE) */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', margin: '0 0 0.75rem', fontSize: '0.8rem', color: 'var(--text-body)' }}>
          {[
            { label: 'Done', s: STATUS_STYLE.DONE },
            { label: 'On process', s: STATUS_STYLE.ON_PROCESS },
            { label: 'Delay', s: STATUS_STYLE.DELAY },
            { label: 'Waiting', s: STATUS_STYLE.WAIT },
          ].map(x => (
            <span key={x.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 22, height: 14, borderRadius: 3, background: x.s.bg, border: `1px solid ${x.s.border}`, display: 'inline-block' }} />
              {x.label}
            </span>
          ))}
        </div>

        <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 8 }}>
          <table className="table table--grid table--dense" style={{ minWidth: 1408, width: '100%', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 44 }} />
              {DASH_COLUMNS.map(c => <col key={c.key} style={{ width: colWidthPx(c) }} />)}
              {!isViewer && <col style={{ width: 110 }} />}
            </colgroup>
            <thead>
              <tr>
                <th rowSpan={2} style={{ textAlign: 'center' }}>#</th>
                {groupRow.map((h, i) => <th key={i} colSpan={h.colSpan} rowSpan={h.rowSpan} style={hdrStyle(h)}>{h.label}</th>)}
                {!isViewer && <th rowSpan={2} style={{ textAlign: 'center' }}>Actions</th>}
              </tr>
              <tr>
                {subRow.map((h, i) => <th key={i} style={hdrStyle(h)}>{h.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableState colSpan={colCount} state="loading" />
              ) : paged.length === 0 ? (
                <TableState colSpan={colCount} state="empty" emptyText={hasFilter ? 'No matching records — click “Clear filter” to show all' : 'No data yet — click “+ Add Project” to start'} />
              ) : paged.map((p, idx) => {
                const y = ppYield(p);
                const no = (page - 1) * PAGE + idx + 1;   // ลำดับต่อเนื่องข้ามหน้า
                return (
                  <tr key={p.id} style={rowHasDelay(p) ? { background: '#fff7ed', boxShadow: 'inset 3px 0 0 #ea580c' } : undefined}>
                    <td style={{ textAlign: 'center', color: '#94a3b8', fontWeight: 700 }}>{no}</td>
                    {DASH_COLUMNS.map(c => renderCell(c, p, y, () => setDetail(p), isViewer ? undefined : (key, e) => onCellClick(p, key, e)))}
                    {!isViewer && (
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                          <button type="button" className="btn secondary" style={{ padding: '3px 10px', fontSize: '0.75rem' }} onClick={() => setEdit(p)}>Edit</button>
                          <button type="button" className="btn danger" style={{ padding: '3px 10px', fontSize: '0.75rem' }} onClick={() => handleDelete(p)}>Delete</button>
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

      {/* กราฟ — ตามตัวกรองที่เลือก (ย้ายมาอยู่ใต้ตารางตามที่ขอ · ref ไว้เลื่อนหน้าจอมาตรงนี้ตอนกดการ์ด KPI) */}
      <div className="dash-grid-3" ref={chartsRef} style={{ scrollMarginTop: 'calc(var(--topbar-h) + 12px)' }}>
        <ChartCard title="Status breakdown">
          <Donut data={chart.byStatus} />
        </ChartCard>
        <ChartCard title="Customer (Top 8)">
          {chart.byCustomer.length ? chart.byCustomer.map(c => <BarRow key={c.label} label={c.label} value={c.value} max={maxCust} color="#2e7d4f" />) : <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>—</div>}
        </ChartCard>
        <ChartCard title="Total output (OK vs NG)">
          <BarRow label="Total OK" value={chart.totalOk} max={Math.max(1, chart.totalOk + chart.totalNg)} color="#16a34a" />
          <BarRow label="Total NG" value={chart.totalNg} max={Math.max(1, chart.totalOk + chart.totalNg)} color="#dc2626" />
        </ChartCard>
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
      {colorPick && <StatusColorPopup p={colorPick.p} pos={colorPick} onClose={() => setColorPick(null)} onPick={color => pickStatusColor(colorPick.p, color)} />}
      {saveAs && (
        <FileNamePromptModal
          title={saveAs === 'xlsx' ? '⬇️ Save as Excel' : '🖨️ Save as PDF'}
          defaultBase={`production-plan-${new Date().toISOString().slice(0, 10)}`}
          ext={saveAs}
          onCancel={() => setSaveAs(null)}
          onConfirm={(name) => { if (saveAs === 'xlsx') void exportXlsx(sortedRows, name); else printPdf(sortedRows, name); setSaveAs(null); }}
        />
      )}
    </section>
  );
}
