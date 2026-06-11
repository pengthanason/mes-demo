import { supabase } from './supabase';

export type WoStep = 'DRAFT' | 'OPEN' | 'READY' | 'RUNNING' | 'WAIT_FAI_QA' | 'WAIT_FAI_MGR' | 'CLOSED';
export type UserRole = 'admin' | 'member' | 'viewer';

export interface MockWO {
  woId: string;
  productCode: string;
  customer: string;
  qty: number;
  currentStep: WoStep;
  station: string;
  createdAt: string;
  updatedAt: string;
  qtyGood: number;
  faiInspector?: string;
  faiApprover?: string;
  faiPassed?: boolean;
  actualQty?: number;
}

export interface ObaRecord {
  id: string;
  woId: string;
  lotNo: string;
  sampleQty: number;
  result: 'PASS' | 'FAIL';
  defectNote: string;
  timestamp: string;
}

export interface AuthState {
  isLoggedIn: boolean;
  username: string;
  role: UserRole;
}

export interface RoutingRecord {
  id: string;
  ts: string;
  serial: string;
  sequence: string;
  result: string;
  totalSec: number;
}

export interface QcRecord {
  id: string;
  sn: string;
  status: string;
  time: string;
  error: string | null;
}

export interface ProductionReport {
  id: string;
  code: string;
  customer: string;
  status: string;
  qty: number;
  delivery: string;
  stage: string;
  isCompleted: boolean;
}

// ── Column mappers ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toMockWO(row: any): MockWO {
  return {
    woId:         row.wo_id,
    productCode:  row.product_code,
    customer:     row.customer,
    qty:          row.qty,
    currentStep:  row.current_step as WoStep,
    station:      row.station,
    createdAt:    row.created_at,
    updatedAt:    row.updated_at,
    qtyGood:      row.qty_good ?? 0,
    faiInspector: row.fai_inspector ?? undefined,
    faiApprover:  row.fai_approver ?? undefined,
    faiPassed:    row.fai_passed ?? undefined,
    actualQty:    row.actual_qty ?? undefined,
  };
}

function fromMockWO(wo: MockWO): Record<string, unknown> {
  return {
    wo_id:        wo.woId,
    product_code: wo.productCode,
    customer:     wo.customer,
    qty:          wo.qty,
    current_step: wo.currentStep,
    station:      wo.station,
    created_at:   wo.createdAt,
    updated_at:   wo.updatedAt,
    qty_good:     wo.qtyGood,
    fai_inspector: wo.faiInspector ?? null,
    fai_approver:  wo.faiApprover ?? null,
    fai_passed:    wo.faiPassed ?? null,
    actual_qty:    wo.actualQty ?? null,
  };
}

function fromMockWOPatch(patch: Partial<MockWO>): Record<string, unknown> {
  const r: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.productCode  !== undefined) r.product_code  = patch.productCode;
  if (patch.customer     !== undefined) r.customer      = patch.customer;
  if (patch.qty          !== undefined) r.qty           = patch.qty;
  if (patch.currentStep  !== undefined) r.current_step  = patch.currentStep;
  if (patch.station      !== undefined) r.station       = patch.station;
  if (patch.qtyGood      !== undefined) r.qty_good      = patch.qtyGood;
  if (patch.faiInspector !== undefined) r.fai_inspector = patch.faiInspector;
  if (patch.faiApprover  !== undefined) r.fai_approver  = patch.faiApprover;
  if (patch.faiPassed    !== undefined) r.fai_passed    = patch.faiPassed;
  if (patch.actualQty    !== undefined) r.actual_qty    = patch.actualQty;
  return r;
}

function dispatch() {
  window.dispatchEvent(new Event('mockstore'));
}

// ── Auth (stays in localStorage — per-browser, intentional) ────────────

const AUTH_KEY = 'syntech_auth';

const ACCOUNTS = [
  { username: 'admin',  password: 'admin',  role: 'admin'  as UserRole },
  { username: 'member', password: 'member', role: 'member' as UserRole },
  { username: 'viewer', password: 'viewer', role: 'viewer' as UserRole },
];

export function getAuth(): AuthState {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (raw) return JSON.parse(raw) as AuthState;
  } catch { /* ignore */ }
  return { isLoggedIn: false, username: '', role: 'viewer' };
}

export function mockLogin(username: string, password: string): boolean {
  const account = ACCOUNTS.find(a => a.username === username && a.password === password);
  if (!account) return false;
  localStorage.setItem(AUTH_KEY, JSON.stringify({ isLoggedIn: true, username: account.username, role: account.role }));
  dispatch();
  return true;
}

export function mockLogout(): void {
  localStorage.setItem(AUTH_KEY, JSON.stringify({ isLoggedIn: false, username: '', role: 'viewer' }));
  dispatch();
}

// ── WO Store ────────────────────────────────────────────────────────────

export async function getWoList(): Promise<MockWO[]> {
  const { data, error } = await supabase
    .from('work_orders')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { console.error('[getWoList]', error); return []; }
  return (data ?? []).map(toMockWO);
}

export async function getWo(woId: string): Promise<MockWO | null> {
  const { data, error } = await supabase
    .from('work_orders')
    .select('*')
    .eq('wo_id', woId)
    .maybeSingle();
  if (error) { console.error('[getWo]', error); return null; }
  return data ? toMockWO(data) : null;
}

export async function addWo(wo: MockWO): Promise<void> {
  const { error } = await supabase
    .from('work_orders')
    .insert([fromMockWO(wo)]);
  if (error) { console.error('[addWo]', error); return; }
  dispatch();
}

export async function updateWo(woId: string, patch: Partial<MockWO>): Promise<void> {
  const { error } = await supabase
    .from('work_orders')
    .update(fromMockWOPatch(patch))
    .eq('wo_id', woId);
  if (error) { console.error('[updateWo]', error); return; }
  dispatch();
}

// ── OBA Records ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toObaRecord(row: any): ObaRecord {
  return {
    id:         row.id,
    woId:       row.wo_id,
    lotNo:      row.lot_no,
    sampleQty:  row.sample_qty,
    result:     row.result,
    defectNote: row.defect_note,
    timestamp:  row.timestamp,
  };
}

export async function getObaRecords(): Promise<ObaRecord[]> {
  const { data, error } = await supabase
    .from('oba_records')
    .select('*')
    .order('timestamp', { ascending: false });
  if (error) { console.error('[getObaRecords]', error); return []; }
  return (data ?? []).map(toObaRecord);
}

export async function addObaRecord(record: Omit<ObaRecord, 'id' | 'timestamp'>): Promise<void> {
  const row = {
    id:          `OBA-${Date.now()}`,
    wo_id:       record.woId,
    lot_no:      record.lotNo,
    sample_qty:  record.sampleQty,
    result:      record.result,
    defect_note: record.defectNote,
    timestamp:   new Date().toISOString(),
  };
  const { error } = await supabase.from('oba_records').insert([row]);
  if (error) { console.error('[addObaRecord]', error); return; }
  dispatch();
}

// ── QC Records ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toQcRecord(row: any): QcRecord {
  return { id: row.id, sn: row.sn, status: row.status, time: row.time, error: row.error };
}

export async function getQcRecords(): Promise<QcRecord[]> {
  const { data, error } = await supabase
    .from('qc_records')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { console.error('[getQcRecords]', error); return []; }
  return (data ?? []).map(toQcRecord);
}

export async function addQcRecord(record: Omit<QcRecord, 'id'>): Promise<void> {
  const row = {
    id:     `QC-${Date.now()}`,
    sn:     record.sn,
    status: record.status,
    time:   record.time,
    error:  record.error,
  };
  const { error } = await supabase.from('qc_records').insert([row]);
  if (error) { console.error('[addQcRecord]', error); return; }
  dispatch();
}

// ── Routing History ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRoutingRecord(row: any): RoutingRecord {
  return { id: row.id, ts: row.ts, serial: row.serial, sequence: row.sequence, result: row.result, totalSec: row.total_sec };
}

export async function getRoutingHistory(): Promise<RoutingRecord[]> {
  const { data, error } = await supabase
    .from('routing_history')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { console.error('[getRoutingHistory]', error); return []; }
  return (data ?? []).map(toRoutingRecord);
}

export async function addRoutingRecord(record: Omit<RoutingRecord, 'id'>): Promise<void> {
  const row = {
    id:        `RH-${Date.now()}`,
    ts:        record.ts,
    serial:    record.serial,
    sequence:  record.sequence,
    result:    record.result,
    total_sec: record.totalSec,
  };
  const { error } = await supabase.from('routing_history').insert([row]);
  if (error) { console.error('[addRoutingRecord]', error); return; }
  dispatch();
}

export async function deleteRoutingRecord(id: string): Promise<void> {
  const { error } = await supabase.from('routing_history').delete().eq('id', id);
  if (error) { console.error('[deleteRoutingRecord]', error); return; }
  dispatch();
}

// ── Production Reports ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toProductionReport(row: any): ProductionReport {
  return {
    id:          row.id,
    code:        row.code,
    customer:    row.customer,
    status:      row.status,
    qty:         row.qty,
    delivery:    row.delivery,
    stage:       row.stage,
    isCompleted: row.is_completed,
  };
}

export async function getProductionReports(): Promise<ProductionReport[]> {
  const { data, error } = await supabase
    .from('production_reports')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) { console.error('[getProductionReports]', error); return []; }
  return (data ?? []).map(toProductionReport);
}

export async function addProductionReport(report: Omit<ProductionReport, 'id'>): Promise<ProductionReport> {
  const id = (crypto.randomUUID ? crypto.randomUUID() : `PR-${Date.now()}`);
  const row = {
    id,
    code:         report.code,
    customer:     report.customer,
    status:       report.status,
    qty:          report.qty,
    delivery:     report.delivery,
    stage:        report.stage,
    is_completed: report.isCompleted,
  };
  const { error } = await supabase.from('production_reports').insert([row]);
  if (error) { console.error('[addProductionReport]', error); }
  dispatch();
  return { ...report, id };
}

export async function updateProductionReport(id: string, patch: Partial<ProductionReport>): Promise<void> {
  const r: Record<string, unknown> = {};
  if (patch.code        !== undefined) r.code         = patch.code;
  if (patch.customer    !== undefined) r.customer     = patch.customer;
  if (patch.status      !== undefined) r.status       = patch.status;
  if (patch.qty         !== undefined) r.qty          = patch.qty;
  if (patch.delivery    !== undefined) r.delivery     = patch.delivery;
  if (patch.stage       !== undefined) r.stage        = patch.stage;
  if (patch.isCompleted !== undefined) r.is_completed = patch.isCompleted;
  const { error } = await supabase.from('production_reports').update(r).eq('id', id);
  if (error) { console.error('[updateProductionReport]', error); }
  dispatch();
}

export async function deleteProductionReport(id: string): Promise<void> {
  const { error } = await supabase.from('production_reports').delete().eq('id', id);
  if (error) { console.error('[deleteProductionReport]', error); }
  dispatch();
}

// ── Random WO Generator ─────────────────────────────────────────────────

const CUSTOMERS = ['TOYOTA', 'HONDA', 'YAMAHA', 'SUZUKI', 'NISSAN', 'MITSUBISHI', 'ISUZU', 'BOSCH'];
const PRODUCTS  = ['PCB-A100', 'PCB-B200', 'ASY-300', 'MOT-4500', 'ECU-9100', 'PNL-2200', 'HRN-550', 'SEN-7700'];
const STATIONS  = ['SMT-LINE', 'ASSY-LINE', 'ST-01', 'ST-02', 'ST-03', 'QC-FINAL'];
const NEW_STEPS: WoStep[] = ['DRAFT', 'OPEN', 'READY', 'RUNNING', 'WAIT_FAI_QA', 'WAIT_FAI_MGR'];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function generateRandomWo(): Promise<MockWO> {
  const d    = new Date();
  const yymm = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const qty  = (Math.floor(Math.random() * 45) + 5) * 100;
  const now  = new Date().toISOString();

  const { count } = await supabase
    .from('work_orders')
    .select('*', { count: 'exact', head: true });
  const seq = String((count ?? 0) + 1).padStart(3, '0');

  return {
    woId:        `WO-${yymm}-${seq}`,
    productCode: pick(PRODUCTS),
    customer:    pick(CUSTOMERS),
    qty,
    currentStep: pick(NEW_STEPS),
    station:     pick(STATIONS),
    createdAt:   now,
    updatedAt:   now,
    qtyGood:     0,
  };
}

// ── Seed (runs once if DB is empty) ─────────────────────────────────────

export async function seedIfEmpty(): Promise<void> {
  const list = await getWoList();
  if (list.length > 0) return;

  const d    = new Date();
  const yymm = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const hr   = 3_600_000;

  const seeds: MockWO[] = [
    { woId: `WO-${yymm}-001`, productCode: 'PCB-A100', customer: 'TOYOTA',     qty: 2000, currentStep: 'RUNNING',      station: 'SMT-LINE',  createdAt: new Date(Date.now() - hr).toISOString(),     updatedAt: new Date(Date.now() - hr).toISOString(),     qtyGood: 0 },
    { woId: `WO-${yymm}-002`, productCode: 'ASY-300',  customer: 'HONDA',      qty: 1500, currentStep: 'WAIT_FAI_QA',  station: 'ASSY-LINE', createdAt: new Date(Date.now() - 2*hr).toISOString(),   updatedAt: new Date(Date.now() - 2*hr).toISOString(),   qtyGood: 0 },
    { woId: `WO-${yymm}-003`, productCode: 'MOT-4500', customer: 'YAMAHA',     qty: 3000, currentStep: 'OPEN',         station: 'ST-01',     createdAt: new Date(Date.now() - 3*hr).toISOString(),   updatedAt: new Date(Date.now() - 3*hr).toISOString(),   qtyGood: 0 },
    { woId: `WO-${yymm}-004`, productCode: 'ECU-9100', customer: 'NISSAN',     qty: 800,  currentStep: 'DRAFT',        station: 'ST-02',     createdAt: new Date(Date.now() - 4*hr).toISOString(),   updatedAt: new Date(Date.now() - 4*hr).toISOString(),   qtyGood: 0 },
    { woId: `WO-${yymm}-005`, productCode: 'PNL-2200', customer: 'BOSCH',      qty: 5000, currentStep: 'CLOSED',       station: 'QC-FINAL',  createdAt: new Date(Date.now() - 5*hr).toISOString(),   updatedAt: new Date(Date.now() - 5*hr).toISOString(),   qtyGood: 5000, actualQty: 4980 },
    { woId: `WO-${yymm}-006`, productCode: 'HRN-550',  customer: 'MITSUBISHI', qty: 1200, currentStep: 'READY',        station: 'ASSY-LINE', createdAt: new Date(Date.now() - 6*hr).toISOString(),   updatedAt: new Date(Date.now() - 6*hr).toISOString(),   qtyGood: 0 },
    { woId: `WO-${yymm}-007`, productCode: 'SEN-7700', customer: 'SUZUKI',     qty: 4000, currentStep: 'WAIT_FAI_MGR', station: 'SMT-LINE',  createdAt: new Date(Date.now() - 7*hr).toISOString(),   updatedAt: new Date(Date.now() - 7*hr).toISOString(),   qtyGood: 0 },
  ];

  const { error } = await supabase.from('work_orders').insert(seeds.map(fromMockWO));
  if (error) { console.error('[seedIfEmpty]', error); return; }
  dispatch();
}
