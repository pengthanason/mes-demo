import { FormEvent, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import api, { clearAuthTokens, getAccessToken, getRefreshToken, setAuthTokens } from '../lib/api';

type MesUser = {
  id: number;
  username: string;
  role: string;
};

type StoredAuth = {
  accessToken: string;
  refreshToken: string;
  user: MesUser | null;
};

type AuthResponse = {
  access_token: string;
  refresh_token: string;
  user: MesUser;
};

type AuthMeResponse = {
  user?: MesUser | null;
  [key: string]: unknown;
};

function normalizeMesUser(value: unknown): MesUser | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  return {
    id: Number(candidate.id || 0),
    username: String(candidate.username || ''),
    role: String(candidate.role || ''),
  };
}

function safeGetLocalStorage(key: string): string {
  if (typeof window === 'undefined') return '';
  return String(window.localStorage.getItem(key) || '');
}

function safeSetLocalStorage(key: string, value: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, value);
}

function safeRemoveLocalStorage(key: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(key);
}

function loadStoredAuth(): StoredAuth {
  const accessToken = String(getAccessToken() || '').trim();
  const refreshToken = String(getRefreshToken() || '').trim();
  const userRaw = safeGetLocalStorage('mes_user').trim();
  let user: MesUser | null = null;
  if (userRaw) {
    try {
      user = normalizeMesUser(JSON.parse(userRaw));
    } catch (_error) {
      user = null;
    }
  }
  return { accessToken, refreshToken, user };
}

function persistAuth(payload: AuthResponse) {
  setAuthTokens(String(payload.access_token || '').trim(), String(payload.refresh_token || '').trim());
  safeSetLocalStorage('mes_user', JSON.stringify(payload.user || null));
}

function clearAuthStorage() {
  clearAuthTokens();
  safeRemoveLocalStorage('mes_user');
}

export function MesAuthPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ kind: 'ok' | 'warn' | 'err'; message: string } | null>(null);
  const [authState, setAuthState] = useState<StoredAuth>(() => loadStoredAuth());
  const [mePayload, setMePayload] = useState<string>('');

  const authSummary = useMemo(() => {
    const hasAccess = authState.accessToken.length > 0;
    const hasRefresh = authState.refreshToken.length > 0;
    return { hasAccess, hasRefresh };
  }, [authState]);

  function reloadAuthState() {
    setAuthState(loadStoredAuth());
  }

  const loginMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<AuthResponse>('/mes/auth/login', {
        username: username.trim(),
        password,
      });
      return data;
    },
    onSuccess: (data) => {
      const user = normalizeMesUser(data.user) || { id: 0, username: '', role: '' };
      persistAuth({
        access_token: String(data?.access_token || ''),
        refresh_token: String(data?.refresh_token || ''),
        user,
      });
      reloadAuthState();
      setPassword('');
      setStatusMsg({
        kind: 'ok',
        message: `Login success (${user.username || '-'}/${user.role || '-'})`,
      });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'login failed';
      setStatusMsg({ kind: 'err', message: `Login failed: ${message}` });
    },
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const refreshToken = String(getRefreshToken() || '').trim();
      if (!refreshToken) throw new Error('missing refresh token');
      const { data } = await api.post<AuthResponse>('/mes/auth/refresh', { refresh_token: refreshToken });
      return data;
    },
    onSuccess: (data) => {
      const user = normalizeMesUser(data.user) || authState.user || { id: 0, username: '', role: '' };
      persistAuth({
        access_token: String(data?.access_token || ''),
        refresh_token: String(data?.refresh_token || ''),
        user,
      });
      reloadAuthState();
      setStatusMsg({ kind: 'ok', message: 'Refresh token success' });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'refresh failed';
      setStatusMsg({ kind: 'err', message: `Refresh failed: ${message}` });
    },
  });

  const meMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.get<AuthMeResponse>('/mes/auth/me');
      return data;
    },
    onSuccess: (data) => {
      setMePayload(JSON.stringify(data, null, 2));
      setStatusMsg({ kind: 'ok', message: 'Fetched /api/mes/auth/me successfully' });
      const user = normalizeMesUser(data.user);
      if (user) {
        safeSetLocalStorage('mes_user', JSON.stringify(user));
        reloadAuthState();
      }
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'request failed';
      setStatusMsg({ kind: 'err', message: `Auth me failed: ${message}` });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const refreshToken = String(getRefreshToken() || '').trim();
      await api.post('/mes/auth/logout', { refresh_token: refreshToken });
    },
    onSuccess: () => {
      clearAuthStorage();
      reloadAuthState();
      setMePayload('');
      setStatusMsg({ kind: 'ok', message: 'Logged out and cleared local MES auth state' });
    },
    onError: (err: unknown) => {
      clearAuthStorage();
      reloadAuthState();
      const message = err instanceof Error ? err.message : 'logout failed';
      setStatusMsg({ kind: 'warn', message: `Logout response error (${message}) but local session is cleared` });
    },
  });

  function onLoginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMsg(null);
    setMePayload('');
    loginMutation.mutate();
  }

  return (
    <div className="stack-lg">
      <section className="panel" style={{ maxWidth: 720 }}>
        <h1 className="panel__title">MES Login (JWT)</h1>
        <p className="panel__subtitle">ใช้หน้านี้ล็อกอินเพื่อเรียก MES APIs ผ่าน `/api` บนพอร์ตเดียวกัน</p>

        {statusMsg ? <div className={`notice ${statusMsg.kind}`}>{statusMsg.message}</div> : null}

        <div className="stack" style={{ marginTop: '1rem' }}>
          <div className="notice info">
            Access token: {authSummary.hasAccess ? 'available' : 'missing'} | Refresh token: {authSummary.hasRefresh ? 'available' : 'missing'}
            {authState.user ? ` | User: ${authState.user.username} (${authState.user.role})` : ''}
          </div>

          <form className="stack" onSubmit={onLoginSubmit}>
            <label className="field">
              <span>Username</span>
              <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="mes username" autoComplete="username" />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="mes password"
                autoComplete="current-password"
              />
            </label>
            <button type="submit" className="btn" disabled={loginMutation.isPending || !username.trim() || !password}>
              {loginMutation.isPending ? 'Logging in...' : 'Login'}
            </button>
          </form>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button className="btn secondary" type="button" onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending}>
              {refreshMutation.isPending ? 'Refreshing...' : 'Refresh Token'}
            </button>
            <button className="btn secondary" type="button" onClick={() => meMutation.mutate()} disabled={meMutation.isPending}>
              {meMutation.isPending ? 'Loading...' : 'Check /auth/me'}
            </button>
            <button className="btn secondary" type="button" onClick={() => logoutMutation.mutate()} disabled={logoutMutation.isPending}>
              {logoutMutation.isPending ? 'Logging out...' : 'Logout'}
            </button>
            <button
              className="btn secondary"
              type="button"
              onClick={() => {
                clearAuthStorage();
                reloadAuthState();
                setStatusMsg({ kind: 'ok', message: 'Local MES auth storage cleared' });
              }}
            >
              Clear Local Tokens
            </button>
          </div>
        </div>
      </section>

      {mePayload ? (
        <section className="panel">
          <h2 className="panel__title panel__title--sm">Auth Me Payload</h2>
          <pre style={{ whiteSpace: 'pre-wrap', overflowX: 'auto', margin: 0 }}>{mePayload}</pre>
        </section>
      ) : null}
    </div>
  );
}
