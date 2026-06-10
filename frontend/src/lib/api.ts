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

export function getRefreshToken(): string | null {
  return getStoredToken(REFRESH_TOKEN_KEYS);
}

function buildUrl(path: string, params?: RequestConfig['params']): string {
  const base = path.startsWith('/api') ? path : `/api${path.startsWith('/') ? '' : '/'}${path}`;
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
  let res: globalThis.Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: payload,
      signal: config?.signal,
      credentials: 'include',
    });
  } catch {
    // Network error — backend not reachable, return null data silently
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
    // Return null data instead of throwing — pages with fallback data show empty state
    return { data: null as T, status: res.status, headers: res.headers };
  }
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
