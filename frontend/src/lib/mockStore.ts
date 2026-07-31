import { setAuthTokens, clearAuthTokens } from './api';
import { IS_DEMO } from './config';

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
  expectedDate?: string;
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
  permissions?: string[];   // สิทธิ์รายหน้า (ว่าง = ใช้ค่าตาม role) — ใช้กรองเมนู/กันเข้าหน้า
}

const AUTH_KEY = 'syntech_auth';

function dispatch() {
  window.dispatchEvent(new Event('mockstore'));
}

// ── Auth ──────────────────────────────────────────────────────────────
export function getAuth(): AuthState {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (raw) return JSON.parse(raw) as AuthState;
  } catch { /* empty */ }
  return { isLoggedIn: false, username: '', role: 'viewer' };
}

// demo fallback — ล็อกอินในเครื่องเมื่อ MSW ไม่ทำงาน (เช่น เปิดลิงก์ในเบราว์เซอร์ในแอป/โหมดส่วนตัวบนมือถือ ที่ Service Worker ใช้ไม่ได้)
const DEMO_ROLES: Record<string, UserRole> = { admin: 'admin', member1: 'member', viewer1: 'viewer' };
function demoLogin(username: string, password: string): boolean {
  const role = DEMO_ROLES[username];
  if (!role || password !== username) return false;
  setAuthTokens(btoa(`${username}:${role}:demo`));
  localStorage.setItem(AUTH_KEY, JSON.stringify({ isLoggedIn: true, username, role, permissions: [] }));
  dispatch();
  return true;
}

// ตรวจ login กับ backend จริง (my-api /api/auth/login — users + bcrypt) · เดโม: fallback local ถ้า MSW/SW ไม่ทำงาน
export async function apiLogin(username: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const uname = username.trim();
  const isDemo = IS_DEMO;
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: uname, password }),
    });
    const json = await res.json().catch(() => null);
    if (res.ok && json && json.data) {
      const u = json.data;
      // เก็บ token → api.ts จะแนบ Authorization: Bearer ให้ทุก request ที่ไม่ใช่ login
      setAuthTokens(u.token || btoa(`${u.username}:${u.role}:${Date.now()}`));
      localStorage.setItem(AUTH_KEY, JSON.stringify({
        isLoggedIn: true,
        username: u.username,
        role: String(u.role).toLowerCase() as UserRole,
        permissions: Array.isArray(u.permissions) ? u.permissions : [],
      }));
      dispatch();
      return { ok: true };
    }
    // เดโม + response ไม่ใช่ JSON ที่ถูก (SW ไม่ทำงาน → ได้ index.html/404) → ล็อกอิน local
    if (isDemo && demoLogin(uname, password)) return { ok: true };
    return { ok: false, error: (json && json.message) || 'Login failed' };
  } catch {
    if (isDemo && demoLogin(uname, password)) return { ok: true };
    return { ok: false, error: 'Cannot connect to server' };
  }
}

export function mockLogout(): void {
  clearAuthTokens();
  localStorage.setItem(AUTH_KEY, JSON.stringify({ isLoggedIn: false, username: '', role: 'viewer' }));
  dispatch();
}
