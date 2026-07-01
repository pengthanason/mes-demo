import { useState, useEffect, useRef } from 'react';
import {
  useWorkflows, useWorkflowCreate, useWorkflowDelete,
  useWorkflowResults, useWorkflowResultCreate, useWorkflowResultDelete,
  type Workflow,
} from '../lib/workflowApi';
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
const INCOMING_LABEL = 'Check material (incoming)';
// สถานีหลักหัว-ท้ายสายผลิต — เผื่อเผลอลบทิ้ง จะได้เลือกใส่กลับจากดรอปดาวน์ แล้วลากเข้าตำแหน่งเอง
const MAIN_OPTS = [INCOMING_LABEL, 'PACKING', 'STORE'];
// เครื่อง/สถานีเริ่มต้น (ดรอปดาวในแต่ละ process — ผู้ใช้เพิ่ม/ลบเองได้ เก็บใน localStorage)
const MACHINE_DEFAULT = ['SMT Line', 'FCT Tester', 'Setup Station'];

type Step = {
  id: string; process: string; seconds: number | '';
  role: Role;
  kind: StepKind; timeScope: TimeScope;   // มาจาก role (เก็บไว้ให้ flowchart/คำนวณใช้)
  failAction: FailAction; backToId: string; maxRetry: number;
  stations: number;                        // จำนวนเครื่องขนาน (ต่อ process)
  machine: string;                         // ชื่อเครื่อง/สถานี (เลือกจากดรอปดาวในแถว)
};

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `s_${Date.now()}_${Math.round(performance.now())}`);

const makeStep = (role: Role, process: string): Step => {
  const c = ROLE_CFG[role];
  return {
    id: uid(), process, seconds: '', role,
    kind: c.kind, timeScope: c.timeScope,
    failAction: 'rework', backToId: '', maxRetry: 0,
    stations: 1, machine: '',
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
  const [q, setQ] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const showSearch = workflows.length > 10;   // preset เยอะ → มีช่องค้นหา
  const needle = q.trim().toLowerCase();
  const shown = needle ? workflows.filter(w => `${w.name} ${w.customer} ${w.model}`.toLowerCase().includes(needle)) : workflows;
  useEffect(() => { if (open && showSearch) requestAnimationFrame(() => searchRef.current?.focus()); }, [open, showSearch]);
  return (
    <div style={{ position: 'relative', flexGrow: 1, minWidth: 0 }}>
      <div onClick={() => { if (!open) setQ(''); setOpen(o => !o); }}
        style={{ padding: '8px 10px', border: '1px solid #ccc', borderRadius: 4, background: '#f8fafc', color: '#64748b', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>📂 โหลด Preset ที่บันทึกไว้...</span>
        <span style={{ fontSize: 10 }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: '#fff', border: '1px solid #ccc', borderRadius: 4, boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: 300, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {showSearch && (
              <div style={{ padding: 6, borderBottom: '1px solid #e2e8f0' }}>
                <input ref={searchRef} value={q} onChange={e => setQ(e.target.value)} onClick={e => e.stopPropagation()}
                  onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
                  placeholder="🔍 ค้นหา preset..." aria-label="ค้นหา preset"
                  style={{ width: '100%', padding: '6px 8px', border: '1px solid #ccc', borderRadius: 4, fontSize: '0.82rem', fontFamily: 'inherit' }} />
              </div>
            )}
            <div style={{ overflowY: 'auto' }}>
            {workflows.length === 0 && <div style={{ padding: '10px', color: '#94a3b8', fontSize: '0.85rem' }}>ยังไม่มี preset ที่บันทึก</div>}
            {workflows.length > 0 && shown.length === 0 && <div style={{ padding: '10px', color: '#94a3b8', fontSize: '0.85rem' }}>ไม่พบ “{q}”</div>}
            {shown.map(w => (
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
          </div>
        </>
      )}
    </div>
  );
}

// สีตาม role สำหรับ flowchart (stroke + fill อ่อน)
const ROLE_VIS: Record<Role, { stroke: string; fill: string }> = {
  incoming: { stroke: '#0891b2', fill: '#ecfeff' },
  setup:    { stroke: '#7c3aed', fill: '#f5f3ff' },
  smt:      { stroke: '#d97706', fill: '#fffbeb' },
  packing:  { stroke: '#16a34a', fill: '#f0fdf4' },
  store:    { stroke: '#64748b', fill: '#f8fafc' },
};
// ป้าย disposition เมื่อ fail (ใช้ทั้ง flowchart + dropdown)
const FAIL_OPTS: { value: FailAction; label: string }[] = [
  { value: 'rework', label: '🛠️ Rework (วนกลับซ่อม)' },
  { value: 'back',   label: '↩️ ย้อนกลับขั้น...' },
  { value: 'scrap',  label: '❌ Scrap (NG ออก)' },
  { value: 'hold',   label: '⏸️ Hold / MRB' },
];

/* ── mermaid flowchart — สะท้อน disposition ต่อ checkpoint (rework/scrap/hold/back) ── */
function toMermaid(steps: Step[]): string {
  if (!steps.length) return 'flowchart TD\n  START([เริ่ม]) --> DONE([จบ])';
  const L = ['flowchart TD', '  START([▶ เริ่มสายผลิต]):::se'];
  steps.forEach((s, i) => {
    const t = s.seconds !== '' ? `<br/>⏱ ${fmtTime(Number(s.seconds))}` : '';
    L.push(`  S${i}["${i + 1}. ${s.process}${t}"]:::${s.kind === 'checkpoint' ? 'chk' : 'proc'}`);
  });
  steps.forEach((s, i) => { if (s.kind === 'checkpoint') L.push(`  D${i}{"ผ่าน?"}:::dec`); });
  L.push('  DONE([■ เสร็จ]):::se');
  L.push('  START --> S0');
  // spine + ทาง pass
  steps.forEach((s, i) => {
    const next = i < steps.length - 1 ? `S${i + 1}` : 'DONE';
    if (s.kind === 'checkpoint') { L.push(`  S${i} --> D${i}`); L.push(`  D${i} -->|"✓ ใช่"| ${next}`); }
    else L.push(`  S${i} --> ${next}`);
  });
  // ทาง fail (ทุกโอกาส)
  steps.forEach((s, i) => {
    if (s.kind !== 'checkpoint') return;
    const fa = s.failAction || 'rework';
    const tIdx = s.backToId ? steps.findIndex(x => x.id === s.backToId) : -1;
    if (fa === 'back' && tIdx >= 0) {
      L.push(`  D${i} -.->|"✗ ย้อนกลับ"| S${tIdx}`);
    } else if (fa === 'scrap') {
      L.push(`  D${i} -->|"✗ ไม่"| SC${i}["❌ SCRAP (NG)"]:::rw`);
    } else if (fa === 'hold') {
      L.push(`  D${i} -->|"✗ ไม่"| HD${i}["⏸️ HOLD / MRB"]:::hd`);
    } else {
      L.push(`  D${i} -->|"✗ ไม่"| RW${i}["🛠️ REWORK"]:::rw`);
      L.push(`  RW${i} --> F${i}{"แก้ได้?${Number(s.maxRetry) > 0 ? ` ≤${s.maxRetry}×` : ''}"}:::dec`);
      L.push(`  F${i} -.->|"✓ ใช่ ลองใหม่"| S${i}`);
      L.push(`  F${i} -->|"✗ ไม่"| SC${i}["❌ SCRAP (NG)"]:::rw`);
    }
  });
  L.push('  classDef proc fill:#eef2ff,stroke:#6366f1,stroke-width:2px,color:#1e293b;');
  L.push('  classDef chk fill:#fffbeb,stroke:#d97706,stroke-width:2px,color:#1e293b;');
  L.push('  classDef dec fill:#fef9c3,stroke:#d97706,stroke-width:2px,color:#92400e;');
  L.push('  classDef se fill:#dcfce7,stroke:#16a34a,stroke-width:2px,color:#14532d;');
  L.push('  classDef rw fill:#fef2f2,stroke:#dc2626,color:#991b1b;');
  L.push('  classDef hd fill:#fffbeb,stroke:#d97706,color:#92400e;');
  return L.join('\n');
}

/* ── วาด flowchart เป็น SVG เอง — สัญลักษณ์มาตรฐาน: ▭ process · ◇ decision(ผ่าน?) · แสดงทุกทาง fail ──
   checkpoint: [เทส] → ◇ผ่าน? → (✓ ไปต่อ) / (✗ → Rework → ◇แก้ได้? → ✓ วนกลับเทส / ✗ Scrap) */
function buildFlowSvg(steps: Step[]): string {
  const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const BX = 120, BW = 250, GAP = 46;
  const cx = BX + BW / 2, rx = BX + BW;
  const DHW = 50, DHH = 30;                 // ◇ ผ่าน? (บนสไปน์)
  const fx = rx + 46;                        // เริ่มกิ่ง fail (ขวา)
  const RW = 120, RH = 40;                   // กล่อง rework/scrap/hold
  const SDHW = 48, SDHH = 26;                // ◇ แก้ได้?
  const sdcx = fx + RW + 40 + SDHW;          // center ◇ แก้ได้?
  const scx = sdcx + SDHW + 36 + RW / 2;     // center กล่อง scrap (ปลายกิ่ง rework)

  type FNode = { t: 'pill'; label: string } | { t: 'proc'; s: Step; i: number } | { t: 'dec'; s: Step; i: number; procRow: number };
  const nodes: FNode[] = [{ t: 'pill', label: '▶ เริ่มสายผลิต' }];
  steps.forEach((s, i) => {
    nodes.push({ t: 'proc', s, i });
    if (s.kind === 'checkpoint') nodes.push({ t: 'dec', s, i, procRow: nodes.length - 1 });
  });
  nodes.push({ t: 'pill', label: '■ เสร็จ' });

  const hOf = (n: FNode) => n.t === 'pill' ? 36 : n.t === 'dec' ? 2 * DHH : 60;
  const geom: { top: number; mid: number; bottom: number; h: number }[] = [];
  let y = 14;
  nodes.forEach(n => { const h = hOf(n); geom.push({ top: y, mid: y + h / 2, bottom: y + h, h }); y += h + GAP; });
  const totalH = y - GAP + 14;

  // ความกว้าง — ตาม disposition ที่ใช้จริง
  let maxRight = rx + 70;
  steps.forEach(s => {
    if (s.kind !== 'checkpoint') return;
    const fa = s.failAction || 'rework';
    if (fa === 'rework') maxRight = Math.max(maxRight, scx + RW / 2 + 24);
    else if (fa === 'scrap' || fa === 'hold') maxRight = Math.max(maxRight, fx + RW + 24);
    else if (fa === 'back') maxRight = Math.max(maxRight, rx + 100);
  });
  const Wsvg = maxRight;

  const parts: string[] = [];
  const boxN = (bcx: number, bcy: number, w: number, h: number, label: string, stroke: string, fill: string, tc: string, fs = 10.5) => {
    parts.push(`<rect x="${bcx - w / 2}" y="${bcy - h / 2}" width="${w}" height="${h}" rx="7" fill="${fill}" stroke="${stroke}" stroke-width="1.5" filter="url(#sh)"/>`);
    parts.push(`<text x="${bcx}" y="${bcy}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" font-weight="700" fill="${tc}">${esc(label)}</text>`);
  };
  const diamondN = (dcx: number, dcy: number, hw: number, hh: number, label: string, stroke: string, fill: string, tc: string, fs = 11) => {
    parts.push(`<polygon points="${dcx},${dcy - hh} ${dcx + hw},${dcy} ${dcx},${dcy + hh} ${dcx - hw},${dcy}" fill="${fill}" stroke="${stroke}" stroke-width="2" filter="url(#sh)"/>`);
    parts.push(`<text x="${dcx}" y="${dcy}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" font-weight="700" fill="${tc}">${esc(label)}</text>`);
  };
  const redArrow = (x1: number, y1: number, x2: number, y2: number) => parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#dc2626" stroke-width="1.6" marker-end="url(#ahr)"/>`);
  const lbl = (x: number, ty: number, text: string, color: string, anchor: 'start' | 'middle' | 'end' = 'middle') => parts.push(`<text x="${x}" y="${ty}" text-anchor="${anchor}" dominant-baseline="central" font-size="9.5" font-weight="700" fill="${color}">${esc(text)}</text>`);

  // สไปน์ (เส้นลง + ป้าย)
  nodes.forEach((n, k) => {
    if (k >= nodes.length - 1) return;
    const g = geom[k], g2 = geom[k + 1], my = (g.bottom + g2.top) / 2;
    parts.push(`<line x1="${cx}" y1="${g.bottom}" x2="${cx}" y2="${g2.top}" stroke="#94a3b8" stroke-width="2" marker-end="url(#ah)"/>`);
    if (n.t === 'dec') lbl(cx + 12, my, '✓ ผ่าน', '#16a34a', 'start');
    else if (n.t === 'proc' && n.s.seconds !== '') lbl(cx + 12, my, fmtTime(Number(n.s.seconds)), '#64748b', 'start');
  });

  // โหนด
  nodes.forEach((n, k) => {
    const g = geom[k];
    if (n.t === 'pill') {
      parts.push(`<rect x="${cx - 98}" y="${g.top}" width="196" height="${g.h}" rx="${g.h / 2}" fill="#dcfce7" stroke="#16a34a" stroke-width="2" filter="url(#sh)"/>`);
      parts.push(`<text x="${cx}" y="${g.mid}" text-anchor="middle" dominant-baseline="central" font-size="13" font-weight="800" fill="#14532d">${esc(n.label)}</text>`);
      return;
    }
    if (n.t === 'proc') {
      const s = n.s, vis = ROLE_VIS[s.role] ?? ROLE_VIS.smt;
      const tt = s.seconds !== '' ? `⏱ ${fmtTime(Number(s.seconds))}` : '';
      const scope = s.timeScope === 'once' ? 'ครั้งเดียว' : `ทุกชิ้น${Number(s.stations) > 1 ? ` · ×${s.stations} เครื่อง` : ''}`;
      const sub = [tt, scope].filter(Boolean).join('  ·  ');
      parts.push(`<rect x="${BX}" y="${g.top}" width="${BW}" height="${g.h}" rx="12" fill="${vis.fill}" stroke="${vis.stroke}" stroke-width="2" filter="url(#sh)"/>`);
      parts.push(`<rect x="${BX}" y="${g.top}" width="6" height="${g.h}" fill="${vis.stroke}"/>`);
      parts.push(`<text x="${cx}" y="${g.mid - 8}" text-anchor="middle" dominant-baseline="central" font-size="13" font-weight="700" fill="#1e293b">${esc(`${n.i + 1}. ${s.process}`)}</text>`);
      if (sub) parts.push(`<text x="${cx}" y="${g.mid + 11}" text-anchor="middle" dominant-baseline="central" font-size="10.5" fill="#475569">${esc(sub)}</text>`);
      return;
    }
    // ── decision: ◇ ผ่าน? ──
    const s = n.s, dy = g.mid;
    diamondN(cx, dy, DHW, DHH, 'ผ่าน?', '#d97706', '#fffbeb', '#92400e');
    const fa = s.failAction || 'rework';
    const tIdx = s.backToId ? steps.findIndex(x => x.id === s.backToId) : -1;
    if (fa === 'back' && tIdx >= 0 && tIdx < n.i) {
      const tRow = geom[nodes.findIndex(m => m.t === 'proc' && m.i === tIdx)];
      redArrow(cx + DHW, dy, rx + 34, dy);
      parts.push(`<path d="M ${rx + 34} ${dy} C ${rx + 76} ${dy}, ${rx + 76} ${tRow.mid}, ${rx} ${tRow.mid}" fill="none" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="5 3" marker-end="url(#ahr)"/>`);
      lbl(rx + 80, (dy + tRow.mid) / 2, `✗ กลับ #${tIdx + 1}`, '#dc2626', 'start');
      return;
    }
    if (fa === 'scrap' || fa === 'hold') {
      redArrow(cx + DHW, dy, fx, dy);
      lbl((cx + DHW + fx) / 2, dy - 8, '✗ ไม่ผ่าน', '#dc2626');
      if (fa === 'scrap') boxN(fx + RW / 2, dy, RW, RH, '❌ SCRAP (NG)', '#dc2626', '#fee2e2', '#991b1b');
      else boxN(fx + RW / 2, dy, RW, RH, '⏸️ HOLD / MRB', '#d97706', '#fffbeb', '#92400e');
      return;
    }
    // rework (default) — ◇ผ่าน? ✗ → Rework → ◇แก้ได้? → ✗ Scrap / ✓ วนกลับเทส
    redArrow(cx + DHW, dy, fx, dy);
    lbl((cx + DHW + fx) / 2, dy - 8, '✗ ไม่ผ่าน', '#dc2626');
    boxN(fx + RW / 2, dy, RW, RH, '🛠️ REWORK', '#dc2626', '#fee2e2', '#991b1b');
    redArrow(fx + RW, dy, sdcx - SDHW, dy);
    diamondN(sdcx, dy, SDHW, SDHH, 'แก้ได้?', '#d97706', '#fffbeb', '#92400e', 10);
    redArrow(sdcx + SDHW, dy, scx - RW / 2, dy);
    lbl((sdcx + SDHW + scx - RW / 2) / 2, dy - 8, '✗', '#dc2626');
    boxN(scx, dy, RW, RH, '❌ SCRAP (NG)', '#dc2626', '#fee2e2', '#991b1b');
    // ✓ แก้แล้ว → วนกลับกล่องเทส (เส้นเขียวประ)
    const tRow = geom[n.procRow];
    parts.push(`<path d="M ${sdcx} ${dy - SDHH} C ${sdcx} ${tRow.mid - 26}, ${rx + 44} ${tRow.mid}, ${rx} ${tRow.mid}" fill="none" stroke="#16a34a" stroke-width="1.5" stroke-dasharray="5 3" marker-end="url(#ahg)"/>`);
    lbl(sdcx + 8, dy - SDHH - 9, `✓ แก้แล้ว${Number(s.maxRetry) > 0 ? ` (≤${s.maxRetry}×)` : ''}`, '#16a34a', 'start');
  });

  const defs = `<defs>`
    + `<marker id="ah" markerWidth="8" markerHeight="8" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#94a3b8"/></marker>`
    + `<marker id="ahr" markerWidth="8" markerHeight="8" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#dc2626"/></marker>`
    + `<marker id="ahg" markerWidth="8" markerHeight="8" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#16a34a"/></marker>`
    + `<filter id="sh" x="-20%" y="-30%" width="140%" height="160%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#1e293b" flood-opacity="0.12"/></filter>`
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
  const [q, setQ] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const toggle = () => {
    if (disabled) return;
    if (!open) { const r = boxRef.current?.getBoundingClientRect(); if (r) setPos({ top: r.bottom + 2, left: r.left, width: r.width }); setQ(''); }
    setOpen(o => !o);
  };
  const current = groups.flatMap(g => g.items).find(i => i.value === value);
  const totalItems = groups.reduce((n, g) => n + g.items.length, 0);
  const showSearch = totalItems > 10;   // ตัวเลือกเยอะ → มีช่องค้นหาให้พิมพ์กรอง
  const needle = q.trim().toLowerCase();
  const shownGroups = needle
    ? groups.map(g => ({ ...g, items: g.items.filter(it => `${it.label} ${it.value}`.toLowerCase().includes(needle)) })).filter(g => g.items.length)
    : groups;
  useEffect(() => { if (open && showSearch) requestAnimationFrame(() => searchRef.current?.focus()); }, [open, showSearch]);
  return (
    <div style={{ width: '100%', minWidth: 0 }}>
      <div ref={boxRef} onClick={toggle}
        style={{ width: '100%', padding: '8px 28px 8px 10px', borderRadius: 4, border: '1px solid #ccc', fontSize: '0.85rem', fontWeight: 600, backgroundColor: disabled ? '#f1f5f9' : '#fff', color: '#334155', cursor: disabled ? 'default' : 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', backgroundImage: DD_ARROW, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center', backgroundSize: '10px 6px' }}>
        {current ? current.label : (value || '—')}
      </div>
      {open && pos && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, background: '#fff', border: '1px solid #ccc', borderRadius: 4, boxShadow: '0 6px 18px rgba(0,0,0,0.15)', zIndex: 1000, maxHeight: 340, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {showSearch && (
              <div style={{ padding: 6, borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
                <input ref={searchRef} value={q} onChange={e => setQ(e.target.value)} onClick={e => e.stopPropagation()}
                  onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
                  placeholder="🔍 พิมพ์เพื่อค้นหา..." aria-label="ค้นหา"
                  style={{ width: '100%', padding: '6px 8px', border: '1px solid #ccc', borderRadius: 4, fontSize: '0.82rem', fontFamily: 'inherit' }} />
              </div>
            )}
            <div style={{ overflowY: 'auto' }}>
              {shownGroups.length === 0 && <div style={{ padding: '8px 10px', color: '#94a3b8', fontSize: '0.82rem' }}>ไม่พบ “{q}”</div>}
              {shownGroups.map((g, gi) => (
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
          </div>
        </>
      )}
    </div>
  );
}

const GRID = '24px 30px minmax(130px,0.6fr) 200px 88px minmax(180px,0.9fr) 34px';
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

function MachineCell({ step, isViewer, setStep, machineGroups, onAddMachine, onDeleteMachine }: CellProps & {
  machineGroups: DDGroup[]; onAddMachine: () => void; onDeleteMachine: (v: string) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Dropdown value={step.machine} groups={machineGroups} disabled={isViewer}
          onPick={v => setStep(step.id, { machine: v })}
          onAdd={onAddMachine} addLabel="➕ เพิ่มเครื่อง..." onDelete={onDeleteMachine} />
      </div>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', color: '#64748b', whiteSpace: 'nowrap' }} title="จำนวนเครื่องขนาน">
        ×<input type="number" min="1" value={step.stations || 1} disabled={isViewer}
          onChange={e => setStep(step.id, { stations: Math.max(1, Math.floor(Number(e.target.value)) || 1) })} style={{ ...NUMBOX, width: 46 }} /> เครื่อง
      </label>
    </div>
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

  // เครื่อง/สถานี — ลิสต์ในดรอปดาวของแต่ละ process (ผู้ใช้เพิ่ม/ลบเองได้ เก็บใน localStorage)
  const [machines, setMachines] = useState<string[]>(() => {
    try { const c = JSON.parse(localStorage.getItem('mes_machines') || '[]'); if (Array.isArray(c)) return c; } catch { /* noop */ }
    return [];
  });
  useEffect(() => { localStorage.setItem('mes_machines', JSON.stringify(machines)); }, [machines]);
  const machineMain = [...MACHINE_DEFAULT].sort((a, b) => a.localeCompare(b));
  const machineCustomSorted = [...machines].sort((a, b) => a.localeCompare(b));
  const machineGroups: DDGroup[] = [
    { header: 'เครื่อง/สถานี', items: machineMain.map(o => ({ value: o, label: o })) },
    ...(machineCustomSorted.length ? [{ header: 'เพิ่มเอง', items: machineCustomSorted.map(o => ({ value: o, label: o, deletable: true })) }] : []),
  ];

  // เวลามาตรฐาน (ประมาณการ): once = ครั้งเดียว · per_unit = × จำนวน ÷ เครื่อง · SMT คูณจำนวนรอบ (repeat)
  const qtyN = Number(qty) || 0;
  const stationsOf = (s: Step) => Math.max(1, Number(s.stations) || 1);
  const effSec = (s: Step) => Number(s.seconds) || 0;
  const unitSec = (s: Step) => effSec(s);
  const setupSec   = steps.reduce((sum, s) => sum + (s.timeScope === 'once' ? effSec(s) : 0), 0);
  const perUnitSec = steps.reduce((sum, s) => sum + (s.timeScope === 'once' ? 0 : unitSec(s)), 0);
  const lotSec = setupSec + steps.reduce((sum, s) => {
    if (s.timeScope === 'once') return sum;
    return sum + unitSec(s) * qtyN / stationsOf(s);
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
    const timeScope: TimeScope = setupLike ? 'once' : c.timeScope;
    // ขั้นครั้งเดียว = ไม่ผูกเครื่อง/จำนวน (กันค่าเครื่องค้างตอนสลับเป็นครั้งเดียว)
    setStep(id, { process: v, role, timeScope, kind: setupLike ? 'process' : c.kind, ...(timeScope === 'once' ? { machine: '', stations: 1 } : {}) });
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
        failAction: s.kind === 'checkpoint' ? s.failAction : 'rework',
        backToIndex: s.failAction === 'back' && s.backToId ? steps.findIndex(x => x.id === s.backToId) : null,
        maxRetry: Math.max(0, Number(s.maxRetry) || 0),
        stations: s.timeScope === 'once' ? 1 : Math.max(1, Number(s.stations) || 1),
        machine: s.machine || '',
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
        failAction: (['rework', 'back', 'scrap', 'hold'].includes(s.failAction as string) ? s.failAction : 'rework') as FailAction,
        backToId: '', maxRetry: Math.max(0, Number(s.maxRetry) || 0),
        stations: Number(s.stations) > 0 ? Number(s.stations) : 1,
        machine: (s as any).machine || '',
      };
    });
    // แปลง backToIndex (ที่เก็บใน preset) → backToId (id ใหม่หลังโหลด)
    ws.forEach((s, i) => {
      if (s.failAction === 'back' && typeof s.backToIndex === 'number' && loaded[s.backToIndex]) {
        loaded[i].backToId = loaded[s.backToIndex].id;
      }
    });
    setSteps(loaded.length ? loaded : initialSteps());
    setRunFail(new Set());
    const extra = ws.map(s => s.process).filter(p => p && inferRole(p) === 'smt' && !SMT_DEFAULT.includes(p) && !customProcs.includes(p));
    if (extra.length) setCustomProcs(prev => [...new Set([...prev, ...extra])]);
    const machineExtra = ws.map(s => (s as any).machine).filter((m: string) => m && !MACHINE_DEFAULT.includes(m) && !machines.includes(m));
    if (machineExtra.length) setMachines(prev => [...new Set([...prev, ...machineExtra])]);
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

  /* เพิ่ม/ลบ เครื่องในดรอปดาว (ต่อ process) */
  function addMachine(stepId: string) {
    const name = window.prompt('ชื่อเครื่อง/สถานีใหม่:');
    if (name == null) return;
    const t = name.trim();
    if (!t) { showToast('ต้องใส่ชื่อเครื่อง', 'error'); return; }
    if (MACHINE_DEFAULT.includes(t) || machines.includes(t)) showToast('มีเครื่องนี้อยู่แล้ว — เลือกได้เลย', 'info');
    else { setMachines(prev => [...prev, t]); showToast(`เพิ่มเครื่อง "${t}" แล้ว`, 'success'); }
    setStep(stepId, { machine: t });
  }
  function deleteMachine(name: string) {
    if (!confirm(`ลบเครื่อง "${name}" ออกจากลิสต์?`)) return;
    setMachines(prev => prev.filter(n => n !== name));
    setSteps(prev => prev.map(s => s.machine === name ? { ...s, machine: '' } : s));
  }

  /* บันทึกผลรันจริง */
  function record() {
    if (!serial.trim()) { showToast('กรุณากรอก Serial Number', 'error'); return; }
    if (steps.some(s => s.seconds === '' || Number(s.seconds) <= 0)) {
      showToast('กรุณากรอกเวลาให้ครบทุกกระบวนการ', 'error'); return;
    }
    const perStep = steps.map(s => ({ process: s.process, result: (s.kind === 'checkpoint' && runFail.has(s.id)) ? 'FAIL' : 'PASS' }));
    const seqStr = steps.map(s => `${s.process}${s.timeScope === 'per_unit' ? '×N' : ''}${s.kind === 'checkpoint' && runFail.has(s.id) ? '❌' : ''}${s.seconds !== '' ? `(${s.seconds}s)` : ''}`).join(' → ');
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
          <div style={{ minWidth: 800 }}>
            {/* หัวคอลัมน์ */}
            <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 21, alignItems: 'center', padding: '9px 12px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              <span></span>
              <span style={{ textAlign: 'center' }}>#</span>
              <span>กระบวนการ</span>
              <span style={{ textAlign: 'center' }}>เวลา/หน่วย</span>
              <span style={{ textAlign: 'center' }}>ต่อชิ้น?</span>
              <span>เครื่อง / จำนวน</span>
              <span></span>
            </div>

            {steps.map((step, index) => {
              const cfg = ROLE_CFG[step.role];
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
                <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 21, alignItems: 'center', padding: '8px 12px' }}>
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
                  {/* ต่อชิ้น? — ติ๊ก = ทำทุกชิ้น (เวลา × จำนวนในล็อต) · ไม่ติ๊ก = ทำครั้งเดียวต่อล็อต */}
                  <div style={{ textAlign: 'center' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', color: '#64748b', cursor: isViewer ? 'default' : 'pointer' }} title="ติ๊ก = ทำทุกชิ้น (เวลา × จำนวนในล็อต) · ไม่ติ๊ก = ทำครั้งเดียวต่อล็อต เช่น Check material">
                      <input type="checkbox" checked={!isOnce} disabled={isViewer}
                        onChange={e => setStep(step.id, e.target.checked ? { timeScope: 'per_unit' } : { timeScope: 'once', machine: '', stations: 1 })}
                        style={{ width: 16, height: 16 }} />
                      ทุกชิ้น
                    </label>
                  </div>
                  {/* เครื่อง (per_unit เท่านั้น) */}
                  <div>
                    {isOnce ? <span style={{ color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 600 }}>×1</span> : <MachineCell step={step} isViewer={isViewer} setStep={setStep} machineGroups={machineGroups} onAddMachine={() => addMachine(step.id)} onDeleteMachine={deleteMachine} />}
                  </div>
                  {/* ลบ (SMT เท่านั้น) */}
                  <div style={{ textAlign: 'center' }}>
                    {!isViewer && (
                      <button type="button" onClick={() => removeStep(step.id)} title="ลบขั้นตอนนี้"
                        style={{ border: 'none', background: 'transparent', color: '#e11d48', cursor: 'pointer', fontSize: 16, fontWeight: 700, lineHeight: 1 }}>✕</button>
                    )}
                  </div>
                </div>
                {/* fail disposition — เฉพาะขั้นตรวจ (checkpoint) · default = Rework */}
                {step.kind === 'checkpoint' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '0 12px 9px 46px', fontSize: '0.78rem', color: '#b45309' }}>
                    <span style={{ fontWeight: 600 }}>⚠️ ถ้าไม่ผ่าน →</span>
                    <select value={step.failAction} disabled={isViewer} title="เลือกว่าถ้าขั้นนี้ไม่ผ่านจะทำอย่างไร"
                      onChange={e => setStep(step.id, { failAction: e.target.value as FailAction, ...(e.target.value !== 'back' ? { backToId: '' } : {}) })}
                      style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #fcd34d', background: '#fff', fontSize: '0.78rem', color: '#334155', fontWeight: 600 }}>
                      {FAIL_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {step.failAction === 'back' && (
                      <select value={step.backToId} disabled={isViewer} title="เลือกขั้นปลายทางที่จะย้อนกลับไปเมื่อไม่ผ่าน"
                        onChange={e => setStep(step.id, { backToId: e.target.value })}
                        style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #fcd34d', background: '#fff', fontSize: '0.78rem', color: '#334155' }}>
                        <option value="">— เลือกขั้นปลายทาง —</option>
                        {steps.slice(0, index).map((x, xi) => <option key={x.id} value={x.id}>#{xi + 1} {x.process}</option>)}
                      </select>
                    )}
                    {step.failAction !== 'scrap' && step.failAction !== 'hold' && (
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#64748b' }} title="ทำซ้ำได้กี่ครั้งก่อน escalate (0 = ไม่จำกัด)">
                        ซ้ำได้ <input type="number" min="0" value={step.maxRetry || 0} disabled={isViewer}
                          onChange={e => setStep(step.id, { maxRetry: Math.max(0, Math.floor(Number(e.target.value)) || 0) })}
                          style={{ width: 42, padding: '3px 4px', borderRadius: 4, border: '1px solid #cbd5e1', textAlign: 'center', fontSize: '0.78rem' }} /> ครั้ง
                      </label>
                    )}
                  </div>
                )}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <span>Customer: <strong>{customer || '—'}</strong> · Model: <strong>{model || '—'}</strong></span>
            <span style={{ width: 1, height: 14, background: '#e2e8f0' }} />
            {([['รับของ', '#0891b2'], ['ตั้งเครื่อง', '#7c3aed'], ['SMT/ตรวจ', '#d97706'], ['แพ็ก', '#16a34a'], ['คลัง', '#64748b']] as const).map(([l, c]) => (
              <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 11, height: 11, borderRadius: 3, background: c, display: 'inline-block' }} />{l}
              </span>
            ))}
            <span style={{ width: 1, height: 14, background: '#e2e8f0' }} />
            <span style={{ color: '#16a34a', fontWeight: 600 }}>→ ✓ ผ่าน</span>
            <span style={{ color: '#dc2626', fontWeight: 600 }}>→ ✗ ไม่ผ่าน (rework / scrap / hold / ย้อนกลับ)</span>
          </div>
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
