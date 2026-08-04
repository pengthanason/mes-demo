import { useState, useEffect, useRef } from 'react';
import { useEscapeKey } from '../../lib/useEscapeKey';

// ── ป็อปอัพก่อน Export PDF — flow: กรอกข้อมูลเอกสาร+ชื่อไฟล์ · gantt: ชื่อไฟล์อย่างเดียว ──
export type ExportForm = { filename: string; customer: string; model: string; pn: string; issuedBy: string; checkedBy: string; approvedBy: string; revNo: string; revDesc: string };
export function ExportDialog({ mode, initial, onCancel, onConfirm }: { mode: 'flow' | 'gantt'; initial: ExportForm; onCancel: () => void; onConfirm: (f: ExportForm) => void }) {
  const [f, setF] = useState<ExportForm>({ ...initial, filename: `${initial.filename}.pdf` });
  const set = (k: keyof ExportForm, v: string) => setF(p => ({ ...p, [k]: v }));
  const nameRef = useRef<HTMLInputElement>(null);
  useEscapeKey(true, onCancel);
  // เปิดมา → คลุม(ไฮไลต์)เฉพาะส่วนชื่อ ไม่รวม ".pdf" (เหมือนหน้า Dashboard)
  useEffect(() => {
    const el = nameRef.current; if (!el) return;
    el.focus();
    const dot = el.value.lastIndexOf('.');
    el.setSelectionRange(0, dot > 0 ? dot : el.value.length);
  }, []);
  const confirm = () => {
    let name = f.filename.trim(); if (!name) return;
    if (!name.toLowerCase().endsWith('.pdf')) name = `${name.replace(/\.+$/, '')}.pdf`;   // กันลืมนามสกุล → เติม .pdf ให้
    onConfirm({ ...f, filename: name });
  };
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 'min(100%, 760px)' }}>
        <h2 className="panel__title" style={{ marginBottom: 4 }}>🖨️ Export {mode === 'flow' ? 'Process Flow Chart (PDF)' : 'Gantt (PDF)'}</h2>
        <p className="panel__subtitle" style={{ marginTop: 0 }}>{mode === 'flow' ? 'Name the file + fill in document info (optional) then press Export' : 'Name the file then press Export'}</p>
        <div className="stack" style={{ marginTop: '0.9rem', gap: '0.75rem' }}>
          <label className="field"><span>File name (.pdf)</span>
            <input ref={nameRef} value={f.filename} onChange={e => set('filename', e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirm(); } }} />
          </label>
          {mode === 'flow' && (
            <>
              <div className="filters-grid">
                <label className="field"><span>Customer</span><input value={f.customer} onChange={e => set('customer', e.target.value)} /></label>
                <label className="field"><span>Model</span><input value={f.model} onChange={e => set('model', e.target.value)} /></label>
                <label className="field"><span>P/N</span><input value={f.pn} onChange={e => set('pn', e.target.value)} /></label>
              </div>
              <div className="filters-grid">
                <label className="field"><span>Issued by</span><input value={f.issuedBy} onChange={e => set('issuedBy', e.target.value)} /></label>
                <label className="field"><span>Checked by</span><input value={f.checkedBy} onChange={e => set('checkedBy', e.target.value)} /></label>
                <label className="field"><span>Approved by</span><input value={f.approvedBy} onChange={e => set('approvedBy', e.target.value)} /></label>
              </div>
              <div className="filters-grid">
                <label className="field"><span>Revision</span><input value={f.revNo} onChange={e => set('revNo', e.target.value)} /></label>
                <label className="field" style={{ gridColumn: 'span 2' }}><span>Description</span><input value={f.revDesc} onChange={e => set('revDesc', e.target.value)} /></label>
              </div>
            </>
          )}
        </div>
        <div className="modal-actions" style={{ marginTop: '1.1rem' }}>
          <button type="button" className="btn secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn" onClick={confirm}>🖨️ Export</button>
        </div>
      </div>
    </div>
  );
}
