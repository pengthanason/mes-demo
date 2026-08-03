// ── SVG diagram builders (FlowChart + Gantt) ──
// แยกจาก WorkflowBuilder.tsx เดิม — ย้ายโค้ด ไม่เปลี่ยนพฤติกรรม

import { type Step, fmtTime } from './workflowCore';
import { categorize } from './categorize';

/* ── วาด flowchart ขาว-ดำ สไตล์ฟอร์ม FM 05 (รองรับหลายคอลัมน์) ──
   • กล่องเลขเล็ก (◻ process · ◇ decision) เรียงลง + คำอธิบายด้านขวา
   • ขั้นตรวจ = ◇ มีทางแยก "ใช่" (ผ่าน ↓) / "ไม่" (✗ → ซ่อม-ตรวจซ้ำ หรือ ย้อนขั้นก่อน)
   • ยาวมาก → ไม่ย่อจิ๋ว แต่ขึ้นคอลัมน์ใหม่ทางขวา (ตัดระหว่างช่องเท่านั้น) · ขึ้นคอลัมน์กลางหมวด = ทำหัวข้อหมวดซ้ำบนสุด "(ต่อ)"
   • หัวข้อคั่น = หมวดที่ AI จัดให้ (categorize) */
export function buildFlowSvg(steps: Step[]): string {
  const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (!steps.length) return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="60" font-family="'Segoe UI',Tahoma,sans-serif"><text x="120" y="34" text-anchor="middle" font-size="13" fill="#64748b">No steps yet</text></svg>`;

  const MX = 20, GAP = 22, HEAD_H = 26, LINEH = 15;
  const BW = 40, BH = 28, DHW = 26, DHH = 20;
  const cats = categorize(steps);

  // เลขในผัง: แต่ละขั้น = 1 เลข · ขั้นตรวจมีกล่อง "ไม่ผ่าน" ต่อท้ายอีก 1 เลข (พฤติกรรมตาม failAction)
  const stepNum: number[] = [];
  const failNum: number[] = [];
  { let dn = 0; steps.forEach(s => { stepNum.push(++dn); failNum.push(s.kind === 'checkpoint' ? ++dn : 0); }); }
  const firstPerUnit = steps.findIndex(s => s.timeScope !== 'once');   // ต้นสายผลิต (scrap = ทิ้งชิ้นนี้ เริ่มชิ้นใหม่) · -1 = งานทำครั้งเดียว

  type Row =
    | { t: 'head'; label: string; h: number; top: number; mid: number; bottom: number }
    | { t: 'step'; s: Step; i: number; dec: boolean; lines: string[]; timeStr: string; h: number; top: number; mid: number; bottom: number };

  // สร้างแถว (ยังไม่ระบุตำแหน่ง) ตามความกว้างคำอธิบายที่กำหนด — ตัดสูงสุด 2 บรรทัด
  const makeRows = (descMax: number) => {
    const wrap = (t: string): string[] => {
      const words = t.trim().split(/\s+/);
      const lines: string[] = [];
      let cur = '';
      for (const w of words) {
        if (!cur) cur = w;
        else if ((cur + ' ' + w).length <= descMax) cur += ' ' + w;
        else { lines.push(cur); cur = w; }
        while (cur.length > descMax) { lines.push(cur.slice(0, descMax)); cur = cur.slice(descMax); }
        if (lines.length >= 2) break;
      }
      if (cur && lines.length < 2) lines.push(cur);
      if (lines.length > 2) lines.length = 2;
      return lines;
    };
    const rows: Row[] = [];
    let prevCat = '';
    steps.forEach((s, i) => {
      if (cats[i] !== prevCat) { rows.push({ t: 'head', label: cats[i], h: HEAD_H, top: 0, mid: 0, bottom: 0 }); prevCat = cats[i]; }
      const lines = wrap(s.process || '');
      const timeStr = s.seconds !== '' ? fmtTime(Number(s.seconds)) : '';   // เวลา → บรรทัดแยกด้านล่าง (ไม่มีไอคอนนาฬิกา)
      const dec = s.kind === 'checkpoint';
      const nLines = lines.length + (timeStr ? 1 : 0);
      const h = Math.max(dec ? 2 * DHH : BH, nLines * LINEH + 8);
      rows.push({ t: 'step', s, i, dec, lines, timeStr, h, top: 0, mid: 0, bottom: 0 });
    });
    const naturalH = rows.reduce((a, r) => a + r.h + GAP, 0) - GAP;
    return { rows, naturalH };
  };

  // เลือกจำนวนคอลัมน์: สั้น → 1 คอลัมน์กว้าง (เหมือนเดิม) · ยาว → หลายคอลัมน์แคบ ให้ aspect ใกล้หน้ากระดาษ (ไม่ย่อจิ๋ว)
  let descMax = 58, COL_W = 640, NX_LOCAL = 80, COL_GAP = 0, nCols = 1;
  let built = makeRows(descMax);
  if (built.naturalH > 1500) {
    descMax = 30; COL_W = 340; NX_LOCAL = 80; COL_GAP = 28;
    built = makeRows(descMax);
    nCols = Math.max(2, Math.min(5, Math.round(Math.sqrt(built.naturalH / COL_W))));
  }
  const rows = built.rows;

  // แบ่งแถวเข้าคอลัมน์ (บาลานซ์ตามความสูง · ตัดระหว่างแถวเท่านั้น · ไม่ทิ้งหัวข้อไว้ท้ายคอลัมน์)
  const cols: Row[][] = [];
  if (nCols === 1) cols.push(rows);
  else {
    const targetH = built.naturalH / nCols;
    let cur: Row[] = [], curH = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i], rH = r.h + GAP;
      if (cols.length < nCols - 1 && curH > 0) {
        const wouldOver = curH + rH > targetH;
        const headOrphan = r.t === 'head' && (curH + rH + 78 > targetH);   // หัวข้อใกล้ท้ายคอลัมน์ → ยกไปเริ่มคอลัมน์ใหม่
        if (wouldOver || headOrphan) { cols.push(cur); cur = []; curH = 0; }
      }
      cur.push(r); curH += rH;
    }
    cols.push(cur);
  }
  nCols = cols.length;

  // ขึ้นคอลัมน์ใหม่กลางหมวด → ทำหัวข้อหมวดซ้ำไว้บนสุด (ชื่อหมวดที่ต่อเนื่องมา + "(ต่อ)")
  for (let ci = 1; ci < cols.length; ci++) {
    const first = cols[ci][0];
    if (first && first.t === 'step') {
      cols[ci].unshift({ t: 'head', label: `${cats[first.i]} (cont.)`, h: HEAD_H, top: 0, mid: 0, bottom: 0 });
    }
  }
  // ท้ายคอลัมน์ (ที่ไม่ใช่อันสุดท้าย) → แถบบอกว่าไหลต่อไปหมวดไหนในคอลัมน์ถัดไป (กันงงว่าขั้นสุดท้ายไปไหน)
  for (let ci = 0; ci < cols.length - 1; ci++) {
    const nf = cols[ci + 1][0];
    const label = nf && nf.t === 'head' ? nf.label.replace(' (cont.)', '') : '';
    if (label) cols[ci].push({ t: 'head', label: `${label} ▶`, h: HEAD_H, top: 0, mid: 0, bottom: 0 });
  }

  // จัดตำแหน่งในแต่ละคอลัมน์
  const topPad = 12;
  type ColInfo = { ci: number; colX0: number; colNX: number; colDESCX: number; rows: Row[]; lastBottom: number };
  const colInfo: ColInfo[] = cols.map((crows, ci) => {
    const colX0 = MX + ci * (COL_W + COL_GAP);
    const colNX = colX0 + NX_LOCAL;
    let yy = topPad;
    crows.forEach(r => { r.top = yy; r.mid = yy + r.h / 2; r.bottom = yy + r.h; yy += r.h + GAP; });
    return { ci, colX0, colNX, colDESCX: colNX + 40, rows: crows, lastBottom: yy - GAP };
  });
  const stepPos: Record<number, { ci: number; mid: number; colNX: number }> = {};   // ตำแหน่งแต่ละขั้น (สำหรับลากเส้นย้อน)
  colInfo.forEach(col => col.rows.forEach(r => { if (r.t === 'step') stepPos[r.i] = { ci: col.ci, mid: r.mid, colNX: col.colNX }; }));

  let maxBottom = 0;
  colInfo.forEach(col => { maxBottom = Math.max(maxBottom, col.lastBottom); });
  const totalH = maxBottom + 12;
  const WSVG = MX + nCols * COL_W + (nCols - 1) * COL_GAP + MX;

  const parts: string[] = [];
  parts.push(`<defs>`
    + `<marker id="ah" markerWidth="8" markerHeight="8" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#111"/></marker>`
    + `<marker id="ahb" markerWidth="8" markerHeight="8" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#555"/></marker>`
    + `</defs>`);

  let crossN = 0;   // นับเส้นย้อนข้ามคอลัมน์ (แยกเลนขอบบน/ซ้ายสุด กันทับ)
  colInfo.forEach(col => {
    const { colX0, colNX, colDESCX, rows: crows, ci } = col;

    // หัวข้อหมวด (แถบเทา เต็มความกว้างคอลัมน์)
    crows.forEach(r => {
      if (r.t !== 'head') return;
      parts.push(`<rect x="${colX0}" y="${r.top}" width="${COL_W}" height="${r.h}" fill="#f1f1f1" stroke="#111" stroke-width="1"/>`);
      parts.push(`<text x="${colX0 + COL_W / 2}" y="${r.mid}" text-anchor="middle" dominant-baseline="central" font-size="12" font-weight="700" fill="#111">▍ ${esc(r.label)}</text>`);
    });

    // สไปน์ระหว่างแถว + ป้าย "ใช่" ใต้ decision
    for (let k = 0; k < crows.length - 1; k++) {
      const a = crows[k], b = crows[k + 1];
      parts.push(`<line x1="${colNX}" y1="${a.bottom}" x2="${colNX}" y2="${b.top}" stroke="#111" stroke-width="1.3" ${b.t === 'step' ? 'marker-end="url(#ah)"' : ''}/>`);
      if (a.t === 'step' && a.dec) parts.push(`<text x="${colNX + 7}" y="${(a.bottom + b.top) / 2}" font-size="9.5" fill="#111" dominant-baseline="central">Pass</text>`);
    }

    // โหนด + คำอธิบาย + ทางแยก "ไม่ผ่าน"
    let backN = 0;   // นับเส้นย้อนกลับในคอลัมน์นี้ (แต่ละเส้นได้เลนเฉพาะ ไม่ทับกัน)
    crows.forEach(r => {
      if (r.t !== 'step') return;
      const num = stepNum[r.i], cy = r.mid;
      const total = r.lines.length + (r.timeStr ? 1 : 0);
      const y0 = cy - (total - 1) * LINEH / 2;
      r.lines.forEach((ln, li) => {
        parts.push(`<text x="${colDESCX}" y="${y0 + li * LINEH}" font-size="11.5" fill="#111" dominant-baseline="central">${esc(ln)}</text>`);
      });
      if (r.timeStr) parts.push(`<text x="${colDESCX}" y="${y0 + r.lines.length * LINEH}" font-size="9.5" fill="#64748b" dominant-baseline="central">${esc(r.timeStr)}</text>`);
      if (!r.dec) {
        parts.push(`<rect x="${colNX - BW / 2}" y="${cy - BH / 2}" width="${BW}" height="${BH}" fill="#fff" stroke="#111" stroke-width="1.4"/>`);
        parts.push(`<text x="${colNX}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="11.5" font-weight="700" fill="#111">${num}</text>`);
        return;
      }
      // ◇ decision (จุดตรวจ)
      parts.push(`<polygon points="${colNX},${cy - DHH} ${colNX + DHW},${cy} ${colNX},${cy + DHH} ${colNX - DHW},${cy}" fill="#fff" stroke="#111" stroke-width="1.4"/>`);
      parts.push(`<text x="${colNX}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="11" font-weight="700" fill="#111">${num}</text>`);
      // กล่อง "ไม่ผ่าน" — พฤติกรรมต่างกันตาม failAction ของจุดตรวจนี้
      const s = r.s;
      const fa = s.failAction || 'rework';
      const tIdx = s.backToId ? steps.findIndex(x => x.id === s.backToId) : -1;
      const dLeft = colNX - DHW;
      const FBW = 34, FBH = 20;
      const fcx = colX0 + 4 + FBW / 2;
      parts.push(`<line x1="${dLeft}" y1="${cy}" x2="${fcx + FBW / 2}" y2="${cy}" stroke="#555" stroke-width="1.2" marker-end="url(#ahb)"/>`);
      parts.push(`<rect x="${fcx - FBW / 2}" y="${cy - FBH / 2}" width="${FBW}" height="${FBH}" fill="#fff" stroke="#111" stroke-width="1.3"/>`);
      parts.push(`<text x="${fcx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="10.5" font-weight="700" fill="#111">${failNum[r.i]}</text>`);
      const cap = (t: string) => parts.push(`<text x="${fcx}" y="${cy + FBH / 2 + 7}" text-anchor="middle" font-size="8" fill="#555">${esc(t)}</text>`);
      const loopBack = () => parts.push(`<path d="M ${fcx} ${cy - FBH / 2} V ${cy - DHH - 8} H ${colNX} V ${cy - DHH}" fill="none" stroke="#555" stroke-width="1.2" stroke-dasharray="4 3" marker-end="url(#ahb)"/>`);
      // ลากเส้นประกลับไปขั้นเป้าหมาย — แต่ละเส้นได้ "เลน" เฉพาะ (ไม่ซ้ำ) เดินในช่องว่างซ้ายคอลัมน์/ซ้ายสุดของหน้า จึงไม่ทับกัน
      const gotoStep = (ti: number) => {
        const tp = ti >= 0 ? stepPos[ti] : null;
        if (!tp) return;
        const startX = fcx - FBW / 2, tx = tp.colNX - BW / 2;
        const laneX = Math.max(1, colX0 - 5 - backN * 5); backN++;
        if (tp.ci === ci) {
          // คอลัมน์เดียวกัน → เลนในช่องว่างซ้ายคอลัมน์ (ซ้ายของแถบหัวข้อ ไม่ทับเนื้อหา)
          parts.push(`<path d="M ${startX} ${cy} H ${laneX} V ${tp.mid} H ${tx}" fill="none" stroke="#555" stroke-width="1.2" stroke-dasharray="4 3" marker-end="url(#ahb)"/>`);
        } else {
          // ไกลข้ามคอลัมน์ → อ้อมขึ้นขอบบน ไปเลนซ้ายสุด แล้วลงหาเป้าหมาย (แต่ละเส้นคนละเลน)
          const topY = 4 + (crossN % 4) * 3, farX = 3 + (crossN % 4) * 4; crossN++;
          parts.push(`<path d="M ${startX} ${cy} H ${laneX} V ${topY} H ${farX} V ${tp.mid} H ${tx}" fill="none" stroke="#555" stroke-width="1.2" stroke-dasharray="4 3" marker-end="url(#ahb)"/>`);
        }
      };
      if (fa === 'scrap') {
        cap(firstPerUnit >= 0 ? `Discard → start #${stepNum[firstPerUnit]}` : 'Scrap (end)');
        if (firstPerUnit >= 0) gotoStep(firstPerUnit);   // ทิ้งชิ้นนี้ → ลากไปต้นสายผลิต
      } else if (fa === 'back') {
        cap(tIdx >= 0 ? `Back to #${stepNum[tIdx]}` : 'Back');
        gotoStep(tIdx);
      } else if (fa === 'hold') {
        cap(Number(s.holdMin) > 0 ? `Hold ${s.holdMin} min` : 'Hold'); loopBack();   // พักแล้ววนทำเดิมต่อ (วนใกล้ๆ)
      } else {
        cap('Rework'); loopBack();                                                     // รีเวิคแล้วตรวจซ้ำ (วนใกล้ๆ)
      }
    });
  });

  return `<svg viewBox="0 0 ${WSVG} ${totalH}" width="${WSVG}" height="${totalH}" xmlns="http://www.w3.org/2000/svg" font-family="'Segoe UI',Tahoma,sans-serif">${parts.join('')}</svg>`;
}

/* ── Gantt chart (SVG) — สไตล์คลาสสิก · แถว = สถานี(task) · 1 แท่ง/สถานี (ชิ้นแรกเข้า → ชิ้นสุดท้ายออก) ──
   หัวตารางเวลา 2 ชั้น (ช่วงใหญ่ = น้ำเงิน / ช่องย่อย = เทา) + เส้น grid
   ตารางเวลา flow-shop: ชิ้น p ออกสถานี i เมื่อ C[p][i] = max(ออกจากสถานีก่อนหน้า, เครื่องว่าง) + เวลา
   ยุบเป็นแท่งเดียว: start_i = เวลาที่ชิ้นแรกเข้าสถานี i, end_i = เวลาที่ชิ้นสุดท้ายออกสถานี i */
// เคอร์เซอร์ = pointer (มือชี้ธรรมดา) ทั้งตอน hover และตอนลาก — ไม่มีมือกำ (grabbing)
export const CURSOR_GRAB = 'pointer';
export const CURSOR_GRABBING = 'pointer';

export function buildGanttSvg(steps: Step[], qty: number, zoom: number = 1, fitW: number = 1000): { label: string; chart: string; full: string } {
  const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const sec = (s: Step) => Number(s.seconds) || 0;
  const mach = (s: Step) => Math.max(1, Number(s.stations) || 1);
  const N = Math.max(1, Math.floor(qty) || 1);

  type Row = { label: string; t: number; m: number; start: number; end: number; once: boolean };
  const rows: Row[] = steps.map(s => ({ label: s.process, t: sec(s), m: mach(s), start: 0, end: 0, once: s.timeScope === 'once' }));

  // ตำแหน่งสถานี "ทุกชิ้น" (per) — ใช้แบ่ง once เป็น ก่อนผลิต(setup) / หลังผลิต(เก็บ/แพ็ก)
  const perPos = steps.map((s, i) => (s.timeScope !== 'once' ? i : -1)).filter(i => i >= 0);
  const S = perPos.length;

  if (S === 0) {
    // ไม่มีสถานีผลิต → ทุกขั้นเรียงต่อกันตามลำดับ
    let c = 0;
    for (const r of rows) { r.start = c; r.end = c + r.t; c += r.t; }
  } else {
    const lastPer = perPos[perPos.length - 1];
    // 1) setup ต้นสาย = once ที่อยู่ "ก่อน" สถานีผลิตสุดท้าย เรียงต่อกันจาก 0
    let cum = 0;
    steps.forEach((s, idx) => { if (s.timeScope === 'once' && idx < lastPer) { rows[idx].start = cum; rows[idx].end = cum + rows[idx].t; cum += rows[idx].t; } });
    const setupSec = cum;                              // สถานีผลิตเริ่มหลัง setup

    // 2) จำลองสายพาน (flow-shop) หา start/end ต่อสถานีผลิต (รองรับ m เครื่องขนาน)
    const per = perPos.map(i => ({ t: sec(steps[i]), m: mach(steps[i]) }));
    const bottleneck = per.reduce((mx, p) => Math.max(mx, p.t / p.m), 0);
    const firstStart: number[] = new Array(S), lastEnd: number[] = new Array(S);
    const SIM = Math.min(N, 20000);                    // จำลองพอถึง steady-state แล้ว extrapolate ที่เหลือ
    const ring = per.map(p => new Array(p.m).fill(setupSec));   // เวลาว่างล่าสุดของ m เครื่องต่อสถานี
    for (let p = 0; p < SIM; p++) {
      let prevOut = setupSec;                          // ชิ้นเข้าสถานีแรกหลัง setup
      for (let i = 0; i < S; i++) {
        const slot = p % per[i].m;
        const startT = Math.max(prevOut, ring[i][slot]);
        const outT = startT + per[i].t;
        ring[i][slot] = outT;
        if (p === 0) firstStart[i] = startT;
        if (p === SIM - 1) lastEnd[i] = outT;
        prevOut = outT;
      }
    }
    if (N > SIM) { const extra = (N - SIM) * bottleneck; for (let i = 0; i < S; i++) lastEnd[i] += extra; }
    perPos.forEach((idx, i) => { rows[idx].start = firstStart[i]; rows[idx].end = lastEnd[i]; });

    // 3) ขั้นปิดท้าย = once ที่อยู่ "หลัง" สถานีผลิตสุดท้าย (เช่น Store/Packing) ต่อจากผลิตเสร็จ
    let tcum = lastEnd.length ? Math.max(...lastEnd) : setupSec;
    steps.forEach((s, idx) => { if (s.timeScope === 'once' && idx > lastPer) { rows[idx].start = tcum; rows[idx].end = tcum + rows[idx].t; tcum += rows[idx].t; } });
  }

  // แท่ง = ช่วงจริงบนสายพาน: ชิ้นแรกเข้า → ชิ้นสุดท้ายออก · สถานีล่างจบทีหลังสถานีบนเสมอ (ลำดับถูกต้อง)
  const axisMax = rows.reduce((mx, r) => Math.max(mx, r.end), 0);

  // ── section อัตโนมัติ (categorize) — เป็นหัวข้อคั่น กางหมดตลอด ไม่ต้องกด/ไม่ต้องจัดเอง ──
  const cats = categorize(steps);
  type Disp = { kind: 'group'; cat: string; count: number } | { kind: 'task'; label: string; t: number; m: number; start: number; end: number; once: boolean };
  const disp: Disp[] = [];
  const groupLabels: string[] = [];
  { let gi = 0;
    while (gi < rows.length) {
      const cat = cats[gi]; let gj = gi;
      while (gj < rows.length && cats[gj] === cat) gj++;
      const mem = rows.slice(gi, gj);
      disp.push({ kind: 'group', cat, count: mem.length });
      groupLabels.push(`${cat} (${mem.length})`);
      mem.forEach(m => disp.push({ kind: 'task', label: m.label, t: m.t, m: m.m, start: m.start, end: m.end, once: m.once }));
      gi = gj;
    }
  }

  // ── layout ──
  // task-name column: กว้างพอดีหัวข้อ/ชื่อกลุ่มที่ยาวสุด + เผื่อสามเหลี่ยม/ย่อหน้า
  const NAME_FS = 14.5, NAME_CHAR_PX = NAME_FS * 0.62, NAME_PAD_L = 14, NAME_PAD_R = 14;
  const longestNamePx = [...rows.map(r => r.label), ...groupLabels].reduce((mx, l) => Math.max(mx, l.length * NAME_CHAR_PX), 0);
  const LX = Math.round(Math.min(340, Math.max(210, longestNamePx + NAME_PAD_L + NAME_PAD_R + 24)) * 0.85);   // ×0.85 = ลดช่องชื่อ ~15%
  const maxNameChars = Math.max(6, Math.floor((LX - NAME_PAD_L - NAME_PAD_R - 24) / NAME_CHAR_PX));
  const fitName = (s: string) => (s.length <= maxNameChars ? s : s.slice(0, maxNameChars - 1).trimEnd() + '…');
  const TITLE_H = 34, H2 = 24, ROW_H = 46, BAR_H = 22, PADR = 4;
  const plotTop = TITLE_H + H2;
  const R = disp.length;
  const plotBot = plotTop + R * ROW_H;

  if (!R || axisMax <= 0) {
    const Wsvg = LX + 720 + PADR;
    const emptySvg = `<svg viewBox="0 0 ${Wsvg} 120" width="${Wsvg}" height="120" xmlns="http://www.w3.org/2000/svg" font-family="'Segoe UI',Tahoma,sans-serif"><text x="${Wsvg / 2}" y="60" text-anchor="middle" font-size="13" fill="#94a3b8">No steps with time yet — add steps + enter time to view the Gantt</text></svg>`;
    return { label: '', chart: emptySvg, full: emptySvg };
  }

  // ── เลือกหน่วยเวลาช่องย่อยแบบกลมๆ ให้ได้ ~6 ช่อง ──
  const NICE = [1, 2, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 300, 600, 900, 1200, 1800, 2700, 3600, 7200, 10800, 14400, 21600, 43200, 86400, 172800, 432000, 864000];
  // ยิ่งซูม ยิ่งมีช่องเวลาถี่ขึ้น → step เล็กลง (เช่น 2ชม.→30น.→5น.) อ่านเวลาละเอียดขึ้น · ~12 ช่องที่ 100% (ถี่)
  const targetCols = Math.min(96, Math.max(6, Math.round(12 * zoom)));
  let step = NICE[NICE.length - 1];
  for (const s of NICE) { if (axisMax / s <= targetCols) { step = s; break; } }
  // กัน qty มหาศาล: จำกัดจำนวนช่องไม่ให้ SVG ระเบิด
  if (axisMax / step > 120) step = Math.ceil(axisMax / 120);
  const minorCount = Math.max(1, Math.ceil(axisMax / step));
  const gridMax = minorCount * step;

  // ที่ zoom 1 ให้เต็มความกว้างพาเนลพอดี (ขนาดจริง ไม่ scale) · ซูมเข้า = W โตขึ้น (คอลัมน์เยอะ/ถี่ขึ้น) เลื่อนได้
  const baseW = Math.max(320, (fitW || 1000) - LX - PADR - 2);
  const W = Math.round(baseW * zoom);
  const Wsvg = LX + W + PADR;
  const svgH = plotBot + 18;
  const x = (t: number) => LX + (t / gridMax) * W;
  // เวลานาฬิกา สมมติเริ่มกะ 08:00 (ไม่มี datetime จริงในข้อมูล) — เกิน 24 ชม. ต่อท้าย (+Nว)
  const clockAt = (sec: number) => {
    const total = 8 * 3600 + Math.round(sec);
    const day = Math.floor(total / 86400), rem = total % 86400;
    const hh = Math.floor(rem / 3600), mm = Math.floor((rem % 3600) / 60);
    const s = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    return day > 0 ? `${s} (+${day}d)` : s;
  };

  // ขาว-ดำ-เทา (ทางการ ใส่รายงานได้ เข้าชุดกับ flowchart) — ไม่ใช้สีสด
  const C_HDR = '#e2e8f0', C_HDRTX = '#1f2937', C_GREY = '#f1f5f9', C_GRID = '#aeb9c7', C_BAR = '#475569', C_ONCE = '#e2e8f0', C_ONCE_BD = '#94a3b8';
  const parts: string[] = [];

  // title + total

  // header: Task Name cell
  parts.push(`<rect x="0" y="${TITLE_H}" width="${LX}" height="${H2}" fill="${C_HDR}"/>`);
  parts.push(`<text x="16" y="${TITLE_H + H2 / 2}" dominant-baseline="central" font-size="14" font-weight="700" fill="${C_HDRTX}">Task Name</text>`);

  // header เวลา (ช่องย่อย · เทา) — เอาแถบช่วงใหญ่ด้านบนออกแล้ว
  const y2 = TITLE_H;
  parts.push(`<rect x="${LX}" y="${y2}" width="${W}" height="${H2}" fill="${C_GREY}"/>`);
  for (let k = 0; k < minorCount; k++) {
    const cx1 = x(k * step), cx2 = x((k + 1) * step);
    if (k > 0) parts.push(`<line x1="${cx1}" y1="${y2}" x2="${cx1}" y2="${y2 + H2}" stroke="#cbd5e1" stroke-width="1"/>`);
    parts.push(`<text x="${(cx1 + cx2) / 2}" y="${y2 + H2 / 2}" text-anchor="middle" dominant-baseline="central" font-size="11.5" fill="#37474f">${esc(fmtTime((k + 1) * step))}</text>`);
  }

  // วาด 3 ชั้น: (A) พื้นหัวกลุ่ม → (B) เส้น grid → (C) แท่ง+ข้อความ · เส้นต่อเนื่องทุกแถวถึงข้อสุดท้าย และอยู่ "หลัง" แท่งข้อมูล (แท่งทับเส้น)
  // (A) พื้นหลังแถว: zebra (แถวคี่) + หัวกลุ่ม — วาดก่อน grid (เส้นจะลากทับพื้นทีหลัง ต่อเนื่องทุกแถว)
  disp.forEach((d, i) => {
    const ry = plotTop + i * ROW_H;
    if (d.kind === 'group') {
      parts.push(`<rect x="0" y="${ry}" width="${LX + W}" height="${ROW_H}" fill="#eef2f7"/>`);
      parts.push(`<line x1="0" y1="${ry}" x2="${LX + W}" y2="${ry}" stroke="#94a3b8" stroke-width="1.5"/>`);
    } else if (i % 2 === 1) {
      parts.push(`<rect x="0" y="${ry}" width="${LX + W}" height="${ROW_H}" fill="#f6f8fa"/>`);
    }
  });

  // (B) เส้น grid — เส้นบาง + เส้นย่อยกลางช่อง (ครึ่งเวลา = ถี่ขึ้น) · ทับพื้น/zebra แต่ก่อนแท่ง → ต่อเนื่องทุกแถวถึงข้อสุดท้าย อยู่หลังแท่ง
  for (let k = 0; k <= minorCount; k++) {
    const gx = x(k * step);
    parts.push(`<line x1="${gx}" y1="${plotTop}" x2="${gx}" y2="${plotBot}" stroke="${C_GRID}" stroke-width="0.6"/>`);
    if (k < minorCount) {
      const gm = x((k + 0.5) * step);   // เส้นย่อยครึ่งช่อง — บาง+จางกว่า
      parts.push(`<line x1="${gm}" y1="${plotTop}" x2="${gm}" y2="${plotBot}" stroke="#dbe1e9" stroke-width="0.4"/>`);
    }
  }
  for (let i = 0; i <= R; i++) {
    if (i < R && disp[i].kind === 'group') continue;
    const gy = plotTop + i * ROW_H;
    parts.push(`<line x1="0" y1="${gy}" x2="${LX + W}" y2="${gy}" stroke="${C_GRID}" stroke-width="0.6"/>`);
  }

  // (C) เนื้อหาแถว (ชื่อ/หัวกลุ่ม/แท่ง/ข้อความ) — ทับ grid ทั้งหมด (แท่งอยู่หน้า เส้นอยู่หลัง)
  disp.forEach((d, i) => {
    const ry = plotTop + i * ROW_H, mid = ry + ROW_H / 2;
    if (d.kind === 'group') {
      parts.push(`<text x="12" y="${mid}" dominant-baseline="central" font-size="13" font-weight="700" fill="#1f2937">${esc(fitName(`${d.cat} (${d.count})`))}</text>`);
    } else {
      const shownName = fitName(d.label);
      parts.push(`<text x="30" y="${mid - 6}" dominant-baseline="central" font-size="${NAME_FS}" fill="#1f2937">${shownName !== d.label ? `<title>${esc(d.label)}</title>` : ''}${esc(shownName)}</text>`);
      parts.push(`<text x="30" y="${mid + 11}" dominant-baseline="central" font-size="9.5" fill="#90a0ac">${esc(d.once ? `Once · ${fmtTime(d.t)}` : `×${d.m} machines · ${fmtTime(d.t)}/pc`)}</text>`);
      const bx = x(d.start), bw = Math.max(7, x(d.end) - x(d.start)), by = mid - BAR_H / 2;
      // ชี้ที่ "ตัวกล่อง" (บาร์) เท่านั้น → tooltip (custom ขึ้นทันที): เริ่มกี่โมง / ชิ้นละกี่นาที / เสร็จกี่โมง
      const tip = `${d.label}\nStart ${clockAt(d.start)}\nPer pc ${fmtTime(d.t)}${d.once ? ' (once)' : ` · ×${d.m} machines`}\nEnd ${clockAt(d.end)}`;
      parts.push(`<rect x="${bx.toFixed(1)}" y="${by}" width="${bw.toFixed(1)}" height="${BAR_H}" rx="3" fill="${d.once ? C_ONCE : (i % 2 ? '#64748b' : C_BAR)}" stroke="${d.once ? C_ONCE_BD : '#334155'}" stroke-width="1" data-tip="${esc(tip).replace(/"/g, '&quot;')}"/>`);
      const durTxt = fmtTime(Math.round(d.end - d.start));
      if (bx + bw + 46 < LX + W) parts.push(`<text x="${(bx + bw + 7).toFixed(1)}" y="${mid}" dominant-baseline="central" font-size="10" pointer-events="none" fill="#475569">${esc(durTxt)}</text>`);
      else parts.push(`<text x="${(bx + bw - 7).toFixed(1)}" y="${mid}" text-anchor="end" dominant-baseline="central" font-size="10" font-weight="600" pointer-events="none" fill="${d.once ? '#1f2937' : '#fff'}">${esc(durTxt)}</text>`);
    }
  });

  // เส้นแบ่ง task/timeline + กรอบนอก
  parts.push(`<line x1="${LX}" y1="${TITLE_H}" x2="${LX}" y2="${plotBot}" stroke="#b4c1cf" stroke-width="1.5"/>`);
  parts.push(`<rect x="0" y="${TITLE_H}" width="${LX + W}" height="${plotBot - TITLE_H}" fill="none" stroke="#b4c1cf" stroke-width="1.5"/>`);

  const body = parts.join('');
  const A = `xmlns="http://www.w3.org/2000/svg" font-family="'Segoe UI',Tahoma,sans-serif" style="display:block"`;
  // แยก 2 ชิ้น body เดียวกัน ต่าง viewBox: label (ตรึงคอลัมน์ชื่อ 0..LX) + chart (เลื่อนไทม์ไลน์ LX..) → แถวตรงกันเป๊ะ · full = รวม (export PDF)
  return {
    label: `<svg viewBox="0 0 ${LX} ${svgH}" width="${LX}" height="${svgH}" ${A}>${body}</svg>`,
    chart: `<svg viewBox="${LX} 0 ${W + PADR} ${svgH}" width="${W + PADR}" height="${svgH}" ${A}>${body}</svg>`,
    full: `<svg viewBox="0 0 ${Wsvg} ${svgH}" width="${Wsvg}" height="${svgH}" ${A}>${body}</svg>`,
  };
}
