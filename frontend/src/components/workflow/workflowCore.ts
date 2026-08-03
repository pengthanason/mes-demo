// ── Core types/constants/step-building helpers for WorkflowBuilder ──
// แยกจาก WorkflowBuilder.tsx เดิม (god component) — ย้ายโค้ด ไม่เปลี่ยนพฤติกรรม

export type StepKind = 'process' | 'checkpoint';
export type TimeScope = 'per_unit' | 'once';
export type FailAction = 'rework' | 'back' | 'rework_station' | 'scrap' | 'hold';

// บทบาทในสายผลิต — หัว/ท้ายล็อกไว้ตายตัว · SMT เป็นช่วงกลางที่แก้/เรียงได้
export type Role = 'incoming' | 'setup' | 'smt' | 'packing' | 'store';
export const ROLE_CFG: Record<Role, { kind: StepKind; timeScope: TimeScope; color: string }> = {
  incoming: { kind: 'process',    timeScope: 'once',     color: '#0891b2' },
  setup:    { kind: 'process',    timeScope: 'once',     color: '#7c3aed' },
  smt:      { kind: 'checkpoint', timeScope: 'per_unit', color: '#d97706' },
  packing:  { kind: 'process',    timeScope: 'per_unit', color: '#16a34a' },
  store:    { kind: 'process',    timeScope: 'once',     color: '#64748b' },
};

// กระบวนการที่เลือกได้ในช่วง SMT (REWORK เป็นปลายทาง fail อัตโนมัติ — ไม่อยู่ในลิสต์)
// สถานีของแท็บ Internal (สายผลิตในโรงงาน) — SET UP แยกไปกลุ่มของตัวเอง (SETUP_OPTS)
export const SMT_DEFAULT = ['BBAS', 'WAV', 'TEST', 'SOLDERING', 'SMT', 'FQC', 'IPQC', 'INSERT', 'ICT TEST', 'FCT TEST', 'REWORK'];
// สถานีสาย SMT/PCBA (built-in) — เป็นหมวด "SMT / PCBA" ของตัวเองในดรอปดาวน์ (แยกจาก Custom process)
export const DEFAULT_CUSTOM = [
  'SOLDER PASTE PRINT', 'SPI (Solder Paste Inspection)', 'SMT PICK & PLACE', 'REFLOW OVEN',
  'AOI (Optical Inspection)', 'THT INSERTION', 'WAVE SOLDERING',
];
// สถานีของแท็บ External — แยกตามบริษัท/ประเภท (Plastic ฉีด/เป่า + EMS) · แต่ละประเภทมีสถานีของตัวเอง
export type ExtKey = 'ext_inj' | 'ext_blow' | 'ext_ems';
export const EXT_GROUPS: Record<ExtKey, { header: string; items: string[] }> = {
  ext_inj:  { header: '🧴 Plastic · Injection', items: [
    'Preparation', 'Feeding', 'Heating & Melting', 'Injection', 'Molding & Cooling', 'Demolding & Ejection', 'Finished Product',
  ] },
  ext_blow: { header: '💨 Plastic · Blow', items: [
    'Feeding & Melting', 'Parison Formation', 'Mold Clamping', 'Blowing', 'Cooling', 'Ejection & Trimming',
  ] },
  ext_ems:  { header: '🔌 EMS · Electronics', items: [
    'Solder Paste Printing', 'Component Placement', 'Reflow Soldering', 'AOI', 'Testing', 'Assembly & Packing',
  ] },
};
export const EXTERNAL_PROC = Object.values(EXT_GROUPS).flatMap(g => g.items);
// ชื่อที่ถือเป็นงาน setup (ครั้งเดียว ไม่คูณจำนวน)
export const isSetupName = (p: string) => /SET\s*UP/i.test(p || '');
export const SETUP_OPTS = ['SET UP LINE', 'SET UP MACHINE'];
export const INCOMING_LABEL = 'Check material (incoming)';
// สถานีหลักหัว-ท้ายสายผลิต — เผื่อเผลอลบทิ้ง จะได้เลือกใส่กลับจากดรอปดาวน์ แล้วลากเข้าตำแหน่งเอง
export const MAIN_OPTS = [INCOMING_LABEL, 'PACKING', 'STORE'];
// เครื่อง/สถานีเริ่มต้น (ดรอปดาวในแต่ละ process — ผู้ใช้เพิ่ม/ลบเองได้ เก็บใน localStorage)
export const MACHINE_DEFAULT = ['SMT Line', 'FCT Tester', 'Setup Station'];
// สถานีมาตรฐาน (built-in) ทุกกลุ่ม — ใช้เช็คว่า process ไหนเป็นของจริง (ไม่ต้องเก็บเป็น custom)
const BUILTIN_PROCS = new Set([...SMT_DEFAULT, ...DEFAULT_CUSTOM, ...EXTERNAL_PROC, ...MAIN_OPTS, ...SETUP_OPTS].map(x => x.trim().toLowerCase()));
export const isBuiltinProc = (p: string) => BUILTIN_PROCS.has((p || '').trim().toLowerCase());

// ── กระบวนการมาตรฐานตามฟอร์ม PROCESS FLOW CHART (FM 05) — ครอบคลุมทุกขั้นในเอกสาร RSU / JUMBO ──
// qc = ขั้นตรวจ (จุดตัดสิน ผ่าน/ไม่ผ่าน = ◇) · once = ทำครั้งเดียวต่อล็อต · role = หมวด (สี/เวลา)
export type FormProc = { n: string; qc?: boolean; once?: boolean; role: Role; sec?: number };   // sec = เวลาตัวอย่าง (วินาที) ใช้ตอนโหลดตัวอย่างฟอร์ม
export const FORM_PROCS: FormProc[] = [
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
export const FORM_PROC_MAP: Record<string, FormProc> = Object.fromEntries(FORM_PROCS.map(f => [f.n, f]));

export type Step = {
  id: string; process: string; seconds: number | '';
  role: Role;
  kind: StepKind; timeScope: TimeScope;   // มาจาก role (เก็บไว้ให้ flowchart/คำนวณใช้)
  failAction: FailAction; backToId: string; maxRetry: number; holdMin: number;   // holdMin = เวลาพัก (นาที) เมื่อ fail=hold
  stations: number;                        // จำนวนเครื่องขนาน (ต่อ process)
  machine: string;                         // ชื่อเครื่อง/สถานี (เลือกจากดรอปดาวในแถว)
};

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `s_${Date.now()}_${Math.round(performance.now())}`);

export const makeStep = (role: Role, process: string): Step => {
  const c = ROLE_CFG[role];
  return {
    id: uid(), process, seconds: '', role,
    kind: c.kind, timeScope: c.timeScope,
    failAction: 'rework', backToId: '', maxRetry: 0, holdMin: 0,
    stations: 1, machine: '',
  };
};

// โครงเริ่มต้น: รับของ → set up (ขั้น smt ปกติ ลบ/ย้ายได้) → (SMT) → แพ็ก → คลัง
export const initialSteps = (): Step[] => [
  makeStep('incoming', INCOMING_LABEL),
  { ...makeStep('smt', SETUP_OPTS[0]), timeScope: 'once', kind: 'process' },   // set up ไม่ล็อกแล้ว เป็นขั้นปกติ (ครั้งเดียว)
  makeStep('packing', 'PACKING'),
  makeStep('store', 'STORE'),
];

// เดา role จากชื่อ (สำหรับ preset เก่าที่ไม่มี role) — SET UP ถือเป็นขั้น smt ปกติ (ไม่ล็อกแล้ว)
export const inferRole = (p: string): Role => {
  const u = (p || '').toUpperCase();
  if (u.includes('CHECK MATERIAL') || u.includes('INCOMING') || u.includes('รับของ')) return 'incoming';
  if (u.includes('PACK')) return 'packing';
  if (u.includes('STORE') || u.includes('คลัง')) return 'store';
  return 'smt';
};

export const fmtTime = (sec: number) => {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const p: string[] = [];
  if (h) p.push(`${h} h`);
  if (m) p.push(`${m} min`);
  if (s || !p.length) p.push(`${s} s`);
  return p.join(' ');
};

export const ROLE_DOT: Record<string, string> = { incoming: '#0891b2', setup: '#7c3aed', smt: '#d97706', packing: '#16a34a', store: '#64748b' };   // #7 สีจุด dumbbell ตาม role

export const fmtDateTime = (s: string) => { try { return new Date(s).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }); } catch { return s; } };

// ป้าย disposition เมื่อ fail (ใช้ทั้ง flowchart + dropdown)
export const FAIL_OPTS: { value: FailAction; label: string }[] = [
  { value: 'rework', label: '🛠️ Rework (loop back to repair)' },
  { value: 'back',   label: '↩️ Go back to step...' },
  { value: 'scrap',  label: '❌ Scrap (NG out)' },
  { value: 'hold',   label: '⏸️ Hold / MRB' },
];
