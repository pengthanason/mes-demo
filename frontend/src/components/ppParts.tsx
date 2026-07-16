import { useEffect, useRef, useState } from 'react';
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
  DONE:        { bg: '#4ade80', text: '#14532d', border: '#16a34a' },   // เขียวสด = Done
  ON_PROCESS:  { bg: '#38bdf8', text: '#0c4a6e', border: '#0284c7' },   // ฟ้าสด = On process / Normal
  DELAY:       { bg: '#fbbf24', text: '#78350f', border: '#d97706' },   // ส้ม/เหลืองอำพัน = Delay / Late
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
  WAIT: 'รอ (Waiting)', ON_PROCESS: 'On process', DONE: 'Done', DELAY: 'Delay',
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

// Status หน้า = ดึงจาก Process อัตโนมัติ — รองรับทั้ง checkbox (ติ๊ก=DONE) และ click-cycle 4 สถานะในตาราง
// ลำดับความสำคัญ: Delay > On process > (ครบทุก step = Done) > ทำบางส่วน (step ถัดไป = On process) > Cancel > status ที่เก็บไว้
export function deriveStatus(p: Partial<PpProject>): { key: string; label: string } {
  const vals = PROCESS_STEPS.map(s => ({ label: s.label, v: (p as any)[s.key] as string }));
  const fallback = () => { const s = p.status || 'ON_PROCESS'; return { key: s, label: PP_STATUS_LABEL[s] ?? s }; };
  if (!vals.some(x => x.v)) return fallback();
  const delay = vals.find(x => x.v === 'DELAY');
  if (delay) return { key: 'DELAY', label: delay.label };
  const onproc = vals.find(x => x.v === 'ON_PROCESS');
  if (onproc) return { key: 'ON_PROCESS', label: onproc.label };
  if (vals.every(x => x.v === 'DONE')) return { key: 'DONE', label: 'Done' };
  if (vals.some(x => x.v === 'DONE')) {                     // ทำบางส่วน → step ถัดไปที่ยังไม่เสร็จ = กำลังทำ
    const next = vals.find(x => x.v !== 'DONE');
    return { key: 'ON_PROCESS', label: next ? next.label : 'On process' };
  }
  const cancel = vals.find(x => x.v === 'CANCEL');
  if (cancel) return { key: 'CANCEL', label: cancel.label };
  return fallback();
}

// แสดงผลช่อง Status — status เก็บได้ทั้ง 4 สถานะ (DONE/ON_PROCESS/DELAY/CANCEL) หรือชื่อ process step (เช่น "SMT")
// · ถ้าเป็น process step → โชว์ชื่อ step + สีเหลือง (เหมือน Delay) · status_color = สีที่กดเปลี่ยนเองในตาราง (ทับได้)
export function statusView(p: Partial<PpProject>): { label: string; colorKey: string } {
  const st = (p.status || '') as string;
  const isStd = (PP_STATUS as readonly string[]).includes(st);
  const label = PP_STATUS_LABEL[st] ?? st;
  const colorKey = p.status_color || (isStd ? st : 'PROCESS');   // process step (ไม่ใช่ 4 สถานะ) = ฟ้าอมเขียว (teal)
  return { label, colorKey };
}


/* ── นิยามคอลัมน์ชุดเดียว — เรียงตามตาราง Dashboard (สำคัญขึ้นก่อน) ──
   ใช้ร่วมกันทั้ง Dashboard table / Excel / PDF เพื่อให้ลำดับตรงกันเสมอ
   headerColor = สีหัวคอลัมน์พิเศษ (hex 6 หลัก ไม่มี #) · center = จัดกึ่งกลาง */
export type PpCol = { key: string; header: string; w: number; center?: boolean; headerColor?: string; group?: string; excelOnly?: boolean; value: (p: PpProject) => string };

/* STATUS pipeline (ขั้นตอนการผลิต) — ลำดับ + ป้าย · ใช้ทั้งฟอร์มและ Excel (ไม่โชว์ตาราง Dashboard) */
export const PP_PIPELINE: { key: keyof PpProject; label: string }[] = [
  { key: 'st_pr_po',     label: 'PR/PO' },
  { key: 'st_wait_mat',  label: "Wait Mat'l" },
  { key: 'st_incoming',  label: 'Incoming' },
  { key: 'st_create_bo', label: 'Create BOM' },
  { key: 'st_test',      label: 'Test' },
  { key: 'st_rework',    label: 'Rework' },
  { key: 'st_smt',       label: 'SMT' },
  { key: 'st_thr',       label: 'THR' },
  { key: 'st_bbas',      label: 'BBAS' },
];

/* ── นิยามคอลัมน์ชุดเดียว — กลุ่ม WO/Type/PD PLAN/PIC (หัวบน + ย่อยล่าง) ──
   ใช้ร่วมกัน: Dashboard table (กรอง excelOnly ออก) · Excel/PDF (ครบทุกคอลัมน์)
   excelOnly = โชว์เฉพาะ Excel/PDF (เช่น STATUS pipeline) ไม่โชว์ในตาราง Dashboard */
export const XLSX_COLUMNS: PpCol[] = [
  { key: 'status',       header: 'Status',      w: 13, center: true, value: p => statusView(p).label },
  { key: 'date_record',  header: 'Date record', w: 14, center: true, value: p => { const d = xlsxDate(p.date_record); return d ? (p.wk != null ? `${d}\n(WW${p.wk})` : d) : ''; } },
  { key: 'work_order',   header: 'WO',          w: 12, center: true, value: p => p.work_order || '' },
  { key: 'model',        header: 'MODEL',       w: 26, value: p => p.model || '' },
  { key: 'product_pn',   header: 'Product P/N', w: 18, value: p => p.product_pn || '' },
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
  { key: 'revised',    header: 'Actual shipping', w: 13, center: true, headerColor: 'FFFF00', group: 'PD PLAN', value: p => xlsxDate(p.revised_date) },
  { key: 'cap_day',    header: 'CAP / DAY',      w: 16, center: true, group: 'PD PLAN', value: p => (p.target_per_day ? String(p.target_per_day) : '') },
  { key: 'syn_requestor', header: 'Owner', w: 14, center: true, headerColor: '4472C4', value: p => p.syn_requestor || '' },
  { key: 'customer',   header: 'Customer',   w: 14, value: p => p.customer || '' },
  // Process — 8 step โชว์เป็นช่องสี (ค่าจริงอ่านจาก p[key] ตอน render/export · value ว่างไว้)
  ...PROCESS_STEPS.map((s): PpCol => ({ key: s.key as string, header: s.label, w: 7, center: true, group: 'Process', value: () => '' })),
  // QA — Sampling% / QA Finish / Status
  { key: 'qa_test_rate', header: 'Sampling%', w: 10, center: true, group: 'QA', value: p => p.qa_test_rate || '' },
  { key: 'qa_finish',    header: 'QA Finish', w: 12, center: true, group: 'QA', value: p => xlsxDate(p.qa_finish_date) },
  { key: 'qa_status',    header: 'Status',    w: 11, center: true, group: 'QA', value: p => p.qa_status ? (PP_STATUS_LABEL[p.qa_status] ?? p.qa_status) : '' },
  { key: 'store',      header: 'Received date', w: 12, center: true, group: 'Store', value: p => xlsxDate(p.store_received) },
  // PIC — Name / Responsible
  { key: 'pd_pic',        header: 'Name',        w: 12, group: 'PIC', value: p => p.pd_pic || '' },
  { key: 'pic_responsible', header: 'Responsible', w: 13, group: 'PIC', value: p => p.pic_responsible || '' },
  { key: 'special_request', header: 'Special request', w: 22, value: p => p.special_request || '' },
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

/* ── เอฟเฟกต์ตอนเปิดหน้า: ตัวเลข/กราฟ วิ่งจาก 0 ไปค่าจริง (กิมมิกให้หน้าดูมีชีวิต) ── */
// นับเลขจากค่าเดิม → ค่าใหม่ (ครั้งแรก = จาก 0) ด้วย easeOutCubic; ตอน poll ข้อมูลก็ glide นุ่มๆ ไม่วิ่งใหม่จาก 0
function useCountUp(value: number, duration = 900) {
  const [n, setN] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    let raf = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const p = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
      const cur = from + (to - from) * e;
      fromRef.current = cur;
      setN(cur);
      if (p < 1) raf = requestAnimationFrame(tick);
      else { fromRef.current = to; setN(to); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return n;
}

// true หลัง mount 1 เฟรม — ใช้ทริกเกอร์ CSS transition ให้แท่ง/โดนัทโตจาก 0 ตอนเข้าหน้า
function useMounted() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return on;
}

/* ── Donut chart (SVG) ── */
export function Donut({ data, size = 170 }: { data: { label: string; value: number; color: string }[]; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const sw = 18;
  const r = size / 2 - sw / 2 - 2;
  const c = size / 2;
  const C = 2 * Math.PI * r;
  const mounted = useMounted();
  const count = useCountUp(total);
  let offset = 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', justifyContent: 'center' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="#eef2f7" strokeWidth={sw} />
        {total > 0 && data.filter(d => d.value > 0).map((d, i) => {
          const len = (d.value / total) * C;
          const drawn = mounted ? len : 0; // ตอน mount = 0 → โตเป็น len ผ่าน CSS transition
          const seg = (
            <circle key={i} cx={c} cy={c} r={r} fill="none" stroke={d.color} strokeWidth={sw}
              strokeDasharray={`${drawn} ${C - drawn}`} strokeDashoffset={-offset} transform={`rotate(-90 ${c} ${c})`}
              style={{ transition: 'stroke-dasharray 0.85s cubic-bezier(0.22,1,0.36,1)' }} />
          );
          offset += len;
          return seg;
        })}
        <text x={c} y={c - 2} textAnchor="middle" fontSize="24" fontWeight="800" fill="#1e293b">{Math.round(count)}</text>
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
  const isNum = typeof value === 'number';
  const animated = useCountUp(isNum ? value : 0); // นับเลขวิ่งเฉพาะค่าตัวเลข (ข้อความ เช่น "—"/"85%" โชว์ตรงๆ)
  const display = isNum ? Math.round(animated).toLocaleString() : value;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', background: '#fff', border: '1px solid var(--border-color)', borderRadius: 12, padding: '0.9rem 1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <span style={{ width: 42, height: 42, flexShrink: 0, borderRadius: 11, fontSize: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', background: accent + '1a', color: accent }}>{icon}</span>
      <div style={{ lineHeight: 1.2 }}>
        <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1e293b' }}>{display}</div>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>{label}</div>
      </div>
    </div>
  );
}

export function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const target = max > 0 ? (value / max) * 100 : 0;
  const mounted = useMounted();      // แท่งโตจาก 0 → target ตอนเข้าหน้า (และ glide ตอนค่าเปลี่ยน)
  const num = useCountUp(value, 800); // เลขท้ายแท่งวิ่งตามไปด้วย
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.82rem' }}>
      <div style={{ flex: '0 1 130px', minWidth: 64, textAlign: 'right', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={label}>{label}</div>
      <div style={{ flex: 1, background: 'var(--border-color)', borderRadius: 99, height: 18, overflow: 'hidden' }}>
        <div style={{ width: `${mounted ? target : 0}%`, height: '100%', background: color, borderRadius: 99, minWidth: value > 0 && mounted ? 6 : 0, transition: 'width 0.8s cubic-bezier(0.22,1,0.36,1)' }} />
      </div>
      <div style={{ width: 44, fontWeight: 700, color: '#1e293b' }}>{Math.round(num).toLocaleString()}</div>
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

/* ── Gantt chart — ไทม์ไลน์รายวัน: แถวซ้าย = งาน · หัวบน = แกนวันที่ · แท่ง = PD Start → PD Done ── */
/* ── Export Gantt เป็น Excel (ปฏิทินระบายสีตามสถานะ · เหมือนบนจอ) ── */
export async function exportGanttXlsx(rows: PpProject[], filename?: string) {
  const toD = (v: string | null | undefined): Date | null => { if (!v) return null; const d = new Date(String(v).slice(0, 10) + 'T00:00:00'); return isNaN(d.getTime()) ? null : d; };
  const dd = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000);
  const tasks = rows.map(p => {
    const start = toD(p.pd_start_date);
    let end = toD(p.pd_finish_date) || toD(p.expected_date);
    if (start && end && end.getTime() < start.getTime()) end = start;
    const log = (Array.isArray(p.process_log) ? p.process_log : [])
      .map(e => ({ date: toD(e.date), status: e.status }))
      .filter((e): e is { date: Date; status: string } => !!e.date)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    return { p, start, end: end || start, log };
  }).filter(t => !!t.start || t.log.length > 0);
  if (!tasks.length) { showToast('ไม่มีข้อมูลสำหรับ Gantt (ต้องมี PD Start หรือประวัติ Process)', 'error'); return; }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const allDates: Date[] = [];
  tasks.forEach(t => { if (t.start) allDates.push(t.start); if (t.end) allDates.push(t.end); t.log.forEach(e => allDates.push(e.date)); });
  if (tasks.some(t => t.log.length > 0)) allDates.push(today);
  let min = allDates[0], max = allDates[0];
  for (const d of allDates) { if (d < min) min = d; if (d > max) max = d; }
  const totalDays = dd(min, max) + 1;
  const days = Array.from({ length: totalDays }, (_, i) => { const d = new Date(min); d.setDate(d.getDate() + i); return d; });
  const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Gantt', { views: [{ state: 'frozen', xSplit: 1, ySplit: 2, showGridLines: false }] });
  ws.getColumn(1).width = 24;
  days.forEach((_, i) => { ws.getColumn(i + 2).width = 3; });
  ws.getRow(1).height = 20; ws.getRow(2).height = 16;

  const thin = { style: 'thin' as const, color: { argb: 'FFB9C0C9' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const PEACH = 'FFF6DCC9', HEAD_BG = 'FFF1F5F9', TEAL = 'FF2B5F74', RED = 'FFDC2626';

  // มุมซ้ายบน — ช่อง DATE / Name แบบเส้นทแยง (ตาม FM03)
  ws.mergeCells(1, 1, 2, 1);
  const corner = ws.getCell(1, 1);
  corner.value = '            DATE\n\nName';
  corner.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  corner.font = { bold: true, size: 9, color: { argb: 'FF334155' } };
  corner.border = { ...border, diagonal: { down: true, style: 'thin', color: { argb: 'FF334155' } } };

  // แถวเดือน (JUN/JUL/AUG) — merge ตามจำนวนวันของแต่ละเดือน (ไม่ใส่ปี)
  let c = 2;
  while (c <= days.length + 1) {
    const d = days[c - 2];
    let e = c;
    while (e <= days.length + 1 && days[e - 2].getMonth() === d.getMonth() && days[e - 2].getFullYear() === d.getFullYear()) e++;
    ws.getCell(1, c).value = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    if (e - 1 > c) ws.mergeCells(1, c, 1, e - 1);
    c = e;
  }
  // แถววันที่ + ระบายสีวันหยุด (เสาร์/อาทิตย์) ทั้งหัวและตัวตาราง
  days.forEach((d, i) => { ws.getCell(2, i + 2).value = d.getDate(); });
  for (let col = 2; col <= days.length + 1; col++) {
    const wknd = isWeekend(days[col - 2]);
    for (const r of [1, 2]) {
      const cell = ws.getCell(r, col);
      cell.border = border;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.font = { bold: true, size: 9, color: { argb: 'FF334155' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: wknd ? PEACH : HEAD_BG } };
    }
  }

  // แต่ละงาน 1 แถว — แท่งงาน = ระบายสีพื้นเซลล์ทึบตามสถานะ (ไม่ใช้ตัวอักษร/เส้นขอบ) จึงต่อกันสนิทเสมอไม่มีช่องว่าง
  tasks.forEach((t, ri) => {
    const row = ri + 3;
    ws.getRow(row).height = 20;
    const nameCell = ws.getCell(row, 1);
    nameCell.value = t.p.model || t.p.product_pn || '-';
    nameCell.font = { bold: true, size: 9, color: { argb: 'FF1E293B' } };
    nameCell.alignment = { vertical: 'middle' };
    nameCell.border = border;

    const dayColor: Record<number, string> = {};   // สีแท่งของแต่ละวัน
    if (t.log.length) {
      t.log.forEach((pt, i) => {
        const col = pt.status && STATUS_STYLE[pt.status] ? argb(STATUS_STYLE[pt.status].border) : 'FF94A3B8';
        // segment สุดท้าย: งานจบแล้ว (DONE/CANCEL) แท่งจบที่วันนั้นเลย ไม่ลากต่อถึงวันนี้
        const isLast = i + 1 >= t.log.length;
        const terminal = pt.status === 'DONE' || pt.status === 'CANCEL';
        const nextDate = !isLast ? t.log[i + 1].date : (terminal ? pt.date : (today.getTime() > pt.date.getTime() ? today : pt.date));
        for (let k = dd(min, pt.date); k <= dd(min, nextDate); k++) dayColor[k] = col;
      });
    } else if (t.start) {
      const isLate = t.p.status === 'DELAY' || (!!t.end && t.end.getTime() < today.getTime() && t.p.status !== 'DONE');
      const col = isLate ? RED : TEAL;
      const ks = dd(min, t.start), ke = dd(min, t.end || t.start);
      for (let k = ks; k <= ke; k++) dayColor[k] = col;
    }
    days.forEach((d, i) => {
      const cell = ws.getCell(row, i + 2);
      cell.border = border;
      const col = dayColor[i];
      if (col) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: col } };
      } else if (isWeekend(d)) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PEACH } };
      }
    });
  });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename || `gantt-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

const gToDate = (v: string | null | undefined): Date | null => {
  if (!v) return null;
  const d = new Date(String(v).slice(0, 10) + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
};
const gDayDiff = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000);

export function GanttChart({ rows }: { rows: PpProject[] }) {
  const DAY_W = 44, LEFT_W = 250, ROW_H = 48, HEAD_H = 30, R = 8;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [fromStr, setFromStr] = useState('');   // ฟิลเตอร์ช่วงวันที่ที่แสดง (ว่าง = อัตโนมัติทั้งหมด)
  const [toStr, setToStr] = useState('');
  const leftRef = useRef<HTMLDivElement>(null);   // แผงชื่อ (sync เลื่อนแนวตั้งกับ timeline)

  // แต่ละงาน: start/end จาก PD + ประวัติ log (แต่ละ event มีวันที่ → วาด Gantt หลายสี)
  const tasks = rows.map(p => {
    const start = gToDate(p.pd_start_date);
    let end = gToDate(p.pd_finish_date) || gToDate(p.expected_date);
    if (start && end && end.getTime() < start.getTime()) end = start;
    const log = (Array.isArray(p.process_log) ? p.process_log : [])
      .map(e => ({ date: gToDate(e.date), status: e.status, step: e.step, note: e.note || '' }))
      .filter((e): e is { date: Date; status: string; step: string; note: string } => !!e.date)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    return { p, start, end: end || start, log };
  }).filter(t => !!t.start || t.log.length > 0);

  const skipped = rows.length - tasks.length;

  if (tasks.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', border: '1px solid var(--border-color)', borderRadius: 8 }}>
        ยังไม่มีงานที่ระบุ PD Start หรือประวัติ Process — เพิ่มวันเริ่มผลิต หรือกดที่ช่อง Process ในตารางเพื่อบันทึกความคืบหน้า
      </div>
    );
  }

  // ช่วงวันที่ครอบคลุมทุกงาน (รวม start/end + วันใน log + วันนี้ถ้ามี log)
  const allDates: Date[] = [];
  tasks.forEach(t => { if (t.start) allDates.push(t.start); if (t.end) allDates.push(t.end); t.log.forEach(e => allDates.push(e.date)); });
  if (tasks.some(t => t.log.length > 0)) allDates.push(today);
  let min = allDates[0], max = allDates[0];
  for (const d of allDates) { if (d < min) min = d; if (d > max) max = d; }
  { const f = gToDate(fromStr); if (f) min = f; const tt = gToDate(toStr); if (tt) max = tt; if (min.getTime() > max.getTime()) max = min; }   // ฟิลเตอร์ช่วงวันที่
  const totalDays = gDayDiff(min, max) + 1;
  const days = Array.from({ length: totalDays }, (_, i) => { const d = new Date(min); d.setDate(d.getDate() + i); return d; });

  const months: { label: string; span: number }[] = [];
  days.forEach(d => {
    const key = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    const last = months[months.length - 1];
    if (last && last.label === key) last.span++;
    else months.push({ label: key, span: 1 });
  });

  const todayOff = gDayDiff(min, today);
  const bodyW = totalDays * DAY_W;
  const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
  const centerX = (d: Date) => gDayDiff(min, d) * DAY_W + DAY_W / 2;
  const fmt = (d: Date) => d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  const stlOf = (s: string) => STATUS_STYLE[s] ?? STATUS_STYLE.CANCEL;

  return (
    <div>
      {/* ฟิลเตอร์ช่วงวันที่ */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', fontSize: '0.8rem', color: '#475569' }}>
        <span style={{ fontWeight: 600 }}>ช่วงวันที่:</span>
        <input type="date" value={fromStr} onChange={e => setFromStr(e.target.value)} style={{ padding: '3px 6px', border: '1px solid var(--border-color)', borderRadius: 6, fontFamily: 'inherit' }} />
        <span>ถึง</span>
        <input type="date" value={toStr} onChange={e => setToStr(e.target.value)} style={{ padding: '3px 6px', border: '1px solid var(--border-color)', borderRadius: 6, fontFamily: 'inherit' }} />
        {(fromStr || toStr) && <button type="button" onClick={() => { setFromStr(''); setToStr(''); }} style={{ padding: '3px 10px', fontSize: '0.75rem', border: '1px solid var(--border-color)', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>ล้างช่วงวันที่</button>}
      </div>

      {/* 2 แผง: คอลัมน์ชื่อ (ตรึง) + timeline (เลื่อน x/y เอง → scrollbar อยู่แค่ใต้ timeline) */}
      <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: 8, maxHeight: 640, overflow: 'hidden' }}>
        {/* LEFT — คอลัมน์ชื่อ (เลื่อนแนวตั้ง sync ตาม timeline) */}
        <div ref={leftRef} style={{ width: LEFT_W, minWidth: LEFT_W, flexShrink: 0, overflow: 'hidden', borderRight: '1px solid var(--border-color)', background: '#fff' }}>
          <div style={{ position: 'sticky', top: 0, zIndex: 2, height: HEAD_H * 2, background: '#f1f5f9', display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: '0.72rem', fontWeight: 700, color: '#475569', borderBottom: '1px solid var(--border-color)' }}>Name</div>
          {tasks.map(t => (
            <div key={t.p.id} style={{ height: ROW_H, display: 'flex', alignItems: 'center', padding: '0 10px', borderBottom: '1px solid #f1f5f9', overflow: 'hidden' }} title={t.p.model || ''}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.p.model || '—'}</span>
            </div>
          ))}
        </div>

        {/* RIGHT — timeline (overflow auto → scrollbar อยู่แค่ตรงนี้) */}
        <div onScroll={e => { if (leftRef.current) leftRef.current.scrollTop = e.currentTarget.scrollTop; }} style={{ overflow: 'auto', flex: 1 }}>
          <div style={{ width: bodyW, position: 'relative' }}>
            {/* แรเงาวันหยุด */}
            <div style={{ position: 'absolute', top: HEAD_H * 2, bottom: 0, left: 0, width: bodyW, zIndex: 0, pointerEvents: 'none' }}>
              {days.map((d, i) => isWeekend(d)
                ? <div key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: i * DAY_W, width: DAY_W, background: 'rgba(234,140,86,0.22)' }} />
                : null)}
            </div>

            {/* หัว: เดือน */}
            <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 4, background: '#f1f5f9', borderBottom: '1px solid var(--border-color)' }}>
              {months.map((m, i) => (
                <div key={i} style={{ width: m.span * DAY_W, height: HEAD_H, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 700, color: '#475569', borderLeft: '1px solid var(--border-color)' }}>{m.label}</div>
              ))}
            </div>

            {/* หัว: วันที่ */}
            <div style={{ display: 'flex', position: 'sticky', top: HEAD_H, zIndex: 4, background: '#f8fafc', borderBottom: '1px solid var(--border-color)' }}>
              {days.map((d, i) => (
                <div key={i} style={{ width: DAY_W, height: HEAD_H, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.68rem', fontWeight: 600, color: isWeekend(d) ? '#9a5b34' : '#64748b', borderLeft: '1px solid #eef2f7', background: isWeekend(d) ? 'rgba(234,140,86,0.22)' : undefined }}>{d.getDate()}</div>
              ))}
            </div>

            {/* แถวงาน — timeline */}
            {tasks.map(t => {
              const isLate = t.p.status === 'DELAY' || (!!t.end && t.end.getTime() < today.getTime() && t.p.status !== 'DONE');
              return (
                <div key={t.p.id} style={{ position: 'relative', height: ROW_H, borderBottom: '1px solid #f1f5f9', zIndex: 1 }}>
                  <div style={{ position: 'absolute', inset: 0, backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent ${DAY_W - 1}px, #eef2f7 ${DAY_W - 1}px, #eef2f7 ${DAY_W}px)` }} />
                  {t.log.length > 0 ? (
                    <>
                      {t.log.map((pt, i) => {
                        const x1 = centerX(pt.date);
                        // segment สุดท้าย: ถ้างานจบแล้ว (DONE/CANCEL) เส้นจบที่จุดนั้นเลย ไม่ลากต่อถึงวันนี้ · ถ้ายังไม่จบค่อยลากถึงวันนี้
                        const isLast = i + 1 >= t.log.length;
                        const terminal = pt.status === 'DONE' || pt.status === 'CANCEL';
                        const nextDate = !isLast ? t.log[i + 1].date : (terminal ? pt.date : (today.getTime() > pt.date.getTime() ? today : pt.date));
                        const x2 = centerX(nextDate);
                        return <div key={'s' + i} title={pt.note || ''}
                          style={{ position: 'absolute', top: '50%', left: x1, width: Math.max(0, x2 - x1), height: 3, background: stlOf(pt.status).border, transform: 'translateY(-50%)' }} />;
                      })}
                      {t.log.map((pt, i) => {
                        const x = centerX(pt.date);
                        const s = stlOf(pt.status);
                        return <div key={'n' + i} title={pt.note || ''}
                          style={{ position: 'absolute', top: '50%', left: x - R, width: R * 2, height: R * 2, borderRadius: '50%', background: s.bg, border: `2px solid ${s.border}`, transform: 'translateY(-50%)', boxShadow: '0 0 0 2px #fff', zIndex: 1, cursor: 'help' }} />;
                      })}
                    </>
                  ) : t.start ? (
                    <div title={`${t.p.product_pn || t.p.model || ''} | ${fmt(t.start)} - ${fmt(t.end || t.start)}`} style={{ position: 'absolute', inset: 0 }}>
                      <div style={{ position: 'absolute', top: '50%', left: centerX(t.start), width: Math.max(0, centerX(t.end || t.start) - centerX(t.start)), height: 3, background: isLate ? '#dc2626' : '#2b5f74', transform: 'translateY(-50%)' }} />
                      <div style={{ position: 'absolute', top: '50%', left: centerX(t.start) - R, width: R * 2, height: R * 2, borderRadius: '50%', background: isLate ? '#dc2626' : '#2b5f74', transform: 'translateY(-50%)', boxShadow: '0 0 0 2px #fff' }} />
                      <div style={{ position: 'absolute', top: '50%', left: centerX(t.end || t.start) - R, width: R * 2, height: R * 2, borderRadius: '50%', background: isLate ? '#dc2626' : '#2b5f74', transform: 'translateY(-50%)', boxShadow: '0 0 0 2px #fff' }} />
                    </div>
                  ) : null}
                </div>
              );
            })}

            {/* เส้นวันนี้ */}
            {todayOff >= 0 && todayOff < totalDays && (
              <div style={{ position: 'absolute', top: HEAD_H * 2, bottom: 0, left: todayOff * DAY_W + DAY_W / 2, width: 2, background: '#ef4444', zIndex: 2, pointerEvents: 'none' }}>
                <span style={{ position: 'absolute', top: -1, left: -15, background: '#ef4444', color: '#fff', fontSize: '0.6rem', fontWeight: 700, padding: '1px 5px', borderRadius: 4, whiteSpace: 'nowrap' }}>วันนี้</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {skipped > 0 && (
        <div style={{ padding: '6px 12px', fontSize: '0.72rem', color: '#94a3b8' }}>
          * ซ่อน {skipped} งานที่ยังไม่มี PD Start / ประวัติ Process
        </div>
      )}
    </div>
  );
}

/* ── Add/Edit Project Form (modal) — ปิดได้เฉพาะปุ่มยกเลิก ── */
const EMPTY: Partial<PpProject> = {
  status: 'ON_PROCESS', work_order: '', model: '', product_pn: '', customer: '', syn_requestor: '',
  qty: 0, produce: 0, total_ng: 0, total_ok: 0,
  target_per_day: 0, qa_test_rate: '', qa_status: '', pd_pic: '', pic_responsible: '',
  pc_prpo: '', pc_wait: '', pc_incoming: '', pc_smt: '', pc_thr: '', pc_test: '', pc_bbas: '', pc_packing: '', process_log: [],
  special_request: '', remark: '',
};

// ฟอร์มเปล่าสำหรับสร้างใหม่ — เติม Date record = วันนี้ + คำนวณ WW ให้อัตโนมัติ
const blankForm = (): Partial<PpProject> => { const today = new Date().toISOString().slice(0, 10); return { ...EMPTY, date_record: today, wk: isoWeek(today) }; };

/** ฟอร์มกรอกข้อมูลโปรเจกต์ (ใช้ทั้ง inline ในหน้า Add Project และในป๊อปอัพแก้ไข) */
export function ProjectForm({ initial, onSaved, onCancel }: { initial: PpProject | null; onSaved?: () => void; onCancel?: () => void }) {
  const [f, setF] = useState<Partial<PpProject>>(() => initial ?? blankForm());
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
    // Status = ค่าที่ตั้งในฟอร์ม (ไม่ auto จาก process) · status_color เริ่มต้น = ตามสถานะ (เปลี่ยนสีเองทีหลังในตาราง) · date_record auto วันนี้ถ้าเว้นว่าง
    const today = new Date().toISOString().slice(0, 10);
    const status = f.status || 'ON_PROCESS';
    const status_color = f.status_color || ((PP_STATUS as readonly string[]).includes(status) ? status : '');
    const payload: any = editing
      ? { ...f, id: initial!.id, status, status_color }
      : { ...f, status, status_color, date_record: f.date_record || today, wk: f.wk ?? isoWeek(f.date_record || today) };
    mut.mutate(payload, {
      onSuccess: () => {
        showToast(editing ? 'แก้ไขสำเร็จ' : 'เพิ่มโปรเจกต์สำเร็จ', 'success');
        if (!editing) { setF(blankForm()); window.scrollTo({ top: 0, behavior: 'smooth' }); }   // create → เคลียร์ฟอร์ม (วันนี้) + เลื่อนขึ้นบนสุด
        onSaved?.();
      },
      onError: (e: any) => setErr(e.message),
    });
  }

  const num = (k: keyof PpProject) => (e: any) => set(k, e.target.value === '' ? 0 : Number(e.target.value));
  const txt = (k: keyof PpProject) => (e: any) => set(k, e.target.value);
  // เลือก Date Record → คำนวณ WW (ISO week) ให้อัตโนมัติ
  const onDateRecord = (e: any) => {
    const v = e.target.value;
    setF(p => ({ ...p, date_record: v, wk: v ? isoWeek(v) : null }));
  };
  const Section = ({ title }: { title: string }) => (
    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '0.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: 4 }}>{title}</div>
  );

  return (
        <form onSubmit={submit} className="stack" style={{ gap: '0.7rem' }}>
          <Section title="ข้อมูลหลัก" />
          <div className="grid-3col">
            <label className="field"><span>Status</span>
              <select value={f.status} onChange={txt('status')}>
                {PP_STATUS.map(s => <option key={s} value={s}>{PP_STATUS_LABEL[s]}</option>)}
                {PROCESS_STEPS.map(s => <option key={s.key as string} value={s.label}>{s.label}</option>)}
              </select>
            </label>
            <label className="field"><span>Date record</span><input type="date" value={f.date_record ?? ''} onChange={onDateRecord} /></label>
            <label className="field"><span>WW (Work Week)</span><input type="number" value={f.wk ?? ''} readOnly title="คำนวณอัตโนมัติจาก Date Record (ISO week)" placeholder="auto" style={{ background: '#f1f5f9' }} /></label>
            <label className="field"><span>WO</span><input value={f.work_order ?? ''} onChange={txt('work_order')} placeholder="เลขที่ WO" /></label>
            <label className="field"><span>Model</span><input value={f.model ?? ''} onChange={txt('model')} placeholder="Water Level Rice..." /></label>
            <label className="field"><span>Product P/N</span><input value={f.product_pn ?? ''} onChange={txt('product_pn')} placeholder="1E7D..." autoFocus /></label>
          </div>

          <Section title="Production Record" />
          <div className="grid-3col">
            <label className="field"><span>Quantity</span><input type="number" value={f.qty ?? 0} onChange={num('qty')} /></label>
            <label className="field"><span>Produced</span><input type="number" min="0" value={f.produce ?? 0} onChange={num('produce')} placeholder="0" /></label>
            <label className="field"><span>Balance</span><input value={(Number(f.qty) || 0) - (Number(f.produce) || 0)} readOnly title="Quantity − Produced (คำนวณอัตโนมัติ)" style={{ background: '#f1f5f9' }} /></label>
            <label className="field"><span>Total FG</span><input type="number" value={f.total_ok ?? 0} onChange={num('total_ok')} /></label>
            <label className="field"><span>Total NG</span><input type="number" value={f.total_ng ?? 0} onChange={num('total_ng')} /></label>
            <label className="field"><span>Yield (FG ÷ (FG+NG) × 100)</span><input value={ppYield({ total_ok: f.total_ok ?? 0, total_ng: f.total_ng ?? 0 })?.toFixed(2) ?? '—'} readOnly style={{ background: '#f1f5f9' }} /></label>
          </div>

          <Section title="PD PLAN" />
          <div className="grid-3col">
            <label className="field"><span>PD Start</span><input type="date" value={f.pd_start_date ?? ''} onChange={txt('pd_start_date')} /></label>
            <label className="field"><span>PD Done</span><input type="date" value={f.pd_finish_date ?? ''} onChange={txt('pd_finish_date')} /></label>
            <label className="field"><span>Expected date</span><input type="date" value={f.expected_date ?? ''} onChange={txt('expected_date')} /></label>
            <label className="field"><span>Actual shipping date</span><input type="date" value={f.revised_date ?? ''} onChange={txt('revised_date')} /></label>
            <label className="field"><span>CAP / DAY</span><input type="number" min="0" value={f.target_per_day ?? 0} onChange={num('target_per_day')} placeholder="เช่น 40" /></label>
          </div>

          <Section title="Owner / Customer" />
          <div className="grid-3col">
            <label className="field"><span>Owner</span><input value={f.syn_requestor ?? ''} onChange={txt('syn_requestor')} placeholder="ผู้รับผิดชอบ / ผู้มอบหมาย" /></label>
            <label className="field"><span>Customer</span><input value={f.customer ?? ''} onChange={txt('customer')} /></label>
          </div>

          <Section title="Process (เลือกสถานะแต่ละขั้น)" />
          <div className="grid-3col">
            {PROCESS_STEPS.map(s => (
              <label key={s.key as string} className="field"><span>{s.label}</span>
                <select value={(f as any)[s.key] ?? ''} onChange={txt(s.key)}>
                  <option value="">— ว่าง —</option>
                  {PP_STATUS.map(v => <option key={v} value={v}>{PP_STATUS_LABEL[v]}</option>)}
                </select>
              </label>
            ))}
          </div>

          <Section title="QA" />
          <div className="grid-3col">
            <label className="field"><span>Sampling rate</span>
              <input type="text" value={f.qa_test_rate ?? ''} onChange={txt('qa_test_rate')} />
            </label>
            <label className="field"><span>QA Finish date</span><input type="date" value={f.qa_finish_date ?? ''} onChange={txt('qa_finish_date')} /></label>
            <label className="field"><span>QA Status</span>
              <select value={f.qa_status ?? ''} onChange={txt('qa_status')} title="สถานะฝั่ง QA — แยกจากสถานะงาน">
                <option value="">— ไม่ระบุ —</option>
                {PP_STATUS.map(s => <option key={s} value={s}>{PP_STATUS_LABEL[s]}</option>)}
              </select>
            </label>
          </div>

          <Section title="Store" />
          <div className="grid-3col">
            <label className="field"><span>Received date</span><input type="date" value={f.store_received ?? ''} onChange={txt('store_received')} /></label>
          </div>

          <Section title="PIC" />
          <div className="grid-3col">
            <label className="field"><span>Name</span><input value={f.pd_pic ?? ''} onChange={txt('pd_pic')} placeholder="Noi,Kiert" /></label>
            <label className="field"><span>Responsible</span><input value={f.pic_responsible ?? ''} onChange={txt('pic_responsible')} placeholder="หน้าที่ที่รับผิดชอบ" /></label>
          </div>

          <label className="field"><span>Special request (ขอพิเศษเพิ่มเติม)</span><textarea value={f.special_request ?? ''} onChange={txt('special_request')} rows={2} placeholder="เช่น ขอเร่งด่วน, ขอ QA ก่อน ฯลฯ" /></label>
          <label className="field"><span>Remark</span><textarea value={f.remark ?? ''} onChange={txt('remark')} rows={4} /></label>

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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 'min(100%, 860px)', maxHeight: '94vh', overflowY: 'auto' }}>
        <h2 className="panel__title" style={{ marginBottom: '1rem' }}>{initial ? 'แก้ไขโปรเจกต์' : 'เพิ่มโปรเจกต์ (Add Project)'}</h2>
        <ProjectForm initial={initial} onSaved={onClose} onCancel={onClose} />
      </div>
    </div>
  );
}
