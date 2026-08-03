// Minimal axios-compatible client built on fetch, sufficient for orphan pages
// (MesAuth / PmCoreFlow / ScmCases) that expect `api.get/post/put/delete` returning `{ data }`.
// Base URL is same-origin `/api` — served by MES backbone Express on :5100 in prod,
// proxied by vite dev server in dev.

type RequestConfig = {
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
};

type Response<T> = { data: T; status: number; headers: Headers };

const ACCESS_TOKEN_KEYS = ['syntech.mes.access_token', 'mes_access_token'];
const REFRESH_TOKEN_KEYS = ['syntech.mes.refresh_token', 'mes_refresh_token'];

function getStoredToken(keys: string[]): string | null {
  if (typeof window === 'undefined') return null;
  try {
    for (const key of keys) {
      const value = window.localStorage.getItem(key);
      if (value) return value;
    }
    return null;
  } catch {
    return null;
  }
}

export function getAccessToken(): string | null {
  return getStoredToken(ACCESS_TOKEN_KEYS);
}

export function setAuthTokens(access: string | null, refresh?: string | null) {
  if (typeof window === 'undefined') return;
  try {
    for (const key of ACCESS_TOKEN_KEYS) {
      if (access) window.localStorage.setItem(key, access);
      else window.localStorage.removeItem(key);
    }
    if (refresh !== undefined) {
      for (const key of REFRESH_TOKEN_KEYS) {
        if (refresh) window.localStorage.setItem(key, refresh);
        else window.localStorage.removeItem(key);
      }
    }
  } catch {
    /* storage disabled */
  }
}

export function clearAuthTokens() {
  setAuthTokens(null, null);
}

import { API_BASE_URL } from './config';
import { apiErrorMessage } from './errorMessage';
const API_ORIGIN: string = API_BASE_URL;

function buildUrl(path: string, params?: RequestConfig['params']): string {
  const apiPath = path.startsWith('/api') ? path : `/api${path.startsWith('/') ? '' : '/'}${path}`;
  const base = API_ORIGIN + apiPath;
  if (!params) return base;
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    search.set(k, String(v));
  }
  const qs = search.toString();
  return qs ? `${base}?${qs}` : base;
}

async function request<T>(
  method: string,
  path: string,
  body: unknown,
  config?: RequestConfig,
): Promise<Response<T>> {
  const url = buildUrl(path, config?.params);
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(config?.headers || {}),
  };
  const token = getAccessToken();
  if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;
  let payload: string | undefined;
  if (body !== undefined && body !== null) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    payload = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const timeoutMs = 15000;
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
  const signal = config?.signal || timeoutController.signal;

  let res: globalThis.Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: payload,
      signal,
      credentials: API_ORIGIN ? 'omit' : 'include',
    });
    clearTimeout(timeoutId);
  } catch (e: any) {
    clearTimeout(timeoutId);
    if (e?.name === 'AbortError') {
      if (method === 'GET') throw new Error('การเชื่อมต่อหมดเวลา (Request Timeout)');
      return { data: null as T, status: 0, headers: new Headers() };
    }
    if (method === 'GET') throw new Error('Connection failed — cannot reach the server');
    return { data: null as T, status: 0, headers: new Headers() };
  }
  const contentType = res.headers.get('content-type') || '';
  let data: any = null;
  if (contentType.includes('application/json')) {
    data = await res.json().catch(() => null);
  } else {
    const text = await res.text().catch(() => '');
    data = text;
  }
  if (!res.ok) {
    // 401 = token หมดอายุ/ไม่ถูกต้อง → แจ้ง app จัดการ session (ยกเว้น request login เอง)
    //
    // ⚠️ ยกเว้น prefix ที่เป็นของ MES backbone (:5100) ด้วย — ระบบนี้เซ็น JWT คนละ secret
    //    กับ my-api ที่เราล็อกอินอยู่ ดังนั้น token ของเราจะได้ 401 จากมันเป็นปกติ
    //    ถ้าปล่อยให้ 401 ของ widget พวกนี้ dispatch app:unauthorized จะกลายเป็นว่า
    //    "เปิด Dashboard แล้วเด้ง Session expired ทันที" ทั้งที่ session ยังดีอยู่
    //    (FactoryOverview เรียก /api/jumbo/report/daily · StationMonitor เรียก /api/mes/stations/monitor)
    //    → widget เหล่านั้นจะว่างเปล่าไปก่อนจนกว่าจะทำ SSO ระหว่าง 2 ระบบ แต่ที่เหลือใช้งานได้ปกติ
    const OTHER_REALM_PREFIXES = ['/jumbo', '/mes', '/api/jumbo', '/api/mes'];
    const isOtherRealm = OTHER_REALM_PREFIXES.some((p) => path === p || path.startsWith(p + '/'));
    if (res.status === 401 && typeof window !== 'undefined' && !path.includes('/auth/login') && !isOtherRealm) {
      window.dispatchEvent(new CustomEvent('app:unauthorized'));
    }
    // GET + server error (5xx) → throw ให้ useQuery เข้า isError (แยก "server ล่ม" ออกจาก "ไม่มีข้อมูล")
    // 4xx (400/403/404) → คืน null ให้ caller จัดการเอง (validation/notfound/permission) เหมือนเดิม
    if (method === 'GET' && res.status >= 500) {
      throw new Error(apiErrorMessage(res.status, data));   // แปลงเป็นข้อความเป็นมิตร กัน raw pg error รั่ว
    }
    // คง body ที่ parse แล้วไว้ (เดิมทิ้งเป็น null) → hook อ่าน res.data.message โชว์ข้อความจริงจาก backend ได้
    // (400/409 เช่น optimistic-lock, validation) แทนที่จะเป็น fallback generic เสมอ · caller ทุกที่เช็ก status ก่อนอยู่แล้ว
    return { data: data as T, status: res.status, headers: res.headers };
  }
  // แจ้ง mutation ที่สำเร็จ (POST/PUT/PATCH/DELETE) → โหมดเดโมเก็บเป็น Activity (ดักที่ browser.ts)
  try {
    const mm = method.toUpperCase();
    if ((mm === 'POST' || mm === 'PUT' || mm === 'PATCH' || mm === 'DELETE') && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mes:mutation', { detail: { method: mm, url, status: res.status, auth: headers.Authorization || null, data } }));
    }
  } catch { /* noop */ }
  return { data: data as T, status: res.status, headers: res.headers };
}

const api = {
  get: <T = unknown>(path: string, config?: RequestConfig) => request<T>('GET', path, undefined, config),
  post: <T = unknown>(path: string, body?: unknown, config?: RequestConfig) => request<T>('POST', path, body, config),
  put: <T = unknown>(path: string, body?: unknown, config?: RequestConfig) => request<T>('PUT', path, body, config),
  patch: <T = unknown>(path: string, body?: unknown, config?: RequestConfig) => request<T>('PATCH', path, body, config),
  delete: <T = unknown>(path: string, config?: RequestConfig) => request<T>('DELETE', path, undefined, config),
};

export default api;
