// ── flowchart (SVG) → พิมพ์ (Save as PDF) ──
// แยกจาก WorkflowBuilder.tsx เดิม — ย้ายโค้ด ไม่เปลี่ยนพฤติกรรม

import { type Step, fmtTime } from './workflowCore';
import { showToast } from '../../lib/toast';

export type ExportMeta = {
  title?: string; customer?: string; model?: string; pn?: string;
  issuedBy?: string; checkedBy?: string; approvedBy?: string;
  revNo?: string; revDate?: string; revDesc?: string;
  filename?: string;   // ชื่อไฟล์ (ใช้เป็น title → default ตอน Save as PDF)
  form?: boolean;   // true = เจนเป็นฟอร์ม PROCESS FLOW CHART (FM 05) · false = เอกสารทั่วไป (เช่น Gantt)
  timeHtml?: string;   // ถ้ามี → เพิ่มหน้า 2 = ตารางรายละเอียดเวลา
};

/* ── หน้า 2 ของ PDF: ตารางรายละเอียดเวลา (แต่ละขั้นใช้เท่าไหร่ + สรุป setup/ต่อชิ้น/คอขวด/รวมทั้งล็อต) ── */
export function buildTimeDetailHtml(steps: Step[], qty: number): string {
  const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const stationsOf = (s: Step) => Math.max(1, Number(s.stations) || 1);
  const effSec = (s: Step) => Number(s.seconds) || 0;
  const setupSec = steps.reduce((a, s) => a + (s.timeScope === 'once' ? effSec(s) : 0), 0);
  const perUnitSteps = steps.filter(s => s.timeScope !== 'once');
  const perUnitSec = perUnitSteps.reduce((a, s) => a + effSec(s), 0);
  const bottleneckSec = perUnitSteps.reduce((m, s) => Math.max(m, effSec(s) / stationsOf(s)), 0);
  const qtyN = Math.max(0, Math.floor(qty) || 0);
  const lotSec = qtyN > 0 ? setupSec + perUnitSec + (qtyN - 1) * bottleneckSec : setupSec + perUnitSec;
  const rows = steps.map((s, i) => {
    const once = s.timeScope === 'once';
    const mode = once ? 'Once/lot' : `Every pc${stationsOf(s) > 1 ? ` ×${stationsOf(s)} machines` : ''}`;
    return `<tr><td class="c">${i + 1}</td><td>${esc(s.process)}${s.kind === 'checkpoint' ? ' <span class="chk">(checkpoint)</span>' : ''}</td><td>${esc(mode)}</td><td class="r">${s.seconds !== '' ? esc(fmtTime(effSec(s))) : '-'}</td></tr>`;
  }).join('');
  return `
    <h2 class="t2title">Time Breakdown</h2>
    <table class="tt">
      <tr><th class="c" style="width:7%">#</th><th>Process</th><th style="width:28%">Mode</th><th class="r" style="width:20%">Time/instance</th></tr>
      ${rows || '<tr><td colspan="4" class="c">— No steps —</td></tr>'}
    </table>
    <table class="tt sum">
      <tr><th>Time Summary</th><th class="r" style="width:28%">Time</th></tr>
      <tr><td>One-time/lot (setup + incoming + storage)</td><td class="r">${esc(fmtTime(Math.round(setupSec)))}</td></tr>
      <tr><td>Time for 1 pc through the whole line (latency)</td><td class="r">${esc(fmtTime(Math.round(perUnitSec)))}</td></tr>
      <tr><td>Bottleneck (slowest per-pc station ÷ parallel machines)</td><td class="r">${esc(fmtTime(Math.round(bottleneckSec)))}</td></tr>
      <tr><td>Quantity produced (Qty)</td><td class="r">${qtyN > 0 ? qtyN.toLocaleString() : '-'}</td></tr>
      <tr class="grand"><td>Total lot (pipeline)${qtyN > 0 ? ` @ ${qtyN.toLocaleString()} pcs` : ''}</td><td class="r">${esc(fmtTime(Math.round(lotSec)))}</td></tr>
    </table>
    <div class="t2note">Formula: setup + latency (first pc through the whole line) + (Qty−1) × bottleneck — pipeline model (the next pc does not wait for the previous one to finish the whole line) · estimate</div>
  `;
}

// เจน/พิมพ์แผนภาพเป็น PDF — โหมด form = ฟอร์ม FM 05 (SYNTECH Process Flow Chart) ตามเอกสารจริง
export function exportFlowchartPdf(svg: string, meta: ExportMeta = {}) {
  const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (!svg) { showToast('No diagram to print yet — press Gen first', 'error'); return; }
  const {
    title = 'Manufacturing Workflow', customer = '', model = '', pn = '',
    issuedBy = '', checkedBy = '', approvedBy = '', revNo = '', revDate = '', revDesc = '', filename = '', form = false, timeHtml = '',
  } = meta;
  const pages = timeHtml ? 2 : 1;

  const body = form ? `
    <table class="hdr">
      <tr>
        <td class="logo" rowspan="2"><div class="brand">SYNTECH</div><div class="brand-sub">Empowering Professionals</div></td>
        <td class="title" rowspan="2">PROCESS FLOW CHART</td>
        <td class="pg" colspan="3">Page 1 of ${pages}</td>
      </tr>
      <tr>
        <td class="sig">Issued :<div>${esc(issuedBy)}</div></td>
        <td class="sig">Checked :<div>${esc(checkedBy)}</div></td>
        <td class="sig">Approved :<div>${esc(approvedBy)}</div></td>
      </tr>
      <tr><td class="info" colspan="5">Customer : <b>${esc(customer || '-')}</b> &nbsp;&nbsp;|&nbsp;&nbsp; Model : <b>${esc(model || '-')}</b> &nbsp;&nbsp;|&nbsp;&nbsp; P/N : <b>${esc(pn || '-')}</b></td></tr>
    </table>
    <table class="rev">
      <tr><th style="width:8%">Item</th><th style="width:16%">Date</th><th style="width:16%">Revision</th><th>Description</th></tr>
      <tr><td style="text-align:center">1</td><td>${esc(revDate)}</td><td style="text-align:center">${esc(revNo)}</td><td>${esc(revDesc)}</td></tr>
    </table>
    <div class="diagram">${svg}</div>
    <table class="legend">
      <tr><td class="lh" colspan="4">Flow chart symbol</td></tr>
      <tr><td class="sym">▷</td><td>Transport</td><td class="sym">◇</td><td>Quality check</td></tr>
      <tr><td class="sym">▽</td><td>Keeping</td><td class="sym">—</td><td>Flow of process</td></tr>
      <tr><td class="sym">⬡</td><td>Process with quality check</td><td class="sym">◯</td><td>Process</td></tr>
      <tr><td class="sym">⬡</td><td>Quality check with quantity check</td><td class="sym">▢</td><td>Quantity check</td></tr>
    </table>
    <div class="foot">FM 05 Rev.02 Ref. EN-P-02</div>
  ` : `
    <h1>${esc(title)}</h1>
    <div class="sub">Customer: ${esc(customer || '-')} &nbsp;|&nbsp; Model: ${esc(model || '-')}${pn ? ` &nbsp;|&nbsp; P/N: ${esc(pn)}` : ''}</div>
    <div class="diagram">${svg}</div>
  `;

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=800"><title>${esc(filename || (form ? 'Process Flow Chart' : title))}</title>
    <style>
      @page { size: A4; margin: 10mm; }
      body{font-family:'Segoe UI',Tahoma,sans-serif;color:#1e293b;padding:${form ? '0' : '24px'};text-align:${form ? 'left' : 'center'}}
      h1{font-size:20px;margin-bottom:2px}.sub{color:#64748b;margin-bottom:24px;font-size:13px}
      .diagram{text-align:center;margin:12px 0;page-break-inside:avoid;break-inside:avoid}
      /* ย่อแผนภาพให้พอดี 1 หน้าเสมอ (จำกัดทั้งกว้าง+สูง) + จัดกึ่งกลาง — ไม่ให้ล้น/ตัดกลางองค์ประกอบ */
      .diagram svg{max-width:100%;max-height:${form ? '176mm' : '250mm'};width:auto;height:auto;display:block;margin:0 auto}
      .hdr,.rev,.legend{border-collapse:collapse;page-break-inside:avoid;break-inside:avoid}
      .hdr tr,.rev tr,.legend tr{page-break-inside:avoid;break-inside:avoid}
      .hdr{width:100%}.hdr td{border:1px solid #333;padding:4px 8px;font-size:12px;vertical-align:top}
      .hdr .logo{text-align:center;width:20%}.hdr .brand{font-weight:800;color:#0a7d3f;font-size:15px}.hdr .brand-sub{font-size:8px;color:#666}
      .hdr .title{text-align:center;font-style:italic;font-weight:800;font-size:18px}
      .hdr .pg{text-align:right;font-size:11px}
      .hdr .sig{font-size:11px;height:32px;width:20%}.hdr .sig div{margin-top:6px;font-weight:600}
      .hdr .info{font-size:12px}
      .rev{width:100%;margin-top:-1px}.rev th,.rev td{border:1px solid #333;padding:4px 8px;font-size:11px;text-align:left}.rev th{background:#f1f5f9}
      .legend{margin-top:10px}.legend td{border:1px solid #333;padding:3px 8px;font-size:11px}.legend .lh{font-weight:700;background:#f1f5f9}.legend .sym{text-align:center;width:30px;font-size:14px}
      .foot{text-align:right;font-size:10px;color:#666;margin-top:12px}
      .page2{page-break-before:always;text-align:left;padding:${form ? '0' : '24px'}}
      .t2title{font-size:16px;margin:0 0 10px}
      .tt{width:100%;border-collapse:collapse;margin-bottom:14px;page-break-inside:auto}
      .tt th,.tt td{border:1px solid #333;padding:4px 8px;font-size:11px;text-align:left;vertical-align:top}
      .tt th{background:#f1f5f9;font-weight:700}
      .tt .c{text-align:center}.tt .r{text-align:right;white-space:nowrap}.tt .chk{color:#b45309}
      .tt tr{page-break-inside:avoid}
      .tt.sum td,.tt.sum th{font-size:12px}
      .tt.sum .grand td{font-weight:800;background:#eef6ff}
      .t2note{font-size:10px;color:#666}
    </style></head>
    <body>${body}${timeHtml ? `<div class="page2">${timeHtml}</div>` : ''}<script>window.onload=()=>window.print()</script></body></html>`;
  const w = window.open('', '_blank');
  if (!w) { showToast('Browser blocked the popup — allow it before printing', 'error'); return; }
  w.document.write(html); w.document.close();
}
