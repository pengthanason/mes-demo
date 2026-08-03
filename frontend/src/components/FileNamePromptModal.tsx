import { useEffect, useRef, useState } from 'react';

/**
 * ป๊อปอัพตั้งชื่อไฟล์ก่อนดาวน์โหลด
 * — เติมชื่อปัจจุบันให้ + คลุมไฮไลต์เฉพาะชื่อ (ไม่รวมนามสกุล) เหมือนตอน rename ไฟล์ใน Explorer
 * — Enter = OK · Esc / คลิกพื้นหลัง = ยกเลิก
 * ใช้ร่วมกันหลายหน้า (Dashboard export, Settings backup) — แก้ที่เดียวเหมือนกันทุกหน้า
 */
export function FileNamePromptModal({ title, subtitle, defaultBase, ext, onConfirm, onCancel }: {
  title: string;
  subtitle?: string;
  defaultBase: string;
  ext: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
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
      <div className="modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ width: 'min(100%, 440px)' }}>
        <h2 className="panel__title" style={{ marginBottom: '0.3rem' }}>{title}</h2>
        <p className="panel__subtitle" style={{ marginBottom: '1rem' }}>{subtitle || 'Name the file, then click “OK” to download'}</p>
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
