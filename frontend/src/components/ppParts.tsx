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

/* ── Excel (.xlsx) export — ออกมาตามฟอร์มบอส FM03 เป๊ะ: merge cell + เส้นกรอบ + สีหัวตาราง, 30 คอลัมน์ A–AD ── */
export async function exportXlsx(rows: PpProject[]) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Production Plan', { views: [{ state: 'frozen', ySplit: 3, showGridLines: false }] });

  // ความกว้างคอลัมน์ A–AD (30 คอลัมน์)
  const widths = [11, 5, 12, 17, 28, 7, 14, 13, 14, 5, 5, 5, 5, 7, 7, 7, 11, 11, 9, 11, 12, 12, 12, 7, 11, 13, 8, 9, 9, 32];
  ws.columns = widths.map(w => ({ width: w }));

  // แถว 1 — โลโก้ SYNTECH (มุมบนซ้าย A1:C1) + หัวเรื่อง + รหัสฟอร์ม
  ws.getRow(1).height = 42;
  const logoId = wb.addImage({ base64: SYNTECH_LOGO_PNG_BASE64, extension: 'png' });
  ws.addImage(logoId, { tl: { col: 0.15, row: 0.15 }, ext: { width: 210, height: 48 } });
  ws.mergeCells('E1:I1');
  ws.getCell('E1').value = 'Production Plan';
  ws.getCell('AD1').value = 'FM03 Rev.01 Ref.EN-P-01';

  // แถว 2 — หัวกลุ่ม (label อยู่ช่องแรกของกลุ่ม)
  ws.getRow(2).values = ['Status', 'WK', 'DATE Record', 'Product P/N', 'MODEL', 'QTY', 'SYN Requestor',
    'PM', 'SC', '4M Check', '', '', '', 'PD Plan', '', '', '', '', 'QA', '', 'Store',
    'Expected date', 'Revised date', 'DONE', 'PD PIC', 'Team Member', 'OK/DAY', 'TOTAL NG', 'TOTAL OK', 'Remark'];
  // แถว 3 — หัวย่อย (เฉพาะคอลัมน์ที่มีกลุ่ม)
  ws.getRow(3).values = ['', '', '', '', '', '', '',
    'Work Order.', "Mat'l coming", 'Man', 'Mac', 'Med', 'Mat',
    'PCBA', 'BBAS', 'TEST', 'Start date', 'Finish date', 'Test rate%', 'Finish date', 'Received date',
    '', '', '', '', '', '', '', '', ''];

  // merge ตามฟอร์มจริง
  ['A2:A3', 'B2:B3', 'C2:C3', 'D2:D3', 'E2:E3', 'F2:F3', 'G2:G3',
    'J2:M2', 'N2:R2', 'S2:T2',
    'V2:V3', 'W2:W3', 'X2:X3', 'Y2:Y3', 'Z2:Z3', 'AA2:AA3', 'AB2:AB3', 'AC2:AC3', 'AD2:AD3',
  ].forEach(r => ws.mergeCells(r));

  // แถวข้อมูล (เริ่ม row 4)
  rows.forEach(p => {
    ws.addRow([
      PP_STATUS_LABEL[p.status] ?? p.status, p.wk ?? '', xlsxDate(p.date_record), p.product_pn, p.model, p.qty, p.syn_requestor ?? '',
      p.work_order ?? '', p.matl_coming ?? '',
      yesNo(p.chk_man), yesNo(p.chk_mac), yesNo(p.chk_med), yesNo(p.chk_mat),
      yesNo(p.pd_pcba), yesNo(p.pd_bbas), yesNo(p.pd_test), xlsxDate(p.pd_start_date), xlsxDate(p.pd_finish_date),
      p.qa_test_rate ?? '', xlsxDate(p.qa_finish_date), xlsxDate(p.store_received),
      xlsxDate(p.expected_date), xlsxDate(p.revised_date), yesNo(p.done),
      p.pd_pic ?? '', p.team_member ?? '', p.ok_per_day ?? '', p.total_ng ?? '', p.total_ok ?? '', p.remark ?? '',
    ]);
  });

  const lastRow = 3 + rows.length;
  const thin = { style: 'thin' as const, color: { argb: 'FFB0B8C4' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };

  // สไตล์ทั้งตาราง (row 1–lastRow, col 1–30)
  for (let r = 1; r <= lastRow; r++) {
    const row = ws.getRow(r);
    if (r >= 2) row.height = r <= 3 ? 18 : 16;     // แถว 1 คงสูง 42 (มีโลโก้)
    const p = r > 3 ? rows[r - 4] : null;
    const st = p ? (STATUS_STYLE[p.status] ?? STATUS_STYLE.ON_PROCESS) : null;
    for (let c = 1; c <= 30; c++) {
      const cell = row.getCell(c);
      // ไม่ใส่เส้นขอบเซลล์ A1–D1 (ใต้โลโก้) จะได้ไม่มีเส้นทับรูป
      if (!(r === 1 && c <= 4)) cell.border = border;
      if (r === 1) {
        // หัวเรื่อง: ชื่อ "Production Plan" ตัวใหญ่สีเขียว SYNTECH, รหัสฟอร์มชิดขวา
        cell.font = { bold: true, size: c === 5 ? 28 : 9, color: { argb: c === 5 ? 'FF2E7D32' : 'FF64748B' } };
        cell.alignment = { vertical: 'middle', horizontal: c === 30 ? 'right' : 'left' };
        // พื้นขาวใต้โลโก้ (A1–D1) กัน gridline ทะลุพื้นโปร่งของรูป
        if (c <= 4) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
      } else if (r <= 3) {
        // หัวตาราง: โทนเขียว SYNTECH — ยกเว้น Expected(ส้ม) / Revised(เหลือง) / DONE(เขียว) ตามฟอร์ม
        const vivid = c === 22 ? 'FFFFC000' : c === 23 ? 'FFFFFF00' : c === 24 ? 'FF00B050' : null;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: vivid ?? (r === 2 ? 'FFD9EAD3' : 'FFEAF3E4') } };
        cell.font = { bold: true, size: 9, color: { argb: c === 24 ? 'FFFFFFFF' : 'FF1B4332' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      } else {
        cell.font = { size: 9, color: { argb: 'FF1E293B' } };
        cell.alignment = { vertical: 'middle', horizontal: c >= 10 && c <= 24 ? 'center' : 'left', wrapText: c === 30 };
        // คอลัมน์ Status (c=1) ลงสีตามสถานะ ให้เหมือนฟอร์ม
        if (c === 1 && st) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(st.bg) } };
          cell.font = { size: 9, bold: true, color: { argb: argb(st.text) } };
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        }
        // DONE (c=24) ติ๊กถูกเป็นสีเขียว
        if (c === 24 && p?.done) cell.font = { size: 11, bold: true, color: { argb: 'FF16A34A' } };
      }
    }
  }

  // ตั้ง font ของ title หลัง loop — เพราะ E1:I1 merge ทำให้ slave cell (F1..I1) ไปทับ master E1 ใน loop
  const titleCell = ws.getCell('E1');
  titleCell.font = { bold: true, size: 28, color: { argb: 'FF2E7D32' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  ws.getCell('AD1').font = { bold: true, size: 9, color: { argb: 'FF64748B' } };
  ws.getCell('AD1').alignment = { vertical: 'middle', horizontal: 'right' };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `production-plan-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
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
  pd_pcba: false, pd_bbas: false, pd_test: false, qa_test_rate: '', pd_pic: '', team_member: 0,
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
            <label className="field"><span>WK</span><input type="number" value={f.wk ?? ''} onChange={num('wk')} /></label>
            <label className="field"><span>Date Record</span><input type="date" value={f.date_record ?? ''} onChange={txt('date_record')} /></label>
            <label className="field"><span>Product P/N</span><input value={f.product_pn ?? ''} onChange={txt('product_pn')} placeholder="1E7D..." /></label>
            <label className="field"><span>Model</span><input value={f.model ?? ''} onChange={txt('model')} placeholder="Water Level Rice..." /></label>
            <label className="field"><span>QTY</span><input type="number" value={f.qty ?? 0} onChange={num('qty')} /></label>
            <label className="field"><span>Customer</span><input value={f.customer ?? ''} onChange={txt('customer')} /></label>
            <label className="field"><span>WO (Work Order)</span><input value={f.work_order ?? ''} onChange={txt('work_order')} /></label>
          </div>

          <Section title="Waiting & 4M Check" />
          <label className="field"><span>Waiting (Mat'l coming)</span><input value={f.matl_coming ?? ''} onChange={txt('matl_coming')} placeholder="Components, PCB, Stencil, etc." /></label>
          <div style={{ display: 'flex', gap: '1.2rem', flexWrap: 'wrap' }}>
            {([['chk_man', 'Man'], ['chk_mac', 'Machine'], ['chk_med', 'Method'], ['chk_mat', 'Material']] as const).map(([k, l]) => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.9rem' }}>
                <input type="checkbox" checked={!!f[k]} onChange={chk(k)} style={{ width: 18, height: 18 }} /> {l}
              </label>
            ))}
          </div>

          <Section title="PD Plan" />
          <div style={{ display: 'flex', gap: '1.2rem', flexWrap: 'wrap' }}>
            {([['pd_pcba', 'PCBA'], ['pd_bbas', 'BBAS'], ['pd_test', 'TEST']] as const).map(([k, l]) => (
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
            <label className="field"><span>QA Test rate%</span><input value={f.qa_test_rate ?? ''} onChange={txt('qa_test_rate')} placeholder="เช่น 1.00%" /></label>
            <label className="field"><span>QA Finish date</span><input type="date" value={f.qa_finish_date ?? ''} onChange={txt('qa_finish_date')} /></label>
            <label className="field"><span>Store Received</span><input type="date" value={f.store_received ?? ''} onChange={txt('store_received')} /></label>
            <label className="field"><span>Expected date</span><input type="date" value={f.expected_date ?? ''} onChange={txt('expected_date')} /></label>
            <label className="field"><span>Revised date</span><input type="date" value={f.revised_date ?? ''} onChange={txt('revised_date')} /></label>
          </div>

          <Section title="ผลผลิต (PD)" />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', fontWeight: 600 }}>
            <input type="checkbox" checked={!!f.done} onChange={chk('done')} style={{ width: 18, height: 18 }} /> ✅ DONE (งานเสร็จแล้ว)
          </label>
          <div className="grid-3col">
            <label className="field"><span>PD PIC</span><input value={f.pd_pic ?? ''} onChange={txt('pd_pic')} placeholder="Noi,Kiert" /></label>
            <label className="field"><span>Team Member</span><input type="number" value={f.team_member ?? 0} onChange={num('team_member')} /></label>
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
