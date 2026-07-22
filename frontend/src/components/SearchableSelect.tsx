import { useEffect, useRef, useState } from 'react';

export type SelectOption = { value: string; label: string };

/**
 * ดรอปดาวน์เลือกค่า (combobox) — คลิกเปิดแล้วเลือกได้เลย (ไม่ต้องพิมพ์)
 * ถ้าตัวเลือกเกิน searchThreshold (ดีฟอลต์ 10) จะมีช่องค้นหาโผล่ให้พิมพ์กรองหาได้
 * panel เป็น position:fixed (คำนวณจาก getBoundingClientRect) กันโดน overflow ตัด
 */
export function SearchableSelect({
  value, onChange, options, placeholder = '— Select —', disabled, required, searchThreshold = 10, style, ariaLabel, allowCustom,
}: {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  searchThreshold?: number;
  style?: React.CSSProperties;
  ariaLabel?: string;
  allowCustom?: boolean;   // true = พิมพ์ค่าเองได้ (combobox) นอกเหนือจากเลือกในลิสต์
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number; maxH: number } | null>(null);

  const current = options.find(o => o.value === value);
  const showSearch = allowCustom || options.length > searchThreshold;
  const needle = q.trim().toLowerCase();
  const filtered = showSearch && needle
    ? options.filter(o => `${o.label} ${o.value}`.toLowerCase().includes(needle))
    : options;
  const trimmed = q.trim();
  const showCustom = !!allowCustom && !!trimmed && !options.some(o => o.value === trimmed);   // มีตัวเลือก "ใช้ค่าที่พิมพ์เอง"

  // คำนวณตำแหน่ง panel: ถ้าที่ว่างด้านล่างไม่พอ → เปิดขึ้นบน + จำกัดความสูงตามที่ว่างจริง (กันตกขอบจอ/นอนจอ)
  const computePos = () => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 8;
    const above = r.top - 8;
    const up = below < 220 && above > below;
    const maxH = Math.max(160, Math.min(390, up ? above : below));
    setPos(up ? { bottom: window.innerHeight - r.top + 2, left: r.left, width: r.width, maxH }
              : { top: r.bottom + 2, left: r.left, width: r.width, maxH });
  };
  const toggle = () => {
    if (disabled) return;
    if (!open) { computePos(); setQ(''); }
    setOpen(o => !o);
  };
  useEffect(() => {
    if (open && showSearch) requestAnimationFrame(() => searchRef.current?.focus());
  }, [open, showSearch]);
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
    <div style={{ position: 'relative', width: '100%', minWidth: 0, ...style }}>
      <div
        ref={boxRef} role="button" tabIndex={disabled ? -1 : 0} onClick={toggle}
        onKeyDown={e => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(); } }}
        aria-haspopup="listbox" aria-expanded={open ? 'true' : 'false'} aria-disabled={disabled ? 'true' : 'false'}
        aria-label={ariaLabel || placeholder} title={current?.label || value || placeholder}
        style={{
          // ให้หน้าตาเหมือน native <select> เป๊ะ: padding เท่ากัน + ลูกศร SVG chevron ชุดเดียวกัน (index.css select)
          width: '100%', boxSizing: 'border-box',
          padding: '0.45rem 2rem 0.45rem 0.7rem',
          border: '1px solid var(--border-color)', borderRadius: 6,
          backgroundColor: disabled ? '#f1f5f9' : '#fff',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2364748b' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center', backgroundSize: '10px 6px',
          color: (current || value) ? 'var(--text-body)' : '#94a3b8',
          fontFamily: 'inherit', fontSize: '0.875rem', cursor: disabled ? 'default' : 'pointer', textAlign: 'left', userSelect: 'none',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        {current ? current.label : (value || placeholder)}
      </div>
      {/* input ซ่อนไว้เพื่อให้ required ทำงานกับ form ได้ */}
      {required && <input tabIndex={-1} aria-hidden value={value} required onChange={() => {}} style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }} />}

      {open && pos && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'fixed', ...(pos.top != null ? { top: pos.top } : { bottom: pos.bottom }), left: pos.left, width: pos.width, background: '#fff',
            border: '1px solid var(--border-color)', borderRadius: 6, boxShadow: '0 6px 18px rgba(0,0,0,0.15)',
            zIndex: 1000, maxHeight: pos.maxH, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {showSearch && (
              <div style={{ padding: 6, borderBottom: '1px solid var(--border-color)' }}>
                <input
                  ref={searchRef} value={q} onChange={e => setQ(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') setOpen(false); else if (e.key === 'Enter' && showCustom) { e.preventDefault(); onChange(trimmed); setOpen(false); } }}
                  placeholder={allowCustom ? '🔍 Search or type new…' : '🔍 Type to search...'} aria-label="Search"
                  style={{ width: '100%', padding: '0.4rem 0.6rem', border: '1px solid var(--border-color)', borderRadius: 5, fontSize: '0.85rem', fontFamily: 'inherit' }}
                />
              </div>
            )}
            <div style={{ overflowY: 'auto' }}>
              {showCustom && (
                <div
                  onClick={() => { onChange(trimmed); setOpen(false); }}
                  style={{ padding: '0.5rem 0.7rem', cursor: 'pointer', fontSize: '0.85rem', color: '#0369a1', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderBottom: filtered.length ? '1px solid var(--border-color)' : undefined }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
                >
                  ➕ Use “{trimmed}”
                </div>
              )}
              {filtered.length === 0 && !showCustom && <div style={{ padding: '0.6rem 0.7rem', color: '#94a3b8', fontSize: '0.85rem' }}>No results for “{q}”</div>}
              {filtered.map(o => (
                <div
                  key={o.value} onClick={() => { onChange(o.value); setOpen(false); }}
                  style={{
                    padding: '0.5rem 0.7rem', cursor: 'pointer', fontSize: '0.85rem',
                    background: o.value === value ? '#e0f2fe' : '#fff', color: o.value === value ? '#0369a1' : 'var(--text-body)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}
                  onMouseEnter={e => { if (o.value !== value) e.currentTarget.style.background = '#f1f5f9'; }}
                  onMouseLeave={e => { if (o.value !== value) e.currentTarget.style.background = '#fff'; }}
                >
                  {o.label}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
