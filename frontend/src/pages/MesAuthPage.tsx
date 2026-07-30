import { FormEvent, useState } from 'react';
import { useMockAuth } from '../lib/useMockStore';
import { apiLogin, mockLogout } from '../lib/mockStore';
import { showToast } from '../lib/toast';
import { ROLE_COLOR } from '../lib/roles';

export function MesAuthPage() {
  const auth = useMockAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');

  const [loading, setLoading] = useState(false);

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await apiLogin(username.trim(), password);
    setLoading(false);
    if (!result.ok) {
      setError(result.error || 'Sign in failed');
    } else {
      setUsername('');
      setPassword('');
      showToast(`Welcome, ${username.trim()}!`, 'success');
    }
  }

  return (
    <div className="stack-lg" style={{ maxWidth: 480, margin: '0 auto' }}>
      <section className="panel">
        <h1 className="panel__title">Login / Logout</h1>
        <p className="panel__subtitle">Sign in to access MES features</p>

        {auth.isLoggedIn ? (
          <div className="stack" style={{ marginTop: '1rem' }}>
            <div className="notice info" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span>Logged in as: <strong>{auth.username}</strong></span>
              <span style={{
                background: ROLE_COLOR[auth.role] || '#64748b',
                color: '#fff',
                padding: '0.2rem 0.6rem',
                borderRadius: 999,
                fontSize: '0.75rem',
                fontWeight: 700,
                textTransform: 'uppercase',
              }}>{auth.role}</span>
            </div>
            <button className="btn" type="button" onClick={() => mockLogout()}>
              Logout
            </button>
          </div>
        ) : (
          <div className="stack" style={{ marginTop: '1rem' }}>
            {error && <div className="notice err">{error}</div>}
            <form className="stack" onSubmit={handleLogin}>
              <label className="field">
                <span>Username</span>
                <input
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="username"
                  autoComplete="username"
                  autoFocus
                />
              </label>
              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="password"
                  autoComplete="current-password"
                />
              </label>
              <button type="submit" className="btn" disabled={!username.trim() || !password || loading}>
                {loading ? 'Signing in...' : 'Login'}
              </button>
            </form>

          </div>
        )}
      </section>
    </div>
  );
}
