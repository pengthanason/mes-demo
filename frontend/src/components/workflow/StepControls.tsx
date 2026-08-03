import { useState, useEffect, useRef } from 'react';
import { type Step } from './workflowCore';

// ── Dropdown กลาง — ใช้ทุกช่อง (setup/SMT/เครื่อง) ให้หน้าตาเหมือนกันหมด ──
// groups = แยกเป็นหัวข้อได้ (เช่น Set up / Custom process) · item.deletable = มี ✕ ลบในตัว · onAdd = ปุ่ม "+ เพิ่ม"
// ลูกศรดรอปดาวน์ — SVG ตัวเดียวกับ <select> ทั่วเว็บ (index.css) ให้หน้าตาตรงกัน
const DD_ARROW = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2364748b' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")";
export type DDItem = { value: string; label: string; deletable?: boolean };
export type DDGroup = { header?: string; items: DDItem[] };
export function Dropdown({ value, groups, onPick, onAdd, addLabel = '➕ Add process...', onDelete, disabled }: {
  value: string; groups: DDGroup[];
  onPick: (v: string) => void; onAdd?: () => void; addLabel?: string; onDelete?: (v: string) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number; maxH: number } | null>(null);
  // ที่ว่างล่างไม่พอ → เปิดขึ้นบน + จำกัดความสูงตามที่ว่างจริง (กันตกขอบจอ/นอนจอ)
  const computePos = () => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 8;
    const above = r.top - 8;
    const up = below < 260 && above > below;
    const maxH = Math.max(200, Math.min(442, up ? above : below));
    setPos(up ? { bottom: window.innerHeight - r.top + 2, left: r.left, width: r.width, maxH }
              : { top: r.bottom + 2, left: r.left, width: r.width, maxH });
  };
  const toggle = () => {
    if (disabled) return;
    if (!open) { computePos(); setQ(''); }
    setOpen(o => !o);
  };
  const current = groups.flatMap(g => g.items).find(i => i.value === value);
  const totalItems = groups.reduce((n, g) => n + g.items.length, 0);
  const showSearch = totalItems > 10;   // ตัวเลือกเยอะ → มีช่องค้นหาให้พิมพ์กรอง
  const needle = q.trim().toLowerCase();
  const shownGroups = needle
    ? groups.map(g => ({ ...g, items: g.items.filter(it => `${it.label} ${it.value}`.toLowerCase().includes(needle)) })).filter(g => g.items.length)
    : groups;
  useEffect(() => { if (open && showSearch) requestAnimationFrame(() => searchRef.current?.focus()); }, [open, showSearch]);
  // เปิดอยู่แล้วเลื่อนจอ/รีไซส์ → คำนวณตำแหน่ง panel ใหม่ให้ติดกับช่องเสมอ (ไม่ลอยตามจอ)
  useEffect(() => {
    if (!open) return;
    const reposition = () => computePos();
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => { window.removeEventListener('scroll', reposition, true); window.removeEventListener('resize', reposition); };
  }, [open]);
  return (
    <div style={{ width: '100%', minWidth: 0 }}>
      <div ref={boxRef} onClick={toggle}
        role="button" tabIndex={disabled ? -1 : 0} aria-expanded={open} aria-disabled={disabled}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
        style={{ width: '100%', padding: '8px 28px 8px 10px', borderRadius: 4, border: '1px solid #ccc', fontSize: '0.85rem', fontWeight: 600, backgroundColor: disabled ? '#f1f5f9' : '#fff', color: '#334155', cursor: disabled ? 'default' : 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', backgroundImage: DD_ARROW, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center', backgroundSize: '10px 6px' }}>
        {current ? current.label : (value || '—')}
      </div>
      {open && pos && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'fixed', ...(pos.top != null ? { top: pos.top } : { bottom: pos.bottom }), left: pos.left, width: pos.width, background: '#fff', border: '1px solid #ccc', borderRadius: 4, boxShadow: '0 6px 18px rgba(0,0,0,0.15)', zIndex: 1000, maxHeight: pos.maxH, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {showSearch && (
              <div style={{ padding: 6, borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
                <input ref={searchRef} value={q} onChange={e => setQ(e.target.value)} onClick={e => e.stopPropagation()}
                  onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
                  placeholder="🔍 Type to search..." aria-label="Search"
                  style={{ width: '100%', padding: '6px 8px', border: '1px solid #ccc', borderRadius: 4, fontSize: '0.82rem', fontFamily: 'inherit' }} />
              </div>
            )}
            <div style={{ overflowY: 'auto' }}>
              {shownGroups.length === 0 && <div style={{ padding: '8px 10px', color: '#94a3b8', fontSize: '0.82rem' }}>No results for “{q}”</div>}
              {shownGroups.map((g, gi) => (
                <div key={gi}>
                  {g.header && <div style={{ padding: '5px 10px', fontSize: '0.7rem', fontWeight: 700, color: '#6366f1', background: '#eef2ff', borderBottom: '1px solid #e2e8f0' }}>{g.header}</div>}
                  {g.items.map(it => (
                    <div key={it.value} style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #f1f5f9', background: value === it.value ? '#e0f2fe' : '#fff' }}>
                      <div style={{ flexGrow: 1, padding: '8px 10px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: value === it.value ? '#0369a1' : '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                        onClick={() => { onPick(it.value); setOpen(false); }}
                        role="button" tabIndex={0} aria-label={it.label}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(it.value); setOpen(false); } }}>{it.label}</div>
                      {it.deletable && onDelete && (
                        <button type="button" title={`Delete "${it.label}"`} onClick={e => { e.stopPropagation(); onDelete(it.value); }}
                          onMouseOver={e => (e.currentTarget.style.background = '#fee2e2')} onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                          style={{ background: 'transparent', border: 'none', color: '#e11d48', cursor: 'pointer', padding: '8px 11px', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>✕</button>
                      )}
                    </div>
                  ))}
                </div>
              ))}
              {onAdd && (
                <div onClick={() => { setOpen(false); onAdd(); }}
                  role="button" tabIndex={0} aria-label={addLabel}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(false); onAdd(); } }}
                  style={{ padding: '8px 10px', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', color: '#0369a1', background: '#f0f9ff', borderTop: '1px solid #e2e8f0' }}>{addLabel}</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export const GRID = '24px 30px minmax(130px,0.6fr) 200px 88px minmax(180px,0.9fr) 34px';
const TBOX = { width: 64, padding: '8px 4px', borderRadius: 4, border: '1px solid #ccc', textAlign: 'center' as const, fontSize: '0.85rem', fontWeight: 600 };
const NUMBOX = { width: 60, padding: '7px 4px', borderRadius: 4, border: '1px solid #ccc', textAlign: 'center' as const, fontSize: '0.85rem', fontWeight: 600 };

// ⚠️ ต้องประกาศนอก WorkflowBuilder — ถ้าประกาศข้างใน จะถูกสร้างใหม่ทุก render → input remount → เคอร์เซอร์หายตอนพิมพ์
type CellProps = { step: Step; isViewer: boolean; setStep: (id: string, patch: Partial<Step>) => void };

export function TimeCells({ step, isViewer, setStep }: CellProps) {
  const sec = step.seconds === '' ? 0 : Number(step.seconds);
  const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
  // พิมพ์เก็บเป็น string ก่อน → คำนวณ (carry นาที/ชม.) ตอน "ออกจากช่อง" (blur/Enter) ไม่ใช่ normalize ทุกคีย์
  // เช่น พิมพ์ 611 ในช่องวินาที จะได้ครบ 611 แล้วค่อยกลายเป็น 10 นาที 11 วิ (ไม่ใช่ 1 นาที 11 วิ)
  const [h, setH] = useState(hh ? String(hh) : '');
  const [m, setM] = useState(mm ? String(mm) : '');
  const [s, setS] = useState(ss ? String(ss) : '');
  useEffect(() => {   // ค่าจริงเปลี่ยนจากภายนอก (โหลด preset / normalize หลังคำนวณ) → sync ช่องกรอก
    setH(hh ? String(hh) : ''); setM(mm ? String(mm) : ''); setS(ss ? String(ss) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sec]);
  const commit = () => {
    const n = (v: string) => Math.max(0, Math.floor(Number(v)) || 0);
    const total = n(h) * 3600 + n(m) * 60 + n(s);
    setStep(step.id, { seconds: total <= 0 ? '' : total });
  };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); };
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center', justifyContent: 'center' }} title="Hours : minutes : seconds — finish typing and the system will calculate/carry units for you">
      <input type="number" min="0" placeholder="hr" disabled={isViewer} value={h} onChange={e => setH(e.target.value)} onBlur={commit} onKeyDown={onKey} style={TBOX} />
      <span style={{ color: '#94a3b8', fontWeight: 700 }}>:</span>
      <input type="number" min="0" placeholder="min" disabled={isViewer} value={m} onChange={e => setM(e.target.value)} onBlur={commit} onKeyDown={onKey} style={TBOX} />
      <span style={{ color: '#94a3b8', fontWeight: 700 }}>:</span>
      <input type="number" min="0" placeholder="sec" disabled={isViewer} value={s} onChange={e => setS(e.target.value)} onBlur={commit} onKeyDown={onKey} style={TBOX} />
    </div>
  );
}

export function MachineCell({ step, isViewer, setStep, machineGroups, onAddMachine, onDeleteMachine }: CellProps & {
  machineGroups: DDGroup[]; onAddMachine: () => void; onDeleteMachine: (v: string) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Dropdown value={step.machine} groups={machineGroups} disabled={isViewer}
          onPick={v => setStep(step.id, { machine: v })}
          onAdd={onAddMachine} addLabel="➕ Add machine..." onDelete={onDeleteMachine} />
      </div>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', color: '#64748b', whiteSpace: 'nowrap' }} title="Number of parallel machines">
        ×<input type="number" min="1" value={step.stations || 1} disabled={isViewer}
          onChange={e => setStep(step.id, { stations: Math.max(1, Math.floor(Number(e.target.value)) || 1) })} style={{ ...NUMBOX, width: 46 }} /> machines
      </label>
    </div>
  );
}
