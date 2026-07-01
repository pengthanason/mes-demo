import { useEffect, useRef, useState } from 'react';

export type SelectOption = { value: string; label: string };

/**
 * ดรอปดาวน์เลือกค่า (combobox) — คลิกเปิดแล้วเลือกได้เลย (ไม่ต้องพิมพ์)
 * ถ้าตัวเลือกเกิน searchThreshold (ดีฟอลต์ 10) จะมีช่องค้นหาโผล่ให้พิมพ์กรองหาได้
 * panel เป็น position:fixed (คำนวณจาก getBoundingClientRect) กันโดน overflow ตัด
 */
export function SearchableSelect({
  value, onChange, options, placeholder = '— เลือก —', disabled, required, searchThreshold = 10, style, ariaLabel,
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
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const current = options.find(o => o.value === value);
  const showSearch = options.length > searchThreshold;
  const needle = q.trim().toLowerCase();
  const filtered = showSearch && needle
    ? options.filter(o => `${o.label} ${o.value}`.toLowerCase().includes(needle))
    : options;

  const toggle = () => {
    if (disabled) return;
    if (!open) {
      const r = boxRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 2, left: r.left, width: r.width });
      setQ('');
    }
    setOpen(o => !o);
  };
  useEffect(() => {
    if (open && showSearch) requestAnimationFrame(() => searchRef.current?.focus());
  }, [open, showSearch]);

  return (
    <div style={{ position: 'relative', width: '100%', minWidth: 0, ...style }}>
      <div
        ref={boxRef} role="button" tabIndex={disabled ? -1 : 0} onClick={toggle}
        onKeyDown={e => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(); } }}
        aria-haspopup="listbox" aria-expanded={open ? 'true' : 'false'} aria-disabled={disabled ? 'true' : 'false'}
        aria-label={ariaLabel || placeholder} title={current?.label || placeholder}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          padding: '0.45rem 0.7rem', border: '1px solid var(--border-color)', borderRadius: 6, boxSizing: 'border-box',
          background: disabled ? '#f1f5f9' : '#fff', color: current ? 'var(--text-body)' : '#94a3b8',
          fontFamily: 'inherit', fontSize: '0.875rem', cursor: disabled ? 'default' : 'pointer', textAlign: 'left', userSelect: 'none',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current ? current.label : placeholder}</span>
        <span style={{ fontSize: 10, color: '#64748b', flexShrink: 0 }}>▾</span>
      </div>
      {/* input ซ่อนไว้เพื่อให้ required ทำงานกับ form ได้ */}
      {required && <input tabIndex={-1} aria-hidden value={value} required onChange={() => {}} style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }} />}

      {open && pos && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'fixed', top: pos.top, left: pos.left, width: pos.width, background: '#fff',
            border: '1px solid var(--border-color)', borderRadius: 6, boxShadow: '0 6px 18px rgba(0,0,0,0.15)',
            zIndex: 1000, maxHeight: 300, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {showSearch && (
              <div style={{ padding: 6, borderBottom: '1px solid var(--border-color)' }}>
                <input
                  ref={searchRef} value={q} onChange={e => setQ(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
                  placeholder="🔍 พิมพ์เพื่อค้นหา..." aria-label="ค้นหา"
                  style={{ width: '100%', padding: '0.4rem 0.6rem', border: '1px solid var(--border-color)', borderRadius: 5, fontSize: '0.85rem', fontFamily: 'inherit' }}
                />
              </div>
            )}
            <div style={{ overflowY: 'auto' }}>
              {filtered.length === 0 && <div style={{ padding: '0.6rem 0.7rem', color: '#94a3b8', fontSize: '0.85rem' }}>ไม่พบ “{q}”</div>}
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
