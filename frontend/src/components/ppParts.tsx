import { useState } from 'react';
import { usePpCreate, usePpUpdate, PP_STATUS, PP_STATUS_LABEL, ppYield, type PpProject } from '../lib/ppApi';
import { showToast } from '../lib/toast';
import { SYNTECH_LOGO_PNG_BASE64 } from '../assets/syntechLogo';

// hex (#rrggbb) → ARGB ('FFRRGGBB') สำหรับ ExcelJS
const argb = (hex: string) => 'FF' + hex.replace('#', '').toUpperCase();

// ตัด timestamp ออก เหลือแค่วันที่ DD/MM/YYYY (กัน Excel โชว์ 00:00:00)
const xlsxDate = (v: string | null | undefined) => {
  if (!v) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v).slice(0, 10));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v);
};

// WW (Work Week) = เลขสัปดาห์ตามมาตรฐาน ISO-8601 ของวันที่ที่เลือก (สัปดาห์เริ่มวันจันทร์)
export function isoWeek(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const base = new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
  if (isNaN(base.getTime())) return null;
  const d = new Date(Date.UTC(base.getFullYear(), base.getMonth(), base.getDate()));
  const dayNum = d.getUTCDay() || 7;            // จันทร์=1 ... อาทิตย์=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);     // เลื่อนไปวันพฤหัสฯ ของสัปดาห์นั้น
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export const STATUS_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  DONE:        { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  ON_PROCESS:  { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd' },
  LATE:        { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  MATL_COMING: { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.ON_PROCESS;
  return (
    <span style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}`, padding: '2px 10px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
      {PP_STATUS_LABEL[status] ?? status}
    </span>
  );
}

export const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';
export const yesNo = (b: boolean) => b ? '✓' : '';

/* ── นิยามคอลัมน์ชุดเดียว — เรียงตามตาราง Dashboard (สำคัญขึ้นก่อน) ──
   ใช้ร่วมกันทั้ง Dashboard table / Excel / PDF เพื่อให้ลำดับตรงกันเสมอ
   headerColor = สีหัวคอลัมน์พิเศษ (hex 6 หลัก ไม่มี #) · center = จัดกึ่งกลาง */
const ckMark = (b: boolean) => b ? '✓' : '';
export type PpCol = { key: string; header: string; w: number; center?: boolean; headerColor?: string; group?: string; value: (p: PpProject) => string };
export const PP_COLUMNS: PpCol[] = [
  { key: 'status',       header: 'Status',      w: 12, center: true, value: p => PP_STATUS_LABEL[p.status] ?? p.status },
  { key: 'product_pn',   header: 'Product P/N', w: 17, value: p => p.product_pn || '' },
  { key: 'model',        header: 'MODEL',       w: 26, value: p => p.model || '' },
  { key: 'customer',     header: 'Customer',    w: 14, value: p => p.customer || '' },
  { key: 'qty',          header: 'QTY',         w: 7,  center: true, value: p => (p.qty != null ? String(p.qty) : '') },
  { key: 'date_record',  header: 'DATE Record', w: 12, center: true, value: p => xlsxDate(p.date_record) },
  { key: 'expected',     header: 'Expected',    w: 12, center: true, headerColor: 'FFC000', value: p => xlsxDate(p.expected_date) },
  { key: 'revised',      header: 'Revised',     w: 12, center: true, headerColor: 'FFFF00', value: p => xlsxDate(p.revised_date) },
  { key: 'ok_per_day',   header: 'OK/DAY',      w: 8,  center: true, value: p => (p.ok_per_day ? String(p.ok_per_day) : '') },
  { key: 'total_ng',     header: 'NG',          w: 7,  center: true, value: p => (p.total_ng != null ? String(p.total_ng) : '') },
  { key: 'total_ok',     header: 'OK',          w: 7,  center: true, value: p => (p.total_ok != null ? String(p.total_ok) : '') },
  { key: 'yield',        header: 'Yield',       w: 8,  center: true, value: p => { const y = ppYield(p); return y == null ? '' : `${y.toFixed(0)}%`; } },
  { key: 'done',         header: 'DONE',        w: 7,  center: true, headerColor: '00B050', value: p => ckMark(p.done) },
  { key: 'wk',           header: 'WW',          w: 6,  center: true, value: p => (p.wk != null ? String(p.wk) : '') },
  { key: 'work_order',   header: 'WO',          w: 14, value: p => p.work_order || '' },
  { key: 'chk_man',      header: 'Man',         w: 5,  center: true, group: '4M Check', value: p => ckMark(p.chk_man) },
  { key: 'chk_mac',      header: 'Mac',         w: 5,  center: true, group: '4M Check', value: p => ckMark(p.chk_mac) },
  { key: 'chk_med',      header: 'Med',         w: 5,  center: true, group: '4M Check', value: p => ckMark(p.chk_med) },
  { key: 'chk_mat',      header: 'Mat',         w: 5,  center: true, group: '4M Check', value: p => ckMark(p.chk_mat) },
  { key: 'pd_pcba',      header: 'PCBA',        w: 6,  center: true, group: 'PD Plan', value: p => ckMark(p.pd_pcba) },
  { key: 'pd_bbas',      header: 'BBAS',        w: 6,  center: true, group: 'PD Plan', value: p => ckMark(p.pd_bbas) },
  { key: 'pd_test',      header: 'TEST',        w: 6,  center: true, group: 'PD Plan', value: p => ckMark(p.pd_test) },
  { key: 'pd_rma',       header: 'RMA',         w: 6,  center: true, group: 'PD Plan', value: p => ckMark(p.pd_rma) },
  { key: 'pd_prep',      header: 'PREP',        w: 6,  center: true, group: 'PD Plan', value: p => ckMark(p.pd_prep) },
  { key: 'qa_test_rate', header: 'Sampling%',   w: 10, center: true, value: p => p.qa_test_rate || '' },
  { key: 'pd_start',     header: 'PD Start',    w: 12, center: true, value: p => xlsxDate(p.pd_start_date) },
  { key: 'pd_finish',    header: 'PD Finish',   w: 12, center: true, value: p => xlsxDate(p.pd_finish_date) },
  { key: 'qa_finish',    header: 'QA Finish',   w: 12, center: true, value: p => xlsxDate(p.qa_finish_date) },
  { key: 'store',        header: 'Store',       w: 12, center: true, value: p => xlsxDate(p.store_received) },
  { key: 'matl_coming',  header: "Mat'l coming",w: 18, value: p => p.matl_coming || '' },
  { key: 'pd_pic',       header: 'PD PIC',      w: 12, value: p => p.pd_pic || '' },
  { key: 'team_member',  header: 'Team',        w: 7,  center: true, value: p => (p.team_member ? String(p.team_member) : '') },
  { key: 'remark',       header: 'Remark',      w: 30, value: p => p.remark || '' },
];

/* ── Excel (.xlsx) export — เรียงคอลัมน์ตาม Dashboard + หัวซ้อน 2 ชั้น (กลุ่ม 4M/PD) + โลโก้/สี SYNTECH ── */
export async function exportXlsx(rows: PpProject[]) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Production Plan', { views: [{ state: 'frozen', ySplit: 3, showGridLines: false }] });
  const N = PP_COLUMNS.length;

  ws.columns = PP_COLUMNS.map(c => ({ width: c.w }));

  // แถว 1 — โลโก้ SYNTECH (มุมบนซ้าย) + หัวเรื่อง + รหัสฟอร์ม
  ws.getRow(1).height = 42;
  const logoId = wb.addImage({ base64: SYNTECH_LOGO_PNG_BASE64, extension: 'png' });
  ws.addImage(logoId, { tl: { col: 0.15, row: 0.15 }, ext: { width: 210, height: 48 } });
  ws.mergeCells(1, 5, 1, 11);          // E1:K1 = หัวเรื่อง
  ws.getCell(1, 5).value = 'Production Plan';
  ws.getCell(1, N).value = 'FM03 Rev.01 Ref.EN-P-01';

  // แถว 2–3 — หัวตาราง 2 ชั้น: คอลัมน์ปกติ merge แนวตั้งคร่อม 2 แถว, กลุ่ม (4M/PD) มีหัวกลุ่มแถว 2 + หัวย่อยแถว 3
  for (let i = 0; i < N; i++) {
    const col = i + 1;
    const def = PP_COLUMNS[i];
    if (def.group) {
      ws.getCell(3, col).value = def.header;        // หัวย่อยอยู่แถว 3
    } else {
      ws.getCell(2, col).value = def.header;
      ws.mergeCells(2, col, 3, col);                // ไม่มีกลุ่ม → merge แนวตั้งคร่อม 2 แถว
    }
  }
  // หัวกลุ่ม (merge แนวนอนในแถว 2) — รวมช่วงคอลัมน์ที่ group เดียวกันติดกัน
  for (let i = 0; i < N; ) {
    const g = PP_COLUMNS[i].group;
    if (!g) { i++; continue; }
    let j = i;
    while (j < N && PP_COLUMNS[j].group === g) j++;
    ws.mergeCells(2, i + 1, 2, j);
    ws.getCell(2, i + 1).value = g;
    i = j;
  }
  ws.getRow(2).height = 18;
  ws.getRow(3).height = 18;

  // แถวข้อมูล (เริ่ม row 4)
  rows.forEach(p => ws.addRow(PP_COLUMNS.map(c => c.value(p))));

  const lastRow = 3 + rows.length;
  const thin = { style: 'thin' as const, color: { argb: 'FFB0B8C4' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };

  for (let r = 1; r <= lastRow; r++) {
    const row = ws.getRow(r);
    if (r >= 4) row.height = 16;        // แถว 1 สูง 42 (โลโก้), แถว 2–3 หัวตาราง
    const p = r >= 4 ? rows[r - 4] : null;
    const st = p ? (STATUS_STYLE[p.status] ?? STATUS_STYLE.ON_PROCESS) : null;
    for (let c = 1; c <= N; c++) {
      const cell = row.getCell(c);
      const def = PP_COLUMNS[c - 1];
      // ไม่ใส่เส้นขอบใต้โลโก้ (คอลัมน์ 1–4 ของแถว 1)
      if (!(r === 1 && c <= 4)) cell.border = border;
      if (r === 1) {
        cell.font = { bold: true, size: c === 5 ? 28 : 9, color: { argb: c === 5 ? 'FF2E7D32' : 'FF64748B' } };
        cell.alignment = { vertical: 'middle', horizontal: c === N ? 'right' : 'left' };
        if (c <= 4) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
      } else if (r === 2 || r === 3) {
        // หัวตาราง: เขียว SYNTECH — ยกเว้น Expected(ส้ม)/Revised(เหลือง)/DONE(เขียว)
        const fill = def.headerColor ? argb(def.headerColor) : (r === 2 ? 'FFD9EAD3' : 'FFEAF3E4');
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
        cell.font = { bold: true, size: 9, color: { argb: def.headerColor === '00B050' ? 'FFFFFFFF' : 'FF1B4332' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      } else {
        cell.font = { size: 9, color: { argb: 'FF1E293B' } };
        cell.alignment = { vertical: 'middle', horizontal: def.center ? 'center' : 'left', wrapText: def.key === 'remark' };
        // Status — ลงสีตามสถานะ
        if (def.key === 'status' && st) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(st.bg) } };
          cell.font = { size: 9, bold: true, color: { argb: argb(st.text) } };
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        }
        // DONE — ติ๊กถูกสีเขียว
        if (def.key === 'done' && p?.done) cell.font = { size: 11, bold: true, color: { argb: 'FF16A34A' } };
      }
    }
  }

  // title font หลัง loop (merge slave overwrite fix)
  const titleCell = ws.getCell(1, 5);
  titleCell.font = { bold: true, size: 28, color: { argb: 'FF2E7D32' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  ws.getCell(1, N).font = { bold: true, size: 9, color: { argb: 'FF64748B' } };
  ws.getCell(1, N).alignment = { vertical: 'middle', horizontal: 'right' };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `production-plan-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

/* ── Donut chart (SVG) ── */
export function Donut({ data, size = 170 }: { data: { label: string; value: number; color: string }[]; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const sw = 18;
  const r = size / 2 - sw / 2 - 2;
  const c = size / 2;
  const C = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', justifyContent: 'center' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="#eef2f7" strokeWidth={sw} />
        {total > 0 && data.filter(d => d.value > 0).map((d, i) => {
          const len = (d.value / total) * C;
          const seg = (
            <circle key={i} cx={c} cy={c} r={r} fill="none" stroke={d.color} strokeWidth={sw}
              strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} transform={`rotate(-90 ${c} ${c})`} />
          );
          offset += len;
          return seg;
        })}
        <text x={c} y={c - 2} textAnchor="middle" fontSize="24" fontWeight="800" fill="#1e293b">{total}</text>
        <text x={c} y={c + 16} textAnchor="middle" fontSize="10" fill="#64748b">รวม</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 130 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem' }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: d.color, flexShrink: 0 }} />
            <span style={{ color: 'var(--text-muted)' }}>{d.label}</span>
            <strong style={{ marginLeft: 'auto', color: '#1e293b' }}>{d.value}</strong>
            <span style={{ color: '#94a3b8', fontSize: '0.72rem', width: 38, textAlign: 'right' }}>{total > 0 ? `${Math.round(d.value / total * 100)}%` : '—'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── chart bits ── */
export function StatCard({ icon, label, value, accent }: { icon: string; label: string; value: number | string; accent: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', background: '#fff', border: '1px solid var(--border-color)', borderRadius: 12, padding: '0.9rem 1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <span style={{ width: 42, height: 42, flexShrink: 0, borderRadius: 11, fontSize: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', background: accent + '1a', color: accent }}>{icon}</span>
      <div style={{ lineHeight: 1.2 }}>
        <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1e293b' }}>{value}</div>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>{label}</div>
      </div>
    </div>
  );
}

export function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.82rem' }}>
      <div style={{ width: 130, textAlign: 'right', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={label}>{label}</div>
      <div style={{ flex: 1, background: 'var(--border-color)', borderRadius: 99, height: 18, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99, minWidth: value > 0 ? 6 : 0, transition: 'width 0.4s' }} />
      </div>
      <div style={{ width: 44, fontWeight: 700, color: '#1e293b' }}>{value.toLocaleString()}</div>
    </div>
  );
}

export function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pp-chart-card" style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: 12, padding: '1.15rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.9rem' }}>{title}</div>
      <div className="stack" style={{ gap: '0.55rem' }}>{children}</div>
    </div>
  );
}

/* ── Add/Edit Project Form (modal) — ปิดได้เฉพาะปุ่มยกเลิก ── */
const EMPTY: Partial<PpProject> = {
  status: 'ON_PROCESS', product_pn: '', model: '', customer: '', qty: 0, syn_requestor: '', work_order: '',
  matl_coming: '', chk_man: false, chk_mac: false, chk_med: false, chk_mat: false,
  pd_pcba: false, pd_bbas: false, pd_test: false, pd_rma: false, pd_prep: false, qa_test_rate: '', pd_pic: '', team_member: 0,
  ok_per_day: 0, total_ng: 0, total_ok: 0, remark: '',
};

/** ฟอร์มกรอกข้อมูลโปรเจกต์ (ใช้ทั้ง inline ในหน้า Add Project และในป๊อปอัพแก้ไข) */
export function ProjectForm({ initial, onSaved, onCancel }: { initial: PpProject | null; onSaved?: () => void; onCancel?: () => void }) {
  const [f, setF] = useState<Partial<PpProject>>(initial ?? EMPTY);
  const [err, setErr] = useState('');
  const create = usePpCreate();
  const update = usePpUpdate();
  const editing = !!initial;
  const set = (k: keyof PpProject, v: any) => setF(p => ({ ...p, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (!f.product_pn?.trim() && !f.model?.trim()) return setErr('ต้องมี Product P/N หรือ Model');
    const mut = editing ? update : create;
    // ตั้งวันที่บันทึกอัตโนมัติ (ไม่มีช่องในฟอร์มตามสเปก แต่ Dashboard ใช้ filter วันที่)
    const payload: any = editing ? { ...f, id: initial!.id } : { ...f, date_record: f.date_record || new Date().toISOString().slice(0, 10) };
    mut.mutate(payload, {
      onSuccess: () => {
        showToast(editing ? 'แก้ไขสำเร็จ' : 'เพิ่มโปรเจกต์สำเร็จ', 'success');
        if (!editing) setF(EMPTY);   // inline create → เคลียร์ฟอร์มให้กรอกต่อ
        onSaved?.();
      },
      onError: (e: any) => setErr(e.message),
    });
  }

  const num = (k: keyof PpProject) => (e: any) => set(k, e.target.value === '' ? 0 : Number(e.target.value));
  const txt = (k: keyof PpProject) => (e: any) => set(k, e.target.value);
  const chk = (k: keyof PpProject) => (e: any) => set(k, e.target.checked);
  // เลือก Date Record → คำนวณ WW (ISO week) ให้อัตโนมัติ
  const onDateRecord = (e: any) => {
    const v = e.target.value;
    setF(p => ({ ...p, date_record: v, wk: v ? isoWeek(v) : null }));
  };
  const Section = ({ title }: { title: string }) => (
    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '0.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: 4 }}>{title}</div>
  );

  return (
        <form onSubmit={submit} className="stack" style={{ gap: '0.7rem' }}>
          <Section title="ข้อมูลหลัก" />
          <div className="grid-3col">
            <label className="field"><span>Status</span>
              <select value={f.status} onChange={txt('status')}>
                {PP_STATUS.map(s => <option key={s} value={s}>{PP_STATUS_LABEL[s]}</option>)}
              </select>
            </label>
            <label className="field"><span>Date Record</span><input type="date" value={f.date_record ?? ''} onChange={onDateRecord} /></label>
            <label className="field"><span>WW (Work Week)</span><input type="number" value={f.wk ?? ''} readOnly title="คำนวณอัตโนมัติจาก Date Record (ISO week)" placeholder="auto" style={{ background: '#f1f5f9' }} /></label>
            <label className="field"><span>Product P/N</span><input value={f.product_pn ?? ''} onChange={txt('product_pn')} placeholder="1E7D..." autoFocus /></label>
            <label className="field"><span>Model</span><input value={f.model ?? ''} onChange={txt('model')} placeholder="Water Level Rice..." /></label>
            <label className="field"><span>QTY</span><input type="number" value={f.qty ?? 0} onChange={num('qty')} /></label>
            <label className="field"><span>Customer</span><input value={f.customer ?? ''} onChange={txt('customer')} /></label>
            <label className="field"><span>WO (Work Order)</span><input value={f.work_order ?? ''} onChange={txt('work_order')} /></label>
          </div>

          <Section title="4M Check & Waiting" />
          <div style={{ display: 'flex', gap: '1.2rem', flexWrap: 'wrap' }}>
            {([['chk_man', 'Man'], ['chk_mac', 'Machine'], ['chk_med', 'Method'], ['chk_mat', 'Material']] as const).map(([k, l]) => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.9rem' }}>
                <input type="checkbox" checked={!!f[k]} onChange={chk(k)} style={{ width: 18, height: 18 }} /> {l}
              </label>
            ))}
          </div>
          <label className="field"><span>Waiting (Mat'l coming)</span><input value={f.matl_coming ?? ''} onChange={txt('matl_coming')} placeholder="Components, PCB, Stencil, etc." /></label>

          <Section title="PD Plan" />
          <div style={{ display: 'flex', gap: '1.2rem', flexWrap: 'wrap' }}>
            {([['pd_pcba', 'PCBA'], ['pd_bbas', 'BBAS'], ['pd_test', 'TEST'], ['pd_rma', 'RMA'], ['pd_prep', 'PREP']] as const).map(([k, l]) => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.9rem' }}>
                <input type="checkbox" checked={!!f[k]} onChange={chk(k)} style={{ width: 18, height: 18 }} /> {l}
              </label>
            ))}
          </div>
          <div className="grid-2col">
            <label className="field"><span>PD Start date</span><input type="date" value={f.pd_start_date ?? ''} onChange={txt('pd_start_date')} /></label>
            <label className="field"><span>PD Finish date</span><input type="date" value={f.pd_finish_date ?? ''} onChange={txt('pd_finish_date')} /></label>
          </div>

          <Section title="QA / Store / กำหนดส่ง" />
          <div className="grid-3col">
            <label className="field"><span>Sampling rate%</span><input value={f.qa_test_rate ?? ''} onChange={txt('qa_test_rate')} placeholder="เช่น 1.00%" /></label>
            <label className="field"><span>QA Finish date</span><input type="date" value={f.qa_finish_date ?? ''} onChange={txt('qa_finish_date')} /></label>
            <label className="field"><span>Store Received</span><input type="date" value={f.store_received ?? ''} onChange={txt('store_received')} /></label>
            <label className="field"><span>Expected date</span><input type="date" value={f.expected_date ?? ''} onChange={txt('expected_date')} /></label>
            <label className="field"><span>Revised date</span><input type="date" value={f.revised_date ?? ''} onChange={txt('revised_date')} /></label>
          </div>

          <Section title="ผู้รับผิดชอบ / ทีม" />
          <div className="grid-2col">
            <label className="field"><span>PD PIC</span><input value={f.pd_pic ?? ''} onChange={txt('pd_pic')} placeholder="Noi,Kiert" /></label>
            <label className="field"><span>Team Member</span><input type="number" value={f.team_member ?? 0} onChange={num('team_member')} /></label>
          </div>

          <Section title="ผลผลิต (PD)" />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', fontWeight: 600 }}>
            <input type="checkbox" checked={!!f.done} onChange={chk('done')} style={{ width: 18, height: 18 }} /> ✅ DONE (งานเสร็จแล้ว)
          </label>
          <div className="grid-3col">
            <label className="field"><span>OK/Day</span><input type="number" value={f.ok_per_day ?? 0} onChange={num('ok_per_day')} /></label>
            <label className="field"><span>Total NG</span><input type="number" value={f.total_ng ?? 0} onChange={num('total_ng')} /></label>
            <label className="field"><span>Total OK</span><input type="number" value={f.total_ok ?? 0} onChange={num('total_ok')} /></label>
            <label className="field"><span>Yield (คำนวณเอง)</span><input value={ppYield({ total_ok: f.total_ok ?? 0, total_ng: f.total_ng ?? 0 })?.toFixed(1) ?? '—'} readOnly style={{ background: '#f1f5f9' }} /></label>
          </div>

          <label className="field"><span>Remark</span><textarea value={f.remark ?? ''} onChange={txt('remark')} rows={2} /></label>

          {err && <div className="notice err">{err}</div>}
          <div className="modal-actions">
            {onCancel && <button type="button" className="btn secondary" onClick={onCancel}>ยกเลิก</button>}
            <button type="submit" className="btn" disabled={create.isPending || update.isPending}>
              {editing ? 'บันทึกการแก้ไข' : 'เพิ่มโปรเจกต์'}
            </button>
          </div>
        </form>
  );
}

/** ป๊อปอัพแก้ไข (wrap ProjectForm) — ปิดได้เฉพาะปุ่มยกเลิก */
export function ProjectFormModal({ initial, onClose }: { initial: PpProject | null; onClose: () => void }) {
  return (
    <div className="modal-overlay">
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 'min(100%, 720px)', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 className="panel__title" style={{ marginBottom: '1rem' }}>{initial ? 'แก้ไขโปรเจกต์' : 'เพิ่มโปรเจกต์ (Add Project)'}</h2>
        <ProjectForm initial={initial} onSaved={onClose} onCancel={onClose} />
      </div>
    </div>
  );
}
