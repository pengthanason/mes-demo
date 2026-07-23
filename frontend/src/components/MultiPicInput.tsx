import { useEffect, useRef, useState } from 'react';

/**
 * ช่องกรอกผู้รับผิดชอบ (PIC) — หน้าตา/พฤติกรรมเหมือนช่อง WO (ComboBoxInput) เป๊ะ
 * ต่างกันแค่ "ใส่ได้หลายคน": คลิกชื่อจาก dropdown → ต่อท้ายด้วย ", " แล้วเลือกคนถัดไปได้เลย
 * dropdown กรองตามชื่อที่กำลังพิมพ์ (token หลังคอมมาตัวสุดท้าย) และซ่อนคนที่เลือกไปแล้ว
 * ค่าเก็บเป็นสตริงคั่นด้วย "," → คง backward-compat กับ pd_pic เดิม
 * panel เป็น position:fixed (คำนวณจาก getBoundingClientRect) กันโดน overflow ของ modal ตัด
 */
export function MultiPicInput({
  value, onChange, options, placeholder, required, disabled, style,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number; maxH: number } | null>(null);

  // แยก token · token สุดท้ายจะถือเป็น "กำลังพิมพ์ชื่อใหม่" (partial) ต่อเมื่อยังไม่ตรงกับชื่อที่มีในลิสต์
  // → ถ้าเปิดฟอร์มที่มีคนอยู่แล้ว ("Noi, Kiert") token สุดท้ายเป็นชื่อครบ ไม่เอาไปกรอง → โชว์ทุกคน
  const tokens = value.split(',');
  const last = (tokens[tokens.length - 1] || '').trim();
  const isPartial = !!last && !options.some(o => o.toLowerCase() === last.toLowerCase());
  const current = isPartial ? last : '';
  const committed = (isPartial ? tokens.slice(0, -1) : tokens).map(t => t.trim()).filter(Boolean);
  const committedLower = new Set(committed.map(s => s.toLowerCase()));

  const needle = current.toLowerCase();
  const avail = options.filter(o => !committedLower.has(o.toLowerCase()));   // ซ่อนคนที่เลือกไปแล้ว
  const filtered = needle ? avail.filter(o => o.toLowerCase().includes(needle)) : avail;
  const canAddNew = isPartial && !committedLower.has(needle);

  // เพิ่มคน (จาก dropdown หรือพิมพ์เอง) → ต่อท้ายด้วย ", " เพื่อเลือกคนถัดไปได้เลย
  const add = (name: string) => {
    const n = name.trim();
    const next = n && !committedLower.has(n.toLowerCase()) ? [...committed, n] : committed;
    onChange(next.length ? next.join(', ') + ', ' : '');
    inputRef.current?.focus();
  };

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

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (current) add(current);                       // มีข้อความ → commit คนนี้
      else if (filtered.length === 1) add(filtered[0]);
    } else if (e.key === 'Backspace' && !last && committed.length) {
      e.preventDefault();
      const rest = committed.slice(0, -1);             // อยู่หลัง ", " (token ท้ายว่าง) + มีคน → ลบคนตัวท้าย
      onChange(rest.length ? rest.join(', ') + ', ' : '');
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  // ออกจากช่อง → เก็บกวาดคอมมา/ช่องว่างส่วนเกิน ให้เป็น "A, B" สะอาดๆ
  const onBlur = () => {
    const all = value.split(',').map(t => t.trim()).filter(Boolean);
    const clean = all.join(', ');
    if (clean !== value) onChange(clean);
  };

  const showPanel = open && pos && (filtered.length > 0 || canAddNew);

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', minWidth: 0 }}>
      <input
        ref={inputRef}
        value={value}
        onChange={e => { onChange(e.target.value); if (!open) openIt(); }}
        onFocus={openIt}
        onClick={openIt}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        placeholder={placeholder || 'Select or type people…'}
        required={required}
        disabled={disabled}
        aria-label="PIC name"
        autoComplete="off"
        style={{ width: '100%', boxSizing: 'border-box', ...style }}
      />
      {showPanel && (
        <div style={{
          position: 'fixed', ...(pos!.top != null ? { top: pos!.top } : { bottom: pos!.bottom }),
          left: pos!.left, width: pos!.width, maxHeight: pos!.maxH, overflowY: 'auto',
          background: '#fff', border: '1px solid var(--border-color)', borderRadius: 6,
          boxShadow: '0 6px 18px rgba(0,0,0,0.15)', zIndex: 1000,
        }}>
          {filtered.map(o => (
            <div
              key={o}
              onMouseDown={e => { e.preventDefault(); add(o); }}
              style={{ padding: '0.5rem 0.7rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-body)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
            >
              {o}
            </div>
          ))}
          {canAddNew && (
            <div
              onMouseDown={e => { e.preventDefault(); add(current); }}
              style={{ padding: '0.5rem 0.7rem', cursor: 'pointer', fontSize: '0.85rem', color: '#0369a1', fontWeight: 600, borderTop: filtered.length ? '1px solid #f1f5f9' : undefined }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
            >
              + Add “{current}”
            </div>
          )}
        </div>
      )}
    </div>
  );
}
