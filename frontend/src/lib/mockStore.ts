import { setAuthTokens, clearAuthTokens } from './api';

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
  woId: string;
  serial: string;
  sequence: string;
  result: string;
  totalSec: number;
}

const KEYS = {
  WOS:     'syntech_wo_list',
  OBA:     'syntech_oba_records',
  AUTH:    'syntech_auth',
  WO_SEQ:  'syntech_wo_seq',
  ROUTING: 'syntech_routing_history',
  QC:      'syntech_qc_records',
} as const;

function dispatch() {
  window.dispatchEvent(new Event('mockstore'));
}

// ── Auth ──────────────────────────────────────────────────────────────
export function getAuth(): AuthState {
  try {
    const raw = localStorage.getItem(KEYS.AUTH);
    if (raw) return JSON.parse(raw) as AuthState;
  } catch { /* empty */ }
  return { isLoggedIn: false, username: '', role: 'viewer' };
}

const ACCOUNTS = [
  { username: 'admin',  password: 'admin',  role: 'admin'  as UserRole },
  { username: 'member', password: 'member', role: 'member' as UserRole },
  { username: 'viewer', password: 'viewer', role: 'viewer' as UserRole },
];

export function mockLogin(username: string, password: string): boolean {
  const account = ACCOUNTS.find(a => a.username === username && a.password === password);
  if (account) {
    localStorage.setItem(KEYS.AUTH, JSON.stringify({ isLoggedIn: true, username: account.username, role: account.role }));
    dispatch();
    return true;
  }
  return false;
}

// ตรวจ login กับ backend จริง (app_users + bcrypt) — แทนที่ mock เดิม
export async function apiLogin(username: string, password: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.trim(), password }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !(json && json.data)) {
      return { ok: false, error: (json && json.message) || 'เข้าสู่ระบบไม่สำเร็จ' };
    }
    const u = json.data;
    // เก็บ token → api.ts จะแนบ Authorization: Bearer ให้ทุก request ที่ไม่ใช่ login
    setAuthTokens(u.token || btoa(`${u.username}:${u.role}:${Date.now()}`));
    localStorage.setItem(KEYS.AUTH, JSON.stringify({
      isLoggedIn: true,
      username: u.username,
      role: String(u.role).toLowerCase() as UserRole,
    }));
    dispatch();
    return { ok: true };
  } catch {
    return { ok: false, error: 'เชื่อมต่อ server ไม่ได้' };
  }
}

export function mockLogout(): void {
  clearAuthTokens();
  localStorage.setItem(KEYS.AUTH, JSON.stringify({ isLoggedIn: false, username: '', role: 'viewer' }));
  dispatch();
}

// ── WO Store ──────────────────────────────────────────────────────────
export function getWoList(): MockWO[] {
  try {
    const raw = localStorage.getItem(KEYS.WOS);
    if (raw) return JSON.parse(raw) as MockWO[];
  } catch { /* empty */ }
  return [];
}

export function getWo(woId: string): MockWO | null {
  return getWoList().find(w => w.woId === woId) ?? null;
}

function saveWoList(list: MockWO[]): void {
  localStorage.setItem(KEYS.WOS, JSON.stringify(list));
  dispatch();
}

export function addWo(wo: MockWO): void {
  const list = getWoList();
  list.unshift({ createdAt: new Date().toISOString(), ...wo });
  saveWoList(list);
}

export function updateWo(woId: string, patch: Partial<MockWO>): void {
  const list = getWoList().map(w =>
    w.woId === woId ? { ...w, ...patch, updatedAt: new Date().toISOString() } : w
  );
  saveWoList(list);
}

// ── OBA Records ───────────────────────────────────────────────────────
export function getObaRecords(): ObaRecord[] {
  try {
    const raw = localStorage.getItem(KEYS.OBA);
    if (raw) return JSON.parse(raw) as ObaRecord[];
  } catch { /* empty */ }
  return [];
}

export function addObaRecord(record: Omit<ObaRecord, 'id' | 'timestamp'>): void {
  const list = getObaRecords();
  list.unshift({
    ...record,
    id: `OBA-${Date.now()}`,
    timestamp: new Date().toISOString(),
  });
  localStorage.setItem(KEYS.OBA, JSON.stringify(list));
  dispatch();
}

// ── Routing History ───────────────────────────────────────────────────
export function getRoutingHistory(): RoutingRecord[] {
  try {
    const raw = localStorage.getItem(KEYS.ROUTING);
    if (raw) return JSON.parse(raw) as RoutingRecord[];
  } catch { /* empty */ }
  return [];
}

export function addRoutingRecord(record: Omit<RoutingRecord, 'id'>): void {
  const list = getRoutingHistory();
  list.unshift({ ...record, id: `RH-${Date.now()}` });
  localStorage.setItem(KEYS.ROUTING, JSON.stringify(list));
  dispatch();
}

export function deleteRoutingRecord(id: string): void {
  const list = getRoutingHistory().filter(r => r.id !== id);
  localStorage.setItem(KEYS.ROUTING, JSON.stringify(list));
  dispatch();
}

// ── QC Records ────────────────────────────────────────────────────────
export interface QcRecord {
  id: string;
  sn: string;
  status: string;
  time: string;
  error: string | null;
}

export function getQcRecords(): QcRecord[] {
  try {
    const raw = localStorage.getItem(KEYS.QC);
    if (raw) return JSON.parse(raw) as QcRecord[];
  } catch { /* empty */ }
  return [];
}

export function addQcRecord(record: Omit<QcRecord, 'id'>): void {
  const list = getQcRecords();
  list.unshift({ ...record, id: `QC-${Date.now()}` });
  localStorage.setItem(KEYS.QC, JSON.stringify(list));
  dispatch();
}

// ── Random WO Generator ───────────────────────────────────────────────
const CUSTOMERS = ['TOYOTA', 'HONDA', 'YAMAHA', 'SUZUKI', 'NISSAN', 'MITSUBISHI', 'ISUZU', 'BOSCH'];
const PRODUCTS  = ['PCB-A100', 'PCB-B200', 'ASY-300', 'MOT-4500', 'ECU-9100', 'PNL-2200', 'HRN-550', 'SEN-7700'];
const STATIONS  = ['SMT-LINE', 'ASSY-LINE', 'ST-01', 'ST-02', 'ST-03', 'QC-FINAL'];
const NEW_STEPS: WoStep[] = ['DRAFT', 'OPEN', 'READY', 'RUNNING', 'WAIT_FAI_QA', 'WAIT_FAI_MGR'];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function nextSeq(): string {
  const seq = Number(localStorage.getItem(KEYS.WO_SEQ) || '0') + 1;
  localStorage.setItem(KEYS.WO_SEQ, String(seq));
  return String(seq).padStart(3, '0');
}

export function generateRandomWo(): MockWO {
  const d = new Date();
  const yymm = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const qty = (Math.floor(Math.random() * 45) + 5) * 100;
  const now = new Date().toISOString();
  return {
    woId:        `WO-${yymm}-${nextSeq()}`,
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

// ── Data Backup / Restore ─────────────────────────────────────────────

const BACKUP_KEYS = [
  'syntech_wo_list',
  'syntech_oba_records',
  'syntech_wo_seq',
  'syntech_routing_history',
  'syntech_qc_records',
  'mes_production_report_mock',
] as const;

export function exportData(): void {
  const snapshot: Record<string, unknown> = {
    _version: 1,
    _exportedAt: new Date().toISOString(),
  };
  for (const key of BACKUP_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      snapshot[key] = raw ? JSON.parse(raw) : null;
    } catch {
      snapshot[key] = null;
    }
  }
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href     = url;
  a.download = `mes-backup-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importData(file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const snapshot = JSON.parse(e.target?.result as string) as Record<string, unknown>;
        for (const key of BACKUP_KEYS) {
          if (key in snapshot && snapshot[key] !== null) {
            localStorage.setItem(key, JSON.stringify(snapshot[key]));
          }
        }
        dispatch();
        resolve();
      } catch {
        reject(new Error('ไฟล์ไม่ถูกต้อง — กรุณาใช้ไฟล์ backup ที่ export จากระบบนี้เท่านั้น'));
      }
    };
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่ได้'));
    reader.readAsText(file);
  });
}

// ── Seed initial data (runs once if localStorage is empty) ────────────
export function seedIfEmpty(): void {
  if (getWoList().length > 0) return;
  const d = new Date();
  const yymm = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const seeds: MockWO[] = [
    { woId: `WO-${yymm}-001`, productCode: 'PCB-A100', customer: 'TOYOTA',      qty: 2000, currentStep: 'RUNNING',      station: 'SMT-LINE',  createdAt: new Date(Date.now() - 3600000).toISOString(),   updatedAt: new Date(Date.now() - 3600000).toISOString(),   qtyGood: 0 },
    { woId: `WO-${yymm}-002`, productCode: 'ASY-300',  customer: 'HONDA',       qty: 1500, currentStep: 'WAIT_FAI_QA',  station: 'ASSY-LINE', createdAt: new Date(Date.now() - 7200000).toISOString(),   updatedAt: new Date(Date.now() - 7200000).toISOString(),   qtyGood: 0 },
    { woId: `WO-${yymm}-003`, productCode: 'MOT-4500', customer: 'YAMAHA',      qty: 3000, currentStep: 'OPEN',         station: 'ST-01',     createdAt: new Date(Date.now() - 10800000).toISOString(),  updatedAt: new Date(Date.now() - 10800000).toISOString(),  qtyGood: 0 },
    { woId: `WO-${yymm}-004`, productCode: 'ECU-9100', customer: 'NISSAN',      qty: 800,  currentStep: 'DRAFT',        station: 'ST-02',     createdAt: new Date(Date.now() - 14400000).toISOString(),  updatedAt: new Date(Date.now() - 14400000).toISOString(),  qtyGood: 0 },
    { woId: `WO-${yymm}-005`, productCode: 'PNL-2200', customer: 'BOSCH',       qty: 5000, currentStep: 'CLOSED',       station: 'QC-FINAL',  createdAt: new Date(Date.now() - 18000000).toISOString(),  updatedAt: new Date(Date.now() - 18000000).toISOString(),  qtyGood: 5000, actualQty: 4980 },
    { woId: `WO-${yymm}-006`, productCode: 'HRN-550',  customer: 'MITSUBISHI',  qty: 1200, currentStep: 'READY',        station: 'ASSY-LINE', createdAt: new Date(Date.now() - 21600000).toISOString(),  updatedAt: new Date(Date.now() - 21600000).toISOString(),  qtyGood: 0 },
    { woId: `WO-${yymm}-007`, productCode: 'SEN-7700', customer: 'SUZUKI',      qty: 4000, currentStep: 'WAIT_FAI_MGR', station: 'SMT-LINE',  createdAt: new Date(Date.now() - 25200000).toISOString(),  updatedAt: new Date(Date.now() - 25200000).toISOString(),  qtyGood: 0 },
  ];
  localStorage.setItem(KEYS.WO_SEQ, '7');
  saveWoList(seeds);
}
