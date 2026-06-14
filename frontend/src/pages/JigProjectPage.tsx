import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useJigProject, useJigRecords, useJigTimeseries, JigTimeseries, JigRecord } from '../lib/jigApi';

/* ──────── SVG Line Chart ──────── */
function LineChart({ data }: { data: JigTimeseries[] }) {
  const W = 600, H = 180, PAD = { top: 16, right: 16, bottom: 40, left: 40 };
  const inner = { w: W - PAD.left - PAD.right, h: H - PAD.top - PAD.bottom };

  if (data.length < 2) {
    return <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>ข้อมูลไม่เพียงพอ</div>;
  }

  const rates = data.map(d => d.passRate);
  const minY = Math.max(0, Math.min(...rates) - 5);
  const maxY = Math.min(100, Math.max(...rates) + 5);
  const rangeY = maxY - minY || 1;

  function x(i: number) { return PAD.left + (i / (data.length - 1)) * inner.w; }
  function y(v: number) { return PAD.top + inner.h - ((v - minY) / rangeY) * inner.h; }

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(d.passRate)}`).join(' ');
  const areaPath = `${linePath} L${x(data.length - 1)},${PAD.top + inner.h} L${PAD.left},${PAD.top + inner.h} Z`;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => minY + t * rangeY);
  const labelStep = Math.max(1, Math.floor(data.length / 6));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H }}>
      <defs>
        <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#3b82f6" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Y grid + labels */}
      {ticks.map(t => (
        <g key={t}>
          <line x1={PAD.left} y1={y(t)} x2={PAD.left + inner.w} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
          <text x={PAD.left - 4} y={y(t) + 4} textAnchor="end" fontSize={10} fill="var(--text-muted)">{t.toFixed(0)}%</text>
        </g>
      ))}

      {/* X labels */}
      {data.map((d, i) => i % labelStep === 0 && (
        <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize={9} fill="var(--text-muted)">
          {d.date.slice(5)}
        </text>
      ))}

      {/* Area fill */}
      <path d={areaPath} fill="url(#area-grad)" />

      {/* Line */}
      <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth={2} strokeLinejoin="round" />

      {/* Dots */}
      {data.map((d, i) => (
        <circle key={i} cx={x(i)} cy={y(d.passRate)} r={3} fill="#3b82f6">
          <title>{d.date}: {d.passRate.toFixed(1)}% ({d.passCount}/{d.total})</title>
        </circle>
      ))}
    </svg>
  );
}

/* ──────── Records Table ──────── */
function RecordsTable({ records }: { records: JigRecord[] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)' }}>
            {['#', 'Serial', 'Result', 'Tested At', 'V (V)', 'I (mA)', 'T (°C)', 'Fail Param', 'Notes'].map(h => (
              <th key={h} style={{ padding: '0.5rem 0.6rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((r, idx) => (
            <tr key={r.id} style={{ borderBottom: '1px solid var(--border)', background: r.result === 'FAIL' ? 'rgba(239,68,68,0.03)' : undefined }}>
              <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>{idx + 1}</td>
              <td style={{ padding: '0.45rem 0.6rem', fontFamily: 'monospace', fontSize: '0.82rem' }}>{r.serial}</td>
              <td style={{ padding: '0.45rem 0.6rem' }}>
                <span style={{
                  fontSize: '0.7rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                  background: r.result === 'PASS' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                  color: r.result === 'PASS' ? '#22c55e' : '#ef4444',
                }}>{r.result}</span>
              </td>
              <td style={{ padding: '0.45rem 0.6rem', fontSize: '0.78rem', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                {new Date(r.testedAt).toLocaleString('th-TH')}
              </td>
              <td style={{ padding: '0.45rem 0.6rem' }}>{r.voltage ?? '—'}</td>
              <td style={{ padding: '0.45rem 0.6rem' }}>{r.currentMa ?? '—'}</td>
              <td style={{ padding: '0.45rem 0.6rem' }}>{r.tempC ?? '—'}</td>
              <td style={{ padding: '0.45rem 0.6rem', color: r.failParam ? '#ef4444' : 'var(--text-muted)' }}>{r.failParam ?? '—'}</td>
              <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-muted)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.notes ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ──────── Page ──────── */
export function JigProjectPage() {
  const { projectCode } = useParams<{ projectCode: string }>();
  const navigate = useNavigate();
  const [resultFilter, setResultFilter] = useState<'' | 'PASS' | 'FAIL'>('');

  const { data: project, isLoading: loadingProject, error: projError } = useJigProject(projectCode);
  const { data: records = [], isLoading: loadingRecords } = useJigRecords(projectCode, resultFilter);
  const { data: timeseries = [], isLoading: loadingTs } = useJigTimeseries(projectCode);

  if (loadingProject) return <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>กำลังโหลด...</div>;
  if (projError || !project) return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <p style={{ color: 'var(--danger)' }}>ไม่พบโปรเจกต์ "{projectCode}"</p>
      <button className="btn secondary" style={{ marginTop: '1rem' }} onClick={() => navigate('/jig-test')}>← กลับ</button>
    </div>
  );

  const passColor = project.passRate >= 95 ? '#22c55e' : project.passRate >= 80 ? '#f59e0b' : '#ef4444';

  return (
    <section className="stack-lg" style={{ maxWidth: 960, margin: '0 auto' }}>
      {/* Header */}
      <div className="panel">
        <button className="btn secondary" style={{ fontSize: '0.8rem', marginBottom: '0.75rem' }} onClick={() => navigate('/jig-test')}>
          ← กลับ Jig Test
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h1 className="panel__title">{project.name}</h1>
            <p className="panel__subtitle"><code>{project.projectCode}</code> · Jig ID: <code>{project.jigId}</code></p>
          </div>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, padding: '4px 12px', borderRadius: 99, background: project.isActive ? 'rgba(34,197,94,0.15)' : 'rgba(156,163,175,0.15)', color: project.isActive ? '#22c55e' : '#9ca3af' }}>
            {project.isActive ? 'ACTIVE' : 'INACTIVE'}
          </span>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px,1fr))', gap: '0.75rem', marginTop: '1rem' }}>
          {[
            { label: 'Total', value: project.total, color: undefined },
            { label: 'Pass', value: project.passCount, color: '#22c55e' },
            { label: 'Fail', value: project.failCount, color: '#ef4444' },
            { label: 'Pass Rate', value: `${project.passRate.toFixed(1)}%`, color: passColor },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--bg-muted)', borderRadius: 8, padding: '0.75rem', textAlign: 'center' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: s.color ?? 'var(--text-base)' }}>{s.value}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Trend Chart */}
      <div className="panel">
        <h2 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.75rem' }}>Pass Rate Trend (รายวัน)</h2>
        {loadingTs ? (
          <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>กำลังโหลด...</div>
        ) : (
          <LineChart data={timeseries} />
        )}
      </div>

      {/* Records Table */}
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '0.9rem', fontWeight: 700 }}>
            Test Records {loadingRecords ? '' : `(${records.length})`}
          </h2>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['', 'PASS', 'FAIL'] as const).map(f => (
              <button
                key={f}
                className={`btn ${resultFilter === f ? 'primary' : 'secondary'}`}
                style={{ fontSize: '0.78rem', padding: '4px 12px' }}
                onClick={() => setResultFilter(f)}
              >
                {f === '' ? 'All' : f}
              </button>
            ))}
          </div>
        </div>
        {loadingRecords ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>กำลังโหลด...</div>
        ) : records.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>ไม่พบข้อมูล</div>
        ) : (
          <RecordsTable records={records} />
        )}
      </div>
    </section>
  );
}
