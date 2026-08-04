import { useEffect, useRef, useState } from 'react';

/**
 * ช่องกรอกแบบ combobox — พิมพ์เองได้ตรงๆ + มี dropdown suggestion (สีขาว เต็มกรอบ ลงด้านล่าง)
 * ใช้แทน native <datalist> ที่เบราว์เซอร์เรนเดอร์เอง (พื้นดำ/แคบ คุมสไตล์ไม่ได้)
 * panel เป็น position:fixed (คำนวณจาก getBoundingClientRect) กันโดน overflow ของ modal ตัด
 */
export function ComboBoxInput({
  value, onChange, options, placeholder, required, disabled, style, className, ariaLabel, autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
  className?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number; maxH: number } | null>(null);

  const needle = value.trim().toLowerCase();
  // พิมพ์อยู่ → กรองตามคำ · ถ้าตรงเป๊ะกับตัวเลือกเดียว ไม่ต้องโชว์ dropdown (เลือกเสร็จแล้ว)
  const filtered = needle ? options.filter(o => o.toLowerCase().includes(needle)) : options;
  const exact = options.length === 1 && options[0] === value;

  const computePos = () => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 8;
    const above = r.top - 8;
    const up = below < 200 && above > below;
    const maxH = Math.max(150, Math.min(300, up ? above : below));
    setPos(up ? { bottom: window.innerHeight - r.top + 2, left: r.left, width: r.width, maxH }
              : { top: r.bottom + 2, left: r.left, width: r.width, maxH });
  };

  // เปิดอยู่ → รีโพซิชัน panel ตามช่องเสมอเมื่อเลื่อน/รีไซส์ + ปิดเมื่อคลิกนอก
  useEffect(() => {
    if (!open) return;
    const reposition = () => computePos();
    const onDown = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const openIt = () => { if (!disabled) { computePos(); setOpen(true); } };

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', minWidth: 0 }}>
      <input
        className={className}
        value={value}
        onChange={e => { onChange(e.target.value); if (!open) openIt(); }}
        onFocus={openIt}
        onClick={openIt}
        onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        aria-label={ariaLabel}
        autoComplete="off"
        autoFocus={autoFocus}
        style={{ width: '100%', boxSizing: 'border-box', ...style }}
      />
      {open && pos && !exact && filtered.length > 0 && (
        <div style={{
          position: 'fixed', ...(pos.top != null ? { top: pos.top } : { bottom: pos.bottom }),
          left: pos.left, width: pos.width, maxHeight: pos.maxH, overflowY: 'auto',
          background: '#fff', border: '1px solid var(--border-color)', borderRadius: 6,
          boxShadow: '0 6px 18px rgba(0,0,0,0.15)', zIndex: 1000,
        }}>
          {filtered.map(o => (
            <div
              key={o}
              onMouseDown={e => { e.preventDefault(); onChange(o); setOpen(false); }}
              style={{
                padding: '0.5rem 0.7rem', cursor: 'pointer', fontSize: '0.85rem',
                background: o === value ? '#e0f2fe' : '#fff', color: o === value ? '#0369a1' : 'var(--text-body)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
              onMouseEnter={e => { if (o !== value) e.currentTarget.style.background = 'var(--surface-2)'; }}
              onMouseLeave={e => { if (o !== value) e.currentTarget.style.background = '#fff'; }}
            >
              {o}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
