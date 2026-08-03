import { PP_STATUS, PP_STATUS_LABEL, ppYield, type PpProject } from '../../lib/ppApi';
import { SYNTECH_LOGO_PNG_BASE64 } from '../../assets/syntechLogo';

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
  DONE:        { bg: '#4ade80', text: '#14532d', border: '#16a34a' },   // เขียวสด = Done
  ON_PROCESS:  { bg: '#38bdf8', text: '#0c4a6e', border: '#0284c7' },   // ฟ้าสด = On process / Normal
  DELAY:       { bg: '#f87171', text: '#7f1d1d', border: '#dc2626' },   // แดง = Delay / Late (เตือนงานล่าช้า)
  CANCEL:      { bg: '#94a3b8', text: '#1e293b', border: '#64748b' },   // เทา = Cancel (เฉพาะ Status หลัก)
  WAIT:        { bg: '#94a3b8', text: '#1e293b', border: '#64748b' },   // เทา = รอ (Waiting) — ใช้ในช่อง Process
  PROCESS:     { bg: '#2dd4bf', text: '#134e4a', border: '#0d9488' },   // ฟ้าอมเขียว (teal) = Status ที่เป็นชื่อ process step
  // ── สีเพิ่มเติม — ให้เลือกเองได้อิสระจากช่อง Status (ไม่ผูกความหมายสถานะ แค่เป็นตัวเลือกสี) ──
  RED:      { bg: '#f87171', text: '#7f1d1d', border: '#dc2626' },
  ORANGE:   { bg: '#fb923c', text: '#7c2d12', border: '#ea580c' },
  AMBER:    { bg: '#fcd34d', text: '#78350f', border: '#d97706' },
  YELLOW:   { bg: '#facc15', text: '#713f12', border: '#ca8a04' },
  LIME:     { bg: '#a3e635', text: '#365314', border: '#65a30d' },
  GREEN:    { bg: '#22c55e', text: '#14532d', border: '#16a34a' },
  EMERALD:  { bg: '#34d399', text: '#064e3b', border: '#059669' },
  CYAN:     { bg: '#22d3ee', text: '#164e63', border: '#0891b2' },
  BLUE:     { bg: '#60a5fa', text: '#1e3a8a', border: '#2563eb' },
  INDIGO:   { bg: '#818cf8', text: '#312e81', border: '#4f46e5' },
  VIOLET:   { bg: '#a78bfa', text: '#4c1d95', border: '#7c3aed' },
  PURPLE:   { bg: '#c084fc', text: '#581c87', border: '#9333ea' },
  FUCHSIA:  { bg: '#e879f9', text: '#701a75', border: '#c026d3' },
  PINK:     { bg: '#f472b6', text: '#831843', border: '#db2777' },
  ROSE:     { bg: '#fb7185', text: '#881337', border: '#e11d48' },
  BROWN:    { bg: '#a8a29e', text: '#292524', border: '#78716c' },
};

// สถานะของแต่ละ Process step — ต่างจาก Status หลัก: ใช้ "รอ (Waiting)" แทน "Cancel" (ว่าง = ไม่มี/ยังไม่บันทึก)
export const PROC_STATUS = ['WAIT', 'ON_PROCESS', 'DONE', 'DELAY'] as const;
export const PROC_STATUS_LABEL: Record<string, string> = {
  WAIT: 'Waiting', ON_PROCESS: 'On process', DONE: 'Done', DELAY: 'Delay',
};

// Process steps (ตาม FM03) — แต่ละ step เก็บสถานะ ('' | PP_STATUS) → โชว์เป็นช่องสีในตาราง
export const PROCESS_STEPS: { key: keyof PpProject; label: string }[] = [
  { key: 'pc_prpo',     label: 'PR/PO' },
  { key: 'pc_wait',     label: "Wait Mat'l" },
  { key: 'pc_incoming', label: 'In Coming' },
  { key: 'pc_smt',      label: 'SMT' },
  { key: 'pc_thr',      label: 'THR' },
  { key: 'pc_test',     label: 'TEST' },
  { key: 'pc_bbas',     label: 'BBAS' },
  { key: 'pc_packing',  label: 'Packing' },
];
export const PROCESS_KEYS = new Set<string>(PROCESS_STEPS.map(s => s.key as string));

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.ON_PROCESS;
  return (
    <span style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}`, padding: '2px 10px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
      {label ?? PP_STATUS_LABEL[status] ?? status}
    </span>
  );
}

// ใกล้ครบกำหนด (revised/expected date) ภายในกี่วัน → เตือนสีส้มอัตโนมัติ ก่อนจะกลายเป็นแดง (เดิมมีแค่ปุ่มเลือกสีเอง)
// ปรับตัวเลขนี้ได้ตามที่ทีมตกลงกัน (transcript พูดถึงทั้ง 1-2 และ 1-3 วัน — ใช้ 3 เป็นค่าเริ่มต้น)
export const DUE_SOON_DAYS = 3;

// แสดงผลช่อง Status — status เก็บได้ทั้ง 4 สถานะ (DONE/ON_PROCESS/DELAY/CANCEL) หรือชื่อ process step (เช่น "SMT")
// · ถ้าเป็น process step → โชว์ชื่อ step + สีเหลือง (เหมือน Delay) · status_color = สีที่กดเปลี่ยนเองในตาราง (ทับได้ ชนะทุกกรณี)
// · ON_PROCESS ที่ยังไม่เลยกำหนดแต่เหลือ <= DUE_SOON_DAYS วัน (เทียบจาก revised_date ถ้ามี ไม่งั้น expected_date) → ขึ้นส้มอัตโนมัติ
//   (ไม่แตะ DELAY/DONE/CANCEL ที่เป็นสถานะชัดเจนอยู่แล้ว — เฉพาะ ON_PROCESS ที่ยังไม่มีใครตั้งสีเองเท่านั้น)
// ⚠️ ProjectFormModal auto-fill status_color = status ทุกครั้งที่บันทึกถ้าไม่ได้เลือกสีเอง (ดู pp/ProjectForm.tsx)
//    → status_color เกือบทุก record จะไม่ว่างเปล่าอยู่แล้ว เทียบแค่ "!empty" จะไม่มีทาง auto-orange ทำงานเลย
//    ต้องเทียบว่า status_color ต่างจาก status จริงๆ (คนละสีกับ default) ถึงจะถือว่า "ตั้งสีเองไว้แล้ว"
export function statusView(p: Partial<PpProject>): { label: string; colorKey: string } {
  const st = (p.status || '') as string;
  const isStd = (PP_STATUS as readonly string[]).includes(st);
  const label = PP_STATUS_LABEL[st] ?? st;
  const hasCustomColor = !!p.status_color && p.status_color !== st;
  if (hasCustomColor) return { label, colorKey: p.status_color! };

  if (st === 'ON_PROCESS') {
    const dueStr = p.revised_date || p.expected_date;
    const due = dueStr ? new Date(String(dueStr).slice(0, 10) + 'T00:00:00') : null;
    if (due && !isNaN(due.getTime())) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const daysLeft = Math.round((due.getTime() - today.getTime()) / 86400000);
      if (daysLeft >= 0 && daysLeft <= DUE_SOON_DAYS) return { label, colorKey: 'ORANGE' };
    }
  }

  const colorKey = isStd ? st : 'PROCESS';   // process step (ไม่ใช่ 4 สถานะ) = ฟ้าอมเขียว (teal)
  return { label, colorKey };
}


/* ── นิยามคอลัมน์ชุดเดียว — เรียงตามตาราง Dashboard (สำคัญขึ้นก่อน) ──
   ใช้ร่วมกันทั้ง Dashboard table / Excel / PDF เพื่อให้ลำดับตรงกันเสมอ
   headerColor = สีหัวคอลัมน์พิเศษ (hex 6 หลัก ไม่มี #) · center = จัดกึ่งกลาง */
export type PpCol = { key: string; header: string; w: number; center?: boolean; headerColor?: string; group?: string; excelOnly?: boolean; value: (p: PpProject) => string };

/* ── นิยามคอลัมน์ชุดเดียว — กลุ่ม WO/Type/PD PLAN/PIC (หัวบน + ย่อยล่าง) ──
   ใช้ร่วมกัน: Dashboard table (กรอง excelOnly ออก) · Excel/PDF (ครบทุกคอลัมน์)
   excelOnly = โชว์เฉพาะ Excel/PDF (เช่น STATUS pipeline) ไม่โชว์ในตาราง Dashboard */
export const XLSX_COLUMNS: PpCol[] = [
  // 3 อันแรก: Model → Product P/N → Status
  { key: 'model',        header: 'MODEL',       w: 26, value: p => p.model || '' },
  { key: 'product_pn',   header: 'Product P/N', w: 18, value: p => p.product_pn || '' },
  { key: 'status',       header: 'Status',      w: 13, center: true, value: p => statusView(p).label },
  // PRODUCTION RECORD — Quantity / Produced / Balance / Total FG / Total NG / Yield
  { key: 'qty',        header: 'Quantity', w: 8, center: true, group: 'PRODUCTION RECORD', value: p => (p.qty != null ? String(p.qty) : '') },
  { key: 'produce',    header: 'Produced', w: 8, center: true, group: 'PRODUCTION RECORD', value: p => (p.produce ? String(p.produce) : '') },
  { key: 'balanced',   header: 'Balance',  w: 8, center: true, group: 'PRODUCTION RECORD', value: p => String((p.qty || 0) - (p.produce || 0)) },
  { key: 'total_ok',   header: 'Total FG', w: 8, center: true, group: 'PRODUCTION RECORD', value: p => (p.total_ok != null ? String(p.total_ok) : '') },
  { key: 'total_ng',   header: 'Total NG', w: 8, center: true, group: 'PRODUCTION RECORD', value: p => (p.total_ng != null ? String(p.total_ng) : '') },
  { key: 'yield',      header: 'Yield',    w: 8, center: true, group: 'PRODUCTION RECORD', value: p => { const y = ppYield(p); return y == null ? '' : `${y.toFixed(2)}%`; } },
  // PD PLAN — PD Start / PD Done / Expected date / CAP·DAY
  { key: 'pd_start',   header: 'PD Start',      w: 12, center: true, group: 'PD PLAN', value: p => xlsxDate(p.pd_start_date) },
  { key: 'pd_finish',  header: 'PD Done',       w: 12, center: true, group: 'PD PLAN', value: p => xlsxDate(p.pd_finish_date) },
  { key: 'expected',   header: 'Expected date',  w: 12, center: true, headerColor: 'FFC000', group: 'PD PLAN', value: p => xlsxDate(p.expected_date) },
  { key: 'cap_day',    header: 'CAP / DAY',      w: 16, center: true, group: 'PD PLAN', value: p => (p.target_per_day ? String(p.target_per_day) : '') },
  // Customer group — Owner / Company name
  { key: 'syn_requestor', header: 'Owner',        w: 14, center: true, headerColor: '4472C4', group: 'Customer', value: p => p.syn_requestor || '' },
  { key: 'customer',      header: 'Company name', w: 16, group: 'Customer', value: p => p.customer || '' },
  // WO group — Date record / WO No. / Bom Rec (วันที่รับ BOM)
  { key: 'date_record',  header: 'Date record', w: 14, center: true, group: 'WO', value: p => { const d = xlsxDate(p.date_record); return d ? (p.wk != null ? `${d}\n(WW${p.wk})` : d) : ''; } },
  { key: 'work_order',   header: 'WO No.',      w: 12, center: true, group: 'WO', value: p => p.work_order || '' },
  { key: 'bom_rec',      header: 'Bom Rec',     w: 12, center: true, group: 'WO', value: p => xlsxDate((p as any).bom_rec_date) },
  // Process — 8 step โชว์เป็นช่องสี (ค่าจริงอ่านจาก p[key] ตอน render/export · value ว่างไว้)
  ...PROCESS_STEPS.map((s): PpCol => ({ key: s.key as string, header: s.label, w: 7, center: true, group: 'Process', value: () => '' })),
  // QA — Sampling% / QA Finish / Status
  { key: 'qa_test_rate', header: 'Sampling%', w: 10, center: true, group: 'QA', value: p => p.qa_test_rate || '' },
  { key: 'qa_finish',    header: 'QA Finish', w: 12, center: true, group: 'QA', value: p => xlsxDate(p.qa_finish_date) },
  { key: 'qa_status',    header: 'Status',    w: 11, center: true, group: 'QA', value: p => p.qa_status ? (PP_STATUS_LABEL[p.qa_status] ?? p.qa_status) : '' },
  { key: 'store',      header: 'Received date', w: 12, center: true, group: 'Store', value: p => xlsxDate(p.store_received) },
  // PIC — ช่องเดียว (รวม Responsible เดิมออก)
  { key: 'pd_pic',        header: 'PIC Name',    w: 14, value: p => p.pd_pic || '' },
  { key: 'special_request', header: 'Special request', w: 22, value: p => p.special_request || '' },
  // Revised date — ก่อน Remark
  { key: 'revised',    header: 'Revised date', w: 13, center: true, headerColor: 'FFFF00', value: p => xlsxDate(p.revised_date) },
  // Delivery date — วันส่งมอบลูกค้า (ต่างจาก Expected/Revised ที่เป็นวันเสร็จผลิตภายใน) · remark แยกไว้ excelOnly
  // (ในตาราง Dashboard โผล่เป็นดอกจัน (*) + hover บนช่อง Delivery date แทน ไม่กินที่เป็นคอลัมน์แยก — ดู renderCell)
  { key: 'delivery',        header: 'Delivery date',    w: 13, center: true, headerColor: 'FFC000', value: p => xlsxDate(p.delivery_date) },
  { key: 'delivery_remark', header: 'Delivery remark',  w: 24, excelOnly: true, value: p => p.delivery_remark || '' },
  { key: 'remark',     header: 'Remark', w: 34, value: p => p.remark || '' },
];

/* คอลัมน์สำหรับตาราง Dashboard บนจอ — ตัด excelOnly (STATUS pipeline) ออก */
export const DASH_COLUMNS: PpCol[] = XLSX_COLUMNS.filter(c => !c.excelOnly);

/* ── สร้างโครงหัวตาราง 2 ชั้นจาก cols (ใช้ร่วม Dashboard HTML + PDF ให้ตรงกับ Excel) ──
   groupRow = แถวบน (คอลัมน์ไม่มีกลุ่ม rowSpan=2, กลุ่ม colSpan=จำนวนสมาชิก)
   subRow   = แถวล่าง เฉพาะหัวย่อยของคอลัมน์ที่อยู่ในกลุ่ม (เรียงซ้าย→ขวา) */
export type HeaderCell = { label: string; colSpan: number; rowSpan: number; headerColor?: string; center?: boolean; key?: string };
export function buildHeaderRows(cols: PpCol[]): { groupRow: HeaderCell[]; subRow: HeaderCell[] } {
  const groupRow: HeaderCell[] = [];
  const subRow: HeaderCell[] = [];
  for (let i = 0; i < cols.length; ) {
    const g = cols[i].group;
    if (!g) {
      groupRow.push({ label: cols[i].header, colSpan: 1, rowSpan: 2, headerColor: cols[i].headerColor, center: cols[i].center, key: cols[i].key });
      i++;
    } else {
      let j = i;
      while (j < cols.length && cols[j].group === g) j++;
      groupRow.push({ label: g, colSpan: j - i, rowSpan: 1, center: true });
      for (let k = i; k < j; k++) subRow.push({ label: cols[k].header, colSpan: 1, rowSpan: 1, headerColor: cols[k].headerColor, center: cols[k].center, key: cols[k].key });
      i = j;
    }
  }
  return { groupRow, subRow };
}

/* ── Excel (.xlsx) export — ตาม XLSX_COLUMNS + หัวซ้อน 2 ชั้น (กลุ่ม PM/4M/PD) + โลโก้/สี SYNTECH ── */
export async function exportXlsx(rows: PpProject[], filename?: string) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  // ล็อกหัวตาราง 3 แถวบน + คอลัมน์ด้านหน้า 5 คอลัมน์ (Status/Date record/WO/Model/Product P/N) ให้ค้างตอนเลื่อน
  const ws = wb.addWorksheet('Production Plan', { views: [{ state: 'frozen', xSplit: 5, ySplit: 3, showGridLines: false }] });
  const COLS = XLSX_COLUMNS;
  const N = COLS.length;

  ws.columns = COLS.map(c => ({ width: c.w }));

  // แถว 1 — โลโก้ SYNTECH (มุมบนซ้าย) + หัวเรื่อง + รหัสฟอร์ม
  ws.getRow(1).height = 42;
  const logoId = wb.addImage({ base64: SYNTECH_LOGO_PNG_BASE64, extension: 'png' });
  ws.addImage(logoId, { tl: { col: 0.15, row: 0.15 }, ext: { width: 210, height: 48 } });
  ws.mergeCells(1, 5, 1, 11);          // E1:K1 = หัวเรื่อง
  ws.getCell(1, 5).value = 'Production Plan Internal';
  ws.getCell(1, N).value = 'FM03 Rev.01 Ref.EN-P-01';

  // แถว 2–3 — หัวตาราง 2 ชั้น: คอลัมน์ปกติ merge แนวตั้งคร่อม 2 แถว, กลุ่ม (4M/PD) มีหัวกลุ่มแถว 2 + หัวย่อยแถว 3
  for (let i = 0; i < N; i++) {
    const col = i + 1;
    const def = COLS[i];
    if (def.group) {
      ws.getCell(3, col).value = def.header;        // หัวย่อยอยู่แถว 3
    } else {
      ws.getCell(2, col).value = def.header;
      ws.mergeCells(2, col, 3, col);                // ไม่มีกลุ่ม → merge แนวตั้งคร่อม 2 แถว
    }
  }
  // หัวกลุ่ม (merge แนวนอนในแถว 2) — รวมช่วงคอลัมน์ที่ group เดียวกันติดกัน
  for (let i = 0; i < N; ) {
    const g = COLS[i].group;
    if (!g) { i++; continue; }
    let j = i;
    while (j < N && COLS[j].group === g) j++;
    if (j - i > 1) ws.mergeCells(2, i + 1, 2, j);   // กลุ่มหลายคอลัมน์ → merge แนวนอน; กลุ่มคอลัมน์เดียว (PM) → ไม่ต้อง merge
    ws.getCell(2, i + 1).value = g;
    i = j;
  }
  ws.getRow(2).height = 18;
  ws.getRow(3).height = 18;

  // แถวข้อมูล (เริ่ม row 4)
  rows.forEach(p => ws.addRow(COLS.map(c => c.value(p))));

  const lastRow = 3 + rows.length;
  const thin = { style: 'thin' as const, color: { argb: 'FFB0B8C4' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };

  for (let r = 1; r <= lastRow; r++) {
    const row = ws.getRow(r);
    if (r >= 4) row.height = 16;        // แถว 1 สูง 42 (โลโก้), แถว 2–3 หัวตาราง
    const p = r >= 4 ? rows[r - 4] : null;
    const rowSt = p ? (STATUS_STYLE[statusView(p).colorKey] ?? STATUS_STYLE.ON_PROCESS) : null;   // สีคอลัมน์ Status (process step = เหลือง · status_color ทับได้)
    const qaSt = p && p.qa_status ? (STATUS_STYLE[p.qa_status] ?? STATUS_STYLE.ON_PROCESS) : null;  // สีช่อง QA·Status (แยกจากงาน)
    for (let c = 1; c <= N; c++) {
      const cell = row.getCell(c);
      const def = COLS[c - 1];
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
        const whiteHdr = def.headerColor === '00B050' || def.headerColor === '4472C4';
        cell.font = { bold: true, size: 9, color: { argb: whiteHdr ? 'FFFFFFFF' : 'FF1B4332' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      } else {
        cell.font = { size: 9, color: { argb: 'FF1E293B' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: def.key === 'remark' || def.key === 'date_record' };
        // Status (คอลัมน์แรก) — ลงสีตามสถานะงาน
        if (def.key === 'status' && rowSt) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(rowSt.bg) } };
          cell.font = { size: 9, bold: true, color: { argb: argb(rowSt.text) } };
        }
        // QA · Status — ลงสีตามสถานะ QA (แยกจากงาน)
        if (def.key === 'qa_status' && qaSt) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(qaSt.bg) } };
          cell.font = { size: 9, bold: true, color: { argb: argb(qaSt.text) } };
        }
        // Process — แต่ละ step ลงสีตามสถานะของ step นั้น (ว่าง = ไม่ลงสี)
        if (PROCESS_KEYS.has(def.key) && p) {
          const pv = (p as any)[def.key];
          if (pv && STATUS_STYLE[pv]) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(STATUS_STYLE[pv].bg) } };
        }
        // PD Done / QA Finish — มีวันที่ = เสร็จ → พื้นเขียว
        if ((def.key === 'pd_finish' || def.key === 'qa_finish') && p && def.value(p)) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
          cell.font = { size: 9, bold: true, color: { argb: 'FF166534' } };
        }
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
  a.href = url; a.download = filename || `production-plan-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}
