export type WoStep = 'DRAFT' | 'OPEN' | 'READY' | 'RUNNING' | 'WAIT_FAI_QA' | 'WAIT_FAI_MGR' | 'CLOSED';

export interface MockWO {
  woId: string;
  productCode: string;
  customer: string;
  qty: number;
  currentStep: WoStep;
  station: string;
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
}

const KEYS = {
  WOS:    'syntech_wo_list',
  OBA:    'syntech_oba_records',
  AUTH:   'syntech_auth',
  WO_SEQ: 'syntech_wo_seq',
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
  return { isLoggedIn: false, username: '' };
}

export function mockLogin(username: string, password: string): boolean {
  if (username === 'test' && password === 'test') {
    localStorage.setItem(KEYS.AUTH, JSON.stringify({ isLoggedIn: true, username }));
    dispatch();
    return true;
  }
  return false;
}

export function mockLogout(): void {
  localStorage.setItem(KEYS.AUTH, JSON.stringify({ isLoggedIn: false, username: '' }));
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
  list.unshift(wo);
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
  return {
    woId:        `WO-${yymm}-${nextSeq()}`,
    productCode: pick(PRODUCTS),
    customer:    pick(CUSTOMERS),
    qty,
    currentStep: pick(NEW_STEPS),
    station:     pick(STATIONS),
    updatedAt:   new Date().toISOString(),
    qtyGood:     0,
  };
}

// ── Seed initial data (runs once if localStorage is empty) ────────────
export function seedIfEmpty(): void {
  if (getWoList().length > 0) return;
  const d = new Date();
  const yymm = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const seeds: MockWO[] = [
    { woId: `WO-${yymm}-001`, productCode: 'PCB-A100', customer: 'TOYOTA',      qty: 2000, currentStep: 'RUNNING',      station: 'SMT-LINE',  updatedAt: new Date(Date.now() - 3600000).toISOString(),   qtyGood: 0 },
    { woId: `WO-${yymm}-002`, productCode: 'ASY-300',  customer: 'HONDA',       qty: 1500, currentStep: 'WAIT_FAI_QA',  station: 'ASSY-LINE', updatedAt: new Date(Date.now() - 7200000).toISOString(),   qtyGood: 0 },
    { woId: `WO-${yymm}-003`, productCode: 'MOT-4500', customer: 'YAMAHA',      qty: 3000, currentStep: 'OPEN',         station: 'ST-01',     updatedAt: new Date(Date.now() - 10800000).toISOString(),  qtyGood: 0 },
    { woId: `WO-${yymm}-004`, productCode: 'ECU-9100', customer: 'NISSAN',      qty: 800,  currentStep: 'DRAFT',        station: 'ST-02',     updatedAt: new Date(Date.now() - 14400000).toISOString(),  qtyGood: 0 },
    { woId: `WO-${yymm}-005`, productCode: 'PNL-2200', customer: 'BOSCH',       qty: 5000, currentStep: 'CLOSED',       station: 'QC-FINAL',  updatedAt: new Date(Date.now() - 18000000).toISOString(),  qtyGood: 5000, actualQty: 4980 },
    { woId: `WO-${yymm}-006`, productCode: 'HRN-550',  customer: 'MITSUBISHI',  qty: 1200, currentStep: 'READY',        station: 'ASSY-LINE', updatedAt: new Date(Date.now() - 21600000).toISOString(),  qtyGood: 0 },
    { woId: `WO-${yymm}-007`, productCode: 'SEN-7700', customer: 'SUZUKI',      qty: 4000, currentStep: 'WAIT_FAI_MGR', station: 'SMT-LINE',  updatedAt: new Date(Date.now() - 25200000).toISOString(),  qtyGood: 0 },
  ];
  localStorage.setItem(KEYS.WO_SEQ, '7');
  saveWoList(seeds);
}
