import React, { useEffect, useState } from 'react';

type CheckResult = {
  name: string;
  url: string;
  status: 'idle' | 'running' | 'ok' | 'fail';
  httpStatus?: number;
  latencyMs?: number;
  message?: string;
};

const CHECKS: Omit<CheckResult, 'status'>[] = [
  { name: 'MES Health', url: '/api/mes/health' },
  { name: 'MES Ready', url: '/api/mes/ready' },
  { name: 'MES Metrics', url: '/api/mes/metrics' },
  { name: 'MES Auth Config', url: '/api/mes/auth/config' },
];

export default function WebCheckPage() {
  const [results, setResults] = useState<CheckResult[]>(
    CHECKS.map((c) => ({ ...c, status: 'idle' as const })),
  );
  const [running, setRunning] = useState(false);

  async function runAll() {
    setRunning(true);
    const next = CHECKS.map((c) => ({ ...c, status: 'running' as const }));
    setResults(next);

    const updated = await Promise.all(
      CHECKS.map(async (c) => {
        const t0 = performance.now();
        try {
          const res = await fetch(c.url, { credentials: 'include' });
          const latency = Math.round(performance.now() - t0);
          let message: string | undefined;
          try {
            const body = await res.clone().text();
            message = body.slice(0, 160);
          } catch {
            /* ignore */
          }
          return {
            ...c,
            status: (res.ok ? 'ok' : 'fail') as 'ok' | 'fail',
            httpStatus: res.status,
            latencyMs: latency,
            message,
          } satisfies CheckResult;
        } catch (e: any) {
          return {
            ...c,
            status: 'fail' as const,
            message: e?.message || 'fetch failed',
          } satisfies CheckResult;
        }
      }),
    );
    setResults(updated);
    setRunning(false);
  }

  useEffect(() => {
    runAll();
  }, []);

  return (
    <section className="stack-lg">
      <div style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Web Check</h2>
        <p style={{ color: 'var(--text-muted)', marginTop: '0.25rem' }}>
          ตรวจ endpoint หลัก MES backbone ผ่านเบราว์เซอร์ · ช่วยเช็คความพร้อมแบบรวดเร็ว
        </p>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button
          onClick={runAll}
          disabled={running}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: 6,
            background: 'var(--primary)',
            color: 'white',
            border: 'none',
            cursor: running ? 'not-allowed' : 'pointer',
            opacity: running ? 0.6 : 1,
          }}
        >
          {running ? 'Running…' : 'Run all checks'}
        </button>
      </div>

      <div className="glass-panel" style={{ padding: '1rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>
              <th style={{ padding: '0.5rem 0.75rem' }}>Name</th>
              <th style={{ padding: '0.5rem 0.75rem' }}>URL</th>
              <th style={{ padding: '0.5rem 0.75rem' }}>Status</th>
              <th style={{ padding: '0.5rem 0.75rem' }}>HTTP</th>
              <th style={{ padding: '0.5rem 0.75rem' }}>Latency</th>
              <th style={{ padding: '0.5rem 0.75rem' }}>Body (first 160B)</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.url} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '0.5rem 0.75rem' }}>{r.name}</td>
                <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>{r.url}</td>
                <td style={{ padding: '0.5rem 0.75rem' }}>
                  <span style={{ color: r.status === 'ok' ? 'var(--success)' : r.status === 'fail' ? 'var(--danger)' : 'var(--text-muted)' }}>
                    {r.status === 'ok' ? 'OK' : r.status === 'fail' ? 'FAIL' : r.status === 'running' ? '…' : '-'}
                  </span>
                </td>
                <td style={{ padding: '0.5rem 0.75rem' }}>{r.httpStatus ?? '-'}</td>
                <td style={{ padding: '0.5rem 0.75rem' }}>{r.latencyMs != null ? `${r.latencyMs} ms` : '-'}</td>
                <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {r.message ? r.message.slice(0, 160) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
