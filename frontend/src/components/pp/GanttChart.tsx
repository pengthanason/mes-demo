import { useEffect, useRef, useState } from 'react';
import { PP_STATUS_LABEL, type PpProject } from '../../lib/ppApi';
import { showToast } from '../../lib/toast';
import { useEscapeKey } from '../../lib/useEscapeKey';
import { STATUS_STYLE, PROCESS_STEPS, PROC_STATUS_LABEL } from './ppColumns';
import { DATE_INPUT_MIN, DATE_INPUT_MAX, DATE_YEAR_MIN, DATE_YEAR_MAX } from '../../lib/dateRange';

// hex (#rrggbb) → ARGB ('FFRRGGBB') สำหรับ ExcelJS
const argb = (hex: string) => 'FF' + hex.replace('#', '').toUpperCase();

/* ── Gantt chart — ไทม์ไลน์รายวัน: แถวซ้าย = งาน · หัวบน = แกนวันที่ · แท่ง = PD Start → PD Done ── */

// ── วันที่ของ Gantt: ปีต้องอยู่ในช่วงที่เป็นไปได้จริงในโรงงาน ─────────────────
// 🔴 บทเรียน INC 2026-08-03: <input type="date"> (ตอนนั้นยังไม่มี min/max) ยอมให้พิมพ์ปีหลักเดียว
//    (เจอ revised_date = 0001-04-11 ใน WO 102026) → ช่วงของ Gantt ถูกลากจากปี 1 ถึงปีนี้
//    = 739,741 วัน → หน้า Dashboard พังทั้งหน้า (Maximum call stack size exceeded ตอน spread
//    array 7 แสนตัวเข้า Math.max) · ปีนอกช่วง = ถือว่าไม่มีค่า + โชว์เตือนใต้ Gantt ไม่เงียบ
const GANTT_YEAR_MIN = DATE_YEAR_MIN;
const GANTT_YEAR_MAX = DATE_YEAR_MAX;
// เพดานความกว้างของไทม์ไลน์ — กันไว้อีกชั้นเผื่อมีวันที่แปลกที่ยังอยู่ในช่วงปี
const GANTT_MAX_SPAN_DAYS = 1830;   // ~5 ปี

const gToDate = (v: string | null | undefined): Date | null => {
  if (!v) return null;
  const d = new Date(String(v).slice(0, 10) + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  return (y < GANTT_YEAR_MIN || y > GANTT_YEAR_MAX) ? null : d;
};
const gDayDiff = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000);

// ฟิลด์วันที่ทั้งหมดของ 1 โปรเจกต์ — ใช้ตรวจว่ามีค่าที่ปีหลุดช่วงไหม (โชว์เตือน)
const PP_DATE_KEYS = ['date_record', 'pd_start_date', 'pd_finish_date', 'qa_finish_date', 'store_received', 'expected_date', 'revised_date', 'bom_rec_date'] as const;
const hasBadDate = (p: PpProject): boolean => PP_DATE_KEYS.some(k => { const v = (p as any)[k]; return !!v && !gToDate(v); });

/* ── Export Gantt เป็น Excel (ปฏิทินระบายสีตามสถานะ · เหมือนบนจอ) ── */
export async function exportGanttXlsx(rows: PpProject[], filename?: string) {
  const toD = gToDate;                                   // ใช้ตัวเดียวกับบนจอ — กันวันที่ปีเพี้ยนเหมือนกัน
  const dd = gDayDiff;
  const tasks = rows.map(p => {
    const start = toD(p.pd_start_date);
    // ปลายแท่ง = PD Done ถ้าเสร็จ ไม่งั้นยึด Expected date (เหมือน Gantt บนจอ)
    let end = toD(p.pd_finish_date) || toD(p.expected_date);
    if (start && end && end.getTime() < start.getTime()) end = start;
    const log = (Array.isArray(p.process_log) ? p.process_log : [])
      .map(e => ({ date: toD(e.date), status: e.status }))
      .filter((e): e is { date: Date; status: string } => !!e.date)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    return { p, start, end: end || start, log };
  }).filter(t => !!t.start || t.log.length > 0);
  if (!tasks.length) { showToast('No data for the Gantt (needs a PD Start or Process history)', 'error'); return; }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const allDates: Date[] = [];
  tasks.forEach(t => { if (t.start) allDates.push(t.start); if (t.end) allDates.push(t.end); t.log.forEach(e => allDates.push(e.date)); });
  if (tasks.some(t => t.log.length > 0)) allDates.push(today);
  let min = allDates[0], max = allDates[0];
  for (const d of allDates) { if (d < min) min = d; if (d > max) max = d; }
  let totalDays = dd(min, max) + 1;
  // เกินเพดาน = ข้อมูลวันที่ผิด ไม่ใช่แผนผลิตจริง — ตัดช่วงแล้วบอกให้รู้ (ไม่งั้น exceljs สร้างเป็นแสนคอลัมน์แล้วค้าง)
  if (totalDays > GANTT_MAX_SPAN_DAYS) {
    max = new Date(min.getTime() + (GANTT_MAX_SPAN_DAYS - 1) * 86400000);
    totalDays = GANTT_MAX_SPAN_DAYS;
    showToast(`Date range wider than ${Math.round(GANTT_MAX_SPAN_DAYS / 365)} years — the export was trimmed. Check the dates in the table.`, 'error');
  }
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
      const n = t.log.length;
      const first = t.log[0].date, last = t.log[n - 1].date;
      const lastStatus = t.log[n - 1].status;
      // ปลายแท่ง = t.end (PD Done/Expected) เป็นหลัก · ไม่ยืดตาม log/วันนี้ · log ที่เลย barEnd → clamp
      const barStart = t.start && t.start.getTime() < first.getTime() ? t.start : first;
      let barEnd = t.end || last;
      if (barEnd.getTime() < barStart.getTime()) barEnd = barStart;
      const kMin = dd(min, barStart), kMax = dd(min, barEnd);
      const clampK = (d: Date) => Math.min(Math.max(dd(min, d), kMin), kMax);
      const lastCol = lastStatus && STATUS_STYLE[lastStatus] ? argb(STATUS_STYLE[lastStatus].border) : 'FF94A3B8';
      // เส้นฐานครอบช่วงจริง (สีสถานะล่าสุด)
      for (let k = kMin; k <= kMax; k++) dayColor[k] = lastCol;
      // แต้มสีหลายช่วงจาก log ทับเส้นฐาน (clamp ในช่วงแท่ง)
      t.log.forEach((pt, i) => {
        if (i + 1 >= n) return;
        const col = pt.status && STATUS_STYLE[pt.status] ? argb(STATUS_STYLE[pt.status].border) : 'FF94A3B8';
        for (let k = clampK(pt.date); k < clampK(t.log[i + 1].date); k++) dayColor[k] = col;
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

export function GanttChart({ rows }: { rows: PpProject[] }) {
  const DAY_W = 44, LEFT_W = 250, ROW_H = 48, HEAD_H = 30, R = 8;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [fromStr, setFromStr] = useState('');   // ฟิลเตอร์ช่วงวันที่ที่แสดง (ว่าง = อัตโนมัติทั้งหมด)
  const [toStr, setToStr] = useState('');
  const [showHeatmap, setShowHeatmap] = useState(false);   // #4: popup "จำนวนงาน active ต่อวัน"
  const [heatTip, setHeatTip] = useState<{ x: number; y: number; label: string; n: number } | null>(null);   // #4: tooltip เซลล์ heatmap
  useEscapeKey(showHeatmap, () => { setShowHeatmap(false); setHeatTip(null); });
  const leftRef = useRef<HTMLDivElement>(null);   // แผงชื่อ (sync เลื่อนแนวตั้งกับ timeline)
  const timelineRef = useRef<HTMLDivElement>(null);   // แผง timeline (เลื่อนแนวนอน) — auto-scroll ไปวันนี้ตอนเข้าหน้า
  const didScrollToday = useRef(false);           // scroll ไปวันนี้ครั้งเดียวตอนข้อมูลพร้อม
  const scrollTarget = useRef(0);                 // ตำแหน่ง scrollLeft ของ "วันนี้" (คำนวณตอน render)
  // เข้าหน้ามา → เลื่อน timeline ให้วันนี้อยู่ด้านหน้า (ซ้าย) อัตโนมัติครั้งเดียว แล้วผู้ใช้เลื่อนเองต่อได้
  useEffect(() => {
    if (didScrollToday.current) return;
    const el = timelineRef.current;
    if (el && scrollTarget.current > 0) { el.scrollLeft = scrollTarget.current; didScrollToday.current = true; }
  });

  // แต่ละงาน: start/end จาก PD + ประวัติ log (แต่ละ event มีวันที่ → วาด Gantt หลายสี)
  const tasks = rows.map(p => {
    const start = gToDate(p.pd_start_date);
    // ปลายแท่ง = PD Done (ถ้าเสร็จ) ไม่งั้นยึด Expected date เป็นหลัก → แก้ Expected แล้วแท่งขยับตาม (ทั้งยืด/หด)
    let end = gToDate(p.pd_finish_date) || gToDate(p.expected_date);
    if (start && end && end.getTime() < start.getTime()) end = start;
    const log = (Array.isArray(p.process_log) ? p.process_log : [])
      .map(e => ({ date: gToDate(e.date), status: e.status, step: e.step, note: e.note || '' }))
      .filter((e): e is { date: Date; status: string; step: string; note: string } => !!e.date)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    return { p, start, end: end || start, log, rev: gToDate(p.revised_date) };
  }).filter(t => !!t.start || t.log.length > 0);

  const skipped = rows.length - tasks.length;
  const badDateRows = rows.filter(hasBadDate);   // แถวที่มีวันที่ปีหลุดช่วง — โชว์เตือนใต้กราฟ

  if (tasks.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', border: '1px solid var(--border-color)', borderRadius: 8 }}>
        No jobs with a PD Start or Process history yet — add a production start date, or click a Process cell in the table to log progress
      </div>
    );
  }

  // ช่วงวันที่ครอบคลุมทุกงาน (รวม start/end + วันใน log + revised date + วันนี้ถ้ามี log)
  const allDates: Date[] = [];
  tasks.forEach(t => { if (t.start) allDates.push(t.start); if (t.end) allDates.push(t.end); t.log.forEach(e => allDates.push(e.date)); if (t.rev) allDates.push(t.rev); });
  allDates.push(today);   // ครอบ "วันนี้" เสมอ → เส้นวันนี้ + เส้น overdue (กำหนด→วันนี้) ไม่หลุดขอบ
  let min = allDates[0], max = allDates[0];
  for (const d of allDates) { if (d < min) min = d; if (d > max) max = d; }
  // เผื่อวันหน้า-หลังข้างละ 5 วัน (มีที่ว่างก่อนแท่งแรก + หลังแท่งสุดท้าย) · ฟิลเตอร์วันที่ด้านล่างจะ override เป็นช่วงที่เลือกเป๊ะ
  const PAD_DAYS = 5;
  if (min && max) { min = new Date(min.getTime() - PAD_DAYS * 86400000); max = new Date(max.getTime() + PAD_DAYS * 86400000); }
  { const f = gToDate(fromStr); if (f) min = f; const tt = gToDate(toStr); if (tt) max = tt; if (min.getTime() > max.getTime()) max = min; }   // ฟิลเตอร์ช่วงวันที่
  let totalDays = gDayDiff(min, max) + 1;
  // เพดานความกว้าง — เกินนี้คือวันที่ในข้อมูลผิด ไม่ใช่แผนจริง · ตัดช่วง + โชว์เตือนใต้กราฟ
  const spanClamped = totalDays > GANTT_MAX_SPAN_DAYS;
  if (spanClamped) { max = new Date(min.getTime() + (GANTT_MAX_SPAN_DAYS - 1) * 86400000); totalDays = GANTT_MAX_SPAN_DAYS; }
  const days = Array.from({ length: totalDays }, (_, i) => { const d = new Date(min); d.setDate(d.getDate() + i); return d; });

  // #4 heatmap: นับงานที่ active (ช่วง [start,end] ครอบวันนั้น) ต่อวัน + สเกลสี 5 ระดับ
  const dayActive = days.map(d => tasks.filter(t => t.start && t.end && t.start.getTime() <= d.getTime() && d.getTime() <= t.end.getTime()).length);
  // ⚠️ ห้าม Math.max(1, ...dayActive) — spread array ยาว ๆ = RangeError: Maximum call stack size exceeded
  //    (เคยทำ Dashboard พังทั้งหน้า 2026-08-03 ตอน dayActive มี 739,741 ตัว) · reduce ไม่ผ่าน argument stack
  const maxActive = dayActive.reduce((m, n) => (n > m ? n : m), 1);
  // สเกล YlOrRd (ColorBrewer) เหลือง→ส้ม→แดง — หลายสีชัด แยกระดับง่าย แต่ยังเป็นมาตรฐาน data-viz
  const HEAT = ['#eef2f7', '#ffe08a', '#fdbf5c', '#fd8d3c', '#f03b20', '#bd0026'];
  const heatBucket = (n: number) => n <= 0 ? 0 : Math.min(5, Math.ceil((n / maxActive) * 5));
  const heat = (n: number) => HEAT[heatBucket(n)];
  const heatTx = (n: number) => heatBucket(n) >= 4 ? 'rgba(255,255,255,0.82)' : 'rgba(124,45,18,0.55)';   // ตัวเลขในช่อง: โทนอ่อนลง (ขาวจาง / น้ำตาลจาง)

  const months: { label: string; span: number }[] = [];
  days.forEach(d => {
    const key = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    const last = months[months.length - 1];
    if (last && last.label === key) last.span++;
    else months.push({ label: key, span: 1 });
  });

  const todayOff = gDayDiff(min, today);
  const bodyW = totalDays * DAY_W;
  // ตำแหน่งวันนี้สำหรับ auto-scroll (ให้วันนี้อยู่ค่อนซ้าย เว้น 1 วันไว้ข้างหน้า) — browser จะ clamp ให้เองถ้าเกินขอบ
  scrollTarget.current = Math.max(0, (todayOff - 1) * DAY_W);
  const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
  const centerX = (d: Date) => gDayDiff(min, d) * DAY_W + DAY_W / 2;
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const stlOf = (s: string) => STATUS_STYLE[s] ?? STATUS_STYLE.CANCEL;

  return (
    <div>
      {/* ฟิลเตอร์ช่วงวันที่ */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', fontSize: '0.8rem', color: '#475569' }}>
        <span style={{ fontWeight: 600 }}>Date range:</span>
        <input type="date" min={DATE_INPUT_MIN} max={DATE_INPUT_MAX} value={fromStr} onChange={e => setFromStr(e.target.value)} style={{ padding: '3px 6px', border: '1px solid var(--border-color)', borderRadius: 6, fontFamily: 'inherit' }} />
        <span>to</span>
        <input type="date" min={DATE_INPUT_MIN} max={DATE_INPUT_MAX} value={toStr} onChange={e => setToStr(e.target.value)} style={{ padding: '3px 6px', border: '1px solid var(--border-color)', borderRadius: 6, fontFamily: 'inherit' }} />
        {(fromStr || toStr) && <button type="button" onClick={() => { setFromStr(''); setToStr(''); }} style={{ padding: '3px 10px', fontSize: '0.75rem', border: '1px solid var(--border-color)', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>Clear date range</button>}
        <button type="button" className="btn secondary" onClick={() => setShowHeatmap(true)} title="Open heat map of active jobs per day"
          style={{ marginLeft: 'auto', fontSize: '0.82rem' }}>🔥 Heatmap</button>
      </div>

      {/* #4 Heat map — popup "Active jobs / day" (enterprise calendar heatmap) */}
      {showHeatmap && (() => {
        const totalJD = dayActive.reduce((a, b) => a + b, 0);
        const activeDays = dayActive.filter(n => n > 0).length;
        const avgActive = activeDays ? (totalJD / activeDays).toFixed(1) : '0';
        let bi = 0; dayActive.forEach((n, i) => { if (n > dayActive[bi]) bi = i; });

        // จัด grid: 7 แถว (จ.–อา.) × คอลัมน์ = สัปดาห์
        const CELL = 26, GAP = 5, MONTH_H = 18;
        // เพิ่มวันหน้า/หลังของ heatmap (ไม่กระทบ timeline gantt) — เติมวันไว้ให้ปฏิทินดูเต็ม/มีที่หายใจ
        const HEAT_PAD = 14;
        const countByKey = new Map<string, number>(); days.forEach((d, i) => countByKey.set(d.toDateString(), dayActive[i]));
        const hStart = new Date(days[0]); hStart.setDate(hStart.getDate() - HEAT_PAD);
        const hEnd = new Date(days[days.length - 1]); hEnd.setDate(hEnd.getDate() + HEAT_PAD);
        const heatDays: { d: Date; n: number }[] = [];
        for (let t = hStart.getTime(); t <= hEnd.getTime(); t += 86400000) { const d = new Date(t); d.setHours(0, 0, 0, 0); heatDays.push({ d, n: countByKey.get(d.toDateString()) ?? 0 }); }
        const firstDow = (heatDays[0].d.getDay() + 6) % 7;
        // concat ไม่ใช่ spread — heatDays ยาวตามช่วงวันที่ ถ้า spread เข้า array literal จะพังแบบเดียวกับ Math.max
        const gridCells: (null | { d: Date; n: number })[] = (Array(firstDow).fill(null) as (null | { d: Date; n: number })[]).concat(heatDays);
        const weeks: (null | { d: Date; n: number })[][] = [];
        for (let k = 0; k < gridCells.length; k += 7) weeks.push(gridCells.slice(k, k + 7));
        if (weeks.length) { const lw = weeks[weeks.length - 1]; while (lw.length < 7) lw.push(null); }
        let prevM = -1;
        const monthLabels = weeks.map(w => {
          const r = w.find(c => !!c) as { d: Date; n: number } | undefined;
          if (!r) return '';
          const m = r.d.getMonth();
          if (m !== prevM) { prevM = m; return r.d.toLocaleDateString('en-GB', { month: 'short' }); }
          return '';
        });

        const close = () => { setShowHeatmap(false); setHeatTip(null); };
        const metrics: { label: string; value: string; sub: string }[] = [
          { label: 'Peak load', value: String(maxActive), sub: 'jobs / day' },
          { label: 'Busiest day', value: maxActive > 0 ? fmt(days[bi]) : '—', sub: maxActive > 0 ? `${dayActive[bi]} jobs` : '' },
          { label: 'Avg / active day', value: avgActive, sub: 'jobs' },
          { label: 'Active days', value: String(activeDays), sub: `of ${days.length} days` },
        ];

        return (
          <div className="modal-overlay" onClick={close}>
            <div className="modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ width: 'min(100%, 840px)', maxHeight: '92vh', overflowY: 'auto' }}>
              {/* header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
                <div>
                  <h2 className="panel__title" style={{ margin: 0 }}>Active jobs / day</h2>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>Jobs in progress (start–end covering each day) · darker = busier</p>
                </div>
                <button type="button" className="btn secondary" aria-label="Close" style={{ padding: '4px 12px', flexShrink: 0 }} onClick={close}>✕</button>
              </div>

              {/* KPI metric bar */}
              <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: 12, background: '#f8fafc', overflow: 'hidden', marginBottom: 20 }}>
                {metrics.map((m, i) => (
                  <div key={m.label} style={{ flex: 1, minWidth: 0, padding: '12px 16px', borderLeft: i ? '1px solid var(--border-color)' : 'none' }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.value}</div>
                    <div style={{ fontSize: '0.64rem', fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: 3 }}>{m.label}</div>
                    {m.sub && <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 1 }}>{m.sub}</div>}
                  </div>
                ))}
              </div>

              {/* heatmap card */}
              <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, padding: '18px 20px', background: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>Daily activity calendar</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    <span>Less</span>
                    {[0, 1, 2, 3, 4, 5].map(l => <span key={l} style={{ width: 16, height: 16, borderRadius: 4, background: HEAT[l], border: '1px solid rgba(27,31,36,0.06)' }} />)}
                    <span>More</span>
                  </div>
                </div>
                <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
                  <div style={{ display: 'flex', gap: GAP, width: 'fit-content', margin: '0 auto' }}>
                    {/* ป้ายวันในสัปดาห์ */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: GAP, paddingTop: MONTH_H + GAP, flexShrink: 0 }}>
                      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w, idx) => <div key={idx} style={{ height: CELL, fontSize: '0.66rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', paddingRight: 4 }}>{w}</div>)}
                    </div>
                    {/* คอลัมน์ = สัปดาห์ */}
                    <div>
                      <div style={{ display: 'flex', gap: GAP, height: MONTH_H, marginBottom: GAP }}>
                        {weeks.map((_, wi) => <div key={wi} style={{ width: CELL, fontSize: '0.66rem', fontWeight: 700, color: '#8592a3', whiteSpace: 'nowrap', overflow: 'visible' }}>{monthLabels[wi]}</div>)}
                      </div>
                      <div style={{ display: 'flex', gap: GAP }}>
                        {weeks.map((w, wi) => (
                          <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>
                            {w.map((c, ci) => c ? (
                              <div key={ci}
                                onMouseEnter={e => { const r = e.currentTarget.getBoundingClientRect(); setHeatTip({ x: r.left + r.width / 2, y: r.top, label: c.d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }), n: c.n }); }}
                                onMouseLeave={() => setHeatTip(null)}
                                style={{ width: CELL, height: CELL, borderRadius: 5, background: heat(c.n), border: c.n === 0 ? '1px solid rgba(27,31,36,0.05)' : 'none', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.66rem', fontWeight: 600, color: heatTx(c.n) }}>{c.n || ''}</div>
                            ) : <div key={ci} style={{ width: CELL, height: CELL }} />)}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* styled tooltip */}
            {heatTip && (
              <div style={{ position: 'fixed', left: heatTip.x, top: heatTip.y - 10, transform: 'translate(-50%, -100%)', background: '#0f172a', color: '#fff', padding: '6px 10px', borderRadius: 8, fontSize: '0.72rem', lineHeight: 1.35, whiteSpace: 'nowrap', boxShadow: '0 6px 18px rgba(0,0,0,0.25)', pointerEvents: 'none', zIndex: 1100 }}>
                <div style={{ fontWeight: 700 }}>{heatTip.label}</div>
                <div style={{ color: '#cbd5e1' }}>Active tasks: <b style={{ color: '#fff' }}>{heatTip.n}</b></div>
              </div>
            )}
          </div>
        );
      })()}

      {/* 2 แผง: คอลัมน์ชื่อ (ตรึง) + timeline (เลื่อน x/y เอง → scrollbar อยู่แค่ใต้ timeline) */}
      <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: 8, maxHeight: 640, overflow: 'hidden' }}>
        {/* LEFT — คอลัมน์ชื่อ (เลื่อนแนวตั้ง sync ตาม timeline) */}
        <div ref={leftRef} style={{ width: LEFT_W, minWidth: LEFT_W, flexShrink: 0, overflow: 'hidden', borderRight: '1px solid var(--border-color)', background: '#fff' }}>
          <div style={{ position: 'sticky', top: 0, zIndex: 2, height: HEAD_H * 2, background: '#f1f5f9', display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: '0.72rem', fontWeight: 700, color: '#475569', borderBottom: '1px solid var(--border-color)' }}>Name</div>
          {tasks.map(t => {
            const primary = t.p.model || t.p.product_pn || t.p.work_order || '—';
            const secondary = [t.p.model ? t.p.product_pn : '', t.p.customer].filter(Boolean).join(' · ');
            const full = [t.p.model, t.p.product_pn, t.p.customer].filter(Boolean).join(' · ');
            return (
              <div key={t.p.id} style={{ height: ROW_H, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 10px', borderBottom: '1px solid #f1f5f9', overflow: 'hidden' }} title={full}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{primary}</span>
                {secondary && <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{secondary}</span>}
              </div>
            );
          })}
        </div>

        {/* RIGHT — timeline (overflow auto → scrollbar อยู่แค่ตรงนี้) */}
        <div ref={timelineRef} onScroll={e => { if (leftRef.current) leftRef.current.scrollTop = e.currentTarget.scrollTop; }} style={{ overflow: 'auto', flex: 1 }}>
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
              // แดง = ตั้ง status=Delay เอง (manual) หรือ overdue จริง (today เลย revised/expected แล้วยังไม่ Done)
              const dueDate = t.rev || gToDate(t.p.expected_date) || t.end;
              const overdue = t.p.status !== 'DONE' && !!dueDate && dueDate.getTime() < today.getTime();
              const isLate = t.p.status === 'DELAY' || overdue;
              return (
                <div key={t.p.id} style={{ position: 'relative', height: ROW_H, borderBottom: '1px solid #f1f5f9', zIndex: 1 }}>
                  <div style={{ position: 'absolute', inset: 0, backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent ${DAY_W - 1}px, #eef2f7 ${DAY_W - 1}px, #eef2f7 ${DAY_W}px)` }} />
                  {/* Revised date — เส้นแดงลากต่อจากปลายแท่ง (Expected/PD Done) ไปถึง revised date = ส่วนที่เลื่อนออก
                      · วงกลาง(ปลายแท่ง) + วงปลาย(revised) เป็นแดง · เส้นเว้นระยะไม่ทับวงทั้งสองข้าง */}
                  {t.rev && (() => {
                    const anchor = t.end || t.start || (t.log.length ? t.log[t.log.length - 1].date : null);
                    if (!anchor) return null;
                    const xa = centerX(anchor), xr = centerX(t.rev);
                    if (Math.abs(xr - xa) < 1) return null;   // revised = expected → ไม่มีอะไรให้ลาก
                    const lo = Math.min(xa, xr), hi = Math.max(xa, xr);
                    const lineW = Math.max(0, (hi - lo) - 2 * R);   // เว้นรัศมีวง R ทั้งสองด้าน ไม่ให้เส้นทับวง
                    return (
                      <>
                        {lineW > 0 && <div style={{ position: 'absolute', top: '50%', left: lo + R, width: lineW, height: 3, background: '#dc2626', transform: 'translateY(-50%)', zIndex: 2 }} />}
                        <div title={fmt(anchor)} style={{ position: 'absolute', top: '50%', left: xa - R, width: R * 2, height: R * 2, borderRadius: '50%', background: '#dc2626', border: '2px solid #dc2626', transform: 'translateY(-50%)', boxShadow: '0 0 0 2px #fff', zIndex: 3 }} />
                        <div title={`Revised date: ${fmt(t.rev)}`} style={{ position: 'absolute', top: '50%', left: xr - R, width: R * 2, height: R * 2, borderRadius: '50%', background: '#dc2626', border: '2px solid #dc2626', transform: 'translateY(-50%)', boxShadow: '0 0 0 2px #fff', zIndex: 3, cursor: 'help' }} />
                      </>
                    );
                  })()}
                  {/* Overdue — เลยกำหนดจริง (revised/expected) แล้วยังไม่ Done → เส้นแดงลากจากกำหนด → วันนี้ (แนวเดียวกับเส้น revised) */}
                  {overdue && dueDate && (() => {
                    const xa = centerX(dueDate), xr = centerX(today);
                    const w = Math.max(0, xr - xa - R);   // เริ่มหลังวงกำหนด (เว้น R) ลากไปถึงเส้นวันนี้
                    if (w < 1) return null;
                    return (
                      <>
                        <div style={{ position: 'absolute', top: '50%', left: xa + R, width: w, height: 3, background: '#dc2626', transform: 'translateY(-50%)', zIndex: 2 }} />
                        <div title={`Overdue since ${fmt(dueDate)}`} style={{ position: 'absolute', top: '50%', left: xa - R, width: R * 2, height: R * 2, borderRadius: '50%', background: '#dc2626', border: '2px solid #dc2626', transform: 'translateY(-50%)', boxShadow: '0 0 0 2px #fff', zIndex: 3, cursor: 'help' }} />
                      </>
                    );
                  })()}
                  {t.log.length > 0 ? (() => {
                    const n = t.log.length;
                    const first = t.log[0].date, last = t.log[n - 1].date;
                    const lastStatus = t.log[n - 1].status;
                    // ปลายแท่ง = t.end (PD Done/Expected) เป็นหลัก · ไม่ยืดตาม log หรือวันนี้ → แก้ Expected แล้วแท่งขยับ (ยืด/หด)
                    // จุด/เส้นใน log ที่เลยช่วง [barStart, barEnd] จะถูก clamp มาที่ขอบ (process history เลย Expected = ตัดที่ Expected)
                    const barStart = t.start && t.start.getTime() < first.getTime() ? t.start : first;
                    let barEnd = t.end || last;
                    if (barEnd.getTime() < barStart.getTime()) barEnd = barStart;
                    const clampX = (d: Date) => centerX(new Date(Math.min(Math.max(d.getTime(), barStart.getTime()), barEnd.getTime())));
                    const lastCol = stlOf(lastStatus).border;
                    const xs = centerX(barStart), xe = centerX(barEnd);
                    // จุด = เฉพาะ "เหตุการณ์ที่เปลี่ยนสถานะ" จริง (ยุบ event ที่สถานะซ้ำกับตัวก่อนหน้า → ไม่รกด้วยจุดซ้ำ)
                    const changes = t.log.filter((e, i) => i === 0 || e.status !== t.log[i - 1].status);
                    return (
                      <>
                        {/* เส้นฐานครอบช่วงจริง (สีสถานะล่าสุด) */}
                        <div style={{ position: 'absolute', top: '50%', left: xs, width: Math.max(0, xe - xs), height: 3, background: lastCol, transform: 'translateY(-50%)' }} />
                        {/* เส้นย่อยหลายสีตามช่วง log (แต้มทับเส้นฐาน · clamp ในช่วงแท่ง) */}
                        {t.log.map((pt, i) => {
                          if (i + 1 >= n) return null;
                          const x1 = clampX(pt.date), x2 = clampX(t.log[i + 1].date);
                          if (x2 <= x1) return null;
                          return <div key={'s' + i} title={pt.note || ''}
                            style={{ position: 'absolute', top: '50%', left: x1, width: x2 - x1, height: 3, background: stlOf(pt.status).border, transform: 'translateY(-50%)' }} />;
                        })}
                        {/* จุดหัว/ท้ายแท่ง (barStart / barEnd) */}
                        {xs !== clampX(first) && <div style={{ position: 'absolute', top: '50%', left: xs - R, width: R * 2, height: R * 2, borderRadius: '50%', background: stlOf(t.log[0].status).bg, border: `2px solid ${stlOf(t.log[0].status).border}`, transform: 'translateY(-50%)', boxShadow: '0 0 0 2px #fff', zIndex: 1 }} />}
                        {xe !== clampX(last) && <div style={{ position: 'absolute', top: '50%', left: xe - R, width: R * 2, height: R * 2, borderRadius: '50%', background: stlOf(lastStatus).bg, border: `2px solid ${lastCol}`, transform: 'translateY(-50%)', boxShadow: '0 0 0 2px #fff', zIndex: 1 }} />}
                        {/* จุด = เฉพาะตอนเปลี่ยนสถานะจริง (มีวันที่จริง) — ไม่ใช่จุดต่อ process */}
                        {changes.map((pt, i) => {
                          const x = clampX(pt.date);
                          const s = stlOf(pt.status);
                          const stepLabel = PROCESS_STEPS.find(st => (st.key as string) === pt.step)?.label ?? pt.step;
                          return <div key={'n' + i} title={`${stepLabel}: ${PROC_STATUS_LABEL[pt.status] ?? PP_STATUS_LABEL[pt.status] ?? pt.status}${pt.note ? ` — ${pt.note}` : ''}`}
                            style={{ position: 'absolute', top: '50%', left: x - R, width: R * 2, height: R * 2, borderRadius: '50%', background: s.bg, border: `2px solid ${s.border}`, transform: 'translateY(-50%)', boxShadow: '0 0 0 2px #fff', zIndex: 1, cursor: 'help' }} />;
                        })}
                      </>
                    );
                  })() : t.start ? (() => {
                    // สีแท่งตามสถานะจริง (ให้ตรงกับช่อง Status ในตาราง): เลท=แดง · Done=เขียว · อื่นๆ=ฟ้าสด (On process)
                    const stl = isLate ? STATUS_STYLE.DELAY : (t.p.status === 'DONE' ? STATUS_STYLE.DONE : STATUS_STYLE.ON_PROCESS);
                    const xs = centerX(t.start), xe = centerX(t.end || t.start);
                    return (
                      <div title={`${t.p.product_pn || t.p.model || ''} | ${fmt(t.start)} - ${fmt(t.end || t.start)}`} style={{ position: 'absolute', inset: 0 }}>
                        <div style={{ position: 'absolute', top: '50%', left: xs, width: Math.max(0, xe - xs), height: 3, background: stl.border, transform: 'translateY(-50%)' }} />
                        <div style={{ position: 'absolute', top: '50%', left: xs - R, width: R * 2, height: R * 2, borderRadius: '50%', background: stl.bg, border: `2px solid ${stl.border}`, transform: 'translateY(-50%)', boxShadow: '0 0 0 2px #fff' }} />
                        <div style={{ position: 'absolute', top: '50%', left: xe - R, width: R * 2, height: R * 2, borderRadius: '50%', background: stl.bg, border: `2px solid ${stl.border}`, transform: 'translateY(-50%)', boxShadow: '0 0 0 2px #fff' }} />
                      </div>
                    );
                  })() : null}
                </div>
              );
            })}

            {/* เส้นวันนี้ */}
            {todayOff >= 0 && todayOff < totalDays && (
              <div style={{ position: 'absolute', top: HEAD_H * 2, bottom: 0, left: todayOff * DAY_W + DAY_W / 2, width: 2, background: '#ef4444', zIndex: 2, pointerEvents: 'none' }}>
                <span style={{ position: 'absolute', top: -2, left: '50%', transform: 'translateX(-50%)', background: '#ef4444', color: '#fff', fontSize: '0.78rem', fontWeight: 700, padding: '3px 10px', borderRadius: 6, whiteSpace: 'nowrap', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}>Today</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {skipped > 0 && (
        <div style={{ padding: '6px 12px', fontSize: '0.72rem', color: '#94a3b8' }}>
          * {skipped} job(s) hidden — no PD Start / Process history
        </div>
      )}

      {/* วันที่ปีหลุดช่วง / ช่วงกว้างเกินเพดาน = ต้องเห็นชัด ไม่ใช่เงียบแล้วกราฟเพี้ยน */}
      {(badDateRows.length > 0 || spanClamped) && (
        <div style={{ padding: '8px 12px', marginTop: 6, fontSize: '0.75rem', color: '#9a3412', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8 }}>
          {badDateRows.length > 0 && (
            <div>
              ⚠️ {badDateRows.length} job(s) have a date outside {GANTT_YEAR_MIN}–{GANTT_YEAR_MAX} — those dates are ignored in the Gantt. Please fix: {badDateRows.slice(0, 5).map(p => p.work_order || p.model || `#${p.id}`).join(', ')}{badDateRows.length > 5 ? ', …' : ''}
            </div>
          )}
          {spanClamped && <div>⚠️ Date range wider than {Math.round(GANTT_MAX_SPAN_DAYS / 365)} years — the timeline was trimmed. Check the dates in the table.</div>}
        </div>
      )}
    </div>
  );
}
