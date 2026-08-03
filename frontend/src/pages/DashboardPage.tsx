import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { usePpProjects, usePpDelete, usePpUpdate, usePpCreate, PP_STATUS, PP_STATUS_LABEL, ppYield, type PpProject } from '../lib/ppApi';
import { useIsViewer } from '../lib/useMockStore';
import { showToast } from '../lib/toast';
import { confirmDialog } from '../lib/confirm';
import { Paginator } from '../components/Paginator';
import { ROW_H_DENSE, fillerCount, FillerRows } from '../components/TableFill';
import { FactoryOverview } from '../components/FactoryOverview';
import { TableState } from '../components/DataStates';
import { FileNamePromptModal } from '../components/FileNamePromptModal';
import { SYNTECH_LOGO_PNG_BASE64 } from '../assets/syntechLogo';
import {
  STATUS_STYLE, DUE_SOON_DAYS, exportXlsx, exportGanttXlsx, StatCard, BarRow, ChartCard, Donut, GanttChart, ProjectFormModal,
  DASH_COLUMNS, PROCESS_STEPS, PROCESS_KEYS, buildHeaderRows, todayLocal,
} from '../components/ppParts';
import { StationMonitorWidget } from '../components/StationMonitorWidget';
import { WoOverviewWidget } from '../components/WoOverviewWidget';
import { splitPics, hdrStyle, colWidthPx, ColumnFilterField, rowOnProcessOnly, rowHasDelay, renderCell } from './dashboard/dashboardCells';
import { ProductDetailModal } from './dashboard/ProductPopups';
import { printPdf, KpiCard, FgNgByJob, smoothScrollTo, ProcessEventPopup, StatusColorPopup } from './dashboard/DashboardWidgets';

export function DashboardPage() {
  const isViewer = useIsViewer();
  const { data: allRows = [], isLoading, isError, refetch } = usePpProjects({});          // แหล่งข้อมูลเดียว — กรองฝั่ง client ทั้งหมด (dropdown filter ที่หัวตาราง)
  const [colFilters, setColFilters] = useState<Record<string, Set<string>>>({});   // key: status/customer/work_order/model → ค่าที่เลือก (ว่าง = ไม่กรอง)
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [openFilterCol, setOpenFilterCol] = useState<string | null>(null);
  const toggleFilterValue = (col: string, v: string) => {
    setColFilters(prev => {
      const next = new Set(prev[col]);
      next.has(v) ? next.delete(v) : next.add(v);
      return { ...prev, [col]: next };
    });
    setPage(1);
  };
  const clearFilterCol = (col: string) => { setColFilters(prev => ({ ...prev, [col]: new Set() })); setPage(1); };
  const del = usePpDelete();
  const create = usePpCreate();
  const ppUpdate = usePpUpdate();
  // คลิกช่อง Status/Process ในตาราง → เปลี่ยนสี + บันทึกลง backend (my-api) · optimistic ให้เปลี่ยนทันที
  const [procEdit, setProcEdit] = useState<{ p: PpProject; key: string } | null>(null);   // popup บันทึก process 1 step
  const [colorPick, setColorPick] = useState<{ p: PpProject; top: number; left: number } | null>(null);   // palette เลือกสี Status
  const toggleCheck = (p: PpProject, key: string) => {
    const change: any = { [key]: !(p as any)[key] };
    const merged = { ...p, ...change };
    queryClient.setQueriesData({ queryKey: ['pp-projects'] }, (old: any) => Array.isArray(old) ? old.map((r: any) => r.id === p.id ? merged : r) : old);
    // ส่งเฉพาะ field ที่เปลี่ยน (ไม่ส่งทั้งแถว) → คนละคนแก้คนละช่องบนแถวเดียวกันไม่ทับกัน (กัน lost-update)
    ppUpdate.mutate({ id: p.id, ...change }, { onError: (e: any) => { showToast(e?.message || 'Update failed', 'error'); void queryClient.invalidateQueries({ queryKey: ['pp-projects'] }); } });
  };
  // บันทึกสี Status ที่เลือกจาก palette (ทับ status_color เท่านั้น ชื่อสถานะเดิมไม่เปลี่ยน)
  const pickStatusColor = (p: PpProject, color: string) => {
    const merged = { ...p, status_color: color };
    queryClient.setQueriesData({ queryKey: ['pp-projects'] }, (old: any) => Array.isArray(old) ? old.map((r: any) => r.id === p.id ? merged : r) : old);
    ppUpdate.mutate({ id: p.id, status_color: color }, { onError: (e: any) => { showToast(e?.message || 'Update failed', 'error'); void queryClient.invalidateQueries({ queryKey: ['pp-projects'] }); } });
    setColorPick(null);
  };
  // ── Inline quick-edit — patch เฉพาะ field ที่เปลี่ยน (optimistic เหมือน toggleCheck) ──
  const applyPatch = (p: PpProject, patch: Record<string, any>) => {
    const merged = { ...p, ...patch };
    queryClient.setQueriesData({ queryKey: ['pp-projects'] }, (old: any) => Array.isArray(old) ? old.map((r: any) => r.id === p.id ? merged : r) : old);
    ppUpdate.mutate({ id: p.id, ...patch } as any, { onError: (e: any) => { showToast(e?.message || 'Update failed', 'error'); void queryClient.invalidateQueries({ queryKey: ['pp-projects'] }); } });
  };
  const INLINE_FIELD: Record<string, string> = { pd_finish: 'pd_finish_date', expected: 'expected_date', revised: 'revised_date', target_per_day: 'target_per_day', store: 'store_received', store_received: 'store_received', qa_test_rate: 'qa_test_rate', remark: 'remark' };
  const inlineSave = (p: PpProject, key: string, value: number | string) => {
    const field = INLINE_FIELD[key] || key;
    const patch: Record<string, any> = { [field]: value };

    // CAP/Day (กำลังผลิตต่อวัน) — เซฟตามที่ทีมกำหนด (ไม่คำนวณ Expected Date อัตโนมัติ ปล่อยให้เป็นดุลพินิจทีม)
    if (field === 'target_per_day') {
      patch.target_per_day = Math.max(0, Number(value));
    }
    // คำนวณจำนวนคงเหลือ FG/NG + Auto-Done เมื่อผลิตครบ Qty
    else if (field === 'produce') {
      const qty = Number(p.qty || 0);
      const produce = Math.min(Math.max(0, Number(value)), qty > 0 ? qty : Infinity);   // Produced ≤ Qty
      const currentOk = Number(p.total_ok || 0);
      const fg = currentOk === 0 ? produce : Math.min(currentOk, produce);              // Auto-fill FG
      patch.produce = produce; patch.total_ok = fg; patch.total_ng = Math.max(0, produce - fg);

      // ถ้าผลิตครบตามเป้า Qty → ปิดงาน (DONE) + เติมวันเสร็จให้อัตโนมัติทันที!
      if (produce > 0 && qty > 0 && produce === qty && !p.pd_finish_date) {
        const today = todayLocal();
        patch.pd_finish_date = today;
        patch.status = 'DONE'; patch.status_color = 'DONE';
        PROCESS_STEPS.forEach(s => { const cur = (p as any)[s.key]; if (cur && cur !== 'DONE' && cur !== 'CANCEL') patch[s.key as string] = 'DONE'; });
        showToast('🎉 Production target reached! Status automatically set to DONE', 'success');
      }
    } else if (field === 'total_ok') {
      const produce = Number(p.produce || 0);
      const fg = Math.min(Math.max(0, Number(value)), produce);                   // FG ≤ Produced
      patch.total_ok = fg; patch.total_ng = Math.max(0, produce - fg);
    } else if (field === 'total_ng') {
      const produce = Number(p.produce || 0);
      const ng = Math.min(Math.max(0, Number(value)), produce);                   // NG ≤ Produced
      patch.total_ng = ng; patch.total_ok = Math.max(0, produce - ng);
    }
    // ใส่ PD Done (วันเสร็จจริง) → งานเสร็จ: status=DONE + process ที่กำลังทำ/มีข้อมูล → DONE + เพิ่ม event DONE ลง log ให้ Gantt เขียวถึงปลายแท่ง
    if (field === 'pd_finish_date' && value) {
      if (Number(p.produce || 0) < Number(p.qty || 0)) {   // ต้องผลิตครบก่อน ค่อยปิดงาน
        showToast('Production must be complete (Produced = Quantity) before you can close the job (PD Done)', 'error');
        return;
      }
      patch.status = 'DONE'; patch.status_color = 'DONE';
      PROCESS_STEPS.forEach(s => { const cur = (p as any)[s.key]; if (cur && cur !== 'DONE' && cur !== 'CANCEL') patch[s.key as string] = 'DONE'; });
      const log = Array.isArray(p.process_log) ? [...p.process_log] : [];
      if (!log.length || log[log.length - 1].status !== 'DONE') {
        const lastStep = ([...PROCESS_STEPS].reverse().find(s => (p as any)[s.key])?.key as string) || 'pc_packing';
        log.push({ date: String(value).slice(0, 10), step: lastStep, status: 'DONE', note: 'PD Done' });
        patch.process_log = log;
      }
    }
    applyPatch(p, patch);
  };
  // คลิกช่อง Process → เปิด popup เลือกสถานะ+วันที่ · คลิกช่อง Status → เปิด palette สีลอยตรงจุดที่คลิก
  const onCellClick = (p: PpProject, key: string, e?: React.MouseEvent<HTMLElement>) => {
    if (PROCESS_KEYS.has(key)) setProcEdit({ p, key });
    else if (key === 'status') {
      const rect = e?.currentTarget.getBoundingClientRect();
      setColorPick({ p, top: rect ? rect.bottom + 4 : 100, left: rect ? rect.left : 100 });
    }
    else toggleCheck(p, key);
  };
  // บันทึก process 1 step: ตั้งค่าสถานะปัจจุบัน + เพิ่ม event (วันที่) ลง process_log → PUT
  const saveProc = (p: PpProject, key: string, status: string, date: string, note: string) => {
    const log = Array.isArray(p.process_log) ? [...p.process_log] : [];
    log.push({ date, step: key, status, ...(note.trim() ? { note: note.trim() } : {}) });
    const merged = { ...p, [key]: status, process_log: log };
    queryClient.setQueriesData({ queryKey: ['pp-projects'] }, (old: any) => Array.isArray(old) ? old.map((r: any) => r.id === p.id ? merged : r) : old);
    ppUpdate.mutate({ id: p.id, [key]: status, process_log: log }, { onError: (e: any) => { showToast(e?.message || 'Save failed', 'error'); void queryClient.invalidateQueries({ queryKey: ['pp-projects'] }); } });
    setProcEdit(null);
  };
  const queryClient = useQueryClient();
  const [updatedAt, setUpdatedAt] = useState(() => new Date());
  // รีเฟรชข้อมูลทั้ง dashboard ทุก 10 วินาที + อัปเดตเวลา
  useEffect(() => {
    const t = setInterval(() => { void queryClient.invalidateQueries({ queryKey: ['pp-projects'] }); setUpdatedAt(new Date()); }, 10000);
    return () => clearInterval(t);
  }, [queryClient]);
  const [edit, setEdit] = useState<PpProject | null>(null);
  const [detail, setDetail] = useState<PpProject | null>(null);   // ป๊อปอัพรายละเอียดสินค้า (คลิก Product P/N)
  const [saveAs, setSaveAs] = useState<'xlsx' | 'pdf' | null>(null);   // เปิดป๊อปอัพตั้งชื่อไฟล์ก่อนโหลด
  const [page, setPage] = useState(1);
  const [ppTab, setPpTab] = useState<'internal' | 'external'>('internal');   // แท็บงานภายใน/ภายนอก (External ยังใช้ข้อมูลชุดเดียวกันไปก่อน)
  const [adding, setAdding] = useState(false);   // เปิดฟอร์มเพิ่มโปรเจกต์ (พรีเซ็ต Type ตามแท็บที่เปิด)
  const PAGE = 10;

  // เปิดรายละเอียดสินค้าอัตโนมัติเมื่อมากับ ?pp=<id> (ลิงก์จากหน้า Activities)
  const [params, setParams] = useSearchParams();
  const ppParam = params.get('pp');
  useEffect(() => {
    if (!ppParam) return;
    const proj = allRows.find(r => String(r.id) === ppParam);
    if (proj) { setDetail(proj); const n = new URLSearchParams(params); n.delete('pp'); setParams(n, { replace: true }); }
  }, [ppParam, allRows]);   // eslint-disable-line react-hooks/exhaustive-deps

  // แยกข้อมูลตามแท็บ Internal/External (pp_type) — ทุกอย่าง (KPI/filter/ตาราง/gantt) คิดจากชุดของแท็บที่เลือก
  const tabRows = useMemo(() => allRows.filter(r => ((r as any).pp_type || 'internal') === ppTab), [allRows, ppTab]);
  // ตัวเลือกที่มีอยู่จริงในข้อมูล — ใช้เติม dropdown filter ที่หัวตาราง (Status ใช้ PP_STATUS คงที่แทน)
  const customers = useMemo(() => [...new Set(tabRows.map(r => r.customer).filter(Boolean))], [tabRows]);
  const workOrders = useMemo(() => [...new Set(tabRows.map(r => r.work_order).filter(Boolean))], [tabRows]);
  const models = useMemo(() => [...new Set(tabRows.map(r => r.model).filter(Boolean))], [tabRows]);
  // #3: รายชื่อคน (รายบุคคล) — แตกช่องที่มีหลายคน + รวมชื่อซ้ำแบบไม่สนตัวพิมพ์ (Kiert/kiert = คนเดียว)
  const pics = useMemo(() => {
    const seen = new Map<string, string>();   // lowercase key → display แรกที่เจอ
    tabRows.forEach(r => splitPics(r.pd_pic).forEach(n => { const k = n.toLowerCase(); if (!seen.has(k)) seen.set(k, n); }));
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [tabRows]);

  // Filter ย่อยของ "On process" — ขยายเลือกได้ว่า process step ไหนบ้างที่กำลัง ON_PROCESS อยู่
  const [procStepFilter, setProcStepFilter] = useState<Set<string>>(new Set());
  const toggleProcStep = (key: string) => {
    setProcStepFilter(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
    setPage(1);
  };
  // "เลือกทั้งหมด" ในเมนู On process = เลือก On process (สถานะ) ตรงๆ + ล้างการเลือก step ย่อย
  const toggleProcStepAll = () => {
    setProcStepFilter(new Set());
    toggleFilterValue('status', 'ON_PROCESS');   // toggle สถานะ On process (setPage(1) อยู่ในนี้แล้ว)
  };

  // กรองจากชุดของแท็บ (tabRows) ตาม colFilters (เลือกได้หลายค่า) + ช่วงวันที่ + process step ย่อย
  const rows = useMemo(() => tabRows.filter(r => {
    // สถานะ: "On process" = แถวที่มี step ไหนก็ได้กำลัง ON_PROCESS (หรือ status บนสุด = ON_PROCESS) — ไม่ใช่แค่ status ตรงตัว
    // สถานะอื่น (Done/Delay/Cancel) เทียบ status ตรงตัวเหมือนเดิม · หลายสถานะ = OR กัน
    if (colFilters.status?.size) {
      const matchStatus = [...colFilters.status].some(st => st === 'ON_PROCESS' ? rowOnProcessOnly(r) : r.status === st);
      if (!matchStatus) return false;
    }
    if (colFilters.customer?.size && !colFilters.customer.has(r.customer)) return false;
    if (colFilters.work_order?.size && !colFilters.work_order.has(r.work_order)) return false;
    if (colFilters.model?.size && !colFilters.model.has(r.model)) return false;
    if (colFilters.pd_pic?.size) {
      // ฟิลเตอร์ตามคน: แถวที่มี "คนที่เลือก" อยู่ในช่อง (แม้ช่องนั้นมีหลายคน) ก็ติด · เทียบแบบไม่สนตัวพิมพ์
      const sel = new Set([...colFilters.pd_pic].map(s => s.toLowerCase()));
      if (!splitPics(r.pd_pic).some(n => sel.has(n.toLowerCase()))) return false;
    }
    if (procStepFilter.size && ![...procStepFilter].some(k => (r as any)[k] === 'ON_PROCESS')) return false;
    if (dateFrom && (!r.date_record || r.date_record < dateFrom)) return false;
    if (dateTo && (!r.date_record || r.date_record > dateTo)) return false;
    return true;
  }), [tabRows, colFilters, procStepFilter, dateFrom, dateTo]);
  // เรียงตามวันที่สร้าง (created_at) — ใหม่สุดขึ้นก่อน
  const sortedRows = useMemo(() => [...rows].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))), [rows]);
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE));
  // กันค้างหน้าเปล่า: ถ้า list หด (auto-refresh/ลบ/กรอง) จนหน้าเกิน ให้ดึงกลับหน้าสุดท้ายอัตโนมัติ
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const paged = sortedRows.slice((page - 1) * PAGE, page * PAGE);
  const hasFilter = Object.values(colFilters).some(s => s && s.size > 0) || procStepFilter.size > 0 || !!dateFrom || !!dateTo;
  const clearAllFilters = () => { setColFilters({}); setProcStepFilter(new Set()); setDateFrom(''); setDateTo(''); setPage(1); };

  // กดการ์ด → ตั้งตัวกรองสถานะ + ค่อยๆ เลื่อนหน้าจอลงมาให้เห็นตารางที่ถูกกรอง (กราฟย้ายไปใต้ตารางแล้ว จึงเลื่อนมาที่ตารางแทน)
  const chartsRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const isStatusOnly = (v: string) => colFilters.status?.size === 1 && colFilters.status.has(v);
  const selectStatus = (v: string) => {
    setColFilters(prev => ({ ...prev, status: v ? new Set([v]) : new Set() }));
    setPage(1);
    // รอ 1 เฟรมให้ DOM อัปเดตก่อน แล้วค่อย ๆ เลื่อน (custom smooth — กัน behavior:'smooth' วาป/ไม่ทำงาน)
    requestAnimationFrame(() => {
      const el = tableRef.current;
      if (!el) return;
      const headerOffset = 72; // topbar 60px + เผื่อระยะ
      const target = Math.max(0, el.getBoundingClientRect().top + window.scrollY - headerOffset);
      smoothScrollTo(target, 700);
    });
  };

  // การ์ด KPI — คิดจากชุดของแท็บ (tabRows ภาพรวมทั้งแท็บ ไม่ขึ้นกับ filter) · On process = step ใดก็ได้ ON_PROCESS
  const agg = useMemo(() => {
    const by = (s: string) => s === 'ON_PROCESS' ? tabRows.filter(rowOnProcessOnly).length : tabRows.filter(r => r.status === s).length;
    const ys = tabRows.map(ppYield).filter((v): v is number => v != null);
    const avgYield = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : null;
    return { total: tabRows.length, done: by('DONE'), onProc: by('ON_PROCESS'), delay: by('DELAY'), cancel: by('CANCEL'), avgYield };
  }, [tabRows]);

  // กราฟ — คิดจาก rows (ตามตัวกรองที่เลือก) เพื่อให้กราฟตรงกับสิ่งที่กรองในตาราง · On process = step ใดก็ได้ ON_PROCESS
  const chart = useMemo(() => {
    const by = (s: string) => s === 'ON_PROCESS' ? rows.filter(rowOnProcessOnly).length : rows.filter(r => r.status === s).length;
    const totalOk = rows.reduce((s, r) => s + (r.total_ok || 0), 0);
    const totalNg = rows.reduce((s, r) => s + (r.total_ng || 0), 0);
    const byStatus = PP_STATUS.map(s => ({ label: PP_STATUS_LABEL[s], value: by(s), color: STATUS_STYLE[s].text }));
    const cm: Record<string, number> = {};
    rows.forEach(r => { const c = r.customer || '(N/A)'; cm[c] = (cm[c] || 0) + 1; });
    const byCustomer = Object.entries(cm).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
    // Total output รายงาน — ชื่องาน + FG/NG (เรียงยอดผลิตมาก→น้อย, เอาเฉพาะงานที่มี output, สูงสุด 10 งาน)
    const byJob = rows
      .map(r => ({ name: r.model || r.product_pn || `#${r.id}`, fg: r.total_ok || 0, ng: r.total_ng || 0 }))
      .filter(j => j.fg + j.ng > 0)
      .sort((a, b) => (b.fg + b.ng) - (a.fg + a.ng))
      .slice(0, 10);
    return { totalOk, totalNg, byStatus, byCustomer, byJob };
  }, [rows]);

  async function handleDelete(p: PpProject) {
    if (!(await confirmDialog(`Delete project "${p.product_pn || p.model}"?`, { title: 'Delete project', confirmText: 'Delete', danger: true }))) return;
    del.mutate(p.id, {
      onSuccess: () => {
        setPage(1);
        // Undo = สร้าง record คืน (ได้ id ใหม่ · ประวัติเดิมไม่ตามมา)
        const { id, created_at, updated_at, ...data } = p as any;
        showToast('Deleted', 'info', { label: 'Undo', onClick: () => create.mutate(data, { onSuccess: () => showToast('Restored', 'success'), onError: (e: any) => showToast(e?.message || 'Restore failed', 'error') }) });
      },
      onError: (e: any) => showToast(e.message, 'error'),
    });
  }

  const maxCust = Math.max(1, ...chart.byCustomer.map(x => x.value));
  const { groupRow, subRow } = buildHeaderRows(DASH_COLUMNS);   // ตาราง Dashboard ตัด STATUS pipeline (excelOnly) ออก
  const colCount = DASH_COLUMNS.length + 1 + (isViewer ? 0 : 1);   // +1 = คอลัมน์ลำดับ (#)

  return (
    <section className="stack-lg">
      {/* แถบหัว Dashboard แบรนด์ SYNTECH — โลโก้ + เขียว + ข้อมูลสด */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, background: 'linear-gradient(90deg, var(--brand), var(--brand-dark))', color: '#fff', padding: '14px 20px', borderRadius: 12, boxShadow: '0 4px 14px rgba(46,125,79,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ background: '#fff', borderRadius: 8, padding: '6px 12px', display: 'inline-flex', alignItems: 'center' }}>
            <img src={`data:image/png;base64,${SYNTECH_LOGO_PNG_BASE64}`} alt="SYNTECH" style={{ height: 26, display: 'block' }} />
          </span>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.3px' }}>Production Dashboard</h1>
        </div>
        <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.92)', display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          <span style={{ width: 9, height: 9, borderRadius: 99, background: '#86efac', display: 'inline-block', boxShadow: '0 0 0 3px rgba(134,239,172,0.3)' }} />
          Updated {updatedAt.toLocaleTimeString('en-GB')}
        </span>
      </div>

      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 className="panel__title">📋 Production Plan</h1>
          </div>
        </div>

        {/* KPI — กดเพื่อกรองสถานะ (เลื่อนหน้าจอลงมาให้เห็นกราฟ+ตารางที่กรอง) */}
        <div className="dash-grid-3" style={{ marginTop: '0.75rem' }}>
          <KpiCard icon="📦" label="All" value={agg.total} accent="#2e7d4f" onClick={() => selectStatus('')} active={!colFilters.status?.size} />
          <KpiCard icon="✅" label="Done" value={agg.done} accent="#16a34a" onClick={() => selectStatus('DONE')} active={isStatusOnly('DONE')} />
          <KpiCard icon="⚙️" label="On process" value={agg.onProc} accent="#2563eb" onClick={() => selectStatus('ON_PROCESS')} active={isStatusOnly('ON_PROCESS')} />
          <KpiCard icon="⏰" label="Delay" value={agg.delay} accent="#ea580c" onClick={() => selectStatus('DELAY')} active={isStatusOnly('DELAY')} />
          <KpiCard icon="🚫" label="Cancel" value={agg.cancel} accent="#64748b" onClick={() => selectStatus('CANCEL')} active={isStatusOnly('CANCEL')} />
          <StatCard icon="🎯" label="Avg Yield Good" value={agg.avgYield == null ? '—' : `${agg.avgYield.toFixed(1)}%`} accent="#b58100" />
        </div>
      </div>

      {/* ตาราง + filter + export */}
      <div className="panel" ref={tableRef} style={{ scrollMarginTop: 'calc(var(--topbar-h) + 12px)' }}>
        {/* Production Plan + แท็บ Internal / External (segmented control) — ตอนนี้ External ใช้ข้อมูลชุดเดียวกับ Internal ไปก่อน */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>Production Plan</h2>
          <div style={{ display: 'inline-flex', gap: 4, background: '#eef2f7', borderRadius: 9, padding: 4 }}>
            {(['internal', 'external'] as const).map(t => (
              <button key={t} type="button" onClick={() => { setPpTab(t); setPage(1); }}
                style={{
                  padding: '6px 18px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', fontFamily: 'inherit',
                  background: ppTab === t ? '#fff' : 'transparent', color: ppTab === t ? 'var(--brand)' : 'var(--text-muted)',
                  boxShadow: ppTab === t ? '0 1px 3px rgba(15,23,42,0.14)' : 'none', transition: 'all 0.12s',
                }}>
                {t === 'internal' ? 'Internal' : 'External'}
              </button>
            ))}
          </div>
        </div>

        <div className="dash-grid-3">   {/* filter แถวละ 3 เท่าๆ กัน (6 ช่อง = 2 แถวสมส่วน) — Status/Customer/WO/Model เป็น dropdown เลือกหลายค่า+เสิร์ชได้ */}
          <ColumnFilterField label="Status" options={[...PP_STATUS]} labelFor={v => PP_STATUS_LABEL[v] ?? v}
            selected={colFilters.status ?? new Set()} onToggle={v => toggleFilterValue('status', v)}
            onClear={() => { clearFilterCol('status'); setProcStepFilter(new Set()); }}
            colKey="status" openKey={openFilterCol} setOpenKey={setOpenFilterCol}
            expandKey="ON_PROCESS" expandItems={PROCESS_STEPS.map(s => ({ key: s.key as string, label: s.label }))}
            expandSelected={procStepFilter} onToggleExpandItem={toggleProcStep} onToggleExpandAll={toggleProcStepAll}
            expandAllChecked={colFilters.status?.has('ON_PROCESS') ?? false} />
          <ColumnFilterField label="Customer" options={customers}
            selected={colFilters.customer ?? new Set()} onToggle={v => toggleFilterValue('customer', v)} onClear={() => clearFilterCol('customer')}
            colKey="customer" openKey={openFilterCol} setOpenKey={setOpenFilterCol} />
          <ColumnFilterField label="WO" options={workOrders}
            selected={colFilters.work_order ?? new Set()} onToggle={v => toggleFilterValue('work_order', v)} onClear={() => clearFilterCol('work_order')}
            colKey="work_order" openKey={openFilterCol} setOpenKey={setOpenFilterCol} />
          <ColumnFilterField label="Model" options={models}
            selected={colFilters.model ?? new Set()} onToggle={v => toggleFilterValue('model', v)} onClear={() => clearFilterCol('model')}
            colKey="model" openKey={openFilterCol} setOpenKey={setOpenFilterCol} />
          <ColumnFilterField label="PIC" options={pics}
            selected={colFilters.pd_pic ?? new Set()} onToggle={v => toggleFilterValue('pd_pic', v)} onClear={() => clearFilterCol('pd_pic')}
            colKey="pd_pic" openKey={openFilterCol} setOpenKey={setOpenFilterCol} />
          <label className="field"><span>From date</span><input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} /></label>
          <label className="field"><span>To date</span><input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} /></label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', margin: '12px 0 0.75rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{rows.length} projects</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {hasFilter && <button type="button" className="btn secondary" style={{ fontSize: '0.82rem' }} onClick={clearAllFilters}>Clear filter</button>}
            {!isViewer && <button type="button" className="btn" style={{ fontSize: '0.82rem' }} onClick={() => setAdding(true)}>+ Add Project</button>}
            <button type="button" className="btn secondary" title="Download as an Excel file in the FM03 format (logo + colors)" style={{ fontSize: '0.82rem' }} disabled={rows.length === 0} onClick={() => setSaveAs('xlsx')}>⬇️ Export to Excel</button>
          </div>
        </div>

        {/* แถบ legend สี — บอกความหมายแต่ละสีในตาราง (สีจริงจาก STATUS_STYLE) */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', margin: '0 0 0.75rem', fontSize: '0.8rem', color: 'var(--text-body)' }}>
          {[
            { label: 'Done', s: STATUS_STYLE.DONE },
            { label: 'On process', s: STATUS_STYLE.ON_PROCESS },
            { label: `Due soon (≤${DUE_SOON_DAYS}d)`, s: STATUS_STYLE.ORANGE },
            { label: 'Delay', s: STATUS_STYLE.DELAY },
            { label: 'Waiting', s: STATUS_STYLE.WAIT },
          ].map(x => (
            <span key={x.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 22, height: 14, borderRadius: 3, background: x.s.bg, border: `1px solid ${x.s.border}`, display: 'inline-block' }} />
              {x.label}
            </span>
          ))}
        </div>

        <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 8 }}>
          <table className="table table--grid table--dense" style={{ minWidth: 1408, width: '100%', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 44 }} />
              {DASH_COLUMNS.map(c => <col key={c.key} style={{ width: colWidthPx(c) }} />)}
              {!isViewer && <col style={{ width: 110 }} />}
            </colgroup>
            <thead>
              <tr>
                <th rowSpan={2} style={{ textAlign: 'center' }}>#</th>
                {groupRow.map((h, i) => <th key={i} colSpan={h.colSpan} rowSpan={h.rowSpan} style={hdrStyle(h)}>{h.label}</th>)}
                {!isViewer && <th rowSpan={2} style={{ textAlign: 'center' }}>Actions</th>}
              </tr>
              <tr>
                {subRow.map((h, i) => <th key={i} style={hdrStyle(h)}>{h.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableState colSpan={colCount} state="loading" />
              ) : isError ? (
                <TableState colSpan={colCount} state="error" onRetry={() => refetch()} />
              ) : paged.length === 0 ? (
                <TableState colSpan={colCount} state="empty" emptyText={hasFilter ? 'No matching records — click “Clear filter” to show all' : 'No data yet — click “+ Add Project” to start'} />
              ) : paged.map((p, idx) => {
                const y = ppYield(p);
                const no = (page - 1) * PAGE + idx + 1;   // ลำดับต่อเนื่องข้ามหน้า
                return (
                  <tr key={p.id} style={rowHasDelay(p) ? { background: '#fff7ed', boxShadow: 'inset 3px 0 0 #ea580c' } : undefined}>
                    <td style={{ height: ROW_H_DENSE, textAlign: 'center', color: '#94a3b8', fontWeight: 700 }}>{no}</td>
                    {DASH_COLUMNS.map(c => renderCell(c, p, y, () => setDetail(p), isViewer ? undefined : (key, e) => onCellClick(p, key, e), isViewer ? undefined : (key, value) => inlineSave(p, key, value)))}
                    {!isViewer && (
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                          <button type="button" className="btn secondary" style={{ padding: '3px 10px', fontSize: '0.75rem' }} onClick={() => setEdit(p)}>Edit</button>
                          <button type="button" className="btn danger" style={{ padding: '3px 10px', fontSize: '0.75rem' }} onClick={() => handleDelete(p)}>Delete</button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              {/* เติมแถวว่างให้ครบหน้า — ตารางสูงคงที่ ปุ่มเปลี่ยนหน้าไม่ขยับ
                  (ตารางนี้มี tableLayout: fixed อยู่แล้ว → คอลัมน์นิ่งแต่เดิม) */}
              <FillerRows count={fillerCount(paged.length, PAGE, totalPages)} cols={colCount} rowH={ROW_H_DENSE} />
            </tbody>
          </table>
        </div>
        <Paginator page={page} totalPages={totalPages} onPage={setPage} total={rows.length} />
      </div>

      {/* กราฟ — ตามตัวกรองที่เลือก (ย้ายมาอยู่ใต้ตารางตามที่ขอ · ref ไว้เลื่อนหน้าจอมาตรงนี้ตอนกดการ์ด KPI) */}
      <div className="dash-grid-3" ref={chartsRef} style={{ scrollMarginTop: 'calc(var(--topbar-h) + 12px)' }}>
        <ChartCard title="Status breakdown">
          <Donut data={chart.byStatus} />
        </ChartCard>
        <ChartCard title="Customer">
          {chart.byCustomer.length ? chart.byCustomer.map(c => <BarRow key={c.label} label={c.label} value={c.value} max={maxCust} color="#2e7d4f" />) : <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>—</div>}
        </ChartCard>
        <ChartCard title="Total output">
          <FgNgByJob jobs={chart.byJob} />
        </ChartCard>
      </div>

      {/* Gantt — ไทม์ไลน์การผลิตรายวัน (ใต้ตาราง Production Plan · ตามตัวกรองปัจจุบัน) */}
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: '1rem' }}>
          <div>
            <h1 className="panel__title">📊 Gantt Chart — Production Plan</h1>
          </div>
          {/* คำอธิบายสี (legend) + ปุ่ม export */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {PP_STATUS.map(s => (
              <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: STATUS_STYLE[s].bg, border: `1px solid ${STATUS_STYLE[s].border}` }} />
                {PP_STATUS_LABEL[s]}
              </span>
            ))}
            <button type="button" className="btn secondary" style={{ fontSize: '0.82rem' }} disabled={sortedRows.length === 0} onClick={() => exportGanttXlsx(sortedRows, `gantt-${new Date().toISOString().slice(0, 10)}.xlsx`)}>⬇️ Export Gantt</button>
          </div>
        </div>
        <GanttChart rows={sortedRows} />
      </div>

      {/* สรุปข้ามโมดูล — ใต้ Production Plan */}
      <FactoryOverview />

      {/* #54: Work Orders Overview — ความคืบหน้าใบสั่งผลิต (target/done/yield) จาก /api/planning/wo-overview */}
      <WoOverviewWidget />

      {/* #52: WIP รายสถานีแบบสด (poll 8 วิ) — ล่างสุดของหน้า */}
      <StationMonitorWidget />

      {edit && <ProjectFormModal initial={edit} onClose={() => setEdit(null)} />}
      {adding && <ProjectFormModal initial={null} defaultType={ppTab} onClose={() => setAdding(false)} />}
      {detail && <ProductDetailModal p={detail} onClose={() => setDetail(null)} />}
      {procEdit && <ProcessEventPopup p={procEdit.p} stepKey={procEdit.key} onClose={() => setProcEdit(null)} onSave={(status, date, note) => saveProc(procEdit.p, procEdit.key, status, date, note)} />}
      {colorPick && <StatusColorPopup p={colorPick.p} pos={colorPick} onClose={() => setColorPick(null)} onPick={color => pickStatusColor(colorPick.p, color)} />}
      {saveAs && (
        <FileNamePromptModal
          title={saveAs === 'xlsx' ? '⬇️ Save as Excel' : '🖨️ Save as PDF'}
          defaultBase={`production-plan-${new Date().toISOString().slice(0, 10)}`}
          ext={saveAs}
          onCancel={() => setSaveAs(null)}
          onConfirm={(name) => { if (saveAs === 'xlsx') void exportXlsx(sortedRows, name); else printPdf(sortedRows, name); setSaveAs(null); }}
        />
      )}
    </section>
  );
}
