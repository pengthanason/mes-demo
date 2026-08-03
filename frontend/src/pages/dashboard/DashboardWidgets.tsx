import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PP_STATUS, PP_STATUS_LABEL, type PpProject } from '../../lib/ppApi';
import { showToast } from '../../lib/toast';
import { useEscapeKey } from '../../lib/useEscapeKey';
import {
  STATUS_STYLE, statusView, buildHeaderRows, XLSX_COLUMNS, PROCESS_KEYS, PROCESS_STEPS, PROC_STATUS, PROC_STATUS_LABEL, todayLocal, StatCard,
} from '../../components/ppParts';
import { SYNTECH_LOGO_PNG_BASE64 } from '../../assets/syntechLogo';

/* ── พิมพ์เป็น PDF — โครงเดียวกับ Excel (XLSX_COLUMNS + หัวซ้อน 2 ชั้น) + โลโก้/สี SYNTECH ── */
export function printPdf(rows: PpProject[], filename?: string) {
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
export function KpiCard({ icon, label, value, accent, onClick, active }: {
  icon: string; label: string; value: number | string; accent: string; onClick: () => void; active: boolean;
}) {
  return (
    <div role="button" tabIndex={0} aria-pressed={active}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      title="Click to filter the table by this status" aria-label={`Filter by ${label}: ${value}`}
      style={{ cursor: 'pointer', borderRadius: 12, outline: active ? `2px solid ${accent}` : '2px solid transparent', transition: 'transform 0.12s, box-shadow 0.12s' }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(0,0,0,0.10)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}>
      <StatCard icon={icon} label={label} value={value} accent={accent} />
    </div>
  );
}

// Total output รายงาน — สไตล์แท่งเดียวกับ BarRow (Customer): track กลม สูง 18 · เขียว FG (#2e7d4f) / แดง NG · เลข FG/NG ท้ายแถว
export function FgNgByJob({ jobs }: { jobs: { name: string; fg: number; ng: number }[] }) {
  const max = Math.max(1, ...jobs.map(j => j.fg + j.ng));   // แท่งยาวสุด = งานที่ผลิตมากสุด
  if (!jobs.length) return <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0' }}>No data</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
      {jobs.map(j => {
        const total = j.fg + j.ng;
        const barPct = (total / max) * 100;
        const fgPct = total > 0 ? (j.fg / total) * 100 : 0;
        const ngPct = 100 - fgPct;
        return (
          <div key={j.name} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.82rem' }}>
            <div title={j.name} style={{ flex: '0 1 130px', minWidth: 64, textAlign: 'right', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{j.name}</div>
            <div style={{ flex: 1, background: 'var(--border-color)', borderRadius: 99, height: 18, overflow: 'hidden' }}>
              <div style={{ width: `${barPct}%`, height: '100%', display: 'flex', borderRadius: 99, overflow: 'hidden', minWidth: total > 0 ? 6 : 0 }}>
                {j.fg > 0 && <div title={`FG ${j.fg}`} style={{ width: `${fgPct}%`, height: '100%', background: '#2e7d4f' }} />}
                {j.ng > 0 && <div title={`NG ${j.ng}`} style={{ width: `${ngPct}%`, height: '100%', background: '#dc2626' }} />}
              </div>
            </div>
            {/* กล่องเลขกว้างพอให้มีระยะขอบขวาเท่า Customer (เลข FG/NG ยาวกว่าเลขเดี่ยว) */}
            <div style={{ width: 82, flexShrink: 0, fontWeight: 700, whiteSpace: 'nowrap' }}>
              <span style={{ color: '#2e7d4f' }}>{j.fg.toLocaleString()}</span>
              <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> / </span>
              <span style={{ color: '#dc2626' }}>{j.ng.toLocaleString()}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// เลื่อนหน้าจอแบบ custom (easeOutCubic) — คุม duration เองให้ค่อย ๆ เลื่อน ไม่พึ่ง behavior:'smooth'
export function smoothScrollTo(targetY: number, duration: number) {
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

// ป๊อปอัพตั้งชื่อไฟล์ก่อนดาวน์โหลด → ย้ายไปเป็น component กลางที่ components/FileNamePromptModal.tsx
// (ใช้ร่วมกับหน้า Settings → Backup ด้วย · แก้ที่เดียวเหมือนกันทุกหน้า)

/* ── Popup บันทึก process 1 step (เลือกสถานะ + วันที่) → เก็บลง process_log เพื่อวาด Gantt หลายสี ── */
export function ProcessEventPopup({ p, stepKey, onClose, onSave }: { p: PpProject; stepKey: string; onClose: () => void; onSave: (status: string, date: string, note: string) => void }) {
  useEscapeKey(true, onClose);
  const step = PROCESS_STEPS.find(s => (s.key as string) === stepKey);
  const [status, setStatus] = useState<string>((p as any)[stepKey] || '');
  // วันที่ default = ต่อจาก event ล่าสุดใน log → ถ้าไม่มีใช้ PD Start → ถ้าไม่มีใช้วันนี้ (จะได้ไม่กองที่วันนี้หมด)
  const lastDate = Array.isArray(p.process_log) && p.process_log.length ? p.process_log[p.process_log.length - 1].date : '';
  const [date, setDate] = useState(lastDate || (p.pd_start_date ? String(p.pd_start_date).slice(0, 10) : '') || todayLocal());
  // remark เริ่มต้น = remark ล่าสุดของ step นี้ (จะได้เห็น/แก้ค่าปัจจุบันได้)
  const lastEv = (Array.isArray(p.process_log) ? p.process_log : []).filter(e => e.step === stepKey).slice(-1)[0];
  const [note, setNote] = useState(lastEv?.note || '');
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ width: 'min(100%, 380px)' }}>
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
export function StatusColorPopup({ p, pos, onClose, onPick }: { p: PpProject; pos: { top: number; left: number }; onClose: () => void; onPick: (color: string) => void }) {
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
      // กว้างพอดี = padding 12*2 + 6 ช่อง(28px) + gap 8*5 → กันสีล้นขอบ (แต่ก่อน 190 แคบไป)
      position: 'fixed', top: pos.top, left: pos.left, zIndex: 1000,
      background: '#fff', border: '1px solid var(--border-color)', borderRadius: 12, boxShadow: '0 10px 28px rgba(15,23,42,0.18)',
      padding: 12, display: 'grid', gridTemplateColumns: 'repeat(6, 28px)', gap: 8, justifyContent: 'center',
    }}>
      {STATUS_COLOR_OPTIONS.map(key => {
        const s = STATUS_STYLE[key];
        const active = current === key;
        return (
          <button type="button" key={key} onClick={() => onPick(key)} title={STATUS_COLOR_LABEL[key] ?? key}
            style={{
              width: 28, height: 28, boxSizing: 'border-box', borderRadius: '50%', background: s.bg, cursor: 'pointer', padding: 0,
              border: active ? `3px solid ${s.border}` : '2px solid #fff',
              boxShadow: active ? `0 0 0 1px ${s.border}` : '0 0 0 1px var(--border-color)',
            }} />
        );
      })}
    </div>,
    document.body
  );
}
