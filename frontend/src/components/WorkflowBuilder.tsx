import { useState, useEffect, useRef } from 'react';
import {
  useWorkflows, useWorkflowCreate, useWorkflowDelete,
  useWorkflowResults, useWorkflowResultCreate, useWorkflowResultDelete,
  type Workflow,
} from '../lib/workflowApi';
import { useWorkCenters, useWorkCenterCreate, useWorkCenterDelete, type WorkCenter } from '../lib/workCenterApi';
import { useIsViewer } from '../lib/useMockStore';
import { showToast } from '../lib/toast';
import { ResultBadge } from './ResultBadge';

type StepKind = 'process' | 'checkpoint';
type TimeScope = 'per_unit' | 'once';
type FailAction = 'rework' | 'back' | 'rework_station' | 'scrap' | 'hold';

// บทบาทในสายผลิต — หัว/ท้ายล็อกไว้ตายตัว · SMT เป็นช่วงกลางที่แก้/เรียงได้
type Role = 'incoming' | 'setup' | 'smt' | 'packing' | 'store';
const ROLE_CFG: Record<Role, { kind: StepKind; timeScope: TimeScope; color: string }> = {
  incoming: { kind: 'process',    timeScope: 'once',     color: '#0891b2' },
  setup:    { kind: 'process',    timeScope: 'once',     color: '#7c3aed' },
  smt:      { kind: 'checkpoint', timeScope: 'per_unit', color: '#d97706' },
  packing:  { kind: 'process',    timeScope: 'per_unit', color: '#16a34a' },
  store:    { kind: 'process',    timeScope: 'once',     color: '#64748b' },
};

// กระบวนการที่เลือกได้ในช่วง SMT (REWORK เป็นปลายทาง fail อัตโนมัติ — ไม่อยู่ในลิสต์)
// กระบวนการช่วง SMT (ผู้ใช้เพิ่ม/ลบ custom ได้) — SET UP แยกไปกลุ่มของตัวเอง (SETUP_OPTS)
const SMT_DEFAULT = ['BBAS', 'WAV', 'TEST', 'SOLDERING', 'SMT', 'FQC', 'IPQC', 'INSERT', 'ICT TEST', 'FCT TEST', 'REWORK'];
// ชื่อที่ถือเป็นงาน setup (ครั้งเดียว ไม่คูณจำนวน)
const isSetupName = (p: string) => /SET\s*UP/i.test(p || '');
const SETUP_OPTS = ['SET UP LINE', 'SET UP MACHINE'];
const INCOMING_LABEL = 'Check material (in production)';
// สถานีหลักหัว-ท้ายสายผลิต — เผื่อเผลอลบทิ้ง จะได้เลือกใส่กลับจากดรอปดาวน์ แล้วลากเข้าตำแหน่งเอง
const MAIN_OPTS = [INCOMING_LABEL, 'PACKING', 'STORE'];

type Step = {
  id: string; process: string; seconds: number | '';
  role: Role;
  kind: StepKind; timeScope: TimeScope;   // มาจาก role (เก็บไว้ให้ flowchart/คำนวณใช้)
  failAction: FailAction; backToId: string; maxRetry: number;
  repeat: number;                          // จำนวนรอบ (เฉพาะ SMT — คูณเวลา)
  stations: number;                        // จำนวนเครื่องขนาน (กรอกเอง ใช้เมื่อไม่ผูก work center)
  workCenterId: number | null;             // ผูก work center → ดึงจำนวนเครื่อง+efficiency
};

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `s_${Date.now()}_${Math.round(performance.now())}`);

const makeStep = (role: Role, process: string): Step => {
  const c = ROLE_CFG[role];
  return {
    id: uid(), process, seconds: '', role,
    kind: c.kind, timeScope: c.timeScope,
    failAction: 'rework', backToId: '', maxRetry: 0,
    repeat: 1, stations: 1, workCenterId: null,
  };
};

// โครงเริ่มต้น: รับของ → set up (ขั้น smt ปกติ ลบ/ย้ายได้) → (SMT) → แพ็ก → คลัง
const initialSteps = (): Step[] => [
  makeStep('incoming', INCOMING_LABEL),
  { ...makeStep('smt', SETUP_OPTS[0]), timeScope: 'once', kind: 'process' },   // set up ไม่ล็อกแล้ว เป็นขั้นปกติ (ครั้งเดียว)
  makeStep('packing', 'PACKING'),
  makeStep('store', 'STORE'),
];

// เดา role จากชื่อ (สำหรับ preset เก่าที่ไม่มี role) — SET UP ถือเป็นขั้น smt ปกติ (ไม่ล็อกแล้ว)
const inferRole = (p: string): Role => {
  const u = (p || '').toUpperCase();
  if (u.includes('CHECK MATERIAL') || u.includes('INCOMING') || u.includes('รับของ')) return 'incoming';
  if (u.includes('PACK')) return 'packing';
  if (u.includes('STORE') || u.includes('คลัง')) return 'store';
  return 'smt';
};

const fmtTime = (sec: number) => {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const p: string[] = [];
  if (h) p.push(`${h} ชม.`);
  if (m) p.push(`${m} นาที`);
  if (s || !p.length) p.push(`${s} วิ`);
  return p.join(' ');
};

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

/* ── mermaid flowchart — process ไหลผ่าน · checkpoint(SMT) แตกกิ่งเมื่อไม่ผ่าน → rework ── */
function toMermaid(steps: Step[]): string {
  if (!steps.length) return 'flowchart TD\n  START([เริ่ม]) --> END([จบ])';
  const L = ['flowchart TD', '  START([▶ เริ่มสายผลิต]):::se'];
  steps.forEach((s, i) => {
    const t = s.seconds !== '' ? `<br/>⏱ ${s.seconds}s` : '';
    L.push(`  S${i}["${i + 1}. ${s.process}${t}"]:::${s.kind === 'checkpoint' ? 'chk' : 'proc'}`);
  });
  L.push('  DONE([■ เสร็จ]):::se');
  L.push('  START --> S0');
  steps.forEach((s, i) => {
    const next = i < steps.length - 1 ? `S${i + 1}` : 'DONE';
    const t = s.seconds !== '' ? `${s.seconds}s` : '';
    const lbl = s.kind === 'checkpoint' ? `${t ? t + ' · ' : ''}✓ ผ่าน` : t;
    L.push(lbl ? `  S${i} -->|"${lbl}"| ${next}` : `  S${i} --> ${next}`);
  });
  steps.forEach((s, i) => {
    if (s.kind !== 'checkpoint') return;
    L.push(`  S${i} -->|"ไม่ผ่าน"| RW${i}["🛠️ REWORK"]:::rw`);
    L.push(`  RW${i} -.->|แก้แล้ว| S${i}`);
  });
  L.push('  classDef proc fill:#eef2ff,stroke:#6366f1,stroke-width:2px,color:#1e293b;');
  L.push('  classDef chk fill:#fffbeb,stroke:#d97706,stroke-width:2px,color:#1e293b;');
  L.push('  classDef se fill:#dcfce7,stroke:#16a34a,stroke-width:2px,color:#14532d;');
  L.push('  classDef rw fill:#fef2f2,stroke:#dc2626,color:#991b1b;');
  return L.join('\n');
}

/* ── วาด flowchart เป็น SVG เอง — process ไหลตรง · SMT(checkpoint) แตกกิ่ง fail → rework ── */
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
  const geom: { top: number; mid: number; bottom: number; h: number }[] = [];
  let y = 8;
  items.forEach(it => { const h = it.pill ? PILLH : BH; geom.push({ top: y, mid: y + h / 2, bottom: y + h, h }); y += h + GAP; });
  const totalH = y - GAP + 8;

  const parts: string[] = [];
  const nx = rx + 26, NW = 122, NH = 30;
  items.forEach((it, idx) => {
    const g = geom[idx];
    if (it.pill) {
      parts.push(`<rect x="${cx - PILLW / 2}" y="${g.top}" width="${PILLW}" height="${g.h}" rx="${g.h / 2}" fill="#dcfce7" stroke="#16a34a" stroke-width="2"/>`);
      parts.push(`<text x="${cx}" y="${g.mid}" text-anchor="middle" dominant-baseline="central" font-size="13" font-weight="700" fill="#14532d">${esc(it.label)}</text>`);
    } else {
      const stroke = it.check ? '#d97706' : '#6366f1', fill = it.check ? '#fffbeb' : '#eef2ff';
      parts.push(`<rect x="${BX}" y="${g.top}" width="${BW}" height="${g.h}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`);
      parts.push(`<text x="${cx}" y="${it.sub ? g.mid - 7 : g.mid}" text-anchor="middle" dominant-baseline="central" font-size="13" font-weight="600" fill="#1e293b">${esc(it.label)}</text>`);
      if (it.sub) parts.push(`<text x="${cx}" y="${g.mid + 10}" text-anchor="middle" dominant-baseline="central" font-size="11" fill="#0369a1">${esc(it.sub)}</text>`);
      if (it.check) {
        // SMT: fail → REWORK (node แตกข้างขวา + เส้นวนกลับ)
        const midY = g.mid;
        parts.push(`<line x1="${rx}" y1="${midY}" x2="${nx}" y2="${midY}" stroke="#dc2626" stroke-width="2" marker-end="url(#ahr)"/>`);
        parts.push(`<rect x="${nx}" y="${midY - NH / 2}" width="${NW}" height="${NH}" rx="6" fill="#fee2e2" stroke="#dc2626" stroke-width="1.5"/>`);
        parts.push(`<text x="${nx + NW / 2}" y="${midY}" text-anchor="middle" dominant-baseline="central" font-size="10.5" font-weight="700" fill="#991b1b">🛠️ REWORK</text>`);
        parts.push(`<path d="M ${nx + NW / 2} ${midY + NH / 2} C ${nx + NW / 2} ${midY + 28}, ${rx + 12} ${g.bottom + 4}, ${rx} ${g.bottom - 8}" fill="none" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="4 3" marker-end="url(#ahr)"/>`);
      }
    }
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

// ── Dropdown กลาง — ใช้ทุกช่อง (setup/SMT/เครื่อง) ให้หน้าตาเหมือนกันหมด ──
// groups = แยกเป็นหัวข้อได้ (เช่น Set up / Custom process) · item.deletable = มี ✕ ลบในตัว · onAdd = ปุ่ม "+ เพิ่ม"
// ลูกศรดรอปดาวน์ — SVG ตัวเดียวกับ <select> ทั่วเว็บ (index.css) ให้หน้าตาตรงกัน
const DD_ARROW = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2364748b' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")";
type DDItem = { value: string; label: string; deletable?: boolean };
type DDGroup = { header?: string; items: DDItem[] };
function Dropdown({ value, groups, onPick, onAdd, addLabel = '➕ เพิ่มกระบวนการ...', onDelete, disabled }: {
  value: string; groups: DDGroup[];
  onPick: (v: string) => void; onAdd?: () => void; addLabel?: string; onDelete?: (v: string) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const toggle = () => {
    if (disabled) return;
    if (!open) { const r = boxRef.current?.getBoundingClientRect(); if (r) setPos({ top: r.bottom + 2, left: r.left, width: r.width }); }
    setOpen(o => !o);
  };
  const current = groups.flatMap(g => g.items).find(i => i.value === value);
  return (
    <div style={{ width: '100%', minWidth: 0 }}>
      <div ref={boxRef} onClick={toggle}
        style={{ width: '100%', padding: '8px 28px 8px 10px', borderRadius: 4, border: '1px solid #ccc', fontSize: '0.85rem', fontWeight: 600, backgroundColor: disabled ? '#f1f5f9' : '#fff', color: '#334155', cursor: disabled ? 'default' : 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', backgroundImage: DD_ARROW, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center', backgroundSize: '10px 6px' }}>
        {current ? current.label : (value || '—')}
      </div>
      {open && pos && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, background: '#fff', border: '1px solid #ccc', borderRadius: 4, boxShadow: '0 6px 18px rgba(0,0,0,0.15)', zIndex: 1000, maxHeight: 320, overflowY: 'auto' }}>
            {groups.map((g, gi) => (
              <div key={gi}>
                {g.header && <div style={{ padding: '5px 10px', fontSize: '0.7rem', fontWeight: 700, color: '#6366f1', background: '#eef2ff', borderBottom: '1px solid #e2e8f0' }}>{g.header}</div>}
                {g.items.map(it => (
                  <div key={it.value} style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #f1f5f9', background: value === it.value ? '#e0f2fe' : '#fff' }}>
                    <div style={{ flexGrow: 1, padding: '8px 10px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: value === it.value ? '#0369a1' : '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      onClick={() => { onPick(it.value); setOpen(false); }}>{it.label}</div>
                    {it.deletable && onDelete && (
                      <button type="button" title={`ลบ "${it.label}"`} onClick={e => { e.stopPropagation(); onDelete(it.value); }}
                        onMouseOver={e => (e.currentTarget.style.background = '#fee2e2')} onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                        style={{ background: 'transparent', border: 'none', color: '#e11d48', cursor: 'pointer', padding: '8px 11px', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>✕</button>
                    )}
                  </div>
                ))}
              </div>
            ))}
            {onAdd && (
              <div onClick={() => { setOpen(false); onAdd(); }}
                style={{ padding: '8px 10px', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', color: '#0369a1', background: '#f0f9ff', borderTop: '1px solid #e2e8f0' }}>{addLabel}</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const GRID = '26px 34px minmax(170px,1fr) 220px 84px 150px 40px';
const TBOX = { width: 64, padding: '8px 4px', borderRadius: 4, border: '1px solid #ccc', textAlign: 'center' as const, fontSize: '0.85rem', fontWeight: 600 };
const NUMBOX = { width: 60, padding: '7px 4px', borderRadius: 4, border: '1px solid #ccc', textAlign: 'center' as const, fontSize: '0.85rem', fontWeight: 600 };

// ⚠️ ต้องประกาศนอก WorkflowBuilder — ถ้าประกาศข้างใน จะถูกสร้างใหม่ทุก render → input remount → เคอร์เซอร์หายตอนพิมพ์
type CellProps = { step: Step; isViewer: boolean; setStep: (id: string, patch: Partial<Step>) => void };

function TimeCells({ step, isViewer, setStep }: CellProps) {
  const sec = step.seconds === '' ? 0 : Number(step.seconds);
  const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
  const setPart = (part: 'h' | 'm' | 's', raw: string) => {
    const v = raw === '' ? 0 : Math.max(0, Math.floor(Number(raw)) || 0);
    const next = { h: hh, m: mm, s: ss, [part]: v };
    const total = next.h * 3600 + next.m * 60 + next.s;
    setStep(step.id, { seconds: total === 0 ? '' : total });
  };
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center', justifyContent: 'center' }} title="ชั่วโมง : นาที : วินาที">
      <input type="number" min="0" placeholder="ชั่วโมง" disabled={isViewer} value={hh || ''} onChange={e => setPart('h', e.target.value)} style={TBOX} />
      <span style={{ color: '#94a3b8', fontWeight: 700 }}>:</span>
      <input type="number" min="0" max="59" placeholder="นาที" disabled={isViewer} value={mm || ''} onChange={e => setPart('m', e.target.value)} style={TBOX} />
      <span style={{ color: '#94a3b8', fontWeight: 700 }}>:</span>
      <input type="number" min="0" max="59" placeholder="วินาที" disabled={isViewer} value={ss || ''} onChange={e => setPart('s', e.target.value)} style={TBOX} />
    </div>
  );
}

function MachineCell({ step, isViewer, setStep, workCenters }: CellProps & { workCenters: WorkCenter[] }) {
  if (workCenters.length === 0) {
    return (
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.85rem', color: '#64748b', whiteSpace: 'nowrap' }} title="จำนวนเครื่องขนาน">
        ×<input type="number" min="1" value={step.stations || 1} disabled={isViewer}
          onChange={e => setStep(step.id, { stations: Math.max(1, Math.floor(Number(e.target.value)) || 1) })} style={NUMBOX} /> เครื่อง
      </label>
    );
  }
  return (
    <>
      <Dropdown value={String(step.workCenterId ?? '')} disabled={isViewer}
        groups={[{ items: [{ value: '', label: '🔧 กรอกเครื่องเอง' }, ...workCenters.map(w => ({ value: String(w.id), label: `🏭 ${w.name} (×${w.stations})` }))] }]}
        onPick={v => setStep(step.id, { workCenterId: v ? Number(v) : null })} />
      {!step.workCenterId && (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.85rem', color: '#64748b', whiteSpace: 'nowrap', marginTop: 4 }} title="จำนวนเครื่องขนาน">
          ×<input type="number" min="1" value={step.stations || 1} disabled={isViewer}
            onChange={e => setStep(step.id, { stations: Math.max(1, Math.floor(Number(e.target.value)) || 1) })} style={NUMBOX} /> เครื่อง
        </label>
      )}
    </>
  );
}

export function WorkflowBuilder() {
  const isViewer = useIsViewer();
  const [serial, setSerial] = useState('');
  const [customer, setCustomer] = useState('');
  const [model, setModel] = useState('');
  const [qty, setQty] = useState<number | ''>('');
  const [steps, setSteps] = useState<Step[]>(initialSteps());
  const [showFlow, setShowFlow] = useState(false);
  const [runFail, setRunFail] = useState<Set<string>>(new Set());
  // กระบวนการ SMT แยก 2 กลุ่ม: default (มาตรฐาน คงที่) + custom (ผู้ใช้เพิ่มเอง ลบได้) — แต่ละกลุ่มเรียง A-Z
  const [customProcs, setCustomProcs] = useState<string[]>(() => {
    let list: string[] = [];
    try { const c = JSON.parse(localStorage.getItem('mes_custom_processes') || '[]'); if (Array.isArray(c)) list = c; } catch { /* noop */ }
    // กู้ custom ที่เคยเพิ่มไว้ใต้ key เก่า (ตอนรวมลิสต์) — เอาเฉพาะที่ไม่ใช่ default
    try {
      const old = JSON.parse(localStorage.getItem('mes_smt_processes_v2') || '[]');
      if (Array.isArray(old)) old.forEach((p: string) => { if (p && !SMT_DEFAULT.includes(p) && !list.includes(p)) list.push(p); });
    } catch { /* noop */ }
    return list;
  });
  useEffect(() => { localStorage.setItem('mes_custom_processes', JSON.stringify(customProcs)); }, [customProcs]);
  // ล้าง key เก่าทิ้งหลังกู้ครั้งเดียว — กันไม่ให้ custom ที่ลบไปแล้ว ถูกดึงกลับมาตอนรีโหลด
  useEffect(() => { localStorage.removeItem('mes_smt_processes_v2'); }, []);
  const smtMain = [...SMT_DEFAULT].sort((a, b) => a.localeCompare(b));            // default เรียง A-Z (บน)
  const smtCustomSorted = [...customProcs].sort((a, b) => a.localeCompare(b));   // custom เรียง A-Z (ล่าง)
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [grabId, setGrabId] = useState<string | null>(null);

  const create = useWorkflowCreate();
  const del = useWorkflowDelete();
  const { data: saved = [] } = useWorkflows();
  const recordResult = useWorkflowResultCreate();
  const delResult = useWorkflowResultDelete();
  const { data: results = [] } = useWorkflowResults();

  const { data: workCenters = [] } = useWorkCenters();
  const wcCreate = useWorkCenterCreate();
  const wcDelete = useWorkCenterDelete();
  const wcById = new Map(workCenters.map(w => [w.id, w]));
  const [wcName, setWcName] = useState('');
  const [wcStations, setWcStations] = useState('');
  const [wcEff, setWcEff] = useState('');
  const resolveWc = (s: Step) => {
    const wc = s.workCenterId ? wcById.get(s.workCenterId) : undefined;
    return {
      wc,
      stations: wc ? Math.max(1, wc.stations) : Math.max(1, Number(s.stations) || 1),
      eff: wc ? Math.max(1, wc.efficiency) : 100,
    };
  };

  // เวลามาตรฐาน (ประมาณการ): once = ครั้งเดียว · per_unit = × จำนวน ÷ เครื่อง · SMT คูณจำนวนรอบ (repeat)
  const qtyN = Number(qty) || 0;
  const effSec = (s: Step) => (Number(s.seconds) || 0) * 100 / resolveWc(s).eff;
  const unitSec = (s: Step) => effSec(s) * (s.role === 'smt' ? Math.max(1, Number(s.repeat) || 1) : 1);
  const setupSec   = steps.reduce((sum, s) => sum + (s.timeScope === 'once' ? effSec(s) : 0), 0);
  const perUnitSec = steps.reduce((sum, s) => sum + (s.timeScope === 'once' ? 0 : unitSec(s)), 0);
  const lotSec = setupSec + steps.reduce((sum, s) => {
    if (s.timeScope === 'once') return sum;
    return sum + unitSec(s) * qtyN / resolveWc(s).stations;
  }, 0);
  const totalSec = Math.round(perUnitSec);
  const flowSvg = buildFlowSvg(steps);
  const checkpoints = steps.filter(s => s.kind === 'checkpoint');
  const overallRun = checkpoints.some(s => runFail.has(s.id)) ? 'FAIL' : 'PASS';
  const smtCount = steps.filter(s => s.role === 'smt').length;

  const setStep = (id: string, patch: Partial<Step>) => setSteps(s => s.map(x => x.id === id ? { ...x, ...patch } : x));
  // เลือกกระบวนการจากดรอปดาวน์ — ปรับ role/เวลา/ชนิด ตามชื่อที่เลือก (สถานีหลัก/setup/SMT)
  const pickProcess = (id: string, v: string) => {
    const role = inferRole(v);              // Check material→incoming · PACK→packing · STORE→store · ที่เหลือ→smt
    const setupLike = isSetupName(v);       // SET UP * → ครั้งเดียว ไม่มีจุดตรวจ
    const c = ROLE_CFG[role];
    setStep(id, { process: v, role, timeScope: setupLike ? 'once' : c.timeScope, kind: setupLike ? 'process' : c.kind });
  };
  // เพิ่มขั้น SMT — แทรกก่อน Packing เสมอ
  const addSmt = () => setSteps(s => {
    const ns = makeStep('smt', smtMain[0] || 'SMT');
    const i = s.findIndex(x => x.role === 'packing');
    if (i < 0) return [...s, ns];
    const next = [...s]; next.splice(i, 0, ns); return next;
  });
  const removeStep = (id: string) => setSteps(s => s.filter(x => x.id !== id));   // ลบได้ทุกขั้น (รวมหัว-ท้าย)
  const toggleRun = (id: string) => setRunFail(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ลากจัดลำดับได้ทุกขั้น (รวมหัว-ท้าย) — ผู้ใช้จัดตำแหน่งเองอิสระ
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

  /* บันทึก Preset */
  function savePreset() {
    if (!steps.length) return;
    const name = window.prompt('ตั้งชื่อ Preset:', customer && model ? `${customer} - ${model}` : '');
    if (name == null) return;
    if (!name.trim()) { showToast('ต้องตั้งชื่อ Preset', 'error'); return; }
    create.mutate({
      name: name.trim(), customer: customer.trim(), model: model.trim(),
      steps: steps.map(s => ({
        process: s.process,
        seconds: s.seconds === '' ? null : Number(s.seconds),
        role: s.role,
        kind: s.kind,
        timeScope: s.timeScope,
        failAction: 'rework',
        backToIndex: null,
        maxRetry: 0,
        repeat: s.role === 'smt' ? Math.max(1, Number(s.repeat) || 1) : 1,
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
    const ws = w.steps.length ? w.steps : [];
    const loaded: Step[] = ws.map(s => {
      let role: Role = (['incoming', 'setup', 'smt', 'packing', 'store'].includes(s.role as string) ? s.role : inferRole(s.process)) as Role;
      if (role === 'setup') role = 'smt';                 // setup ไม่ล็อกแล้ว → ขั้น smt ปกติ
      const setupLike = isSetupName(s.process);
      const c = ROLE_CFG[role];
      return {
        id: uid(),
        process: s.process,
        seconds: (s.seconds == null ? '' : s.seconds) as number | '',
        role,
        kind: setupLike ? 'process' : c.kind,
        timeScope: setupLike ? 'once' : c.timeScope,
        failAction: 'rework', backToId: '', maxRetry: 0,
        repeat: Number(s.repeat) > 0 ? Number(s.repeat) : 1,
        stations: Number(s.stations) > 0 ? Number(s.stations) : 1,
        workCenterId: Number(s.workCenterId) > 0 ? Number(s.workCenterId) : null,
      };
    });
    setSteps(loaded.length ? loaded : initialSteps());
    setRunFail(new Set());
    const extra = ws.map(s => s.process).filter(p => p && inferRole(p) === 'smt' && !SMT_DEFAULT.includes(p) && !customProcs.includes(p));
    if (extra.length) setCustomProcs(prev => [...new Set([...prev, ...extra])]);
    setShowFlow(false);
    showToast(`โหลด Preset "${w.name || w.customer}"`, 'info');
  }

  /* เพิ่ม/ลบ กระบวนการ custom (เฉพาะช่วง SMT) */
  function addCustomProcess(stepId: string) {
    const name = window.prompt('ชื่อกระบวนการ SMT ใหม่:');
    if (name == null) return;
    const t = name.trim();
    if (!t) { showToast('ต้องใส่ชื่อกระบวนการ', 'error'); return; }
    if (SMT_DEFAULT.includes(t) || customProcs.includes(t)) showToast('มีกระบวนการนี้อยู่แล้ว — เลือกได้เลย', 'info');
    else { setCustomProcs(prev => [...prev, t]); showToast(`เพิ่มกระบวนการ "${t}" แล้ว`, 'success'); }
    pickProcess(stepId, t);
  }

  /* เพิ่ม/ลบ Work Center */
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

  /* บันทึกผลรันจริง */
  function record() {
    if (!serial.trim()) { showToast('กรุณากรอก Serial Number', 'error'); return; }
    if (steps.some(s => s.seconds === '' || Number(s.seconds) <= 0)) {
      showToast('กรุณากรอกเวลาให้ครบทุกกระบวนการ', 'error'); return;
    }
    const perStep = steps.map(s => ({ process: s.process, result: (s.kind === 'checkpoint' && runFail.has(s.id)) ? 'FAIL' : 'PASS' }));
    const seqStr = steps.map(s => `${s.process}${s.role === 'smt' && Number(s.repeat) > 1 ? `×${s.repeat}` : ''}${s.kind === 'checkpoint' && runFail.has(s.id) ? '❌' : ''}${s.seconds !== '' ? `(${s.seconds}s)` : ''}`).join(' → ');
    recordResult.mutate(
      { serial: serial.trim(), customer: customer.trim(), model: model.trim(), sequence: seqStr, result: overallRun, total_sec: totalSec, steps: perStep },
      {
        onSuccess: () => { showToast(`บันทึกผล ${serial.trim()} (${overallRun}) สำเร็จ`, 'success'); setSerial(''); setRunFail(new Set()); },
        onError: (e: any) => showToast(e.message, 'error'),
      }
    );
  }

  /* ลบกระบวนการที่เพิ่มเอง (custom) ออกจากลิสต์ — ขั้นที่ใช้อยู่จะย้ายไปตัวแรก (default) */
  function deleteCustomProc(name: string) {
    if (!confirm(`ลบกระบวนการ "${name}" ออกจากลิสต์?`)) return;
    setCustomProcs(prev => prev.filter(n => n !== name));
    setSteps(prev => prev.map(s => (s.role === 'smt' && s.process === name) ? { ...s, process: smtMain[0] || 'SMT' } : s));
  }

  return (
    <div className="panel stack-lg">
      <div className="mes-module-head">
        <span className="mes-module-code">1.3</span>
        <div>
          <h2 className="panel__title">Manufacturing Sequence Builder</h2>
          <p className="panel__subtitle">โครงสายผลิต: รับของ → ตั้งเครื่อง → SMT → แพ็ก → เข้าคลัง · ทุกขั้นเลือก/ลาก/ลบได้ · เผลอลบหัว-ท้ายก็เลือกใส่กลับจากดรอปดาวน์ได้</p>
        </div>
      </div>

      {/* Serial + Customer + Model */}
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

      {/* Work Centers */}
      <div style={{ marginBottom: 15, background: 'var(--bg-panel)', padding: 15, borderRadius: 6, border: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>🏭 เครื่อง/สถานี (Work Center)</strong>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>นิยามจำนวนเครื่องขนาน + ประสิทธิภาพ ที่เดียว → เลือกใช้ในขั้น SMT/แพ็กได้เลย</span>
        </div>
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
        {!isViewer && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <input value={wcName} onChange={e => setWcName(e.target.value)} placeholder="ชื่อเครื่อง เช่น FCT Tester"
              style={{ flex: '1 1 180px', minWidth: 140, padding: '8px 10px', borderRadius: 4, border: '1px solid #ccc' }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem', color: '#64748b', whiteSpace: 'nowrap' }} title="จำนวนเครื่อง/หัวที่ทำขนานกัน">
              ×<input type="number" min="1" value={wcStations} onChange={e => setWcStations(e.target.value)} placeholder="1"
                style={{ width: 56, padding: '8px 4px', borderRadius: 4, border: '1px solid #ccc', textAlign: 'center' }} /> เครื่อง
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem', color: '#64748b', whiteSpace: 'nowrap' }} title="ประสิทธิภาพ % (100 = ตามมาตรฐาน)">
              eff<input type="number" min="1" max="1000" value={wcEff} onChange={e => setWcEff(e.target.value)} placeholder="100"
                style={{ width: 56, padding: '8px 4px', borderRadius: 4, border: '1px solid #ccc', textAlign: 'center' }} />%
            </label>
            <button type="button" className="btn secondary" onClick={addWorkCenter} disabled={wcCreate.isPending || !wcName.trim()}>
              {wcCreate.isPending ? 'กำลังเพิ่ม...' : '➕ เพิ่มเครื่อง'}
            </button>
          </div>
        )}
      </div>

      {/* steps — ตาราง Routing (ทุกขั้นเลือก/ลาก/ลบได้) */}
      <div style={{ background: '#f8f9fa', padding: 16, border: '1px solid #e2e8f0', borderRadius: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <strong style={{ fontSize: '0.95rem', color: '#334155' }}>📋 ลำดับกระบวนการ (Routing)</strong>
          {!isViewer && (
            <button type="button" className="btn" onClick={addSmt} style={{ background: 'var(--brand)', color: '#fff', border: 'none' }}>
              + เพิ่มขั้นตอน
            </button>
          )}
        </div>


        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff' }}>
          <div style={{ minWidth: 760 }}>
            {/* หัวคอลัมน์ */}
            <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 10, alignItems: 'center', padding: '9px 12px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              <span></span>
              <span style={{ textAlign: 'center' }}>#</span>
              <span>กระบวนการ</span>
              <span style={{ textAlign: 'center' }}>เวลา/หน่วย</span>
              <span style={{ textAlign: 'center' }}>ทำซ้ำ</span>
              <span>เครื่อง</span>
              <span></span>
            </div>

            {steps.map((step, index) => {
              const cfg = ROLE_CFG[step.role];
              const isSmt = step.role === 'smt';
              const isOnce = step.timeScope === 'once';
              return (
              <div key={step.id}
                draggable={!isViewer && grabId === step.id}
                onDragStart={e => { setDraggedId(step.id); e.dataTransfer.effectAllowed = 'move'; }}
                onDragOver={e => { e.preventDefault(); if (step.id !== dragOverId) setDragOverId(step.id); }}
                onDragLeave={() => setDragOverId(null)}
                onDrop={e => { e.preventDefault(); onDrop(step.id); }}
                onDragEnd={() => { setDraggedId(null); setDragOverId(null); setGrabId(null); }}
                style={{
                  borderBottom: '1px solid #f1f5f9',
                  borderLeft: `4px solid ${cfg.color}`,
                  opacity: draggedId === step.id ? 0.5 : 1,
                  background: dragOverId === step.id && draggedId !== step.id ? '#e0f2fe' : '#fff',
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 10, alignItems: 'center', padding: '8px 12px' }}>
                  {/* ลาก (ทุกขั้น) */}
                  <div style={{ cursor: !isViewer ? 'grab' : 'default', color: '#cbd5e1', fontSize: '1.1rem', textAlign: 'center' }}
                    onMouseEnter={() => !isViewer && setGrabId(step.id)} onMouseLeave={() => setGrabId(null)} title={!isViewer ? 'ลากเพื่อจัดลำดับ' : undefined}>{!isViewer ? '☰' : ''}</div>
                  {/* # */}
                  <div style={{ textAlign: 'center', fontWeight: 700, color: cfg.color }}>{index + 1}</div>
                  {/* กระบวนการ — ดรอปดาวน์เดียวกันทุกขั้น (เลือกสถานีหลัก/setup/SMT/custom ได้) */}
                  <div style={{ minWidth: 0 }}>
                    <Dropdown value={step.process} disabled={isViewer}
                      groups={[
                        { header: 'สถานีหลัก', items: MAIN_OPTS.map(o => ({ value: o, label: o })) },
                        { header: 'Set up', items: SETUP_OPTS.map(o => ({ value: o, label: o })) },
                        { header: 'Process', items: smtMain.map(o => ({ value: o, label: o })) },
                        { header: 'Custom process', items: smtCustomSorted.map(o => ({ value: o, label: o, deletable: true })) },
                      ]}
                      onPick={v => pickProcess(step.id, v)}
                      onAdd={() => addCustomProcess(step.id)} onDelete={deleteCustomProc} />
                  </div>
                  {/* เวลา */}
                  <TimeCells step={step} isViewer={isViewer} setStep={setStep} />
                  {/* ทำซ้ำ — เฉพาะขั้นต่อชิ้น (setup/once โชว์ ×1) */}
                  <div style={{ textAlign: 'center' }}>
                    {isSmt && !isOnce ? (
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.85rem', color: '#64748b' }} title="จำนวนรอบที่ทำขั้นนี้ (คูณเวลา)">
                        ×<input type="number" min="1" value={step.repeat || 1} disabled={isViewer}
                          onChange={e => setStep(step.id, { repeat: Math.max(1, Math.floor(Number(e.target.value)) || 1) })}
                          style={NUMBOX} />
                      </label>
                    ) : <span style={{ color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 600 }}>×1</span>}
                  </div>
                  {/* เครื่อง (per_unit เท่านั้น) */}
                  <div>
                    {isOnce ? <span style={{ color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 600 }}>×1</span> : <MachineCell step={step} isViewer={isViewer} setStep={setStep} workCenters={workCenters} />}
                  </div>
                  {/* ลบ (SMT เท่านั้น) */}
                  <div style={{ textAlign: 'center' }}>
                    {!isViewer && (
                      <button type="button" onClick={() => removeStep(step.id)} title="ลบขั้นตอนนี้"
                        style={{ border: 'none', background: 'transparent', color: '#e11d48', cursor: 'pointer', fontSize: 16, fontWeight: 700, lineHeight: 1 }}>✕</button>
                    )}
                  </div>
                </div>
              </div>
              );
            })}
            {smtCount === 0 && (
              <div style={{ padding: '14px 12px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem', background: '#fffdf6' }}>
                ยังไม่มีขั้น SMT ตรงกลาง — กด “+ เพิ่มขั้นตอน” เพื่อใส่ BBAS / SMT / TEST ฯลฯ
              </div>
            )}
          </div>
        </div>
      </div>

      {/* เวลามาตรฐาน (ประมาณการ) */}
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
            <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: 2 }}>📌 ครั้งเดียว/ล็อต (รับของ+setup+คลัง)</div>
            <strong style={{ fontSize: '1.05rem', color: '#155e75' }}>{fmtTime(Math.round(setupSec))}</strong>
          </div>
          <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e0f2fe', padding: '10px 12px' }}>
            <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: 2 }}>🔁 ต่อชิ้น (1 ชิ้นผ่านครบ)</div>
            <strong style={{ fontSize: '1.05rem', color: '#166534' }}>{fmtTime(Math.round(perUnitSec))}</strong>
          </div>
          <div style={{ background: '#fff', borderRadius: 8, border: '2px solid #38bdf8', padding: '10px 12px' }}>
            <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: 2 }}>📦 รวมทั้งล็อต (ประมาณ)</div>
            <strong style={{ fontSize: '1.15rem', color: '#0284c7' }}>{qtyN > 0 ? fmtTime(Math.round(lotSec)) : '— ใส่ Qty —'}</strong>
          </div>
        </div>
        <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: 12, lineHeight: 1.6, background: '#fff', border: '1px solid #e0f2fe', borderRadius: 6, padding: '9px 12px' }}>
          📦 <strong>รวมทั้งล็อต</strong> = <strong style={{ color: '#155e75' }}>{fmtTime(Math.round(setupSec))}</strong> <span style={{ color: '#64748b' }}>(เวลาครั้งเดียว)</span>
          {' '}<strong>+</strong> <strong style={{ color: '#166534' }}>{fmtTime(Math.round(perUnitSec))}</strong><span style={{ color: '#64748b' }}>/ชิ้น</span> <strong>×</strong> {qtyN > 0 ? `${qtyN.toLocaleString()} ชิ้น` : '— ใส่ Qty —'} <span style={{ color: '#64748b' }}>(÷ เครื่องที่ทำขนานในแต่ละขั้น)</span>
          {qtyN > 0 && <> {' '}<strong>≈</strong> <strong style={{ color: '#0284c7' }}>{fmtTime(Math.round(lotSec))}</strong></>}
          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 5 }}>เป็น<strong>ค่าประมาณการ</strong>สำหรับวางแผน — เวลาจริงขึ้นกับคิว/เครื่องว่าง/การพัก ต้องวัดหน้างาน</div>
        </div>
      </div>

      {/* บันทึกผลเดินสายผลิต */}
      {!isViewer && (
        <div style={{ padding: 15, background: 'var(--bg-panel)', borderRadius: 6, border: '1px solid var(--border-color)' }}>
          <div style={{ fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>📝 บันทึกผลเดินสายผลิต (Serial จริง)</div>
          {checkpoints.length === 0 ? (
            <div style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: 10 }}>ยังไม่มีขั้น SMT — ผลรวมจะเป็น PASS โดยอัตโนมัติ</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {checkpoints.map(s => {
                const failed = runFail.has(s.id);
                const i = steps.findIndex(x => x.id === s.id);
                return (
                  <button key={s.id} type="button" onClick={() => toggleRun(s.id)}
                    title="กดสลับ ผ่าน/ไม่ผ่าน ของขั้นนี้"
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
            <button type="button" className="btn" onClick={record} disabled={!serial.trim() || recordResult.isPending}
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
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 16 }}>Customer: <strong>{customer || '—'}</strong> · Model: <strong>{model || '—'}</strong> · <span style={{ color: '#d97706' }}>เหลือง</span> = ขั้น SMT (fail → วนไป rework)</p>
          <div style={{ display: 'flex', justifyContent: 'center', overflowX: 'auto', padding: '8px 0' }} dangerouslySetInnerHTML={{ __html: flowSvg }} />
          <details style={{ marginTop: 24 }}>
            <summary style={{ cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-muted)' }}>Mermaid</summary>
            <pre style={{ background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: 8, padding: 12, fontSize: '0.8rem', overflowX: 'auto', marginTop: 8 }}>{toMermaid(steps)}</pre>
          </details>
        </div>
      )}

      {/* ตารางผล */}
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
                <tr><td colSpan={isViewer ? 7 : 8} style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>ยังไม่มีผลที่บันทึก — กรอก Serial + เวลา แล้วกด “บันทึกผล”</td></tr>
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
