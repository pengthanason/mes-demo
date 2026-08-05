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
import { ROW_H, fillerCount, FillerRows } from './TableFill';

import {
  type Step, type Role, type TimeScope, type FailAction, type ExtKey, type FormProc,
  ROLE_CFG, SMT_DEFAULT, DEFAULT_CUSTOM, EXT_GROUPS, isSetupName, SETUP_OPTS,
  MAIN_OPTS, MACHINE_DEFAULT, isBuiltinProc, FORM_PROCS, FORM_PROC_MAP,
  uid, makeStep, initialSteps, inferRole, fmtTime, ROLE_DOT, fmtDateTime, FAIL_OPTS, MAX_STATIONS,
} from './workflow/workflowCore';
import { categorize, toMermaid } from './workflow/categorize';
import { PresetSelect } from './workflow/PresetSelect';
import { buildFlowSvg, buildGanttSvg, CURSOR_GRAB, CURSOR_GRABBING } from './workflow/svgBuilders';
import { buildTimeDetailHtml, exportFlowchartPdf } from './workflow/pdfExport';
import { ExportDialog } from './workflow/ExportDialog';
import { Dropdown, type DDGroup, GRID, TimeCells, MachineCell } from './workflow/StepControls';

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

// ── Preset เริ่มต้น: ฟอร์ม FM 05 (PROCESS FLOW CHART · RSU / JUMBO) — โผล่บนสุดในดรอปดาวน์ Preset เสมอ (ลบไม่ได้) ──
const FM05_PRESET_ID = -1;
const FM05_PRESET: Workflow = {
  id: FM05_PRESET_ID,
  name: '📄 FM 05 · PROCESS FLOW CHART (RSU / JUMBO)',
  customer: 'JUMBO', model: 'RSU',
  steps: FORM_PROCS.map(f => ({ process: f.n, seconds: f.sec ?? null })),
  created_at: '',
};

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
  const [ganttZoom, setGanttZoom] = useState(1);   // ซูมแกนเวลา Gantt (1 = พอดี)
  const [ganttFitW, setGanttFitW] = useState(1000);   // ความกว้างพาเนลจริง — ให้ Gantt เต็มพอดีที่ 100% โดยไม่ scale
  const ganttWrapRef = useRef<HTMLDivElement>(null);
  const ganttScrollRef = useRef<HTMLDivElement>(null);
  const ganttPanRef = useRef<{ x: number; left: number } | null>(null);   // ลากมือจับ pan chart แนวนอน
  const stepGhostRef = useRef<HTMLDivElement | null>(null);   // ghost ตอนลากสลับลำดับ (pointer-drag เอง)
  const stepOverRef = useRef<string | null>(null);
  const gtipRef = useRef<HTMLDivElement>(null);   // tooltip โปรเซสใน Gantt (custom — ขึ้นทันที ไม่ดีเลย์)
  useEffect(() => {
    if (!showGantt) return;
    const el = ganttWrapRef.current;
    if (!el) return;
    const update = () => setGanttFitW(el.clientWidth || 1000);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [showGantt]);
  // กระบวนการ SMT แยก 2 กลุ่ม: default (มาตรฐาน คงที่) + custom (ผู้ใช้เพิ่มเอง ลบได้) — แต่ละกลุ่มเรียง A-Z
  const [customProcs, setCustomProcs] = useState<string[]>(() => {
    let list: string[] = [];
    try { const c = JSON.parse(localStorage.getItem('mes_custom_processes') || '[]'); if (Array.isArray(c)) list = c; } catch { /* noop */ }
    // กู้ custom ที่เคยเพิ่มไว้ใต้ key เก่า (ตอนรวมลิสต์) — เอาเฉพาะที่ไม่ใช่ default
    try {
      const old = JSON.parse(localStorage.getItem('mes_smt_processes_v2') || '[]');
      if (Array.isArray(old)) old.forEach((p: string) => { if (p && !SMT_DEFAULT.includes(p) && !list.includes(p)) list.push(p); });
    } catch { /* noop */ }
    return list.filter(p => !isBuiltinProc(p));   // ตัดตัวที่เป็น station มาตรฐาน (built-in) ออก ไม่ให้ค้างเป็น custom (รวม SMT/PCBA ที่เคย seed ไว้ตอนก่อน)
  });
  useEffect(() => { localStorage.setItem('mes_custom_processes', JSON.stringify(customProcs)); }, [customProcs]);
  // ล้าง key เก่าทิ้งหลังกู้ครั้งเดียว — กันไม่ให้ custom ที่ลบไปแล้ว ถูกดึงกลับมาตอนรีโหลด
  useEffect(() => { localStorage.removeItem('mes_smt_processes_v2'); }, []);
  const smtMain = [...SMT_DEFAULT].sort((a, b) => a.localeCompare(b));            // default เรียง A-Z (บน)
  const smtCustomSorted = [...customProcs].filter(p => !isBuiltinProc(p)).sort((a, b) => a.localeCompare(b));   // custom เรียง A-Z (ล่าง) — ไม่โชว์ตัวที่เป็น built-in แล้ว
  // สถานีที่เลือกได้ในดรอปดาว "Process" ตามแท็บ/ประเภท — แยกหัวข้อกลุ่มให้อ่านเข้าใจง่าย
  const internalGroup: DDGroup = { header: '🏭 In-House Line', items: smtMain.map(o => ({ value: o, label: o })) };
  const pcbaGroup: DDGroup = { header: '🔧 SMT / PCBA', items: [...DEFAULT_CUSTOM].sort((a, b) => a.localeCompare(b)).map(o => ({ value: o, label: o })) };
  const extToDD = (k: ExtKey): DDGroup => ({ header: EXT_GROUPS[k].header, items: EXT_GROUPS[k].items.map(o => ({ value: o, label: o })) });
  const procGroups: DDGroup[] =
    tab === 'internal' ? [internalGroup, pcbaGroup]
    : tab === 'external' ? [extToDD(activeKey as ExtKey)]   // โชว์เฉพาะสถานีของประเภทที่เลือกอยู่ (สาย outsource — ไม่มี SMT/PCBA ในบ้าน)
    : [internalGroup, pcbaGroup, extToDD('ext_inj'), extToDD('ext_blow'), extToDD('ext_ems')];   // mix = รวมทุกหัวข้อ
  const defaultProc = tab === 'external' ? EXT_GROUPS[activeKey as ExtKey].items[0] : (smtMain[0] || 'SMT');   // สถานีเริ่มต้นตอนกด "เพิ่มขั้นตอน"
  // สลับแท็บ/ประเภท → ล้างสถานะผลรัน + ยุบ FlowChart/Gantt (กัน id ข้ามชุดปนกัน)
  const resetView = () => { setShowFlow(false); setShowGantt(false); setGanttZoom(1); };
  const subPill = (on: boolean): React.CSSProperties => ({
    padding: '5px 15px', borderRadius: 6, border: `1px solid ${on ? 'var(--brand)' : '#d7dee7'}`, cursor: 'pointer',
    fontSize: '0.8rem', fontWeight: 700, background: on ? 'var(--brand)' : '#fff', color: on ? '#fff' : '#64748b', transition: 'all .12s',
  });
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [grabId, setGrabId] = useState<string | null>(null);
  // ลากสลับลำดับแบบ pointer เอง (ไม่ใช้ HTML5 DnD ที่คุมเคอร์เซอร์/ghost ไม่ได้ → บัค) · ผูก listener เฉพาะตอนกำลังลาก
  useEffect(() => {
    if (draggedId == null) return;
    const onMove = (e: PointerEvent) => {
      const g = stepGhostRef.current;
      if (g) { g.style.left = `${e.clientX + 12}px`; g.style.top = `${e.clientY + 8}px`; }
      const row = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('[data-step-id]');
      const id = row ? row.getAttribute('data-step-id') : null;
      stepOverRef.current = id;
      setDragOverId(id);
    };
    const onUp = () => {
      const target = stepOverRef.current;
      stepGhostRef.current?.remove(); stepGhostRef.current = null;
      document.body.style.cursor = ''; document.body.style.userSelect = '';
      if (target) onDrop(target);
      setDraggedId(null); setDragOverId(null); setGrabId(null);
    };
    // Pointer Events = ครอบทั้งเมาส์และทัช (มือถือ) → ลากสลับลำดับได้ทุกอุปกรณ์
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp); };
  }, [draggedId]);

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
    { header: 'Machine/Station', items: machineMain.map(o => ({ value: o, label: o })) },
    ...(machineCustomSorted.length ? [{ header: 'Custom', items: machineCustomSorted.map(o => ({ value: o, label: o, deletable: true })) }] : []),
  ];

  // เวลามาตรฐาน (ประมาณการ): once = ครั้งเดียว · per_unit = × จำนวน ÷ เครื่อง · SMT คูณจำนวนรอบ (repeat)
  const qtyN = Number(qty) || 0;
  const stationsOf = (s: Step) => Math.min(MAX_STATIONS, Math.max(1, Number(s.stations) || 1));
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
  const ganttSvgs = buildGanttSvg(steps, qtyN, ganttZoom, ganttFitW);
  const ganttNarrow = ganttFitW > 0 && ganttFitW < 600;   // จอแคบ (มือถือ) → เลื่อนทั้งอันในสกอลล์เดียว (frozen label กินจนไม่เหลือที่ให้ chart)
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
    if (!pn.trim()) { showToast('Please enter P/N', 'error'); return; }
    if (!steps.length || steps.some(s => s.seconds === '' || Number(s.seconds) <= 0)) { showToast('Please enter time for every process', 'error'); return; }
    const perStep = steps.map(s => ({ process: s.process, result: 'PASS' }));
    const seqStr = steps.map(s => `${s.process}${s.timeScope === 'per_unit' ? '×N' : ''}${s.seconds !== '' ? `(${s.seconds}s)` : ''}`).join(' → ');
    recordResult.mutate(
      { serial: pn.trim(), customer: customer.trim(), model: model.trim(), sequence: seqStr, result: 'PASS', total_sec: Math.round(perUnitSec), line: tab, steps: perStep },
      {
        onSuccess: () => { showToast(`Recorded result ${pn.trim()} successfully`, 'success'); setPn(''); },
        onError: (e: any) => showToast(e.message, 'error'),
      },
    );
  }

  /* บันทึก Preset */
  function savePreset() {
    if (!steps.length) return;
    const name = window.prompt('Name the Preset:', customer && model ? `${customer} - ${model}` : '');
    if (name == null) return;
    if (!name.trim()) { showToast('A preset name is required', 'error'); return; }
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
        stations: s.timeScope === 'once' ? 1 : Math.min(MAX_STATIONS, Math.max(1, Number(s.stations) || 1)),
        machine: s.machine || '',
      })),
    }, {
      onSuccess: () => showToast(`Saved Preset "${name.trim()}" successfully`, 'success'),
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
        stations: Number(s.stations) > 0 ? Math.min(MAX_STATIONS, Number(s.stations)) : 1,
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
    showToast(`Loaded Preset "${w.name || w.customer}"`, 'info');
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
    showToast('Loaded FM 05 sample form (RSU / JUMBO)', 'success');
  }

  /* เพิ่ม/ลบ กระบวนการ custom (เฉพาะช่วง SMT) */
  function addCustomProcess(stepId: string) {
    const name = window.prompt('New SMT process name:');
    if (name == null) return;
    const t = name.trim();
    if (!t) { showToast('A process name is required', 'error'); return; }
    if (isBuiltinProc(t) || customProcs.includes(t)) showToast('This process already exists — you can select it', 'info');
    else { setCustomProcs(prev => [...prev, t]); showToast(`Added process "${t}"`, 'success'); }
    pickProcess(stepId, t);
  }

  /* เพิ่ม/ลบ เครื่องในดรอปดาว (ต่อ process) */
  function addMachine(stepId: string) {
    const name = window.prompt('New machine/station name:');
    if (name == null) return;
    const t = name.trim();
    if (!t) { showToast('A machine name is required', 'error'); return; }
    if (MACHINE_DEFAULT.includes(t) || machines.includes(t)) showToast('This machine already exists — you can select it', 'info');
    else { setMachines(prev => [...prev, t]); showToast(`Added machine "${t}"`, 'success'); }
    setStep(stepId, { machine: t });
  }
  async function deleteMachine(name: string) {
    if (!(await confirmDialog(`Delete machine "${name}" from the list?`))) return;
    setMachines(prev => prev.filter(n => n !== name));
    setSteps(prev => prev.map(s => s.machine === name ? { ...s, machine: '' } : s));
  }

  /* ลบกระบวนการที่เพิ่มเอง (custom) ออกจากลิสต์ — ขั้นที่ใช้อยู่จะย้ายไปตัวแรก (default) */
  async function deleteCustomProc(name: string) {
    if (!(await confirmDialog(`Delete process "${name}" from the list?`))) return;
    setCustomProcs(prev => prev.filter(n => n !== name));
    setSteps(prev => prev.map(s => (s.role === 'smt' && s.process === name) ? { ...s, process: smtMain[0] || 'SMT' } : s));
  }

  return (
    <div className="stack-lg">
      <h2 className="panel__title">Manufacturing Sequence Builder</h2>

      {/* P/N + Customer + Model */}
      <div className="filters-grid" style={{ marginBottom: 15 }}>
        <label className="field"><span>P/N (Part Number)</span>
          <input value={pn} onChange={e => setPn(e.target.value)} placeholder="Enter P/N..." disabled={isViewer} />
        </label>
        <label className="field"><span>Customer</span>
          <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Customer name" disabled={isViewer} />
        </label>
        <label className="field"><span>Model</span>
          <input value={model} onChange={e => setModel(e.target.value)} placeholder="Model name" disabled={isViewer} />
        </label>
      </div>

      {/* presets bar */}
      <div style={{ marginBottom: 15, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: 'var(--bg-panel)', padding: 15, borderRadius: 6, border: '1px solid var(--border-color)' }}>
        <strong style={{ fontSize: '0.9rem', color: 'var(--text-muted)', minWidth: 80 }}>⚙️ Preset:</strong>
        {!isViewer && (
          <button type="button" className="btn secondary" onClick={savePreset} disabled={create.isPending || steps.length === 0}>
            {create.isPending ? 'Saving...' : '💾 Save as Preset'}
          </button>
        )}
        <div style={{ width: 280, maxWidth: '100%' }}>
          <PresetSelect workflows={[FM05_PRESET, ...saved]} onLoad={(w) => w.id === FM05_PRESET_ID ? loadFm05Sample() : loadPreset(w)} onDelete={(id) => del.mutate(id)} canDelete={!isViewer} />
        </div>
      </div>

      {/* steps — ตาราง Routing (ทุกขั้นเลือก/ลาก/ลบได้) */}
      <div style={{ background: '#f8f9fa', padding: 16, border: '1px solid #e2e8f0', borderRadius: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <strong style={{ fontSize: '0.95rem', color: '#334155' }}>📋 Process sequence (Routing)</strong>
          {!isViewer && (
            <button type="button" className="btn" onClick={addSmt} style={{ background: 'var(--brand)', color: '#fff', border: 'none' }}>
              + Add step
            </button>
          )}
        </div>

        {/* แท็บ Internal / External / Mix — แต่ละแท็บมี routing แยกกัน · External แยกบริษัทอีก 2 ชั้น */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: 4, background: '#eef2f7', borderRadius: 8, marginBottom: 12, width: 'fit-content' }}>
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
              <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 700, minWidth: 54 }}>Company</span>
              {([['plastic', '🛢️ Plastic'], ['ems', '🔌 EMS']] as const).map(([k, label]) => (
                <button key={k} type="button" onClick={() => { if (extMode !== k) { setExtMode(k); resetView(); } }} style={subPill(extMode === k)}>{label}</button>
              ))}
            </div>
            {extMode === 'plastic' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 700, minWidth: 54 }}>Mode</span>
                {([['inj', '🧴 Injection'], ['blow', '💨 Blow']] as const).map(([k, label]) => (
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
              <span>Process</span>
              <span style={{ textAlign: 'center' }}>Time/unit</span>
              <span style={{ textAlign: 'center' }}>Per pc?</span>
              <span>Machine / Qty</span>
              <span></span>
            </div>

            {steps.map((step, index) => {
              const cfg = ROLE_CFG[step.role];
              const isOnce = step.timeScope === 'once';
              return (
              <div key={step.id}
                data-step-id={step.id}
                style={{
                  borderBottom: '1px solid #f1f5f9',
                  borderLeft: `4px solid ${cfg.color}`,
                  opacity: draggedId === step.id ? 0.4 : 1,
                  background: dragOverId === step.id && draggedId !== step.id ? '#e0f2fe' : '#fff',
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 21, alignItems: 'center', padding: '8px 12px' }}>
                  {/* ลาก (ทุกขั้น) */}
                  <div style={{ cursor: !isViewer ? CURSOR_GRAB : 'default', color: grabId === step.id ? '#334155' : '#94a3b8', fontSize: '1.15rem', textAlign: 'center', userSelect: 'none', touchAction: 'none' }}
                    onMouseEnter={() => !isViewer && setGrabId(step.id)} onMouseLeave={() => { if (!draggedId) setGrabId(null); }}
                    onPointerDown={e => {
                      if (isViewer) return;
                      e.preventDefault();
                      setDraggedId(step.id); stepOverRef.current = null;
                      const ghost = document.createElement('div');
                      ghost.textContent = `☰  ${index + 1}. ${step.process}`;
                      ghost.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;padding:6px 12px;background:#334155;color:#fff;border-radius:6px;font-weight:600;font-size:13px;white-space:nowrap;box-shadow:0 8px 20px rgba(0,0,0,.28);opacity:.96';
                      ghost.style.left = `${e.clientX + 12}px`; ghost.style.top = `${e.clientY + 8}px`;
                      document.body.appendChild(ghost); stepGhostRef.current = ghost;
                      document.body.style.cursor = CURSOR_GRABBING; document.body.style.userSelect = 'none';
                    }}
                    title={!isViewer ? 'Drag to reorder' : undefined}>{!isViewer ? '☰' : ''}</div>
                  {/* # */}
                  <div style={{ textAlign: 'center', fontWeight: 700, color: cfg.color }}>{index + 1}</div>
                  {/* กระบวนการ — ดรอปดาวน์เดียวกันทุกขั้น (เลือกสถานีหลัก/setup/SMT/custom ได้) */}
                  <div style={{ minWidth: 0 }}>
                    <Dropdown value={step.process} disabled={isViewer}
                      groups={[
                        { header: 'Main stations', items: MAIN_OPTS.map(o => ({ value: o, label: o })) },
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
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', color: '#64748b', cursor: isViewer ? 'default' : 'pointer' }} title="Checked = done for every pc (time × qty in lot) · unchecked = done once per lot, e.g. Check material">
                      <input type="checkbox" checked={!isOnce} disabled={isViewer}
                        onChange={e => setStep(step.id, e.target.checked ? { timeScope: 'per_unit' } : { timeScope: 'once', machine: '', stations: 1 })}
                        style={{ width: 16, height: 16 }} />
                      Every pc
                    </label>
                  </div>
                  {/* เครื่อง (per_unit เท่านั้น) */}
                  <div>
                    {isOnce ? <span style={{ color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 600 }}>×1</span> : <MachineCell step={step} isViewer={isViewer} setStep={setStep} machineGroups={machineGroups} onAddMachine={() => addMachine(step.id)} onDeleteMachine={deleteMachine} />}
                  </div>
                  {/* ลบ (SMT เท่านั้น) */}
                  <div style={{ textAlign: 'center' }}>
                    {!isViewer && (
                      <button type="button" onClick={() => removeStep(step.id)} title="Delete this step" className="tap-sm"
                        style={{ border: 'none', background: 'transparent', color: '#e11d48', cursor: 'pointer', fontSize: 16, fontWeight: 700, lineHeight: 1, padding: '2px 6px' }}>✕</button>
                    )}
                  </div>
                </div>
                {/* fail disposition — เฉพาะขั้นตรวจ (checkpoint) · default = Rework */}
                {step.kind === 'checkpoint' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '0 12px 9px 46px', fontSize: '0.78rem', color: '#b45309' }}>
                    <span style={{ fontWeight: 600 }}>⚠️ If failed →</span>
                    <select value={step.failAction} disabled={isViewer} title="Choose what to do if this step fails"
                      onChange={e => setStep(step.id, { failAction: e.target.value as FailAction, ...(e.target.value !== 'back' ? { backToId: '' } : {}) })}
                      style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #fcd34d', background: '#fff', fontSize: '0.78rem', color: '#334155', fontWeight: 600 }}>
                      {FAIL_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {step.failAction === 'back' && (
                      <select value={step.backToId} disabled={isViewer} title="Choose the target step to go back to on failure"
                        onChange={e => setStep(step.id, { backToId: e.target.value })}
                        style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #fcd34d', background: '#fff', fontSize: '0.78rem', color: '#334155' }}>
                        <option value="">— Select target step —</option>
                        {steps.slice(0, index).map((x, xi) => <option key={x.id} value={x.id}>#{xi + 1} {x.process}</option>)}
                      </select>
                    )}
                    {step.failAction !== 'scrap' && step.failAction !== 'hold' && (
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#64748b' }} title="How many retries before escalation (0 = unlimited)">
                        Retries <input type="number" min="0" value={step.maxRetry || 0} disabled={isViewer}
                          onChange={e => setStep(step.id, { maxRetry: Math.max(0, Math.floor(Number(e.target.value)) || 0) })}
                          style={{ width: 42, padding: '3px 4px', borderRadius: 4, border: '1px solid #cbd5e1', textAlign: 'center', fontSize: '0.78rem' }} /> times
                      </label>
                    )}
                    {step.failAction === 'hold' && (
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#64748b' }} title="How many minutes to hold before looping back">
                        Hold <input type="number" min="0" value={step.holdMin || 0} disabled={isViewer}
                          onChange={e => setStep(step.id, { holdMin: Math.max(0, Math.floor(Number(e.target.value)) || 0) })}
                          style={{ width: 48, padding: '3px 4px', borderRadius: 4, border: '1px solid #cbd5e1', textAlign: 'center', fontSize: '0.78rem' }} /> min
                      </label>
                    )}
                  </div>
                )}
              </div>
              );
            })}
            {steps.length === 0 ? (
              <div style={{ padding: '18px 12px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem', background: '#fffdf6' }}>
                No steps yet — press “+ Add step” to start building your own routing
              </div>
            ) : smtCount === 0 && (
              <div style={{ padding: '14px 12px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem', background: '#fffdf6' }}>
                No SMT steps in the middle yet — press “+ Add step” to insert BBAS / SMT / TEST etc.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* #7 Dumbbell — ลำดับสถานีทั้งหมดเป็นเส้นเดียว จุด=สถานี hover=standard time */}
      {steps.length > 0 && (
        <div style={{ padding: '12px 14px', border: '1px solid var(--border-color)', borderRadius: 8, background: '#fff' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: 10 }}>Station sequence <span style={{ fontWeight: 400, color: '#94a3b8' }}>— hover a dot for its standard time</span></div>
          <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', minWidth: 'min-content', padding: '2px 6px' }}>
              {steps.map((s, i) => {
                const secN = Number(s.seconds) || 0;
                const c = ROLE_DOT[s.role] ?? '#64748b';
                return (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'flex-start' }}>
                    {i > 0 && <div style={{ width: 34, height: 2, background: '#cbd5e1', marginTop: 7, flexShrink: 0 }} />}
                    <div title={`${i + 1}. ${s.process}${s.kind === 'checkpoint' ? ' (checkpoint)' : ''}\nStandard time: ${secN ? fmtTime(secN) : 'not set'}`}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 72, flexShrink: 0, cursor: 'help' }}>
                      <div style={{ width: 16, height: 16, borderRadius: '50%', background: c, flexShrink: 0 }} />
                      <span style={{ fontSize: '0.62rem', color: '#475569', marginTop: 6, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 70, fontWeight: 600 }}>{s.process}</span>
                      <span style={{ fontSize: '0.6rem', color: secN ? '#0369a1' : '#cbd5e1', fontWeight: 600 }}>{secN ? fmtTime(secN) : '—'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* เวลามาตรฐาน (ประมาณการ) */}
      <div style={{ padding: 16, background: '#f0f9ff', borderRadius: 8, border: '1px solid #bae6fd' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
          <span style={{ fontWeight: 700, color: '#0369a1' }}>⏱️ Standard time (estimate)</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: '#0369a1', whiteSpace: 'nowrap' }}>
            Pieces per lot (Qty)
            <input type="number" min="0" value={qty} disabled={isViewer} placeholder="e.g. 3000"
              onChange={e => setQty(e.target.value === '' ? '' : Math.max(0, Math.floor(Number(e.target.value)) || 0))}
              style={{ width: 110, padding: '7px 10px', borderRadius: 6, border: '1px solid #7dd3fc', textAlign: 'right' }} />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e0f2fe', padding: '10px 12px' }}>
            <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: 2 }}>📌 Once/lot (incoming+setup+storage)</div>
            <strong style={{ fontSize: '1.05rem', color: '#155e75' }}>{fmtTime(Math.round(setupSec))}</strong>
          </div>
          <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e0f2fe', padding: '10px 12px' }}>
            <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: 2 }}>🔁 Per pc (1 pc through all)</div>
            <strong style={{ fontSize: '1.05rem', color: '#166534' }}>{fmtTime(Math.round(perUnitSec))}</strong>
          </div>
          <div style={{ background: '#fff', borderRadius: 8, border: '2px solid #38bdf8', padding: '10px 12px' }}>
            <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: 2 }}>📦 Total lot (pipeline)</div>
            <strong style={{ fontSize: '1.15rem', color: '#0284c7' }}>{qtyN > 0 ? fmtTime(Math.round(lotSec)) : '— Enter Qty —'}</strong>
          </div>
          <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e0f2fe', padding: '10px 12px' }}>
            <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: 2 }}>⛓️ Bottleneck (slowest station/pc)</div>
            <strong style={{ fontSize: '1.05rem', color: '#b45309' }}>{fmtTime(Math.round(bottleneckSec))}</strong>
          </div>
        </div>
        <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: 12, lineHeight: 1.6, background: '#fff', border: '1px solid #e0f2fe', borderRadius: 6, padding: '9px 12px' }}>
          📦 <strong>Total lot (pipeline)</strong> = <strong style={{ color: '#155e75' }}>{fmtTime(Math.round(setupSec))}</strong> <span style={{ color: '#64748b' }}>(once)</span>
          {' '}<strong>+</strong> <strong style={{ color: '#166534' }}>{fmtTime(Math.round(perUnitSec))}</strong> <span style={{ color: '#64748b' }}>(first pc through whole line)</span>
          {' '}<strong>+</strong> ({qtyN > 0 ? `${qtyN.toLocaleString()}` : 'N'}−1) <strong>×</strong> <strong style={{ color: '#b45309' }}>{fmtTime(Math.round(bottleneckSec))}</strong> <span style={{ color: '#64748b' }}>(bottleneck)</span>
          {qtyN > 0 && <> {' '}<strong>≈</strong> <strong style={{ color: '#0284c7' }}>{fmtTime(Math.round(lotSec))}</strong></>}
          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 5 }}><strong>Pipeline</strong> model: the next pc does not wait for the previous one to finish the whole line and can enter the next station right away, so they run in parallel — once the line is full, output comes out every "bottleneck" · estimate, actual time depends on queues/breaks</div>
        </div>
      </div>

      {/* Gen FlowChart / Gantt */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" className="btn" onClick={() => setShowFlow(v => !v)} disabled={steps.length === 0}
          style={{ background: '#6366f1', borderColor: '#6366f1', color: '#fff', fontWeight: 600 }}>
          {showFlow ? 'Hide FlowChart' : '🔀 Gen FlowChart'}
        </button>
        <button type="button" className="btn" onClick={() => setShowGantt(v => !v)} disabled={steps.length === 0 || !qtyN}
          title={!qtyN ? 'Enter production quantity (Qty) first' : ''}
          style={{ background: '#0891b2', borderColor: '#0891b2', color: '#fff', fontWeight: 600 }}>
          {showGantt ? 'Hide Gantt' : '📊 Gen Gantt'}
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
          <div style={{ display: 'flex', justifyContent: 'safe center', overflowX: 'auto', WebkitOverflowScrolling: 'touch', padding: '8px 0' }} dangerouslySetInnerHTML={{ __html: flowSvg }} />
          <details style={{ marginTop: 24 }}>
            <summary style={{ cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-muted)' }}>Mermaid</summary>
            <pre style={{ background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: 8, padding: 12, fontSize: '0.8rem', overflowX: 'auto', marginTop: 8 }}>{toMermaid(steps)}</pre>
          </details>
        </div>
      )}

      {showGantt && (
        <div style={{ padding: 20, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <h3 className="panel__title panel__title--sm" style={{ margin: 0 }}>Gantt · Production Timeline</h3>
            <button type="button" className="btn secondary" style={{ fontSize: '0.82rem' }} onClick={() => setExportMode('gantt')}>🖨️ Export to PDF</button>
          </div>
          <div style={{ marginBottom: 14, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <span>Customer: <strong>{customer || '—'}</strong> · Model: <strong>{model || '—'}</strong> · Qty: <strong>{qtyN.toLocaleString()}</strong> pcs</span>
          </div>
          <div ref={ganttWrapRef} style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', top: 4, right: 8, zIndex: 3, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.85)', borderRadius: 6, padding: '1px 4px' }}>
              <button type="button" className="btn" style={{ fontSize: '1rem', fontWeight: 800, padding: '0 9px', lineHeight: 1.5, background: '#fee2e2', borderColor: '#ef4444', color: '#b91c1c' }} title="Zoom out" onClick={() => setGanttZoom(z => Math.max(1, +(z / 1.5).toFixed(2)))}>−</button>
              <span style={{ fontSize: '0.78rem', minWidth: 38, textAlign: 'center', fontWeight: 700, color: '#334155' }}>{Math.round(ganttZoom * 100)}%</span>
              <button type="button" className="btn" style={{ fontSize: '1rem', fontWeight: 800, padding: '0 9px', lineHeight: 1.5, background: '#dbeafe', borderColor: '#3b82f6', color: '#1d4ed8' }} title="Zoom in" onClick={() => setGanttZoom(z => Math.min(20, +(z * 1.5).toFixed(2)))}>+</button>
              <span style={{ marginLeft: 30, fontSize: '0.75rem', color: '#64748b' }}>Total ≈ <strong style={{ color: '#334155' }}>{qtyN > 0 ? fmtTime(Math.round(lotSec)) : '—'}</strong></span>
            </div>
            {/* มือถือ/จอแคบ: เลื่อนทั้งอัน (label+timeline) ในสกอลล์เดียว — ไม่ freeze label เพื่อให้ chart ได้พื้นที่พอดู */}
            {ganttNarrow ? (
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', padding: '8px 0' }}
                dangerouslySetInnerHTML={{ __html: ganttSvgs.full }} />
            ) : (
            <div style={{ display: 'flex', alignItems: 'flex-start', padding: '8px 0' }}>
              <div style={{ flexShrink: 0 }} dangerouslySetInnerHTML={{ __html: ganttSvgs.label }} />
              <div ref={ganttScrollRef} style={{ overflowX: 'auto', flex: 1, minWidth: 0, cursor: CURSOR_GRAB, userSelect: 'none' }}
                onMouseDown={e => { const el = ganttScrollRef.current; if (el) { ganttPanRef.current = { x: e.clientX, left: el.scrollLeft }; el.style.cursor = CURSOR_GRABBING; } if (gtipRef.current) gtipRef.current.style.display = 'none'; }}
                onMouseMove={e => {
                  const el = ganttScrollRef.current;
                  if (el && ganttPanRef.current) { el.scrollLeft = ganttPanRef.current.left - (e.clientX - ganttPanRef.current.x); return; }
                  const tipEl = gtipRef.current; if (!tipEl) return;
                  const hit = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('[data-tip]');
                  const t = hit?.getAttribute('data-tip');
                  if (t) { tipEl.textContent = t; tipEl.style.left = `${e.clientX + 14}px`; tipEl.style.top = `${e.clientY + 14}px`; tipEl.style.display = 'block'; }
                  else tipEl.style.display = 'none';
                }}
                onMouseUp={() => { const el = ganttScrollRef.current; ganttPanRef.current = null; if (el) el.style.cursor = CURSOR_GRAB; }}
                onMouseLeave={() => { const el = ganttScrollRef.current; ganttPanRef.current = null; if (el) el.style.cursor = CURSOR_GRAB; if (gtipRef.current) gtipRef.current.style.display = 'none'; }}
                dangerouslySetInnerHTML={{ __html: ganttSvgs.chart }} />
            </div>
            )}
            <div ref={gtipRef} style={{ position: 'fixed', display: 'none', zIndex: 50, background: '#1e293b', color: '#fff', padding: '7px 10px', borderRadius: 6, fontSize: '0.78rem', lineHeight: 1.5, whiteSpace: 'pre-line', pointerEvents: 'none', boxShadow: '0 6px 20px rgba(0,0,0,.28)', maxWidth: 320 }} />
          </div>
        </div>
      )}


      {/* ตารางผล — รวมทุกสาย มี filter เลือกดูตามสายได้ (ไม่มีคอลัมน์ ผล PASS/FAIL) */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          <h3 className="panel__title panel__title--sm" style={{ margin: 0 }}>📋 Recorded results {shownResults.length > 0 && `(${shownResults.length})`}</h3>
          {!isViewer && (
            <button type="button" className="btn" onClick={record} disabled={recordResult.isPending || steps.length === 0}
              title="Record the current workflow (P/N entered above) into the results table" style={{ background: '#27ae60', borderColor: '#27ae60', color: '#fff', fontWeight: 600, fontSize: '0.82rem' }}>
              {recordResult.isPending ? 'Saving...' : '💾 Record result (current P/N)'}
            </button>
          )}
        </div>
        {/* filter: รวม / Internal / External / Mix */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: 4, background: '#eef2f7', borderRadius: 8, marginBottom: 12, width: 'fit-content' }}>
          {([['all', 'All'], ['internal', '🏭 Internal'], ['external', '🚚 External'], ['mix', '🔀 Mix']] as const).map(([k, label]) => {
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
          {/* tableLayout fixed + colgroup = คอลัมน์/ความสูงนิ่งเวลาเปลี่ยนหน้า (ดู components/TableFill.tsx) */}
          <table className="table" style={{ minWidth: isViewer ? 760 : 850, width: '100%', tableLayout: 'fixed' }}>
            {isViewer ? (
              <colgroup>
                <col style={{ width: '16%' }} />{/* Date/Time */}
                <col style={{ width: '16%' }} />{/* P/N */}
                <col style={{ width: '13%' }} />{/* Customer */}
                <col style={{ width: '13%' }} />{/* Model */}
                <col style={{ width: '30%' }} />{/* Process sequence */}
                <col style={{ width: '12%' }} />{/* Cycle */}
              </colgroup>
            ) : (
              <colgroup>
                <col style={{ width: '14%' }} />{/* Date/Time */}
                <col style={{ width: '14%' }} />{/* P/N */}
                <col style={{ width: '11%' }} />{/* Customer */}
                <col style={{ width: '11%' }} />{/* Model */}
                <col style={{ width: '25%' }} />{/* Process sequence */}
                <col style={{ width: '10%' }} />{/* Cycle */}
                <col style={{ width: '15%' }} />{/* ปุ่มลบ */}
              </colgroup>
            )}
            <thead>
              <tr>
                <th>Date/Time</th><th>P/N</th><th>Customer</th><th>Model</th><th>Process sequence</th><th>Cycle</th>{!isViewer && <th></th>}
              </tr>
            </thead>
            <tbody>
              {shownResults.length === 0 ? (
                <tr><td colSpan={isViewer ? 6 : 7} style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>{results.length === 0 ? 'No recorded results yet — enter P/N + time then press “Record result”' : 'No results for the selected line — press “All” to view everything'}</td></tr>
              ) : pagedResults.map(r => (
                <tr key={r.id}>
                  <td style={{ height: ROW_H, whiteSpace: 'nowrap', fontSize: '0.82rem', color: '#64748b' }}>{fmtDateTime(r.created_at)}</td>
                  <td style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.serial}>{r.serial}</td>
                  <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.customer || undefined}>{r.customer || '—'}</td>
                  <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.model || undefined}>{r.model || '—'}</td>
                  {/* เดิม whiteSpace:normal + wordBreak → ตัดหลายบรรทัด แถวสูงไม่เท่ากัน · เปลี่ยนเป็นบรรทัดเดียว + … (hover ดูเต็ม) */}
                  <td style={{ fontSize: '0.8rem', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.sequence || undefined}>{r.sequence || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtTime(r.total_sec)}</td>
                  {!isViewer && (
                    <td><button className="btn danger" style={{ padding: '4px 10px', fontSize: '0.78rem' }} onClick={async () => { if (await confirmDialog(`Delete result ${r.serial}?`)) delResult.mutate(r.id); }}>Delete</button></td>
                  )}
                </tr>
              ))}
              {/* เติมแถวว่างให้ครบหน้า — ตารางสูงคงที่ ปุ่มเปลี่ยนหน้าไม่ขยับ */}
              <FillerRows count={fillerCount(pagedResults.length, RES_PAGE_SIZE, resTotalPages)} cols={isViewer ? 6 : 7} />
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
                revNo: fm.revNo, revDesc: fm.revDesc, revDate: new Date().toLocaleDateString('en-GB'),
                timeHtml: buildTimeDetailHtml(steps, qtyN),   // หน้า 2 = รายละเอียดเวลา
              });
            } else {
              // PDF = กางครบทุกสถานี (ไม่ส่ง collapsed → ทุกกลุ่มกาง) · จัดกลุ่มตามที่ผู้ใช้ตั้ง
              exportFlowchartPdf(buildGanttSvg(steps, qtyN).full, { title: 'Manufacturing Workflow — Gantt', filename: fm.filename, customer: fm.customer, model: fm.model, pn: fm.pn, timeHtml: buildTimeDetailHtml(steps, qtyN) });
            }
            setExportMode(null);
          }}
        />
      )}
    </div>
  );
}
