import { useState, useEffect } from 'react';
import {
  PROCESSES, useWorkflows, useWorkflowCreate, useWorkflowDelete,
  useWorkflowResults, useWorkflowResultCreate, useWorkflowResultDelete,
  type Workflow,
} from '../lib/workflowApi';
import { useWorkCenters, useWorkCenterCreate, useWorkCenterDelete } from '../lib/workCenterApi';
import { useIsViewer } from '../lib/useMockStore';
import { showToast } from '../lib/toast';
import { ResultBadge } from './ResultBadge';

type FailAction = 'rework' | 'back' | 'rework_station' | 'scrap' | 'hold';
const FAIL_OPTS: { id: FailAction; name: string }[] = [
  { id: 'rework',         name: '🔁 Rework แล้วทดสอบใหม่ (วนตัวเอง)' },
  { id: 'back',           name: '↩️ ย้อนกลับขั้นก่อนหน้า' },
  { id: 'rework_station', name: '🛠️ แยกไปสถานี Rework แล้วกลับ' },
  { id: 'scrap',          name: '🗑️ Scrap (คัดทิ้ง NG)' },
  { id: 'hold',           name: '⏸️ Hold / MRB (กักรอตัดสิน)' },
];

// ชนิดขั้นตอน: process = ไหลผ่าน · checkpoint = จุดตรวจ/ทดสอบ (มีเงื่อนไขผ่าน + ทางออกเมื่อไม่ผ่าน)
type StepKind = 'process' | 'checkpoint';
// ชนิดเวลา: per_unit = ต่อชิ้น (× จำนวน) · once = ครั้งเดียวต่อล็อต (เช่น setup เครื่อง)
type TimeScope = 'per_unit' | 'once';
type Step = {
  id: string; process: string; seconds: number | '';
  kind: StepKind;                                     // checkpoint = จุดตรวจ (มีทางออกเมื่อไม่ผ่าน)
  failAction: FailAction; backToId: string; maxRetry: number;
  timeScope: TimeScope;                               // ต่อชิ้น / ครั้งเดียว(setup)
  stations: number;                                   // จำนวนเครื่องขนาน (กรอกเอง — ใช้เมื่อไม่ผูก work center)
  workCenterId: number | null;                        // ผูกกับ work center → ดึงจำนวนเครื่อง+efficiency จากเครื่องนั้น
};
const CUSTOM_PROC_KEY = 'mes_custom_processes';

// เดาชนิดจากชื่อกระบวนการ — งานตรวจ/ทดสอบ → checkpoint, ที่เหลือ → process
const CHECK_KEYWORDS = ['TEST', 'ICT', 'FCT', 'IPQC', 'OQC', 'FQC', 'AOI', 'SPI', 'INSPECT', 'CHECK', 'QC', 'VERIFY'];
const guessKind = (p: string): StepKind => CHECK_KEYWORDS.some(k => p.toUpperCase().includes(k)) ? 'checkpoint' : 'process';

// เดาชนิดเวลา — งาน setup/ตั้งเครื่อง/เตรียม → ครั้งเดียว, ที่เหลือ → ต่อชิ้น
const ONCE_KEYWORDS = ['SET UP', 'SETUP', 'SET-UP', 'ตั้งเครื่อง', 'เตรียม', 'PROGRAM', 'FIXTURE', 'JIG SET'];
const guessScope = (p: string): TimeScope => ONCE_KEYWORDS.some(k => p.toUpperCase().includes(k.toUpperCase())) ? 'once' : 'per_unit';

const uid =() => (crypto.randomUUID ? crypto.randomUUID() : `s_${Date.now()}_${Math.round(performance.now())}`);
const newStep = (): Step => {
  const process = PROCESSES[0];
  return { id: uid(), process, seconds: '', kind: guessKind(process), failAction: 'rework', backToId: '', maxRetry: 0, timeScope: guessScope(process), stations: 1, workCenterId: null };
};
const fmtTime = (sec: number) => {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const p: string[] = [];
  if (h) p.push(`${h} ชม.`);
  if (m) p.push(`${m} นาที`);
  if (s || !p.length) p.push(`${s} วิ`);
  return p.join(' ');
};

/* ── dropdown เลือกกระบวนการ: หลัก(A-Z) → custom(ลบได้) → "+ เพิ่มกระบวนการ" ── */
function ProcessSelect({ value, main, custom, onChange, onAdd, onDeleteCustom, disabled }: {
  value: string; main: string[]; custom: string[];
  onChange: (v: string) => void; onAdd: () => void; onDeleteCustom: (name: string) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const row = (p: string, isCustom: boolean) => (
    <div key={p} style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #f1f5f9', background: value === p ? '#e0f2fe' : '#fff' }}>
      <div style={{ flexGrow: 1, padding: '8px 10px', cursor: 'pointer', color: value === p ? '#0369a1' : '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        onClick={() => { onChange(p); setOpen(false); }}>{p}</div>
      {isCustom && (
        <button type="button" onClick={e => { e.stopPropagation(); onDeleteCustom(p); }}
          style={{ background: 'transparent', border: 'none', color: '#e74c3c', cursor: 'pointer', padding: '8px 10px', fontSize: 12, fontWeight: 'bold', flexShrink: 0 }}
          title="ลบกระบวนการนี้" onMouseOver={e => e.currentTarget.style.background = '#fee2e2'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>✕</button>
      )}
    </div>
  );
  return (
    <div style={{ position: 'relative', flexGrow: 1, minWidth: 0 }}>
      <div onClick={() => !disabled && setOpen(o => !o)}
        style={{ padding: '8px 10px', border: '1px solid #ccc', borderRadius: 4, background: disabled ? '#f1f5f9' : '#f8fafc', color: '#334155', cursor: disabled ? 'default' : 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
        {!disabled && <span style={{ fontSize: 10, color: '#64748b' }}>{open ? '▲' : '▼'}</span>}
      </div>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: '#fff', border: '1px solid #ccc', borderRadius: 4, boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: 280, overflowY: 'auto' }}>
            {main.map(p => row(p, false))}
            {custom.length > 0 && <div style={{ padding: '4px 10px', fontSize: '0.7rem', color: '#94a3b8', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>กระบวนการที่เพิ่มเอง</div>}
            {custom.map(p => row(p, true))}
            <div onClick={() => { setOpen(false); onAdd(); }}
              style={{ padding: '8px 10px', cursor: 'pointer', fontWeight: 'bold', color: '#0369a1', background: '#f0f9ff', borderTop: '1px solid #e2e8f0' }}>+ เพิ่มกระบวนการ...</div>
          </div>
        </>
      )}
    </div>
  );
}

/* ── โหลด preset ── */
function PresetSelect({ workflows, onLoad, onDelete, canDelete }: {
  workflows: Workflow[]; onLoad: (w: Workflow) => void; onDelete: (id: number) => void; canDelete: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative', flexGrow: 1, minWidth: 0 }}>
      <div onClick={() => setOpen(o => !o)}
        style={{ padding: '8px 10px', border: '1px solid #ccc', borderRadius: 4, background: '#f8fafc', color: '#64748b', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>📂 โหลด Preset ที่บันทึกไว้...</span>
        <span style={{ fontSize: 10 }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: '#fff', border: '1px solid #ccc', borderRadius: 4, boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: 260, overflowY: 'auto' }}>
            {workflows.length === 0 && <div style={{ padding: '10px', color: '#94a3b8', fontSize: '0.85rem' }}>ยังไม่มี preset ที่บันทึก</div>}
            {workflows.map(w => (
              <div key={w.id} style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ flexGrow: 1, padding: '8px 10px', cursor: 'pointer', color: '#334155', minWidth: 0 }} onClick={() => { onLoad(w); setOpen(false); }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{w.name || `${w.customer || '—'} · ${w.model || '—'}`}</div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.steps.map(s => s.process).join(' → ')}</div>
                </div>
                {canDelete && (
                  <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (confirm('ลบ preset นี้?')) onDelete(w.id); }}
                    style={{ background: 'transparent', border: 'none', color: '#e74c3c', cursor: 'pointer', padding: '8px 10px', fontSize: 12, fontWeight: 'bold', flexShrink: 0 }}
                    title="ลบ" onMouseOver={e => e.currentTarget.style.background = '#fee2e2'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>✕</button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── mermaid flowchart — process ไหลผ่าน · checkpoint แตกกิ่งเมื่อไม่ผ่าน ── */
function toMermaid(steps: Step[]): string {
  if (!steps.length) return 'flowchart TD\n  START([เริ่ม]) --> END([จบ])';
  const L = ['flowchart TD', '  START([▶ เริ่มสายผลิต]):::se'];
  steps.forEach((s, i) => {
    const t = s.seconds !== '' ? `<br/>⏱ ${s.seconds}s` : '';
    L.push(`  S${i}["${i + 1}. ${s.process}${t}"]:::${s.kind === 'checkpoint' ? 'chk' : 'proc'}`);
  });
  L.push('  DONE([■ เสร็จ]):::se');
  // เส้นหลัก (ไหลตรงลงมา) START → ทุกขั้น → DONE
  L.push('  START --> S0');
  steps.forEach((s, i) => {
    const next = i < steps.length - 1 ? `S${i + 1}` : 'DONE';
    const t = s.seconds !== '' ? `${s.seconds}s` : '';
    const lbl = s.kind === 'checkpoint' ? `${t ? t + ' · ' : ''}✓ ผ่าน` : t;
    L.push(lbl ? `  S${i} -->|"${lbl}"| ${next}` : `  S${i} --> ${next}`);
  });
  // เส้นทาง "ไม่ผ่าน" เฉพาะ checkpoint
  steps.forEach((s, i) => {
    if (s.kind !== 'checkpoint') return;
    const r = s.maxRetry > 0 ? ` ×${s.maxRetry}` : '';
    if (s.failAction === 'back') {
      const ti = steps.findIndex(x => x.id === s.backToId);
      L.push(`  S${i} -->|"ไม่ผ่าน ↩${r}"| S${ti >= 0 ? ti : Math.max(0, i - 1)}`);
    } else if (s.failAction === 'scrap') {
      L.push(`  S${i} -->|ไม่ผ่าน| SC${i}["🗑️ Scrap (NG)"]:::ng`);
    } else if (s.failAction === 'hold') {
      L.push(`  S${i} -->|ไม่ผ่าน| HD${i}["⏸️ Hold / MRB"]:::hold`);
    } else if (s.failAction === 'rework_station') {
      L.push(`  S${i} -->|"ไม่ผ่าน${r}"| RW${i}["🛠️ Rework"]:::rw`);
      L.push(`  RW${i} -.->|แก้แล้ว| S${i}`);
    } else {
      L.push(`  S${i} -->|"ไม่ผ่าน ↻${r}"| S${i}`);
    }
  });
  L.push('  classDef proc fill:#eef2ff,stroke:#6366f1,stroke-width:2px,color:#1e293b;');
  L.push('  classDef chk fill:#fffbeb,stroke:#d97706,stroke-width:2px,color:#1e293b;');
  L.push('  classDef ng fill:#fef2f2,stroke:#dc2626,stroke-width:2px,color:#1e293b;');
  L.push('  classDef se fill:#dcfce7,stroke:#16a34a,stroke-width:2px,color:#14532d;');
  L.push('  classDef hold fill:#fef9c3,stroke:#d97706,color:#854d0e;');
  L.push('  classDef rw fill:#eef2ff,stroke:#6366f1,color:#3730a3;');
  return L.join('\n');
}

/* ── วาด flowchart เป็น SVG เอง — process ไหลตรง · checkpoint แตกกิ่งเมื่อไม่ผ่าน ── */
function buildFlowSvg(steps: Step[]): string {
  const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const BX = 92, BW = 240, BH = 54, PILLW = 180, PILLH = 34, GAP = 50;
  const cx = BX + BW / 2, rx = BX + BW;
  const Wsvg = BX + BW + 180;
  type Item = { pill?: boolean; label: string; sub?: string; check?: boolean; stepIdx?: number };
  const items: Item[] = [
    { pill: true, label: '▶ เริ่มสายผลิต' },
    ...steps.map((s, i) => ({ label: `${i + 1}. ${s.process}`, sub: s.seconds !== '' ? `⏱ ${fmtTime(Number(s.seconds))}` : '', check: s.kind === 'checkpoint', stepIdx: i })),
    { pill: true, label: '■ เสร็จ' },
  ];
  // pass 1: คำนวณตำแหน่งแนวตั้งของทุก node
  const geom: { top: number; mid: number; bottom: number; h: number }[] = [];
  let y = 8;
  items.forEach(it => { const h = it.pill ? PILLH : BH; geom.push({ top: y, mid: y + h / 2, bottom: y + h, h }); y += h + GAP; });
  const totalH = y - GAP + 8;

  const parts: string[] = [];
  const nx = rx + 26, NW = 122, NH = 30;     // node แตกข้างขวา
  const retry = (s: Step) => (s.maxRetry && s.maxRetry > 0 ? ` ×${s.maxRetry}` : '');
  // node แตกข้าง (scrap/hold/rework station)
  const sideNode = (midY: number, bg: string, stk: string, tc: string, label: string) => {
    parts.push(`<line x1="${rx}" y1="${midY}" x2="${nx}" y2="${midY}" stroke="${stk}" stroke-width="2" marker-end="url(#ahr)"/>`);
    parts.push(`<rect x="${nx}" y="${midY - NH / 2}" width="${NW}" height="${NH}" rx="6" fill="${bg}" stroke="${stk}" stroke-width="1.5"/>`);
    parts.push(`<text x="${nx + NW / 2}" y="${midY}" text-anchor="middle" dominant-baseline="central" font-size="10.5" font-weight="700" fill="${tc}">${esc(label)}</text>`);
  };

  items.forEach((it, idx) => {
    const g = geom[idx];
    if (it.pill) {
      parts.push(`<rect x="${cx - PILLW / 2}" y="${g.top}" width="${PILLW}" height="${g.h}" rx="${g.h / 2}" fill="#dcfce7" stroke="#16a34a" stroke-width="2"/>`);
      parts.push(`<text x="${cx}" y="${g.mid}" text-anchor="middle" dominant-baseline="central" font-size="13" font-weight="700" fill="#14532d">${esc(it.label)}</text>`);
    } else {
      // checkpoint = เหลือง (จุดตรวจ) · process = ฟ้า (ไหลผ่าน)
      const stroke = it.check ? '#d97706' : '#6366f1', fill = it.check ? '#fffbeb' : '#eef2ff';
      parts.push(`<rect x="${BX}" y="${g.top}" width="${BW}" height="${g.h}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`);
      const badge = it.check ? '🔎 ' : '';
      parts.push(`<text x="${cx}" y="${it.sub ? g.mid - 7 : g.mid}" text-anchor="middle" dominant-baseline="central" font-size="13" font-weight="600" fill="#1e293b">${esc(badge + it.label)}</text>`);
      if (it.sub) parts.push(`<text x="${cx}" y="${g.mid + 10}" text-anchor="middle" dominant-baseline="central" font-size="11" fill="#0369a1">${esc(it.sub)}</text>`);

      if (it.check) {
        const s = steps[it.stepIdx!];
        const midY = g.mid;
        if (s.failAction === 'scrap') sideNode(midY, '#fee2e2', '#dc2626', '#991b1b', '🗑️ Scrap (NG)');
        else if (s.failAction === 'hold') sideNode(midY, '#fef9c3', '#d97706', '#854d0e', '⏸️ Hold / MRB');
        else if (s.failAction === 'back') {
          let ti = items.findIndex(x => x.stepIdx != null && steps[x.stepIdx]?.id === s.backToId);
          if (ti < 0) ti = idx - 1;                       // default: ขั้นก่อนหน้า
          const tg = geom[ti], lx = BX - 30;
          parts.push(`<path d="M ${BX} ${midY} L ${lx} ${midY} L ${lx} ${tg.mid} L ${BX} ${tg.mid}" fill="none" stroke="#dc2626" stroke-width="2" marker-end="url(#ahr)"/>`);
          parts.push(`<text x="${lx}" y="${(midY + tg.mid) / 2}" text-anchor="middle" dominant-baseline="central" font-size="10" font-weight="700" fill="#dc2626">ไม่ผ่าน ↩${retry(s)}</text>`);
        }
        else if (s.failAction === 'rework_station') {
          sideNode(midY, '#eef2ff', '#6366f1', '#3730a3', `🛠️ Rework${retry(s)}`);
          parts.push(`<path d="M ${nx + NW / 2} ${midY + NH / 2} C ${nx + NW / 2} ${midY + 28}, ${rx + 12} ${g.bottom + 4}, ${rx} ${g.bottom - 8}" fill="none" stroke="#6366f1" stroke-width="1.5" stroke-dasharray="4 3" marker-end="url(#ahi)"/>`);
        }
        else {  // rework — self-loop เล็กๆ ด้านขวา
          const y1 = midY - 9, y2 = midY + 9;
          parts.push(`<path d="M ${rx} ${y1} C ${rx + 30} ${y1 - 4}, ${rx + 30} ${y2 + 4}, ${rx} ${y2}" fill="none" stroke="#dc2626" stroke-width="2" marker-end="url(#ahr)"/>`);
          parts.push(`<text x="${rx + 36}" y="${midY}" text-anchor="start" dominant-baseline="central" font-size="10" font-weight="700" fill="#dc2626">↻ rework${retry(s)}</text>`);
        }
      }
    }
    // เส้นหลักไปโหนดถัดไป + ป้าย (checkpoint = ✓ ผ่าน, process = เวลาเฉยๆ)
    if (idx < items.length - 1) {
      parts.push(`<line x1="${cx}" y1="${g.bottom}" x2="${cx}" y2="${geom[idx + 1].top}" stroke="#94a3b8" stroke-width="2" marker-end="url(#ah)"/>`);
      if (it.stepIdx != null) {
        const s = steps[it.stepIdx];
        const t = s.seconds !== '' ? fmtTime(Number(s.seconds)) : '';
        if (s.kind === 'checkpoint') {
          parts.push(`<text x="${cx + 10}" y="${(g.bottom + geom[idx + 1].top) / 2}" text-anchor="start" dominant-baseline="central" font-size="10" font-weight="600" fill="#16a34a">✓ ${esc(t ? t + ' · ' : '')}ผ่าน</text>`);
        } else if (t) {
          parts.push(`<text x="${cx + 10}" y="${(g.bottom + geom[idx + 1].top) / 2}" text-anchor="start" dominant-baseline="central" font-size="10" font-weight="600" fill="#64748b">${esc(t)}</text>`);
        }
      }
    }
  });
  const defs = `<defs>`
    + `<marker id="ah" markerWidth="8" markerHeight="8" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#94a3b8"/></marker>`
    + `<marker id="ahr" markerWidth="8" markerHeight="8" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#dc2626"/></marker>`
    + `<marker id="ahi" markerWidth="8" markerHeight="8" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#6366f1"/></marker>`
    + `</defs>`;
  return `<svg viewBox="0 0 ${Wsvg} ${totalH}" width="${Wsvg}" height="${totalH}" xmlns="http://www.w3.org/2000/svg" font-family="'Segoe UI',Tahoma,sans-serif">${defs}${parts.join('')}</svg>`;
}

/* ── flowchart (SVG) → พิมพ์ (Save as PDF) ── */
function exportFlowchartPdf(customer: string, model: string, svg: string) {
  const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (!svg) { showToast('ยังไม่มี FlowChart ให้พิมพ์ — กด Gen FlowChart ก่อน', 'error'); return; }
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Workflow</title>
    <style>
      body{font-family:'Segoe UI',Tahoma,sans-serif;padding:32px;color:#1e293b;text-align:center}
      h1{font-size:20px;margin-bottom:2px}.sub{color:#64748b;margin-bottom:24px;font-size:13px}
      .diagram svg{max-width:100%;height:auto}
    </style></head>
    <body><h1>Manufacturing Workflow</h1>
    <div class="sub">Customer: ${esc(customer || '-')} &nbsp;|&nbsp; Model: ${esc(model || '-')}</div>
    <div class="diagram">${svg}</div>
    <script>window.onload=()=>window.print()</script></body></html>`;
  const w = window.open('', '_blank');
  if (!w) { showToast('เบราว์เซอร์บล็อก popup — อนุญาตก่อนพิมพ์', 'error'); return; }
  w.document.write(html); w.document.close();
}

const fmtDateTime = (s: string) => { try { return new Date(s).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }); } catch { return s; } };

export function WorkflowBuilder() {
  const isViewer = useIsViewer();
  const [serial, setSerial] = useState('');
  const [customer, setCustomer] = useState('');
  const [model, setModel] = useState('');
  const [qty, setQty] = useState<number | ''>('');     // จำนวนชิ้นในล็อต — ใช้คำนวณเวลารวมทั้งล็อต (ประมาณการ)
  const [steps, setSteps] = useState<Step[]>([newStep()]);
  const [showFlow, setShowFlow] = useState(false);
  // ผลรันจริง: เซ็ตของ id จุดตรวจที่ "ไม่ผ่าน" (design กับ run แยกกัน)
  const [runFail, setRunFail] = useState<Set<string>>(new Set());
  // กระบวนการที่เพิ่มเอง — เก็บใน localStorage ของบราวเซอร์
  const [customProcs, setCustomProcs] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(CUSTOM_PROC_KEY) || '[]'); } catch { return []; }
  });
  useEffect(() => { localStorage.setItem(CUSTOM_PROC_KEY, JSON.stringify(customProcs)); }, [customProcs]);
  // drag-drop
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [grabId, setGrabId] = useState<string | null>(null);
  // แต่ละ step ย่อ/ขยายตัวเลือกย่อย (ชนิด/เวลา/เครื่อง/เงื่อนไข) — เก็บ id ที่กางอยู่
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const toggleOpen = (id: string) => setOpenIds(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const create = useWorkflowCreate();
  const del = useWorkflowDelete();
  const { data: saved = [] } = useWorkflows();
  const recordResult = useWorkflowResultCreate();
  const delResult = useWorkflowResultDelete();
  const { data: results = [] } = useWorkflowResults();

  // Work Centers (เครื่อง/สถานี — master data ใช้ร่วมกันทุก product)
  const { data: workCenters = [] } = useWorkCenters();
  const wcCreate = useWorkCenterCreate();
  const wcDelete = useWorkCenterDelete();
  const wcById = new Map(workCenters.map(w => [w.id, w]));
  const [wcName, setWcName] = useState('');
  const [wcStations, setWcStations] = useState('');
  const [wcEff, setWcEff] = useState('');
  // หาจำนวนเครื่องขนาน + efficiency ของ step: ถ้าผูก work center ใช้ของเครื่อง, ไม่งั้นใช้ค่ากรอกเอง
  const resolveWc = (s: Step) => {
    const wc = s.workCenterId ? wcById.get(s.workCenterId) : undefined;
    return {
      wc,
      stations: wc ? Math.max(1, wc.stations) : Math.max(1, Number(s.stations) || 1),
      eff: wc ? Math.max(1, wc.efficiency) : 100,
    };
  };

  // เวลามาตรฐาน 3 ก้อน (ประมาณการ):
  //  setupSec   = Σ step ครั้งเดียว (setup) — ไม่คูณจำนวน
  //  perUnitSec = Σ step ต่อชิ้น — เวลาที่ 1 ชิ้นไหลผ่านครบ (ยังไม่หารเครื่องขนาน)
  //  lotSec     = setup + Σ(ต่อชิ้น × จำนวน ÷ จำนวนเครื่องขนาน)  → เวลารวมทั้งล็อต
  const qtyN = Number(qty) || 0;
  // เวลาจริงต่อ step = เวลา ÷ (efficiency/100) — เครื่องช้ากว่ามาตรฐาน เวลาก็มากขึ้น
  const effSec = (s: Step) => (Number(s.seconds) || 0) * 100 / resolveWc(s).eff;
  const setupSec   = steps.reduce((sum, s) => sum + (s.timeScope === 'once' ? effSec(s) : 0), 0);
  const perUnitSec = steps.reduce((sum, s) => sum + (s.timeScope === 'once' ? 0 : effSec(s)), 0);
  const lotSec = setupSec + steps.reduce((sum, s) => {
    if (s.timeScope === 'once') return sum;
    return sum + effSec(s) * qtyN / resolveWc(s).stations;   // ต่อชิ้น × จำนวน ÷ จำนวนเครื่องขนาน
  }, 0);
  const totalSec = Math.round(perUnitSec); // เวลาต่อ 1 ชิ้น — ใช้เป็น cycle ตอนบันทึกผล Serial จริง
  const flowSvg = buildFlowSvg(steps);
  const checkpoints = steps.filter(s => s.kind === 'checkpoint');
  const overallRun = checkpoints.some(s => runFail.has(s.id)) ? 'FAIL' : 'PASS';

  const setStep = (id: string, patch: Partial<Step>) => setSteps(s => s.map(x => x.id === id ? { ...x, ...patch } : x));
  const addStep = () => setSteps(s => [...s, newStep()]);
  const removeStep = (id: string) => setSteps(s => s.length > 1 ? s.filter(x => x.id !== id) : s);
  const toggleRun = (id: string) => setRunFail(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  function onDrop(targetId: string) {
    if (draggedId == null || draggedId === targetId) return;
    setSteps(s => {
      const from = s.findIndex(x => x.id === draggedId);
      const to = s.findIndex(x => x.id === targetId);
      if (from < 0 || to < 0) return s;
      const next = [...s];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next;
    });
    setDraggedId(null); setDragOverId(null); setGrabId(null);
  }

  /* บันทึก Preset — เด้ง prompt ให้ตั้งชื่อ */
  function savePreset() {
    if (!steps.length) return;
    const name = window.prompt('ตั้งชื่อ Preset:', customer && model ? `${customer} - ${model}` : '');
    if (name == null) return;            // กดยกเลิก
    if (!name.trim()) { showToast('ต้องตั้งชื่อ Preset', 'error'); return; }
    const idToIndex = new Map(steps.map((s, i) => [s.id, i]));
    create.mutate({
      name: name.trim(), customer: customer.trim(), model: model.trim(),
      steps: steps.map(s => ({
        process: s.process,
        seconds: s.seconds === '' ? null : Number(s.seconds),
        kind: s.kind,
        failAction: s.failAction,
        backToIndex: s.kind === 'checkpoint' && s.failAction === 'back' && idToIndex.has(s.backToId) ? idToIndex.get(s.backToId)! : null,
        maxRetry: s.maxRetry,
        timeScope: s.timeScope,
        stations: s.timeScope === 'once' ? 1 : Math.max(1, Number(s.stations) || 1),
        workCenterId: s.workCenterId,
      })),
    }, {
      onSuccess: () => showToast(`บันทึก Preset "${name.trim()}" สำเร็จ`, 'success'),
      onError: (e: any) => showToast(e.message, 'error'),
    });
  }

  function loadPreset(w: Workflow) {
    setCustomer(w.customer); setModel(w.model);
    const ws = w.steps.length ? w.steps : [{ process: PROCESSES[0], seconds: null }];
    const VALID_FAIL: FailAction[] = ['rework', 'back', 'rework_station', 'scrap', 'hold'];
    const loaded: Step[] = ws.map(s => ({
      id: uid(),
      process: s.process,
      seconds: (s.seconds == null ? '' : s.seconds) as number | '',
      // kind: ใช้ที่บันทึก ถ้าไม่มี (preset เก่า) → เดาจาก pass/ชื่อ
      kind: (s.kind === 'process' || s.kind === 'checkpoint') ? s.kind : (s.pass === false ? 'checkpoint' : guessKind(s.process)),
      failAction: (VALID_FAIL.includes(s.failAction as FailAction) ? s.failAction : 'rework') as FailAction,
      backToId: '',
      maxRetry: Number(s.maxRetry) || 0,
      // timeScope/stations: ใช้ที่บันทึก ถ้าไม่มี (preset เก่า) → เดาจากชื่อ / default 1 เครื่อง
      timeScope: (s.timeScope === 'once' || s.timeScope === 'per_unit') ? s.timeScope : guessScope(s.process),
      stations: Number(s.stations) > 0 ? Number(s.stations) : 1,
      workCenterId: Number(s.workCenterId) > 0 ? Number(s.workCenterId) : null,
    }));
    // กู้ backToId จาก index ที่บันทึกไว้ (ชี้ไปยัง step ที่สร้าง id ใหม่แล้ว)
    ws.forEach((s, i) => {
      const bi = s.backToIndex;
      if (typeof bi === 'number' && bi >= 0 && bi < loaded.length) loaded[i].backToId = loaded[bi].id;
    });
    setSteps(loaded);
    setRunFail(new Set());
    // กระบวนการ custom ที่อยู่ใน preset แต่ยังไม่มีในลิสต์ → เพิ่มเข้า list ให้เลือกได้
    const extra = ws.map(s => s.process).filter(p => p && !PROCESSES.includes(p) && !customProcs.includes(p));
    if (extra.length) setCustomProcs(prev => [...new Set([...prev, ...extra])]);
    setShowFlow(false);
    showToast(`โหลด Preset "${w.name || w.customer}"`, 'info');
  }

  /* เพิ่มกระบวนการ custom (เด้ง prompt) แล้วเซ็ตให้ step นั้น */
  function addCustomProcess(stepId: string) {
    const name = window.prompt('ชื่อกระบวนการใหม่:');
    if (name == null) return;
    const t = name.trim();
    if (!t) { showToast('ต้องใส่ชื่อกระบวนการ', 'error'); return; }
    if (PROCESSES.includes(t) || customProcs.includes(t)) {
      showToast('มีกระบวนการนี้อยู่แล้ว — เลือกได้เลย', 'info');
    } else {
      setCustomProcs(prev => [...prev, t]);
      showToast(`เพิ่มกระบวนการ "${t}" แล้ว`, 'success');
    }
    setStep(stepId, { process: t, kind: guessKind(t), timeScope: guessScope(t) });
  }

  function deleteCustomProcess(name: string) {
    if (!confirm(`ลบกระบวนการ "${name}"?\n(ออกจากลิสต์ของบราวเซอร์นี้)`)) return;
    setCustomProcs(prev => prev.filter(n => n !== name));
    setSteps(prev => prev.map(s => s.process === name ? { ...s, process: PROCESSES[0], kind: guessKind(PROCESSES[0]), timeScope: guessScope(PROCESSES[0]) } : s));
  }

  /* เพิ่ม/ลบ Work Center (เครื่อง/สถานี) — master data ใน DB ใช้ร่วมกันทุก product */
  function addWorkCenter() {
    if (!wcName.trim()) { showToast('ใส่ชื่อเครื่อง/สถานี', 'error'); return; }
    wcCreate.mutate(
      { name: wcName.trim(), stations: Math.max(1, Math.floor(Number(wcStations)) || 1), efficiency: Math.min(1000, Math.max(1, Math.floor(Number(wcEff)) || 100)) },
      {
        onSuccess: () => { showToast(`เพิ่มเครื่อง "${wcName.trim()}" แล้ว`, 'success'); setWcName(''); setWcStations(''); setWcEff(''); },
        onError: (e: any) => showToast(e.message, 'error'),
      }
    );
  }
  function delWorkCenter(id: number, name: string) {
    if (!confirm(`ลบเครื่อง "${name}"?\n(ขั้นตอนที่ผูกเครื่องนี้ไว้จะกลับไปกรอกจำนวนเครื่องเอง)`)) return;
    wcDelete.mutate(id, { onSuccess: () => showToast('ลบเครื่องแล้ว', 'info'), onError: (e: any) => showToast(e.message, 'error') });
  }

  /* บันทึกผลรันจริง — PASS/FAIL อ่านจากจุดตรวจที่กดไว้ (ขั้นผลิตถือว่าผ่านเสมอ) */
  function record() {
    if (!serial.trim()) { showToast('กรุณากรอก Serial Number', 'error'); return; }
    if (!steps.length) { showToast('ต้องมีกระบวนการอย่างน้อย 1', 'error'); return; }
    if (steps.some(s => s.seconds === '' || Number(s.seconds) <= 0)) {
      showToast('กรุณากรอกเวลา (วินาที) ให้ครบทุกกระบวนการ', 'error'); return;
    }
    const perStep = steps.map(s => ({ process: s.process, result: (s.kind === 'checkpoint' && runFail.has(s.id)) ? 'FAIL' : 'PASS' }));
    const overall = overallRun;
    const seqStr = steps.map(s => `${s.process}${s.kind === 'checkpoint' && runFail.has(s.id) ? '❌' : ''}${s.seconds !== '' ? `(${s.seconds}s)` : ''}`).join(' → ');
    recordResult.mutate(
      { serial: serial.trim(), customer: customer.trim(), model: model.trim(), sequence: seqStr, result: overall, total_sec: totalSec, steps: perStep },
      {
        onSuccess: () => { showToast(`บันทึกผล ${serial.trim()} (${overall}) สำเร็จ`, 'success'); setSerial(''); setRunFail(new Set()); },
        onError: (e: any) => showToast(e.message, 'error'),
      }
    );
  }

  return (
    <div className="panel stack-lg">
      <div className="mes-module-head">
        <span className="mes-module-code">1.3</span>
        <div>
          <h2 className="panel__title">Manufacturing Sequence Builder</h2>
          <p className="panel__subtitle">กำหนดลำดับกระบวนการ + จุดตรวจ (เงื่อนไขผ่าน/ทางออกเมื่อไม่ผ่าน) → บันทึก Preset / สร้าง FlowChart / บันทึกผลเดินสายผลิต</p>
        </div>
      </div>

      {/* Serial Number (ข้างบน) + Customer + Model */}
      <div className="filters-grid" style={{ marginBottom: 15 }}>
        <label className="field"><span>Serial Number</span>
          <input value={serial} onChange={e => setSerial(e.target.value)} placeholder="กรอก SN..." disabled={isViewer} />
        </label>
        <label className="field"><span>Customer</span>
          <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="ชื่อลูกค้า" disabled={isViewer} />
        </label>
        <label className="field"><span>Model</span>
          <input value={model} onChange={e => setModel(e.target.value)} placeholder="ชื่อรุ่น" disabled={isViewer} />
        </label>
      </div>

      {/* presets bar */}
      <div style={{ marginBottom: 15, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: 'var(--bg-panel)', padding: 15, borderRadius: 6, border: '1px solid var(--border-color)' }}>
        <strong style={{ fontSize: '0.9rem', color: 'var(--text-muted)', minWidth: 80 }}>⚙️ Preset:</strong>
        {!isViewer && (
          <button type="button" className="btn secondary" onClick={savePreset} disabled={create.isPending || steps.length === 0}>
            {create.isPending ? 'กำลังบันทึก...' : '💾 บันทึกเป็น Preset'}
          </button>
        )}
        <div style={{ width: 280, maxWidth: '100%' }}>
          <PresetSelect workflows={saved} onLoad={loadPreset} onDelete={(id) => del.mutate(id)} canDelete={!isViewer} />
        </div>
      </div>

      {/* Work Centers (เครื่อง/สถานี) — นิยามจำนวนเครื่องขนาน + efficiency ที่เดียว ใช้ซ้ำได้ทุก step/product */}
      <div style={{ marginBottom: 15, background: 'var(--bg-panel)', padding: 15, borderRadius: 6, border: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>🏭 เครื่อง/สถานี (Work Center)</strong>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>นิยามจำนวนเครื่องขนาน + ประสิทธิภาพ ที่เดียว → เลือกใช้ในแต่ละขั้นตอนได้เลย</span>
        </div>

        {/* รายการเครื่องที่มี */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: workCenters.length ? 12 : 0 }}>
          {workCenters.map(w => (
            <span key={w.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#ecfeff', border: '1px solid #a5f3fc', borderRadius: 20, padding: '4px 6px 4px 12px', fontSize: '0.8rem', color: '#155e75' }}>
              <span><strong>🏭 {w.name}</strong> · ×{w.stations} เครื่อง · {w.efficiency}%</span>
              {!isViewer && (
                <button type="button" onClick={() => delWorkCenter(w.id, w.name)} title="ลบเครื่องนี้"
                  style={{ border: 'none', background: 'transparent', color: '#e11d48', cursor: 'pointer', fontWeight: 700, fontSize: 12, lineHeight: 1, padding: '2px 4px' }}>✕</button>
              )}
            </span>
          ))}
          {workCenters.length === 0 && <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>ยังไม่มีเครื่อง/สถานี — เพิ่มด้านล่าง (ถ้าไม่เพิ่มก็กรอกจำนวนเครื่องในแต่ละขั้นเองได้)</span>}
        </div>

        {/* ฟอร์มเพิ่มเครื่อง */}
        {!isViewer && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <input value={wcName} onChange={e => setWcName(e.target.value)} placeholder="ชื่อเครื่อง เช่น FCT Tester"
              style={{ flex: '1 1 180px', minWidth: 140, padding: '8px 10px', borderRadius: 4, border: '1px solid #ccc' }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem', color: '#64748b', whiteSpace: 'nowrap' }} title="จำนวนเครื่อง/หัวที่ทำขนานกัน">
              ×<input type="number" min="1" value={wcStations} onChange={e => setWcStations(e.target.value)} placeholder="1"
                style={{ width: 56, padding: '8px 4px', borderRadius: 4, border: '1px solid #ccc', textAlign: 'center' }} /> เครื่อง
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem', color: '#64748b', whiteSpace: 'nowrap' }} title="ประสิทธิภาพ % เทียบมาตรฐาน (100 = ตามมาตรฐาน, 50 = ช้า 2 เท่า)">
              eff<input type="number" min="1" max="1000" value={wcEff} onChange={e => setWcEff(e.target.value)} placeholder="100"
                style={{ width: 56, padding: '8px 4px', borderRadius: 4, border: '1px solid #ccc', textAlign: 'center' }} />%
            </label>
            <button type="button" className="btn secondary" onClick={addWorkCenter} disabled={wcCreate.isPending || !wcName.trim()}>
              {wcCreate.isPending ? 'กำลังเพิ่ม...' : '➕ เพิ่มเครื่อง'}
            </button>
          </div>
        )}
      </div>

      {/* steps */}
      <div style={{ background: '#f8f9fa', padding: 20, border: '1px solid #e2e8f0', borderRadius: 6 }}>
        {!isViewer && (
          <div style={{ marginBottom: 15 }}>
            <button type="button" className="btn" onClick={addStep} style={{ background: 'var(--brand)', color: '#fff', border: 'none' }}>
              + เพิ่มกระบวนการ
            </button>
          </div>
        )}

        {steps.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#7f8c8d', fontStyle: 'italic', padding: '20px 0' }}>⚠️ ยังไม่มีกระบวนการ — กดปุ่มด้านบนเพื่อเพิ่ม</div>
        ) : (
          <div className="stack">
            {steps.map((step, index) => {
              const isCheck = step.kind === 'checkpoint';
              const isOnce = step.timeScope === 'once';
              const open = openIds.has(step.id);
              const wc = resolveWc(step);
              return (
              <div key={step.id}
                draggable={grabId === step.id}
                onDragStart={e => { setDraggedId(step.id); e.dataTransfer.effectAllowed = 'move'; }}
                onDragOver={e => { e.preventDefault(); if (step.id !== dragOverId) setDragOverId(step.id); }}
                onDragLeave={() => setDragOverId(null)}
                onDrop={e => { e.preventDefault(); onDrop(step.id); }}
                onDragEnd={() => { setDraggedId(null); setDragOverId(null); setGrabId(null); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: 10, borderRadius: 4, borderLeft: `4px solid ${isCheck ? '#d97706' : 'var(--brand)'}`, flexWrap: 'wrap',
                  opacity: draggedId === step.id ? 0.5 : 1,
                  background: dragOverId === step.id && draggedId !== step.id ? '#e0f2fe' : '#fff',
                  boxShadow: dragOverId === step.id && draggedId !== step.id ? '0 0 0 2px #3b82f6' : '0 1px 3px rgba(0,0,0,0.05)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  {!isViewer && (
                    <div style={{ cursor: 'grab', color: '#94a3b8', padding: 5, fontSize: '1.1rem' }}
                      onMouseEnter={() => setGrabId(step.id)} onMouseLeave={() => setGrabId(null)} title="ลากเพื่อจัดลำดับ">☰</div>
                  )}
                  <div style={{ background: 'var(--brand)', color: '#fff', padding: '4px 10px', borderRadius: 20, fontSize: 14, fontWeight: 'bold', minWidth: 70, textAlign: 'center' }}>Step {index + 1}</div>
                </div>

                {/* process dropdown: หลัก(A-Z) + custom + เพิ่มกระบวนการ (เปลี่ยนชื่อ → เดาชนิดให้) */}
                <div style={{ display: 'flex', flexGrow: 1, gap: 8, minWidth: 200 }}>
                  <ProcessSelect value={step.process} main={PROCESSES} custom={customProcs}
                    onChange={v => setStep(step.id, { process: v, kind: guessKind(v), timeScope: guessScope(v) })}
                    onAdd={() => addCustomProcess(step.id)}
                    onDeleteCustom={deleteCustomProcess}
                    disabled={isViewer} />
                </div>

                {/* cycle time — 3 ช่อง ชม. : นาที : วินาที (รวมเป็นวินาทีเก็บข้างใน) */}
                {(() => {
                  const sec = step.seconds === '' ? 0 : Number(step.seconds);
                  const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
                  const setPart = (part: 'h' | 'm' | 's', raw: string) => {
                    const v = raw === '' ? 0 : Math.max(0, Math.floor(Number(raw)) || 0);
                    const next = { h: hh, m: mm, s: ss, [part]: v };
                    const total = next.h * 3600 + next.m * 60 + next.s;
                    setStep(step.id, { seconds: total === 0 ? '' : total });
                  };
                  const box = { width: 72, padding: '9px 0.1px', borderRadius: 4, border: '1px solid #ccc', textAlign: 'right' as const };
                  const sep = { color: '#94a3b8', fontWeight: 700 };
                  return (
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }} title="ชั่วโมง : นาที : วินาที">
                      <input type="number" min="0" placeholder="ชม." disabled={isViewer} value={hh || ''} onChange={e => setPart('h', e.target.value)} style={box} />
                      <span style={sep}>:</span>
                      <input type="number" min="0" max="59" placeholder="นาที" disabled={isViewer} value={mm || ''} onChange={e => setPart('m', e.target.value)} style={box} />
                      <span style={sep}>:</span>
                      <input type="number" min="0" max="59" placeholder="วิ" disabled={isViewer} value={ss || ''} onChange={e => setPart('s', e.target.value)} style={box} />
                    </div>
                  );
                })()}

                {/* สรุปย่อ (อ่านอย่างเดียว) — เห็นชนิด/เวลา/เครื่อง โดยไม่ต้องกาง */}
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: '0.76rem' }}>
                  <span style={{ padding: '3px 8px', borderRadius: 20, border: `1px solid ${isOnce ? '#a5f3fc' : '#bbf7d0'}`, background: isOnce ? '#ecfeff' : '#f0fdf4', color: isOnce ? '#155e75' : '#166534', fontWeight: 600, whiteSpace: 'nowrap' }}>{isOnce ? '📌 ครั้งเดียว' : '🔁 ต่อชิ้น'}</span>
                  <span style={{ padding: '3px 8px', borderRadius: 20, border: `1px solid ${isCheck ? '#fde68a' : '#c7d2fe'}`, background: isCheck ? '#fffbeb' : '#eef2ff', color: isCheck ? '#92400e' : '#3730a3', fontWeight: 600, whiteSpace: 'nowrap' }}>{isCheck ? '🔎 จุดตรวจ' : '⚙️ ขั้นผลิต'}</span>
                  {!isOnce && <span style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{wc.wc ? `🏭 ${wc.wc.name}` : `×${wc.stations} เครื่อง`}</span>}
                </span>

                {/* ปุ่มกาง/ยุบ ตั้งค่าขั้นตอน */}
                <button type="button" onClick={() => toggleOpen(step.id)} title="ตั้งค่าขั้นตอน (ชนิด / เวลา / เครื่อง / เงื่อนไขเมื่อไม่ผ่าน)"
                  style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: open ? '#e2e8f0' : '#fff', color: '#475569', fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                  ⚙️ ตั้งค่า {open ? '▴' : '▾'}
                </button>

                {!isViewer && <button className="btn danger" onClick={() => removeStep(step.id)} disabled={steps.length === 1}>ลบ</button>}

                {/* แผงตั้งค่า (กาง/ยุบได้) — ชนิดขั้น/เวลา/เครื่อง + เงื่อนไขเมื่อไม่ผ่าน */}
                {open && (
                  <div style={{ flexBasis: '100%', display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8, padding: '12px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {/* ชนิดขั้น: ขั้นผลิต / จุดตรวจ */}
                      <button type="button" onClick={() => !isViewer && setStep(step.id, { kind: isCheck ? 'process' : 'checkpoint' })} disabled={isViewer}
                        title="ขั้นผลิต = ไหลผ่าน / จุดตรวจ = มีเงื่อนไขผ่าน + ทางออกเมื่อไม่ผ่าน"
                        style={{ padding: '7px 12px', borderRadius: 6, border: `1px solid ${isCheck ? '#d97706' : '#6366f1'}`, background: isCheck ? '#fffbeb' : '#eef2ff', color: isCheck ? '#92400e' : '#3730a3', fontWeight: 700, cursor: isViewer ? 'default' : 'pointer', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        {isCheck ? '🔎 จุดตรวจ' : '⚙️ ขั้นผลิต'}
                      </button>
                      {/* ชนิดเวลา: ต่อชิ้น / ครั้งเดียว(setup) */}
                      <button type="button" onClick={() => !isViewer && setStep(step.id, { timeScope: isOnce ? 'per_unit' : 'once' })} disabled={isViewer}
                        title="ต่อชิ้น = เวลา × จำนวนชิ้น / ครั้งเดียว = setup ต่อล็อต (ไม่คูณจำนวน)"
                        style={{ padding: '7px 12px', borderRadius: 6, border: `1px solid ${isOnce ? '#0891b2' : '#16a34a'}`, background: isOnce ? '#ecfeff' : '#f0fdf4', color: isOnce ? '#155e75' : '#166534', fontWeight: 700, cursor: isViewer ? 'default' : 'pointer', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        {isOnce ? '📌 ครั้งเดียว (setup)' : '🔁 ต่อชิ้น'}
                      </button>
                      {/* เครื่อง (เฉพาะ step ต่อชิ้น) */}
                      {!isOnce && workCenters.length > 0 && (
                        <select value={step.workCenterId ?? ''} disabled={isViewer}
                          title="เลือกเครื่อง/สถานี (Work Center) — ดึงจำนวนเครื่องขนาน + efficiency มาคิดเวลาให้"
                          onChange={e => setStep(step.id, { workCenterId: e.target.value ? Number(e.target.value) : null })}
                          style={{ maxWidth: 220, padding: '6px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: '0.8rem' }}>
                          <option value="">🔧 กรอกเครื่องเอง</option>
                          {workCenters.map(w => <option key={w.id} value={w.id}>🏭 {w.name} (×{w.stations}, {w.efficiency}%)</option>)}
                        </select>
                      )}
                      {!isOnce && !step.workCenterId && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.78rem', color: '#64748b', whiteSpace: 'nowrap' }} title="จำนวนเครื่อง/สถานีที่ทำขนานกัน — ยิ่งมากเวลารวมทั้งล็อตยิ่งลด">
                          ×<input type="number" min="1" value={step.stations || 1} disabled={isViewer}
                            onChange={e => setStep(step.id, { stations: Math.max(1, Math.floor(Number(e.target.value)) || 1) })}
                            style={{ width: 46, padding: '6px 4px', borderRadius: 4, border: '1px solid #ccc', textAlign: 'center' }} /> เครื่อง
                        </label>
                      )}
                    </div>

                    {/* จุดตรวจ → เงื่อนไขเมื่อไม่ผ่าน */}
                    {!isViewer && isCheck && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6 }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#991b1b', whiteSpace: 'nowrap' }}>✗ ถ้าไม่ผ่าน →</span>
                        <select value={step.failAction} title="การจัดการเมื่อไม่ผ่าน"
                          onChange={e => setStep(step.id, { failAction: e.target.value as FailAction })}
                          style={{ padding: 6, borderRadius: 4, border: '1px solid #fca5a5', background: '#fff', fontSize: '0.8rem' }}>
                          {FAIL_OPTS.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                        {step.failAction === 'back' && (
                          <select value={step.backToId} title="ย้อนกลับไปขั้น"
                            onChange={e => setStep(step.id, { backToId: e.target.value })}
                            style={{ padding: 6, borderRadius: 4, border: '1px solid #fca5a5', background: '#fff', fontSize: '0.8rem' }}>
                            <option value="">— ขั้นที่ย้อนไป (ดีฟอลต์: ขั้นก่อนหน้า) —</option>
                            {steps.slice(0, index).map((x, xi) => <option key={x.id} value={x.id}>Step {xi + 1}: {x.process}</option>)}
                          </select>
                        )}
                        {(step.failAction === 'rework' || step.failAction === 'rework_station' || step.failAction === 'back') && (
                          <label style={{ fontSize: '0.8rem', color: '#991b1b', display: 'flex', alignItems: 'center', gap: 4 }}>
                            วนได้ไม่เกิน
                            <input type="number" min="0" value={step.maxRetry || ''} placeholder="0" title="จำนวนครั้งสูงสุด (0 = ไม่จำกัด)"
                              onChange={e => setStep(step.id, { maxRetry: e.target.value === '' ? 0 : Math.max(0, Math.floor(Number(e.target.value)) || 0) })}
                              style={{ width: 52, padding: 5, borderRadius: 4, border: '1px solid #fca5a5', textAlign: 'center' }} />
                            ครั้ง (0=ไม่จำกัด)
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );})}
          </div>
        )}
      </div>

      {/* เวลามาตรฐาน (ประมาณการ): Setup ครั้งเดียว + ต่อชิ้น × จำนวน ÷ เครื่องขนาน */}
      <div style={{ padding: 16, background: '#f0f9ff', borderRadius: 8, border: '1px solid #bae6fd' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
          <span style={{ fontWeight: 700, color: '#0369a1' }}>⏱️ เวลามาตรฐาน (ประมาณการ)</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: '#0369a1', whiteSpace: 'nowrap' }}>
            จำนวนชิ้นในล็อต (Qty)
            <input type="number" min="0" value={qty} disabled={isViewer} placeholder="เช่น 3000"
              onChange={e => setQty(e.target.value === '' ? '' : Math.max(0, Math.floor(Number(e.target.value)) || 0))}
              style={{ width: 110, padding: '7px 10px', borderRadius: 6, border: '1px solid #7dd3fc', textAlign: 'right' }} />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e0f2fe', padding: '10px 12px' }}>
            <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: 2 }}>📌 Setup (ครั้งเดียว/ล็อต)</div>
            <strong style={{ fontSize: '1.05rem', color: '#155e75' }}>{fmtTime(setupSec)}</strong>
          </div>
          <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e0f2fe', padding: '10px 12px' }}>
            <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: 2 }}>🔁 ต่อชิ้น (1 ชิ้นผ่านครบ)</div>
            <strong style={{ fontSize: '1.05rem', color: '#166534' }}>{fmtTime(perUnitSec)}</strong>
          </div>
          <div style={{ background: '#fff', borderRadius: 8, border: '2px solid #38bdf8', padding: '10px 12px' }}>
            <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: 2 }}>📦 รวมทั้งล็อต (ประมาณ)</div>
            <strong style={{ fontSize: '1.15rem', color: '#0284c7' }}>{qtyN > 0 ? fmtTime(Math.round(lotSec)) : '— ใส่ Qty —'}</strong>
          </div>
        </div>
        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 10, lineHeight: 1.5 }}>
          รวมทั้งล็อต = Setup + Σ(เวลาต่อชิ้น × จำนวน ÷ จำนวนเครื่องขนาน) · เป็น<strong>ค่าประมาณการ</strong>สำหรับวางแผน — เวลาจริง (actual) ขึ้นกับคิว/เครื่องว่าง/การพัก ต้องวัดจากหน้างาน
        </div>
      </div>

      {/* บันทึกผลเดินสายผลิต — กดผ่าน/ไม่ผ่าน เฉพาะ "จุดตรวจ" ของ Serial จริง */}
      {!isViewer && (
        <div style={{ padding: 15, background: 'var(--bg-panel)', borderRadius: 6, border: '1px solid var(--border-color)' }}>
          <div style={{ fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>📝 บันทึกผลเดินสายผลิต (Serial จริง)</div>
          {checkpoints.length === 0 ? (
            <div style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: 10 }}>ยังไม่มีจุดตรวจในเวิร์กโฟลว์ — ผลรวมจะเป็น PASS โดยอัตโนมัติ</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {checkpoints.map(s => {
                const failed = runFail.has(s.id);
                const i = steps.findIndex(x => x.id === s.id);
                return (
                  <button key={s.id} type="button" onClick={() => toggleRun(s.id)}
                    title="กดสลับ ผ่าน/ไม่ผ่าน ของจุดตรวจนี้"
                    style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${failed ? '#dc2626' : '#16a34a'}`, background: failed ? '#fee2e2' : '#dcfce7', color: failed ? '#991b1b' : '#166534', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                    {i + 1}. {s.process}: {failed ? '✗ ไม่ผ่าน' : '✓ ผ่าน'}
                  </button>
                );
              })}
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>ผลรวม (Result):</span>
              <ResultBadge value={overallRun} />
              {overallRun === 'FAIL' && (
                <span style={{ fontSize: '0.82rem', color: '#991b1b', fontWeight: 600 }}>
                  ✗ ไม่ผ่านที่ {checkpoints.filter(s => runFail.has(s.id)).map(s => `Step ${steps.findIndex(x => x.id === s.id) + 1}`).join(', ')}
                </span>
              )}
            </div>
            <button type="button" className="btn" onClick={record} disabled={!serial.trim() || steps.length === 0 || recordResult.isPending}
              style={{ background: '#27ae60', borderColor: '#27ae60', color: '#fff', fontWeight: 600, minHeight: 42, padding: '0 24px' }}>
              {recordResult.isPending ? 'กำลังบันทึก...' : '💾 บันทึกผล'}
            </button>
          </div>
        </div>
      )}

      {/* Gen FlowChart */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" className="btn" onClick={() => setShowFlow(v => !v)} disabled={steps.length === 0}
          style={{ background: '#6366f1', borderColor: '#6366f1', color: '#fff', fontWeight: 600 }}>
          {showFlow ? 'ซ่อน FlowChart' : '🔀 Gen FlowChart'}
        </button>
      </div>

      {showFlow && (
        <div style={{ padding: 20, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <h3 className="panel__title panel__title--sm" style={{ margin: 0 }}>FlowChart</h3>
            <button type="button" className="btn secondary" style={{ fontSize: '0.82rem' }} onClick={() => exportFlowchartPdf(customer, model, flowSvg)}>🖨️ Export PDF</button>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 16 }}>Customer: <strong>{customer || '—'}</strong> · Model: <strong>{model || '—'}</strong> · <span style={{ color: '#6366f1' }}>ฟ้า</span>=ขั้นผลิต · <span style={{ color: '#d97706' }}>เหลือง</span>=จุดตรวจ (มีทางออกเมื่อไม่ผ่าน)</p>
          <div style={{ display: 'flex', justifyContent: 'center', overflowX: 'auto', padding: '8px 0' }} dangerouslySetInnerHTML={{ __html: flowSvg }} />
          <details style={{ marginTop: 24 }}>
            <summary style={{ cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-muted)' }}>Mermaid</summary>
            <pre style={{ background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: 8, padding: 12, fontSize: '0.8rem', overflowX: 'auto', marginTop: 8 }}>{toMermaid(steps)}</pre>
          </details>
        </div>
      )}

      {/* ตารางผล (Result) */}
      <div>
        <h3 className="panel__title panel__title--sm" style={{ marginBottom: 10 }}>📋 ผลการบันทึก {results.length > 0 && `(${results.length})`}</h3>
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
          <table className="table" style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <th>วันที่/เวลา</th><th>Serial</th><th>Customer</th><th>Model</th><th>ลำดับกระบวนการ</th><th>Cycle</th><th>ผล</th>{!isViewer && <th></th>}
              </tr>
            </thead>
            <tbody>
              {results.length === 0 ? (
                <tr><td colSpan={isViewer ? 7 : 8} style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>ยังไม่มีผลที่บันทึก — กรอก Serial + กระบวนการ + เวลา แล้วกด “บันทึกผล”</td></tr>
              ) : results.map(r => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem', color: '#64748b' }}>{fmtDateTime(r.created_at)}</td>
                  <td style={{ fontWeight: 600 }}>{r.serial}</td>
                  <td>{r.customer || '—'}</td>
                  <td>{r.model || '—'}</td>
                  <td style={{ fontSize: '0.8rem', color: '#475569', minWidth: 260, maxWidth: 360, whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.5 }}>{r.sequence || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtTime(r.total_sec)}</td>
                  <td><ResultBadge value={r.result} /></td>
                  {!isViewer && (
                    <td><button className="btn danger" style={{ padding: '4px 10px', fontSize: '0.78rem' }} onClick={() => { if (confirm(`ลบผล ${r.serial}?`)) delResult.mutate(r.id); }}>ลบ</button></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
