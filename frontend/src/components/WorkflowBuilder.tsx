import { useState, useEffect, useRef } from 'react';
import {
  useWorkflows, useWorkflowCreate, useWorkflowDelete,
  useWorkflowResults, useWorkflowResultCreate, useWorkflowResultDelete,
  type Workflow,
} from '../lib/workflowApi';
import { useIsViewer } from '../lib/useMockStore';
import { showToast } from '../lib/toast';
import { confirmDialog } from '../lib/confirm';
import { Paginator } from './Paginator';

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
// สถานีของแท็บ Internal (สายผลิตในโรงงาน) — SET UP แยกไปกลุ่มของตัวเอง (SETUP_OPTS)
const SMT_DEFAULT = ['BBAS', 'WAV', 'TEST', 'SOLDERING', 'SMT', 'FQC', 'IPQC', 'INSERT', 'ICT TEST', 'FCT TEST', 'REWORK'];
// สถานีสาย SMT/PCBA — ใส่ไว้ในกลุ่ม "Custom process" ให้ตั้งต้น (เลือก/ลบเองได้)
const DEFAULT_CUSTOM = [
  'SOLDER PASTE PRINT', 'SPI (Solder Paste Inspection)', 'SMT PICK & PLACE', 'REFLOW OVEN',
  'AOI (Optical Inspection)', 'THT INSERTION', 'WAVE SOLDERING',
];
// สถานีของแท็บ External — แยกตามบริษัท/ประเภท (Plastic ฉีด/เป่า + EMS) · แต่ละประเภทมีสถานีของตัวเอง
type ExtKey = 'ext_inj' | 'ext_blow' | 'ext_ems';
const EXT_GROUPS: Record<ExtKey, { header: string; items: string[] }> = {
  ext_inj:  { header: '🧴 Plastic · ฉีด (Injection)', items: [
    'Preparation', 'Feeding', 'Heating & Melting', 'Injection', 'Molding & Cooling', 'Demolding & Ejection', 'Finished Product',
  ] },
  ext_blow: { header: '💨 Plastic · เป่า (Blow)', items: [
    'Feeding & Melting', 'Parison Formation', 'Mold Clamping', 'Blowing', 'Cooling', 'Ejection & Trimming',
  ] },
  ext_ems:  { header: '🔌 EMS · Electronics', items: [
    'Solder Paste Printing', 'Component Placement', 'Reflow Soldering', 'AOI', 'Testing', 'Assembly & Packing',
  ] },
};
const EXTERNAL_PROC = Object.values(EXT_GROUPS).flatMap(g => g.items);
// ชื่อที่ถือเป็นงาน setup (ครั้งเดียว ไม่คูณจำนวน)
const isSetupName = (p: string) => /SET\s*UP/i.test(p || '');
const SETUP_OPTS = ['SET UP LINE', 'SET UP MACHINE'];
const INCOMING_LABEL = 'Check material (incoming)';
// สถานีหลักหัว-ท้ายสายผลิต — เผื่อเผลอลบทิ้ง จะได้เลือกใส่กลับจากดรอปดาวน์ แล้วลากเข้าตำแหน่งเอง
const MAIN_OPTS = [INCOMING_LABEL, 'PACKING', 'STORE'];
// เครื่อง/สถานีเริ่มต้น (ดรอปดาวในแต่ละ process — ผู้ใช้เพิ่ม/ลบเองได้ เก็บใน localStorage)
const MACHINE_DEFAULT = ['SMT Line', 'FCT Tester', 'Setup Station'];
// สถานีมาตรฐาน (built-in) ทุกกลุ่ม — ใช้เช็คว่า process ไหนเป็นของจริง (ไม่ต้องเก็บเป็น custom)
const BUILTIN_PROCS = new Set([...SMT_DEFAULT, ...EXTERNAL_PROC, ...MAIN_OPTS, ...SETUP_OPTS].map(x => x.trim().toLowerCase()));
const isBuiltinProc = (p: string) => BUILTIN_PROCS.has((p || '').trim().toLowerCase());

// ── กระบวนการมาตรฐานตามฟอร์ม PROCESS FLOW CHART (FM 05) — ครอบคลุมทุกขั้นในเอกสาร RSU / JUMBO ──
// qc = ขั้นตรวจ (จุดตัดสิน ผ่าน/ไม่ผ่าน = ◇) · once = ทำครั้งเดียวต่อล็อต · role = หมวด (สี/เวลา)
type FormProc = { n: string; qc?: boolean; once?: boolean; role: Role; sec?: number };   // sec = เวลาตัวอย่าง (วินาที) ใช้ตอนโหลดตัวอย่างฟอร์ม
const FORM_PROCS: FormProc[] = [
  { n: 'Warehouse Receives Material',       once: true, role: 'incoming', sec: 300 },   // คลังรับวัตถุดิบ + นับจำนวน
  { n: 'QA Inspects Material',              qc: true, once: true, role: 'incoming', sec: 600 },
  { n: 'Warehouse Stores Material',         once: true, role: 'store', sec: 180 },       // เลือกที่จัดเก็บวัตถุดิบ
  { n: 'Issue Material to Production',       once: true, role: 'incoming', sec: 120 },    // เบิกเข้าสายผลิต
  { n: 'Production Receives Material',       once: true, role: 'incoming', sec: 120 },
  { n: 'QC Inspects Material (Production)',  qc: true, once: true, role: 'incoming', sec: 300 },
  { n: 'Production Stores Material',         once: true, role: 'store', sec: 120 },
  { n: 'Screen Printing',                   role: 'smt', sec: 15 },            // พิมพ์สกรีน/ครีมตะกั่ว
  { n: 'SMT Pick & Place',                  role: 'smt', sec: 30 },
  { n: 'Reflow Soldering',                  role: 'smt', sec: 45 },            // หลอมตะกั่ว
  { n: 'Inspect After Reflow',              qc: true, role: 'smt', sec: 20 },
  { n: 'THT Soldering',                     role: 'smt', sec: 40 },            // บัดกรีอุปกรณ์มีขา
  { n: 'Inspect & Clean',                   qc: true, role: 'smt', sec: 25 },
  { n: 'Label & Sort Boards',               role: 'smt', sec: 15 },            // ติดฉลากบอร์ด + แยกวงจร
  { n: 'Program Memory',                    role: 'smt', sec: 30 },            // ลงโปรแกรมหน่วยความจำ
  { n: 'Program ART-Pi Board',              role: 'smt', sec: 35 },
  { n: 'Assembly',                          role: 'packing', sec: 60 },        // ประกอบชิ้นงาน
  { n: 'Label Units',                       role: 'packing', sec: 10 },
  { n: 'Function Test',                     qc: true, role: 'packing', sec: 40 },   // ตรวจ + ทดสอบการทำงาน
  { n: 'Packing',                           role: 'packing', sec: 20 },        // บรรจุลงกล่อง
  { n: 'Label Boxes',                       role: 'packing', sec: 10 },
  { n: 'Final Inspection',                  qc: true, role: 'packing', sec: 30 },   // ตรวจก่อนส่งมอบ
  { n: 'QA Receives Finished Goods',        once: true, role: 'store', sec: 240 },   // รับงานสำเร็จรูป
  { n: 'QA Inspects Finished Goods',        qc: true, once: true, role: 'store', sec: 300 },
  { n: 'Warehouse Stores Finished Goods',   once: true, role: 'store', sec: 180 },
  { n: 'Issue & Ship Finished Goods',       once: true, role: 'store', sec: 300 },   // เบิกสำเร็จรูป + จัดส่งลูกค้า
];
const FORM_PROC_MAP: Record<string, FormProc> = Object.fromEntries(FORM_PROCS.map(f => [f.n, f]));

type Step = {
  id: string; process: string; seconds: number | '';
  role: Role;
  kind: StepKind; timeScope: TimeScope;   // มาจาก role (เก็บไว้ให้ flowchart/คำนวณใช้)
  failAction: FailAction; backToId: string; maxRetry: number; holdMin: number;   // holdMin = เวลาพัก (นาที) เมื่อ fail=hold
  stations: number;                        // จำนวนเครื่องขนาน (ต่อ process)
  machine: string;                         // ชื่อเครื่อง/สถานี (เลือกจากดรอปดาวในแถว)
};

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `s_${Date.now()}_${Math.round(performance.now())}`);

const makeStep = (role: Role, process: string): Step => {
  const c = ROLE_CFG[role];
  return {
    id: uid(), process, seconds: '', role,
    kind: c.kind, timeScope: c.timeScope,
    failAction: 'rework', backToId: '', maxRetry: 0, holdMin: 0,
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

const fmtDateTime = (s: string) => { try { return new Date(s).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }); } catch { return s; } };

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
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: '#fff', border: '1px solid #ccc', borderRadius: 4, boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: 390, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
                  <button onClick={async (e) => { e.preventDefault(); e.stopPropagation(); if (await confirmDialog('ลบ preset นี้?')) onDelete(w.id); }}
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

/* ── "AI" จัดหมวดอัตโนมัติ — อ่านชื่อกระบวนการแล้วแยก section เหมือนในฟอร์ม FM 05 ──
   ขั้นตรวจ/ซ่อม (ไม่มีคีย์เวิร์ดหมวด) จะสืบหมวดจากขั้นก่อนหน้า เพื่อให้อยู่กลุ่มเดียวกัน */
const CAT_RULES: { label: string; re: RegExp }[] = [
  { label: 'Receiving / Warehouse',     re: /รับวัตถุดิบ|วัตถุดิบ|คลังสินค้า|เบิกวัตถุดิบ|incoming|material|\bwh\b/i },
  { label: 'SMT (Surface Mount)',       re: /สกรีน|วางอุปกรณ์|หลอมตะกั่ว|reflow|solder ?paste|pick|แผ่นวงจร|แผงวงจร|\bspi\b|\bsmt\b|screen|print/i },
  { label: 'Soldering & Programming',   re: /บัดกรี|ลงโปรแกรม|โปรแกรม|art-?pi|หมายเลขบอร์ด|แยกแย|\btht\b|wave|หน่วยความจำ|program|board|flash|memory/i },
  { label: 'Assembly / Packing',        re: /ประกอบ|บรรจุ|กล่อง|assembl|pack|\bbox\b/i },
  { label: 'Finished Goods / Shipping', re: /สำเร็จรูป|จัดส่ง|เบิกงาน|\bstore\b|ship|\bfg\b|finished/i },
];
function categorize(steps: { process: string }[]): string[] {
  const out: string[] = [];
  let last = '';
  steps.forEach(s => {
    const hit = CAT_RULES.find(r => r.re.test(s.process || ''));
    const c = hit ? hit.label : (last || 'Production');   // ไม่มีคีย์เวิร์ด → สืบหมวดจากขั้นก่อน
    out.push(c);
    last = c;
  });
  return out;
}

// จัดกลุ่ม process มาตรฐานตามหมวดเดียวกับ flowchart (categorize) — ใช้เป็นหัวข้อในดรอปดาวน์เลือกกระบวนการ
const FORM_GROUPS: { header: string; items: FormProc[] }[] = (() => {
  const catList = categorize(FORM_PROCS.map(f => ({ process: f.n })));
  const order: string[] = [];
  const map: Record<string, FormProc[]> = {};
  FORM_PROCS.forEach((f, i) => {
    const c = catList[i];
    if (!map[c]) { map[c] = []; order.push(c); }
    map[c].push(f);
  });
  return order.map(c => ({ header: c, items: map[c] }));
})();

/* ── วาด flowchart ขาว-ดำ สไตล์ฟอร์ม FM 05 (รองรับหลายคอลัมน์) ──
   • กล่องเลขเล็ก (◻ process · ◇ decision) เรียงลง + คำอธิบายด้านขวา
   • ขั้นตรวจ = ◇ มีทางแยก "ใช่" (ผ่าน ↓) / "ไม่" (✗ → ซ่อม-ตรวจซ้ำ หรือ ย้อนขั้นก่อน)
   • ยาวมาก → ไม่ย่อจิ๋ว แต่ขึ้นคอลัมน์ใหม่ทางขวา (ตัดระหว่างช่องเท่านั้น) · ขึ้นคอลัมน์กลางหมวด = ทำหัวข้อหมวดซ้ำบนสุด "(ต่อ)"
   • หัวข้อคั่น = หมวดที่ AI จัดให้ (categorize) */
function buildFlowSvg(steps: Step[]): string {
  const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (!steps.length) return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="60" font-family="'Segoe UI',Tahoma,sans-serif"><text x="120" y="34" text-anchor="middle" font-size="13" fill="#64748b">ยังไม่มีขั้นตอน</text></svg>`;

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
      cols[ci].unshift({ t: 'head', label: `${cats[first.i]} (ต่อ)`, h: HEAD_H, top: 0, mid: 0, bottom: 0 });
    }
  }
  // ท้ายคอลัมน์ (ที่ไม่ใช่อันสุดท้าย) → แถบบอกว่าไหลต่อไปหมวดไหนในคอลัมน์ถัดไป (กันงงว่าขั้นสุดท้ายไปไหน)
  for (let ci = 0; ci < cols.length - 1; ci++) {
    const nf = cols[ci + 1][0];
    const label = nf && nf.t === 'head' ? nf.label.replace(' (ต่อ)', '') : '';
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
      if (a.t === 'step' && a.dec) parts.push(`<text x="${colNX + 7}" y="${(a.bottom + b.top) / 2}" font-size="9.5" fill="#111" dominant-baseline="central">ผ่าน</text>`);
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
        cap(firstPerUnit >= 0 ? `ทิ้ง → เริ่ม #${stepNum[firstPerUnit]}` : 'Scrap (ตัดจบ)');
        if (firstPerUnit >= 0) gotoStep(firstPerUnit);   // ทิ้งชิ้นนี้ → ลากไปต้นสายผลิต
      } else if (fa === 'back') {
        cap(tIdx >= 0 ? `ย้อนกลับ #${stepNum[tIdx]}` : 'ย้อนกลับ');
        gotoStep(tIdx);
      } else if (fa === 'hold') {
        cap(Number(s.holdMin) > 0 ? `พัก ${s.holdMin} นาที` : 'Hold'); loopBack();   // พักแล้ววนทำเดิมต่อ (วนใกล้ๆ)
      } else {
        cap('รีเวิค'); loopBack();                                                     // รีเวิคแล้วตรวจซ้ำ (วนใกล้ๆ)
      }
    });
  });

  return `<svg viewBox="0 0 ${WSVG} ${totalH}" width="${WSVG}" height="${totalH}" xmlns="http://www.w3.org/2000/svg" font-family="'Segoe UI',Tahoma,sans-serif">${parts.join('')}</svg>`;
}

/* ── Gantt chart (SVG) — สไตล์คลาสสิก · แถว = สถานี(task) · 1 แท่ง/สถานี (ชิ้นแรกเข้า → ชิ้นสุดท้ายออก) ──
   หัวตารางเวลา 2 ชั้น (ช่วงใหญ่ = น้ำเงิน / ช่องย่อย = เทา) + เส้น grid
   ตารางเวลา flow-shop: ชิ้น p ออกสถานี i เมื่อ C[p][i] = max(ออกจากสถานีก่อนหน้า, เครื่องว่าง) + เวลา
   ยุบเป็นแท่งเดียว: start_i = เวลาที่ชิ้นแรกเข้าสถานี i, end_i = เวลาที่ชิ้นสุดท้ายออกสถานี i */
function buildGanttSvg(steps: Step[], qty: number): string {
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

  const axisMax = rows.reduce((mx, r) => Math.max(mx, r.end), 0);

  // ── layout ──
  const LX = 176, TITLE_H = 34, H1 = 26, H2 = 24, ROW_H = 46, BAR_H = 22, PADR = 26;
  const plotTop = TITLE_H + H1 + H2;
  const R = rows.length;
  const plotBot = plotTop + R * ROW_H;

  if (!R || axisMax <= 0) {
    const Wsvg = LX + 720 + PADR;
    return `<svg viewBox="0 0 ${Wsvg} 120" width="${Wsvg}" height="120" xmlns="http://www.w3.org/2000/svg" font-family="'Segoe UI',Tahoma,sans-serif"><text x="${Wsvg / 2}" y="60" text-anchor="middle" font-size="13" fill="#94a3b8">ยังไม่มีขั้นตอนที่มีเวลา — เพิ่มขั้นตอน + ใส่เวลาเพื่อดู Gantt</text></svg>`;
  }

  // ── เลือกหน่วยเวลาช่องย่อยแบบกลมๆ ให้ได้ ~6 ช่อง ──
  const NICE = [1, 2, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 300, 600, 900, 1200, 1800, 2700, 3600, 7200, 10800, 14400, 21600, 43200, 86400, 172800, 432000, 864000];
  let step = NICE[NICE.length - 1];
  for (const s of NICE) { if (axisMax / s <= 6) { step = s; break; } }
  const minorCount = Math.max(1, Math.ceil(axisMax / step));
  const gridMax = minorCount * step;
  const GROUP = 3;                                   // จับช่องย่อย 3 ช่อง = 1 ช่วงใหญ่ (เหมือน Q = 3 เดือน)

  const colW = Math.min(160, Math.max(78, Math.round(760 / minorCount)));
  const W = colW * minorCount;
  const Wsvg = LX + W + PADR;
  const svgH = plotBot + 18;
  const x = (t: number) => LX + (t / gridMax) * W;

  const C_BLUE = '#1e86c7', C_GREY = '#eceff1', C_GRID = '#d6dee6', C_GRIDH = '#e7ecf2', C_ONCE = '#818cf8';
  const parts: string[] = [];

  // title + total
  parts.push(`<text x="0" y="22" font-size="15" font-weight="800" fill="#0f3f5f">📊 Gantt · Timeline การผลิต — ${esc(N.toLocaleString())} ชิ้น</text>`);
  parts.push(`<text x="${Wsvg}" y="22" text-anchor="end" font-size="11" fill="#64748b">รวม ≈ ${esc(fmtTime(Math.round(axisMax)))}</text>`);

  // header: Task Name cell (คร่อม 2 แถว)
  parts.push(`<rect x="0" y="${TITLE_H}" width="${LX}" height="${H1 + H2}" fill="${C_BLUE}"/>`);
  parts.push(`<text x="16" y="${TITLE_H + (H1 + H2) / 2}" dominant-baseline="central" font-size="15" font-weight="700" fill="#fff">Task Name</text>`);

  // header ชั้นบน (ช่วงใหญ่ · น้ำเงิน)
  for (let g = 0; g * GROUP < minorCount; g++) {
    const c0 = g * GROUP, c1 = Math.min(minorCount, (g + 1) * GROUP);
    const gx1 = x(c0 * step), gx2 = x(c1 * step);
    parts.push(`<rect x="${gx1}" y="${TITLE_H}" width="${gx2 - gx1}" height="${H1}" fill="${C_BLUE}"/>`);
    if (g > 0) parts.push(`<line x1="${gx1}" y1="${TITLE_H}" x2="${gx1}" y2="${TITLE_H + H1}" stroke="#ffffff" stroke-opacity="0.5" stroke-width="1"/>`);
    parts.push(`<text x="${gx1 + 8}" y="${TITLE_H + H1 / 2}" dominant-baseline="central" font-size="12.5" font-weight="700" fill="#fff">${esc(`${fmtTime(c0 * step)} – ${fmtTime(c1 * step)}`)}</text>`);
  }
  // header ชั้นล่าง (ช่องย่อย · เทา)
  const y2 = TITLE_H + H1;
  parts.push(`<rect x="${LX}" y="${y2}" width="${W}" height="${H2}" fill="${C_GREY}"/>`);
  for (let k = 0; k < minorCount; k++) {
    const cx1 = x(k * step), cx2 = x((k + 1) * step);
    if (k > 0) parts.push(`<line x1="${cx1}" y1="${y2}" x2="${cx1}" y2="${y2 + H2}" stroke="#cbd5e1" stroke-width="1"/>`);
    parts.push(`<text x="${(cx1 + cx2) / 2}" y="${y2 + H2 / 2}" text-anchor="middle" dominant-baseline="central" font-size="11.5" fill="#37474f">${esc(fmtTime((k + 1) * step))}</text>`);
  }

  // grid แนวตั้ง (ตามช่องย่อย) ทะลุถึงล่าง
  for (let k = 0; k <= minorCount; k++) {
    const gx = x(k * step);
    parts.push(`<line x1="${gx}" y1="${plotTop}" x2="${gx}" y2="${plotBot}" stroke="${C_GRID}" stroke-width="1"/>`);
  }
  // grid แนวนอน (ตามแถว) ทะลุทั้งกว้าง
  for (let r = 0; r <= R; r++) {
    const gy = plotTop + r * ROW_H;
    parts.push(`<line x1="0" y1="${gy}" x2="${LX + W}" y2="${gy}" stroke="${C_GRIDH}" stroke-width="1"/>`);
  }

  // แถว: ชื่อ task + แท่ง
  rows.forEach((r, i) => {
    const ry = plotTop + i * ROW_H, mid = ry + ROW_H / 2;
    parts.push(`<text x="14" y="${mid - 6}" dominant-baseline="central" font-size="14.5" fill="#263238">${esc(r.label)}</text>`);
    parts.push(`<text x="14" y="${mid + 11}" dominant-baseline="central" font-size="9.5" fill="#90a0ac">${esc(r.once ? `ครั้งเดียว · ${fmtTime(r.t)}` : `×${r.m} เครื่อง · ${fmtTime(r.t)}/ชิ้น`)}</text>`);
    const bx = x(r.start), bw = Math.max(3, x(r.end) - x(r.start)), by = mid - BAR_H / 2;
    const fill = r.once ? C_ONCE : 'url(#gg)';
    parts.push(`<rect x="${bx.toFixed(1)}" y="${by}" width="${bw.toFixed(1)}" height="${BAR_H}" rx="4" fill="${fill}"/>`);
    const durTxt = fmtTime(Math.round(r.end - r.start));
    if (bx + bw + 46 < LX + W) parts.push(`<text x="${(bx + bw + 7).toFixed(1)}" y="${mid}" dominant-baseline="central" font-size="10" fill="#64748b">${esc(durTxt)}</text>`);
    else parts.push(`<text x="${(bx + bw - 7).toFixed(1)}" y="${mid}" text-anchor="end" dominant-baseline="central" font-size="10" font-weight="600" fill="#fff">${esc(durTxt)}</text>`);
  });

  // เส้นแบ่ง task/timeline + กรอบนอก
  parts.push(`<line x1="${LX}" y1="${TITLE_H}" x2="${LX}" y2="${plotBot}" stroke="#b4c1cf" stroke-width="1.5"/>`);
  parts.push(`<rect x="0" y="${TITLE_H}" width="${LX + W}" height="${plotBot - TITLE_H}" fill="none" stroke="#b4c1cf" stroke-width="1.5"/>`);

  const defs = `<defs><linearGradient id="gg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4fc3e9"/><stop offset="1" stop-color="#1e86c7"/></linearGradient></defs>`;
  return `<svg viewBox="0 0 ${Wsvg} ${svgH}" width="${Wsvg}" height="${svgH}" xmlns="http://www.w3.org/2000/svg" font-family="'Segoe UI',Tahoma,sans-serif">${defs}${parts.join('')}</svg>`;
}

/* ── flowchart (SVG) → พิมพ์ (Save as PDF) ── */
type ExportMeta = {
  title?: string; customer?: string; model?: string; pn?: string;
  issuedBy?: string; checkedBy?: string; approvedBy?: string;
  revNo?: string; revDate?: string; revDesc?: string;
  filename?: string;   // ชื่อไฟล์ (ใช้เป็น title → default ตอน Save as PDF)
  form?: boolean;   // true = เจนเป็นฟอร์ม PROCESS FLOW CHART (FM 05) · false = เอกสารทั่วไป (เช่น Gantt)
  timeHtml?: string;   // ถ้ามี → เพิ่มหน้า 2 = ตารางรายละเอียดเวลา
};

/* ── หน้า 2 ของ PDF: ตารางรายละเอียดเวลา (แต่ละขั้นใช้เท่าไหร่ + สรุป setup/ต่อชิ้น/คอขวด/รวมทั้งล็อต) ── */
function buildTimeDetailHtml(steps: Step[], qty: number): string {
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
    const mode = once ? 'ครั้งเดียว/ล็อต' : `ทุกชิ้น${stationsOf(s) > 1 ? ` ×${stationsOf(s)} เครื่อง` : ''}`;
    return `<tr><td class="c">${i + 1}</td><td>${esc(s.process)}${s.kind === 'checkpoint' ? ' <span class="chk">(จุดตรวจ)</span>' : ''}</td><td>${esc(mode)}</td><td class="r">${s.seconds !== '' ? esc(fmtTime(effSec(s))) : '-'}</td></tr>`;
  }).join('');
  return `
    <h2 class="t2title">รายละเอียดเวลา (Time Breakdown)</h2>
    <table class="tt">
      <tr><th class="c" style="width:7%">#</th><th>กระบวนการ</th><th style="width:28%">โหมด</th><th class="r" style="width:20%">เวลา/ครั้ง</th></tr>
      ${rows || '<tr><td colspan="4" class="c">— ไม่มีขั้นตอน —</td></tr>'}
    </table>
    <table class="tt sum">
      <tr><th>สรุปเวลา</th><th class="r" style="width:28%">เวลา</th></tr>
      <tr><td>เวลาครั้งเดียว/ล็อต (setup + รับของ + คลัง)</td><td class="r">${esc(fmtTime(Math.round(setupSec)))}</td></tr>
      <tr><td>เวลาต่อ 1 ชิ้นผ่านครบสาย (latency)</td><td class="r">${esc(fmtTime(Math.round(perUnitSec)))}</td></tr>
      <tr><td>คอขวด (สถานีต่อชิ้นช้าสุด ÷ เครื่องขนาน)</td><td class="r">${esc(fmtTime(Math.round(bottleneckSec)))}</td></tr>
      <tr><td>จำนวนที่ผลิต (Qty)</td><td class="r">${qtyN > 0 ? qtyN.toLocaleString() : '-'}</td></tr>
      <tr class="grand"><td>รวมทั้งล็อต (แบบสายพาน)${qtyN > 0 ? ` @ ${qtyN.toLocaleString()} ชิ้น` : ''}</td><td class="r">${esc(fmtTime(Math.round(lotSec)))}</td></tr>
    </table>
    <div class="t2note">สูตร: setup + latency (ชิ้นแรกผ่านครบสาย) + (Qty−1) × คอขวด — คิดแบบสายพาน (ชิ้นถัดไปไม่รอชิ้นก่อนจบทั้งสาย) · เป็นค่าประมาณการ</div>
  `;
}

// เจน/พิมพ์แผนภาพเป็น PDF — โหมด form = ฟอร์ม FM 05 (SYNTECH Process Flow Chart) ตามเอกสารจริง
function exportFlowchartPdf(svg: string, meta: ExportMeta = {}) {
  const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (!svg) { showToast('ยังไม่มีแผนภาพให้พิมพ์ — กด Gen ก่อน', 'error'); return; }
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

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(filename || (form ? 'Process Flow Chart' : title))}</title>
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
  if (!w) { showToast('เบราว์เซอร์บล็อก popup — อนุญาตก่อนพิมพ์', 'error'); return; }
  w.document.write(html); w.document.close();
}

// ── ป็อปอัพก่อน Export PDF — flow: กรอกข้อมูลเอกสาร+ชื่อไฟล์ · gantt: ชื่อไฟล์อย่างเดียว ──
type ExportForm = { filename: string; customer: string; model: string; pn: string; issuedBy: string; checkedBy: string; approvedBy: string; revNo: string; revDesc: string };
function ExportDialog({ mode, initial, onCancel, onConfirm }: { mode: 'flow' | 'gantt'; initial: ExportForm; onCancel: () => void; onConfirm: (f: ExportForm) => void }) {
  const [f, setF] = useState<ExportForm>({ ...initial, filename: `${initial.filename}.pdf` });
  const set = (k: keyof ExportForm, v: string) => setF(p => ({ ...p, [k]: v }));
  const nameRef = useRef<HTMLInputElement>(null);
  // เปิดมา → คลุม(ไฮไลต์)เฉพาะส่วนชื่อ ไม่รวม ".pdf" (เหมือนหน้า Dashboard)
  useEffect(() => {
    const el = nameRef.current; if (!el) return;
    el.focus();
    const dot = el.value.lastIndexOf('.');
    el.setSelectionRange(0, dot > 0 ? dot : el.value.length);
  }, []);
  const confirm = () => {
    let name = f.filename.trim(); if (!name) return;
    if (!name.toLowerCase().endsWith('.pdf')) name = `${name.replace(/\.+$/, '')}.pdf`;   // กันลืมนามสกุล → เติม .pdf ให้
    onConfirm({ ...f, filename: name });
  };
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 'min(100%, 760px)' }}>
        <h2 className="panel__title" style={{ marginBottom: 4 }}>🖨️ Export {mode === 'flow' ? 'Process Flow Chart (PDF)' : 'Gantt (PDF)'}</h2>
        <p className="panel__subtitle" style={{ marginTop: 0 }}>{mode === 'flow' ? 'ตั้งชื่อไฟล์ + กรอกข้อมูลเอกสาร (เว้นว่างได้) แล้วกด Export' : 'ตั้งชื่อไฟล์แล้วกด Export'}</p>
        <div className="stack" style={{ marginTop: '0.9rem', gap: '0.75rem' }}>
          <label className="field"><span>ชื่อไฟล์ (.pdf)</span>
            <input ref={nameRef} value={f.filename} onChange={e => set('filename', e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirm(); } else if (e.key === 'Escape') onCancel(); }} />
          </label>
          {mode === 'flow' && (
            <>
              <div className="filters-grid">
                <label className="field"><span>Customer</span><input value={f.customer} onChange={e => set('customer', e.target.value)} /></label>
                <label className="field"><span>Model</span><input value={f.model} onChange={e => set('model', e.target.value)} /></label>
                <label className="field"><span>P/N</span><input value={f.pn} onChange={e => set('pn', e.target.value)} /></label>
              </div>
              <div className="filters-grid">
                <label className="field"><span>Issued by</span><input value={f.issuedBy} onChange={e => set('issuedBy', e.target.value)} /></label>
                <label className="field"><span>Checked by</span><input value={f.checkedBy} onChange={e => set('checkedBy', e.target.value)} /></label>
                <label className="field"><span>Approved by</span><input value={f.approvedBy} onChange={e => set('approvedBy', e.target.value)} /></label>
              </div>
              <div className="filters-grid">
                <label className="field"><span>Revision</span><input value={f.revNo} onChange={e => set('revNo', e.target.value)} /></label>
                <label className="field" style={{ gridColumn: 'span 2' }}><span>Description</span><input value={f.revDesc} onChange={e => set('revDesc', e.target.value)} /></label>
              </div>
            </>
          )}
        </div>
        <div className="modal-actions" style={{ marginTop: '1.1rem' }}>
          <button type="button" className="btn secondary" onClick={onCancel}>ยกเลิก</button>
          <button type="button" className="btn" onClick={confirm}>🖨️ Export</button>
        </div>
      </div>
    </div>
  );
}


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
  // เปิดอยู่แล้วเลื่อนจอ/รีไซส์ → คำนวณตำแหน่ง panel ใหม่ให้ติดกับช่องเสมอ (ไม่ลอยตามจอ)
  useEffect(() => {
    if (!open) return;
    const reposition = () => { const r = boxRef.current?.getBoundingClientRect(); if (r) setPos({ top: r.bottom + 2, left: r.left, width: r.width }); };
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => { window.removeEventListener('scroll', reposition, true); window.removeEventListener('resize', reposition); };
  }, [open]);
  return (
    <div style={{ width: '100%', minWidth: 0 }}>
      <div ref={boxRef} onClick={toggle}
        style={{ width: '100%', padding: '8px 28px 8px 10px', borderRadius: 4, border: '1px solid #ccc', fontSize: '0.85rem', fontWeight: 600, backgroundColor: disabled ? '#f1f5f9' : '#fff', color: '#334155', cursor: disabled ? 'default' : 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', backgroundImage: DD_ARROW, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center', backgroundSize: '10px 6px' }}>
        {current ? current.label : (value || '—')}
      </div>
      {open && pos && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, background: '#fff', border: '1px solid #ccc', borderRadius: 4, boxShadow: '0 6px 18px rgba(0,0,0,0.15)', zIndex: 1000, maxHeight: 442, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
  // พิมพ์เก็บเป็น string ก่อน → คำนวณ (carry นาที/ชม.) ตอน "ออกจากช่อง" (blur/Enter) ไม่ใช่ normalize ทุกคีย์
  // เช่น พิมพ์ 611 ในช่องวินาที จะได้ครบ 611 แล้วค่อยกลายเป็น 10 นาที 11 วิ (ไม่ใช่ 1 นาที 11 วิ)
  const [h, setH] = useState(hh ? String(hh) : '');
  const [m, setM] = useState(mm ? String(mm) : '');
  const [s, setS] = useState(ss ? String(ss) : '');
  useEffect(() => {   // ค่าจริงเปลี่ยนจากภายนอก (โหลด preset / normalize หลังคำนวณ) → sync ช่องกรอก
    setH(hh ? String(hh) : ''); setM(mm ? String(mm) : ''); setS(ss ? String(ss) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sec]);
  const commit = () => {
    const n = (v: string) => Math.max(0, Math.floor(Number(v)) || 0);
    const total = n(h) * 3600 + n(m) * 60 + n(s);
    setStep(step.id, { seconds: total <= 0 ? '' : total });
  };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); };
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center', justifyContent: 'center' }} title="ชั่วโมง : นาที : วินาที — พิมพ์ให้เสร็จแล้วระบบจะคำนวณ/ทดหน่วยให้เอง">
      <input type="number" min="0" placeholder="ชั่วโมง" disabled={isViewer} value={h} onChange={e => setH(e.target.value)} onBlur={commit} onKeyDown={onKey} style={TBOX} />
      <span style={{ color: '#94a3b8', fontWeight: 700 }}>:</span>
      <input type="number" min="0" placeholder="นาที" disabled={isViewer} value={m} onChange={e => setM(e.target.value)} onBlur={commit} onKeyDown={onKey} style={TBOX} />
      <span style={{ color: '#94a3b8', fontWeight: 700 }}>:</span>
      <input type="number" min="0" placeholder="วินาที" disabled={isViewer} value={s} onChange={e => setS(e.target.value)} onBlur={commit} onKeyDown={onKey} style={TBOX} />
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
  const [pn, setPn] = useState('');   // P/N (Part Number) — ส่งเข้า field serial ของ API เดิม
  // ข้อมูลหัวเอกสาร Process Flow Chart (FM 05) — ใช้ตอน Export PDF
  const [issuedBy, setIssuedBy] = useState('');
  const [checkedBy, setCheckedBy] = useState('');
  const [approvedBy, setApprovedBy] = useState('');
  const [revNo, setRevNo] = useState('');
  const [revDesc, setRevDesc] = useState('');
  const [exportMode, setExportMode] = useState<'flow' | 'gantt' | null>(null);   // ป็อปอัพ Export PDF
  const [customer, setCustomer] = useState('');
  const [model, setModel] = useState('');
  const [qty, setQty] = useState<number | ''>('');
  // Routing: Internal (ในโรงงาน) / External (บริษัทนอก — Plastic ฉีด/เป่า + EMS แยก routing) / Mix (สร้างร่วมกัน)
  // External เลือก 2 ชั้น: บริษัท (Plastic/EMS) → ถ้า Plastic เลือกโหมด (ฉีด/เป่า) · แต่ละประเภทมี routing ของตัวเอง
  type WfTab = 'internal' | 'external' | 'mix';
  type StepKey = 'internal' | 'mix' | ExtKey;
  const [tab, setTab] = useState<WfTab>('internal');
  const [extMode, setExtMode] = useState<'plastic' | 'ems'>('plastic');   // ชั้น 1 ของ External
  const [extPlastic, setExtPlastic] = useState<'inj' | 'blow'>('inj');    // ชั้น 2 (เฉพาะ Plastic)
  // steps = ชุดของ routing ที่ active อยู่ · setSteps เขียนกลับเฉพาะชุดนั้น → โค้ดคำนวณ/Gantt/Flow เดิมทำงานต่อได้เลย
  const activeKey: StepKey =
    tab === 'internal' ? 'internal'
    : tab === 'mix' ? 'mix'
    : extMode === 'ems' ? 'ext_ems'
    : extPlastic === 'blow' ? 'ext_blow' : 'ext_inj';
  // Internal = สายมาตรฐาน (มี 4 สเตชั่นตั้งต้นให้) · ที่เหลือ = เริ่มว่าง ให้ผู้ใช้สร้างเอง
  const [stepsMap, setStepsMap] = useState<Record<StepKey, Step[]>>(() => ({ internal: initialSteps(), mix: [], ext_inj: [], ext_blow: [], ext_ems: [] }));
  const steps = stepsMap[activeKey];
  const setSteps: React.Dispatch<React.SetStateAction<Step[]>> = (u) =>
    setStepsMap(m => ({ ...m, [activeKey]: typeof u === 'function' ? (u as (p: Step[]) => Step[])(m[activeKey]) : u }));
  const [showFlow, setShowFlow] = useState(false);
  const [showGantt, setShowGantt] = useState(false);
  // กระบวนการ SMT แยก 2 กลุ่ม: default (มาตรฐาน คงที่) + custom (ผู้ใช้เพิ่มเอง ลบได้) — แต่ละกลุ่มเรียง A-Z
  const [customProcs, setCustomProcs] = useState<string[]>(() => {
    let list: string[] = [];
    try { const c = JSON.parse(localStorage.getItem('mes_custom_processes') || '[]'); if (Array.isArray(c)) list = c; } catch { /* noop */ }
    // กู้ custom ที่เคยเพิ่มไว้ใต้ key เก่า (ตอนรวมลิสต์) — เอาเฉพาะที่ไม่ใช่ default
    try {
      const old = JSON.parse(localStorage.getItem('mes_smt_processes_v2') || '[]');
      if (Array.isArray(old)) old.forEach((p: string) => { if (p && !SMT_DEFAULT.includes(p) && !list.includes(p)) list.push(p); });
    } catch { /* noop */ }
    // ใส่สถานีสาย SMT/PCBA เข้ากลุ่ม Custom ให้ตั้งต้นครั้งแรก (หลังจากนั้นผู้ใช้ลบได้ ไม่กลับมา)
    try {
      if (!localStorage.getItem('mes_custom_seeded_v1')) {
        DEFAULT_CUSTOM.forEach(p => { if (!list.includes(p)) list.push(p); });
        localStorage.setItem('mes_custom_seeded_v1', '1');
      }
    } catch { /* noop */ }
    return list.filter(p => !isBuiltinProc(p));   // ตัดตัวที่เป็น station มาตรฐาน (built-in) ออก ไม่ให้ค้างเป็น custom
  });
  useEffect(() => { localStorage.setItem('mes_custom_processes', JSON.stringify(customProcs)); }, [customProcs]);
  // ล้าง key เก่าทิ้งหลังกู้ครั้งเดียว — กันไม่ให้ custom ที่ลบไปแล้ว ถูกดึงกลับมาตอนรีโหลด
  useEffect(() => { localStorage.removeItem('mes_smt_processes_v2'); }, []);
  const smtMain = [...SMT_DEFAULT].sort((a, b) => a.localeCompare(b));            // default เรียง A-Z (บน)
  const smtCustomSorted = [...customProcs].filter(p => !isBuiltinProc(p)).sort((a, b) => a.localeCompare(b));   // custom เรียง A-Z (ล่าง) — ไม่โชว์ตัวที่เป็น built-in แล้ว
  // สถานีที่เลือกได้ในดรอปดาว "Process" ตามแท็บ/ประเภท — แยกหัวข้อกลุ่มให้อ่านเข้าใจง่าย
  const internalGroup: DDGroup = { header: '🏭 In-House Line', items: smtMain.map(o => ({ value: o, label: o })) };
  const extToDD = (k: ExtKey): DDGroup => ({ header: EXT_GROUPS[k].header, items: EXT_GROUPS[k].items.map(o => ({ value: o, label: o })) });
  const procGroups: DDGroup[] =
    tab === 'internal' ? [internalGroup]
    : tab === 'external' ? [extToDD(activeKey as ExtKey)]   // โชว์เฉพาะสถานีของประเภทที่เลือกอยู่
    : [internalGroup, extToDD('ext_inj'), extToDD('ext_blow'), extToDD('ext_ems')];   // mix = รวมทุกหัวข้อ
  const defaultProc = tab === 'external' ? EXT_GROUPS[activeKey as ExtKey].items[0] : (smtMain[0] || 'SMT');   // สถานีเริ่มต้นตอนกด "เพิ่มขั้นตอน"
  // สลับแท็บ/ประเภท → ล้างสถานะผลรัน + ยุบ FlowChart/Gantt (กัน id ข้ามชุดปนกัน)
  const resetView = () => { setShowFlow(false); setShowGantt(false); };
  const subPill = (on: boolean): React.CSSProperties => ({
    padding: '5px 15px', borderRadius: 6, border: `1px solid ${on ? 'var(--brand)' : '#d7dee7'}`, cursor: 'pointer',
    fontSize: '0.8rem', fontWeight: 700, background: on ? 'var(--brand)' : '#fff', color: on ? '#fff' : '#64748b', transition: 'all .12s',
  });
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [grabId, setGrabId] = useState<string | null>(null);

  const create = useWorkflowCreate();
  const del = useWorkflowDelete();
  const { data: saved = [] } = useWorkflows();
  const recordResult = useWorkflowResultCreate();
  const delResult = useWorkflowResultDelete();
  const { data: results = [] } = useWorkflowResults();
  const [resFilter, setResFilter] = useState<'all' | 'internal' | 'external' | 'mix'>('all');   // ฟิลเตอร์ตารางผล
  const [resPage, setResPage] = useState(1);
  const RES_PAGE_SIZE = 10;
  const shownResults = resFilter === 'all' ? results : results.filter(r => r.line === resFilter);
  const resTotalPages = Math.max(1, Math.ceil(shownResults.length / RES_PAGE_SIZE));
  const pagedResults = shownResults.slice((resPage - 1) * RES_PAGE_SIZE, resPage * RES_PAGE_SIZE);
  useEffect(() => { setResPage(1); }, [resFilter]);              // เปลี่ยน filter → กลับหน้า 1
  useEffect(() => { if (resPage > resTotalPages) setResPage(resTotalPages); }, [resPage, resTotalPages]);   // กันหน้าเกินหลังลบ

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
  const perUnitSec = steps.reduce((sum, s) => sum + (s.timeScope === 'once' ? 0 : unitSec(s)), 0);  // latency: 1 ชิ้นผ่านครบสาย
  // เวลารวมทั้งล็อตแบบ "สายพาน" (pipeline/flow-shop) — ชิ้นถัดไปไม่รอชิ้นก่อนจบทั้งสาย
  // = เวลาครั้งเดียว(setup/รับของ/คลัง) + latency ชิ้นแรก + (N−1) × คอขวด (สถานีต่อชิ้นที่ช้าสุด ÷ เครื่องขนาน)
  const perUnitSteps = steps.filter(s => s.timeScope !== 'once');
  const bottleneckSec = perUnitSteps.reduce((m, s) => Math.max(m, effSec(s) / stationsOf(s)), 0);
  const lotSec = qtyN > 0 ? setupSec + perUnitSec + (qtyN - 1) * bottleneckSec : setupSec + perUnitSec;
  const flowSvg = buildFlowSvg(steps);
  const ganttSvg = buildGanttSvg(steps, qtyN);
  const smtCount = steps.filter(s => s.role === 'smt').length;

  const setStep = (id: string, patch: Partial<Step>) => setSteps(s => s.map(x => x.id === id ? { ...x, ...patch } : x));
  // เลือกกระบวนการจากดรอปดาวน์ — ปรับ role/เวลา/ชนิด ตามชื่อที่เลือก (สถานีหลัก/setup/SMT)
  const pickProcess = (id: string, v: string) => {
    // กระบวนการตามฟอร์ม FM 05 → กำหนด role/ชนิด(ตรวจ?)/ครั้งเดียว ตามที่ระบุในตาราง (ไม่เดาจากชื่อ)
    const fm = FORM_PROC_MAP[v];
    if (fm) {
      const cf = ROLE_CFG[fm.role];
      const ts: TimeScope = fm.once ? 'once' : cf.timeScope;
      setStep(id, { process: v, role: fm.role, kind: fm.qc ? 'checkpoint' : 'process', timeScope: ts, ...(ts === 'once' ? { machine: '', stations: 1 } : {}) });
      return;
    }
    const role = inferRole(v);              // Check material→incoming · PACK→packing · STORE→store · ที่เหลือ→smt
    const setupLike = isSetupName(v);       // SET UP * → ครั้งเดียว ไม่มีจุดตรวจ
    const c = ROLE_CFG[role];
    const timeScope: TimeScope = setupLike ? 'once' : c.timeScope;
    // ขั้นครั้งเดียว = ไม่ผูกเครื่อง/จำนวน (กันค่าเครื่องค้างตอนสลับเป็นครั้งเดียว)
    setStep(id, { process: v, role, timeScope, kind: setupLike ? 'process' : c.kind, ...(timeScope === 'once' ? { machine: '', stations: 1 } : {}) });
  };
  // เพิ่มขั้น SMT — แทรกก่อน Packing เสมอ
  const addSmt = () => setSteps(s => {
    const ns = makeStep('smt', defaultProc);
    const i = s.findIndex(x => x.role === 'packing');
    if (i < 0) return [...s, ns];
    const next = [...s]; next.splice(i, 0, ns); return next;
  });
  const removeStep = (id: string) => setSteps(s => s.filter(x => x.id !== id));   // ลบได้ทุกขั้น (รวมหัว-ท้าย)

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

  /* บันทึกผลเดินสายผลิต (P/N จริง) — เก็บลงตารางผล */
  function record() {
    if (!pn.trim()) { showToast('กรุณากรอก P/N', 'error'); return; }
    if (!steps.length || steps.some(s => s.seconds === '' || Number(s.seconds) <= 0)) { showToast('กรุณากรอกเวลาให้ครบทุกกระบวนการ', 'error'); return; }
    const perStep = steps.map(s => ({ process: s.process, result: 'PASS' }));
    const seqStr = steps.map(s => `${s.process}${s.timeScope === 'per_unit' ? '×N' : ''}${s.seconds !== '' ? `(${s.seconds}s)` : ''}`).join(' → ');
    recordResult.mutate(
      { serial: pn.trim(), customer: customer.trim(), model: model.trim(), sequence: seqStr, result: 'PASS', total_sec: Math.round(perUnitSec), line: tab, steps: perStep },
      {
        onSuccess: () => { showToast(`บันทึกผล ${pn.trim()} สำเร็จ`, 'success'); setPn(''); },
        onError: (e: any) => showToast(e.message, 'error'),
      },
    );
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
        backToId: '', maxRetry: Math.max(0, Number(s.maxRetry) || 0), holdMin: Math.max(0, Number((s as any).holdMin) || 0),
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
    const extra = ws.map(s => s.process).filter(p => p && inferRole(p) === 'smt' && !isBuiltinProc(p) && !customProcs.includes(p));
    if (extra.length) setCustomProcs(prev => [...new Set([...prev, ...extra])]);
    const machineExtra = ws.map(s => (s as any).machine).filter((m: string) => m && !MACHINE_DEFAULT.includes(m) && !machines.includes(m));
    if (machineExtra.length) setMachines(prev => [...new Set([...prev, ...machineExtra])]);
    setShowFlow(false);
    showToast(`โหลด Preset "${w.name || w.customer}"`, 'info');
  }

  /* โหลดตัวอย่างฟอร์ม FM 05 (RSU / JUMBO) — เติมครบทั้ง 30 ขั้นตามเอกสาร พร้อมจุดตรวจ/ทางย้อน */
  function loadFm05Sample() {
    setCustomer('JUMBO'); setModel('RSU'); setPn('1E6D25234001');
    const st: Step[] = FORM_PROCS.map(fp => {
      const cf = ROLE_CFG[fp.role];
      return {
        id: uid(), process: fp.n, seconds: (fp.sec ?? '') as number | '', role: fp.role,
        kind: fp.qc ? 'checkpoint' : 'process',
        timeScope: fp.once ? 'once' : cf.timeScope,
        failAction: 'rework' as FailAction, backToId: '', maxRetry: 0, holdMin: 0, stations: 1, machine: '',
      };
    });
    // ทางย้อน (ไม่ผ่าน) ของขั้นตรวจที่ "คืน/ย้อนไปขั้นก่อนหน้า" — อ้าง index ตาม FORM_PROCS
    const backTo = (from: number, to: number) => { if (st[from] && st[to]) { st[from].failAction = 'back'; st[from].backToId = st[to].id; } };
    backTo(1, 0);    // ตรวจวัตถุดิบเข้าคลัง → คืน/รับใหม่
    backTo(5, 4);    // ตรวจวัตถุดิบ (ฝ่ายผลิต) → รับใหม่
    backTo(18, 13);  // ทดสอบการทำงาน → ย้อนตรวจ/ติดฉลากบอร์ด
    backTo(23, 22);  // ตรวจสำเร็จรูป → รับใหม่
    // ที่เหลือ (ตรวจหลัง Reflow / หลังบัดกรี / ก่อนส่งมอบ) = rework (ซ่อมแล้วตรวจซ้ำ)
    setSteps(st); setShowFlow(true);
    showToast('โหลดตัวอย่างฟอร์ม FM 05 (RSU / JUMBO) แล้ว', 'success');
  }

  /* เพิ่ม/ลบ กระบวนการ custom (เฉพาะช่วง SMT) */
  function addCustomProcess(stepId: string) {
    const name = window.prompt('ชื่อกระบวนการ SMT ใหม่:');
    if (name == null) return;
    const t = name.trim();
    if (!t) { showToast('ต้องใส่ชื่อกระบวนการ', 'error'); return; }
    if (isBuiltinProc(t) || customProcs.includes(t)) showToast('มีกระบวนการนี้อยู่แล้ว — เลือกได้เลย', 'info');
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
  async function deleteMachine(name: string) {
    if (!(await confirmDialog(`ลบเครื่อง "${name}" ออกจากลิสต์?`))) return;
    setMachines(prev => prev.filter(n => n !== name));
    setSteps(prev => prev.map(s => s.machine === name ? { ...s, machine: '' } : s));
  }

  /* ลบกระบวนการที่เพิ่มเอง (custom) ออกจากลิสต์ — ขั้นที่ใช้อยู่จะย้ายไปตัวแรก (default) */
  async function deleteCustomProc(name: string) {
    if (!(await confirmDialog(`ลบกระบวนการ "${name}" ออกจากลิสต์?`))) return;
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

      {/* P/N + Customer + Model */}
      <div className="filters-grid" style={{ marginBottom: 15 }}>
        <label className="field"><span>P/N (Part Number)</span>
          <input value={pn} onChange={e => setPn(e.target.value)} placeholder="กรอก P/N..." disabled={isViewer} />
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
        {!isViewer && (
          <button type="button" className="btn secondary" onClick={loadFm05Sample} title="เติมครบทั้ง 30 ขั้นตามฟอร์ม PROCESS FLOW CHART (RSU / JUMBO)">
            📄 ตัวอย่างฟอร์ม FM 05
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

        {/* แท็บ Internal / External / Mix — แต่ละแท็บมี routing แยกกัน · External แยกบริษัทอีก 2 ชั้น */}
        <div style={{ display: 'flex', gap: 4, padding: 4, background: '#eef2f7', borderRadius: 8, marginBottom: 12, width: 'fit-content' }}>
          {([['internal', '🏭 Internal'], ['external', '🚚 External'], ['mix', '🔀 Mix']] as const).map(([k, label]) => {
            const cnt = k === 'internal' ? stepsMap.internal.length : k === 'mix' ? stepsMap.mix.length : (stepsMap.ext_inj.length + stepsMap.ext_blow.length + stepsMap.ext_ems.length);
            return (
              <button key={k} type="button" onClick={() => { if (tab !== k) { setTab(k); resetView(); } }}
                style={{
                  padding: '7px 22px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700,
                  background: tab === k ? '#fff' : 'transparent', color: tab === k ? 'var(--brand)' : '#64748b',
                  boxShadow: tab === k ? '0 1px 3px rgba(0,0,0,0.14)' : 'none', transition: 'all .12s',
                }}>
                {label} <span style={{ fontWeight: 600, color: tab === k ? '#94a3b8' : '#b0bac6' }}>({cnt})</span>
              </button>
            );
          })}
        </div>

        {/* ตัวเลือกบริษัท/ประเภท (เฉพาะแท็บ External) — ชั้น 1: Plastic/EMS · ชั้น 2: ฉีด/เป่า */}
        {tab === 'external' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 700, minWidth: 54 }}>บริษัท</span>
              {([['plastic', '🛢️ Plastic'], ['ems', '🔌 EMS']] as const).map(([k, label]) => (
                <button key={k} type="button" onClick={() => { if (extMode !== k) { setExtMode(k); resetView(); } }} style={subPill(extMode === k)}>{label}</button>
              ))}
            </div>
            {extMode === 'plastic' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 700, minWidth: 54 }}>โหมด</span>
                {([['inj', '🧴 ฉีด (Injection)'], ['blow', '💨 เป่า (Blow)']] as const).map(([k, label]) => (
                  <button key={k} type="button" onClick={() => { if (extPlastic !== k) { setExtPlastic(k); resetView(); } }} style={subPill(extPlastic === k)}>{label}</button>
                ))}
              </div>
            )}
          </div>
        )}


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
                        ...FORM_GROUPS.map(g => ({ header: g.header, items: g.items.map(f => ({ value: f.n, label: (f.qc ? '◇ ' : '') + f.n })) })),
                        ...procGroups,
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
                    {step.failAction === 'hold' && (
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#64748b' }} title="พักกี่นาทีก่อนวนกลับมาทำใหม่">
                        พัก <input type="number" min="0" value={step.holdMin || 0} disabled={isViewer}
                          onChange={e => setStep(step.id, { holdMin: Math.max(0, Math.floor(Number(e.target.value)) || 0) })}
                          style={{ width: 48, padding: '3px 4px', borderRadius: 4, border: '1px solid #cbd5e1', textAlign: 'center', fontSize: '0.78rem' }} /> นาที
                      </label>
                    )}
                  </div>
                )}
              </div>
              );
            })}
            {steps.length === 0 ? (
              <div style={{ padding: '18px 12px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem', background: '#fffdf6' }}>
                ยังไม่มีขั้นตอน — กด “+ เพิ่มขั้นตอน” เพื่อเริ่มสร้าง routing เอง
              </div>
            ) : smtCount === 0 && (
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
            <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: 2 }}>📦 รวมทั้งล็อต (สายพาน)</div>
            <strong style={{ fontSize: '1.15rem', color: '#0284c7' }}>{qtyN > 0 ? fmtTime(Math.round(lotSec)) : '— ใส่ Qty —'}</strong>
          </div>
          <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e0f2fe', padding: '10px 12px' }}>
            <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: 2 }}>⛓️ คอขวด (สถานีช้าสุด/ชิ้น)</div>
            <strong style={{ fontSize: '1.05rem', color: '#b45309' }}>{fmtTime(Math.round(bottleneckSec))}</strong>
          </div>
        </div>
        <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: 12, lineHeight: 1.6, background: '#fff', border: '1px solid #e0f2fe', borderRadius: 6, padding: '9px 12px' }}>
          📦 <strong>รวมทั้งล็อต (แบบสายพาน)</strong> = <strong style={{ color: '#155e75' }}>{fmtTime(Math.round(setupSec))}</strong> <span style={{ color: '#64748b' }}>(ครั้งเดียว)</span>
          {' '}<strong>+</strong> <strong style={{ color: '#166534' }}>{fmtTime(Math.round(perUnitSec))}</strong> <span style={{ color: '#64748b' }}>(ชิ้นแรกผ่านครบสาย)</span>
          {' '}<strong>+</strong> ({qtyN > 0 ? `${qtyN.toLocaleString()}` : 'N'}−1) <strong>×</strong> <strong style={{ color: '#b45309' }}>{fmtTime(Math.round(bottleneckSec))}</strong> <span style={{ color: '#64748b' }}>(คอขวด)</span>
          {qtyN > 0 && <> {' '}<strong>≈</strong> <strong style={{ color: '#0284c7' }}>{fmtTime(Math.round(lotSec))}</strong></>}
          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 5 }}>คิดแบบ<strong>สายพาน</strong>: ชิ้นถัดไปไม่รอชิ้นก่อนจบทั้งสาย เข้าสถานีถัดไปได้เลย จึงทำพร้อมกันได้ (parallel) — หลังสายเต็มแล้ว ผลผลิตออกทุกๆ "คอขวด" · เป็นค่าประมาณการ เวลาจริงขึ้นกับคิว/การพัก</div>
        </div>
      </div>

      {/* Gen FlowChart / Gantt */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" className="btn" onClick={() => setShowFlow(v => !v)} disabled={steps.length === 0}
          style={{ background: '#6366f1', borderColor: '#6366f1', color: '#fff', fontWeight: 600 }}>
          {showFlow ? 'ซ่อน FlowChart' : '🔀 Gen FlowChart'}
        </button>
        <button type="button" className="btn" onClick={() => setShowGantt(v => !v)} disabled={steps.length === 0 || !qtyN}
          title={!qtyN ? 'กรอกจำนวนผลิต (Qty) ก่อน' : ''}
          style={{ background: '#0891b2', borderColor: '#0891b2', color: '#fff', fontWeight: 600 }}>
          {showGantt ? 'ซ่อน Gantt' : '📊 Gen Gantt'}
        </button>
      </div>

      {showFlow && (
        <div style={{ padding: 20, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <h3 className="panel__title panel__title--sm" style={{ margin: 0 }}>FlowChart</h3>
            <button type="button" className="btn secondary" style={{ fontSize: '0.82rem' }} onClick={() => setExportMode('flow')}>🖨️ Export to PDF</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <span>Customer: <strong>{customer || '—'}</strong> · Model: <strong>{model || '—'}</strong> · P/N: <strong>{pn || '—'}</strong></span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', overflowX: 'auto', padding: '8px 0' }} dangerouslySetInnerHTML={{ __html: flowSvg }} />
          <details style={{ marginTop: 24 }}>
            <summary style={{ cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-muted)' }}>Mermaid</summary>
            <pre style={{ background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: 8, padding: 12, fontSize: '0.8rem', overflowX: 'auto', marginTop: 8 }}>{toMermaid(steps)}</pre>
          </details>
        </div>
      )}

      {showGantt && (
        <div style={{ padding: 20, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <h3 className="panel__title panel__title--sm" style={{ margin: 0 }}>Gantt · Timeline การผลิต</h3>
            <button type="button" className="btn secondary" style={{ fontSize: '0.82rem' }} onClick={() => setExportMode('gantt')}>🖨️ Export to PDF</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <span>Customer: <strong>{customer || '—'}</strong> · Model: <strong>{model || '—'}</strong> · Qty: <strong>{qtyN.toLocaleString()}</strong> ชิ้น</span>
            <span style={{ width: 1, height: 14, background: '#e2e8f0' }} />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 16, height: 11, borderRadius: 3, background: '#818cf8', display: 'inline-block' }} /> Set up (ครั้งเดียว)
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 16, height: 11, borderRadius: 3, background: 'linear-gradient(90deg,#4fc3e9,#1e86c7)', display: 'inline-block' }} /> สถานีผลิต
            </span>
            <span style={{ width: 1, height: 14, background: '#e2e8f0' }} />
            <span>แต่ละแถว = 1 สถานี · แท่ง = ตั้งแต่ชิ้นแรกเข้า → ชิ้นสุดท้ายออก (แท่งเหลื่อมกัน = ทำพร้อมกัน)</span>
          </div>
          <div style={{ overflowX: 'auto', padding: '8px 0' }} dangerouslySetInnerHTML={{ __html: ganttSvg }} />
        </div>
      )}

      {/* ตารางผล — รวมทุกสาย มี filter เลือกดูตามสายได้ (ไม่มีคอลัมน์ ผล PASS/FAIL) */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          <h3 className="panel__title panel__title--sm" style={{ margin: 0 }}>📋 ผลการบันทึก {shownResults.length > 0 && `(${shownResults.length})`}</h3>
          {!isViewer && (
            <button type="button" className="btn" onClick={record} disabled={recordResult.isPending || steps.length === 0}
              title="บันทึกเวิร์กโฟลว์ปัจจุบัน (P/N ที่กรอกด้านบน) ลงตารางผล" style={{ background: '#27ae60', borderColor: '#27ae60', color: '#fff', fontWeight: 600, fontSize: '0.82rem' }}>
              {recordResult.isPending ? 'กำลังบันทึก...' : '💾 บันทึกผล (P/N ปัจจุบัน)'}
            </button>
          )}
        </div>
        {/* filter: รวม / Internal / External / Mix */}
        <div style={{ display: 'flex', gap: 4, padding: 4, background: '#eef2f7', borderRadius: 8, marginBottom: 12, width: 'fit-content' }}>
          {([['all', 'รวมทั้งหมด'], ['internal', '🏭 Internal'], ['external', '🚚 External'], ['mix', '🔀 Mix']] as const).map(([k, label]) => {
            const cnt = k === 'all' ? results.length : results.filter(r => r.line === k).length;
            return (
              <button key={k} type="button" onClick={() => setResFilter(k)}
                style={{
                  padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700,
                  background: resFilter === k ? '#fff' : 'transparent', color: resFilter === k ? 'var(--brand)' : '#64748b',
                  boxShadow: resFilter === k ? '0 1px 3px rgba(0,0,0,0.14)' : 'none', transition: 'all .12s',
                }}>
                {label} <span style={{ fontWeight: 600, color: resFilter === k ? '#94a3b8' : '#b0bac6' }}>({cnt})</span>
              </button>
            );
          })}
        </div>
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
          <table className="table" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th>วันที่/เวลา</th><th>P/N</th><th>Customer</th><th>Model</th><th>ลำดับกระบวนการ</th><th>Cycle</th>{!isViewer && <th></th>}
              </tr>
            </thead>
            <tbody>
              {shownResults.length === 0 ? (
                <tr><td colSpan={isViewer ? 6 : 7} style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>{results.length === 0 ? 'ยังไม่มีผลที่บันทึก — กรอก P/N + เวลา แล้วกด “บันทึกผล”' : 'ไม่มีผลในสายที่เลือก — กด “รวมทั้งหมด” เพื่อดูทั้งหมด'}</td></tr>
              ) : pagedResults.map(r => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem', color: '#64748b' }}>{fmtDateTime(r.created_at)}</td>
                  <td style={{ fontWeight: 600 }}>{r.serial}</td>
                  <td>{r.customer || '—'}</td>
                  <td>{r.model || '—'}</td>
                  <td style={{ fontSize: '0.8rem', color: '#475569', minWidth: 260, maxWidth: 360, whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.5 }}>{r.sequence || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtTime(r.total_sec)}</td>
                  {!isViewer && (
                    <td><button className="btn danger" style={{ padding: '4px 10px', fontSize: '0.78rem' }} onClick={async () => { if (await confirmDialog(`ลบผล ${r.serial}?`)) delResult.mutate(r.id); }}>ลบ</button></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {shownResults.length > 0 && (
          <Paginator page={resPage} totalPages={resTotalPages} onPage={setResPage} total={shownResults.length} />
        )}
      </div>

      {exportMode && (
        <ExportDialog
          mode={exportMode}
          initial={{
            filename: exportMode === 'flow'
              ? `Process Flow Chart - ${model || pn || 'workflow'}`
              : `Gantt - ${model || pn || 'workflow'}`,
            customer, model, pn, issuedBy, checkedBy, approvedBy, revNo, revDesc,
          }}
          onCancel={() => setExportMode(null)}
          onConfirm={(fm) => {
            if (exportMode === 'flow') {
              // จำค่าเอกสารไว้เป็นค่าเริ่มต้นครั้งถัดไป
              setIssuedBy(fm.issuedBy); setCheckedBy(fm.checkedBy); setApprovedBy(fm.approvedBy); setRevNo(fm.revNo); setRevDesc(fm.revDesc);
              exportFlowchartPdf(flowSvg, {
                form: true, title: 'PROCESS FLOW CHART', filename: fm.filename,
                customer: fm.customer, model: fm.model, pn: fm.pn,
                issuedBy: fm.issuedBy, checkedBy: fm.checkedBy, approvedBy: fm.approvedBy,
                revNo: fm.revNo, revDesc: fm.revDesc, revDate: new Date().toLocaleDateString('th-TH'),
                timeHtml: buildTimeDetailHtml(steps, qtyN),   // หน้า 2 = รายละเอียดเวลา
              });
            } else {
              exportFlowchartPdf(ganttSvg, { title: 'Manufacturing Workflow — Gantt', filename: fm.filename, customer: fm.customer, model: fm.model, pn: fm.pn, timeHtml: buildTimeDetailHtml(steps, qtyN) });
            }
            setExportMode(null);
          }}
        />
      )}
    </div>
  );
}
