import { FormEvent, useState } from 'react';
import { useMockAuth } from '../lib/useMockStore';
import { mockLogin, mockLogout } from '../lib/mockStore';

export function MesAuthPage() {
  const auth = useMockAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');

  function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const ok = mockLogin(username.trim(), password);
    if (!ok) {
      setError('Invalid credentials — use username: test / password: test');
    } else {
      setUsername('');
      setPassword('');
    }
  }

  return (
    <div className="stack-lg" style={{ maxWidth: 480, margin: '0 auto' }}>
      <section className="panel">
        <h1 className="panel__title">Login / Logout</h1>
        <p className="panel__subtitle">Sign in to access MES features</p>

        {auth.isLoggedIn ? (
          <div className="stack" style={{ marginTop: '1rem' }}>
            <div className="notice info">
              Logged in as: <strong>{auth.username}</strong>
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
              <button type="submit" className="btn" disabled={!username.trim() || !password}>
                Login
              </button>
            </form>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              Demo: username <strong>test</strong> / password <strong>test</strong>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
