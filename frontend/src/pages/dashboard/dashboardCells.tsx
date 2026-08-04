import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PpProject } from '../../lib/ppApi';
import {
  STATUS_STYLE, StatusBadge, statusView, PROCESS_STEPS, PROCESS_KEYS, PROC_STATUS_LABEL, type PpCol, type HeaderCell,
} from '../../components/ppParts';
import { DATE_INPUT_MIN, DATE_INPUT_MAX } from '../../lib/dateRange';

// #3: pd_pic อาจเก็บหลายคนในช่องเดียว ("Run,Ice,Nile") — แตกเป็นรายคน เพื่อฟิลเตอร์ "ตามคน"
export const splitPics = (v: any): string[] => String(v ?? '').split(/[,/;]/).map(s => s.trim()).filter(Boolean);

// หัวคอลัมน์: สีพิเศษ (Expected/Actual shipping/Owner) + จัดกึ่งกลาง · WO No. ไม่ให้ตกบรรทัด
export const hdrStyle = (h: HeaderCell): React.CSSProperties => ({
  textAlign: 'center',
  ...(h.label === 'CAP / DAY' ? { whiteSpace: 'nowrap', minWidth: 90 } : {}),
  ...(h.headerColor ? { background: `#${h.headerColor}`, color: (h.headerColor === '00B050' || h.headerColor === '4472C4') ? '#fff' : undefined } : {}),
});

// ความกว้างคอลัมน์แบบล็อกตายตัว (px) — ใช้กับ <colgroup> + table-layout:fixed
// กันปัญหา: filter แล้วข้อมูลสั้นลง → คอลัมน์หด → ตารางทั้งตารางขยับ (ตอนนี้ล็อกไว้ ยาวเกินให้ตัดเป็น ... แทน)
export const colWidthPx = (c: PpCol): number => {
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
export function ColumnFilterField({
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
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number; maxH: number }>({ left: 0, width: 0, maxH: 320 });
  // ตำแหน่ง submenu ที่ผายออกไปด้านข้าง (เหมือนคลิกขวาบน Windows) — null = ปิดอยู่
  const [submenuPos, setSubmenuPos] = useState<{ top: number; left: number } | null>(null);
  const isOpen = openKey === colKey;
  const active = selected.size > 0;

  // คลิกใกล้ขอบจอ (มือถือ/แท็บเล็ตจอแคบ) → กันไม่ให้ panel ล้นขอบขวา/ล่าง (เดิมยึด rect.bottom/rect.left ตรงๆ ไม่เช็คขอบจอเลย)
  useEffect(() => {
    if (!isOpen) return;
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      const width = Math.max(230, rect.width);
      const left = Math.min(rect.left, Math.max(8, window.innerWidth - width - 8));
      const below = window.innerHeight - rect.bottom - 8;
      const above = rect.top - 8;
      const openUp = below < 200 && above > below;
      const maxH = Math.max(150, Math.min(320, openUp ? above : below));
      setPos(openUp
        ? { bottom: window.innerHeight - rect.top + 4, left, width: rect.width, maxH }
        : { top: rect.bottom + 4, left, width: rect.width, maxH });
    }
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
          position: 'fixed', ...(pos.top != null ? { top: pos.top } : { bottom: pos.bottom }),
          left: pos.left, zIndex: 1000, width: Math.max(230, pos.width), maxHeight: pos.maxH,
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
export const rowOnProcessOnly = (r: PpProject) => !PP_TERMINAL.includes(r.status);
// แถว "ดีเลย์" = status = DELAY หรือมี process step ใดก็ได้ที่ DELAY (แม้ภาพรวมยังเป็น On process) → พื้นหลังเหลืองส้มเตือน
export const rowHasDelay = (r: PpProject) => r.status === 'DELAY' || PROCESS_STEPS.some(s => (r as any)[s.key as string] === 'DELAY');

// ── Inline quick-edit cells — คลิกแก้ในตารางเลย ไม่ต้องเปิด modal · save ทันทีตอน Enter/blur + ไฮไลต์เขียว ✓ ──
function InlineTextCell({ value, placeholder = '—', title = 'Click to quick-edit', onSave }: { value: string | null | undefined; placeholder?: string; title?: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [val, setVal] = useState('');
  const [ok, setOk] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);
  const start = () => { setVal(String(value ?? '')); setEditing(true); };
  const commit = () => {
    setEditing(false);
    const trimmed = val.trim();
    if (trimmed !== String(value ?? '').trim()) { onSave(trimmed); setOk(true); setTimeout(() => setOk(false), 1000); }
  };
  if (editing) return (
    <td style={{ padding: 2, textAlign: 'center' }}>
      <input ref={ref} type="text" value={val}
        onChange={e => setVal(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } else if (e.key === 'Escape') setEditing(false); }}
        style={{ width: '100%', boxSizing: 'border-box', textAlign: 'center', padding: '2px 4px', fontSize: '0.82rem', border: '1.5px solid var(--brand)', borderRadius: 4, outline: 'none', background: '#fff' }} />
    </td>
  );
  return (
    <td onClick={start}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      title={title}
      style={{
        textAlign: 'center', cursor: 'pointer',
        background: ok ? '#dcfce7' : hovering ? '#f1f5f9' : undefined,
        color: value ? undefined : '#cbd5e1',
        borderRadius: 4, transition: 'all 0.15s ease',
        userSelect: 'none',
      }}>
      <span>{value || placeholder}</span>
      {ok ? (
        <span style={{ color: '#16a34a', marginLeft: 3, fontWeight: 700 }}>✓</span>
      ) : (
        <span style={{ color: hovering ? 'var(--brand)' : '#cbd5e1', opacity: hovering ? 1 : 0.75, marginLeft: 4, fontSize: '0.7rem', transition: 'all 0.15s' }}>✎</span>
      )}
    </td>
  );
}

function InlineNumberCell({ value, color, title = 'Click to quick-edit', onSave }: { value: number; color?: string; title?: string; onSave: (n: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [val, setVal] = useState('');
  const [ok, setOk] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) { ref.current?.focus(); ref.current?.select(); } }, [editing]);
  const start = () => { setVal(String(value ?? 0)); setEditing(true); };
  const commit = () => {
    setEditing(false);
    const n = Math.max(0, Math.floor(Number(val)) || 0);
    if (n !== (value ?? 0)) { onSave(n); setOk(true); setTimeout(() => setOk(false), 1000); }
  };
  if (editing) return (
    <td style={{ padding: 2, textAlign: 'center' }}>
      <input ref={ref} type="number" min="0" value={val}
        onChange={e => setVal(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } else if (e.key === 'Escape') setEditing(false); }}
        style={{ width: '100%', boxSizing: 'border-box', textAlign: 'center', padding: '2px 4px', fontSize: '0.82rem', border: '1.5px solid var(--brand)', borderRadius: 4, outline: 'none', background: '#fff' }} />
    </td>
  );
  return (
    <td onClick={start}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      title={title}
      style={{
        textAlign: 'center', cursor: 'pointer', color,
        background: ok ? '#dcfce7' : hovering ? '#f1f5f9' : undefined,
        borderRadius: 4, transition: 'all 0.15s ease',
        userSelect: 'none',
      }}>
      <span>{(value ?? 0).toLocaleString()}</span>
      {ok ? (
        <span style={{ color: '#16a34a', marginLeft: 3, fontWeight: 700 }}>✓</span>
      ) : (
        <span style={{ color: hovering ? 'var(--brand)' : '#cbd5e1', opacity: hovering ? 1 : 0.75, marginLeft: 4, fontSize: '0.7rem', transition: 'all 0.15s' }}>✎</span>
      )}
    </td>
  );
}

// note = หมายเหตุวันที่ยังไม่ finalize (เช่น Delivery date) — โผล่เป็นดอกจัน (*) แดงมุมขวาบน เอาเมาส์ชี้ดูรายละเอียดได้
// (สไตล์เดียวกับดอกจัน note ของช่อง Process — ดู renderCell ด้านล่าง)
function InlineDateCell({ value, green, title = 'Click to quick-edit date', note, onSave }: { value: string | null | undefined; green?: boolean; title?: string; note?: string; onSave: (iso: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [ok, setOk] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const iso = value ? String(value).slice(0, 10) : '';
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);
  const display = iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '';
  if (editing) return (
    <td style={{ padding: 2, textAlign: 'center' }}>
      <input ref={ref} type="date" min={DATE_INPUT_MIN} max={DATE_INPUT_MAX} value={iso}
        onChange={e => { onSave(e.target.value); setEditing(false); setOk(true); setTimeout(() => setOk(false), 1000); }}
        onBlur={() => setEditing(false)}
        style={{ width: '100%', boxSizing: 'border-box', fontSize: '0.76rem', padding: '2px', border: '1.5px solid var(--brand)', borderRadius: 4, outline: 'none', background: '#fff' }} />
    </td>
  );
  return (
    <td onClick={() => setEditing(true)}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      title={title}
      style={{
        position: 'relative', textAlign: 'center', cursor: 'pointer', whiteSpace: 'nowrap',
        background: ok ? '#dcfce7' : hovering ? '#f1f5f9' : (green && iso ? '#dcfce7' : undefined),
        color: green && iso ? '#166534' : (iso ? undefined : '#cbd5e1'),
        fontWeight: green && iso ? 600 : undefined,
        borderRadius: 4, transition: 'all 0.15s ease',
        userSelect: 'none',
      }}>
      <span>{display || '—'}</span>
      {ok ? (
        <span style={{ color: '#16a34a', marginLeft: 3, fontWeight: 700 }}>✓</span>
      ) : (
        <span style={{ color: hovering ? 'var(--brand)' : '#cbd5e1', opacity: hovering ? 1 : 0.75, marginLeft: 4, fontSize: '0.7rem', transition: 'all 0.15s' }}>✎</span>
      )}
      {note && <span title={note} style={{ position: 'absolute', top: -2, right: 2, color: '#dc2626', fontWeight: 900, fontSize: '0.95rem', lineHeight: 1 }}>*</span>}
    </td>
  );
}

// เรนเดอร์ 1 เซลล์ตาราง Dashboard ตามนิยามคอลัมน์ (ลำดับ/หัว = แหล่งเดียวกับ Excel)
export function renderCell(c: PpCol, p: PpProject, y: number | null, onOpen?: () => void, onToggle?: (key: string, e?: React.MouseEvent<HTMLElement>) => void, onInline?: (key: string, value: number | string) => void) {
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
  // Inline quick-edit (เฉพาะโหมดแก้ไข = มี onInline) — ดึงหัวข้อคอลัมน์ (c.header) มาตั้งเป็น tooltip ตรงตามหัวตาราง 100%
  if (onInline && (c.key === 'produce' || c.key === 'total_ng' || c.key === 'total_ok' || c.key === 'target_per_day')) {
    const col = c.key === 'total_ng' ? '#dc2626' : c.key === 'total_ok' ? '#16a34a' : undefined;
    return <InlineNumberCell key={c.key} value={(p as any)[c.key] || 0} color={col} title={`Click to edit ${c.header}`} onSave={n => onInline(c.key, n)} />;
  }
  if (onInline && (c.key === 'pd_finish' || c.key === 'expected' || c.key === 'revised' || c.key === 'delivery' || c.key === 'store' || c.key === 'store_received')) {
    const field = c.key === 'pd_finish' ? 'pd_finish_date' : c.key === 'expected' ? 'expected_date' : c.key === 'revised' ? 'revised_date' : c.key === 'delivery' ? 'delivery_date' : 'store_received';
    return <InlineDateCell key={c.key} value={(p as any)[field]} green={c.key === 'pd_finish'} title={`Click to edit ${c.header}`} note={c.key === 'delivery' ? (p.delivery_remark || undefined) : undefined} onSave={iso => onInline(c.key, iso)} />;
  }
  if (onInline && (c.key === 'remark' || c.key === 'qa_test_rate')) {
    return <InlineTextCell key={c.key} value={(p as any)[c.key]} title={`Click to edit ${c.header}`} onSave={txt => onInline(c.key, txt)} />;
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
          {stl && <div role="img" aria-label={`${c.header}: ${PROC_STATUS_LABEL[v] ?? v}`} style={{ position: 'relative', width: 17, height: 17, borderRadius: '50%', background: stl.bg, border: `2px solid ${stl.border}`, zIndex: 1, boxShadow: '0 0 0 2px #fff' }} />}
          {lastNote && <span title={lastNote} style={{ position: 'absolute', top: -2, left: '50%', transform: 'translateX(-50%)', color: '#dc2626', fontWeight: 900, fontSize: '0.95rem', lineHeight: 1, zIndex: 2, pointerEvents: 'none' }}>*</span>}
        </div>
      </td>
    );
  }
  // Delivery date แบบอ่านอย่างเดียว (viewer ไม่มี onInline) — ยังโชว์ดอกจัน+hover ได้เหมือนโหมดแก้ไข
  if (c.key === 'delivery') { const d = c.value(p); return (
    <td key={c.key} style={{ position: 'relative', textAlign: 'center', whiteSpace: 'nowrap' }} title={p.delivery_remark || undefined}>
      {d || <span style={{ color: '#cbd5e1' }}>—</span>}
      {p.delivery_remark && <span title={p.delivery_remark} style={{ position: 'absolute', top: -2, right: 2, color: '#dc2626', fontWeight: 900, fontSize: '0.95rem', lineHeight: 1 }}>*</span>}
    </td>
  ); }
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
