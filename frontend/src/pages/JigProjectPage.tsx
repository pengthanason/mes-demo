import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useJigProject, useJigRecords, useJigTimeseries, useJigRetests, useJigRetestCreate, useJigRecordCreate, JigTimeseries, JigRecord } from '../lib/jigApi';
import { useIsViewer } from '../lib/useMockStore';
import { showToast } from '../lib/toast';

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
function RecordsTable({ records, onSelect }: { records: JigRecord[]; onSelect: (r: JigRecord) => void }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)' }}>
            {['#', 'Serial', 'Result', 'Tested At', 'V (V)', 'I (mA)', 'T (°C)', 'Fail Param', ''].map(h => (
              <th key={h} style={{ padding: '0.5rem 0.6rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((r, idx) => (
            <tr
              key={r.id}
              onClick={() => onSelect(r)}
              style={{ borderBottom: '1px solid var(--border)', background: r.result === 'FAIL' ? 'rgba(239,68,68,0.03)' : undefined, cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
              onMouseLeave={e => (e.currentTarget.style.background = r.result === 'FAIL' ? 'rgba(239,68,68,0.03)' : '')}
            >
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
              <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', color: 'var(--primary)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>ดู →</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ──────── Detail Modal (drill-down) ──────── */
function RecordDetailModal({ record, onClose, onRetest, retesting, alreadyRequested }:
  { record: JigRecord; onClose: () => void; onRetest: () => void; retesting: boolean; alreadyRequested: boolean }) {
  const isFail = record.result === 'FAIL';
  const rows: [string, any][] = [
    ['Serial', record.serial],
    ['ผลทดสอบ', record.result],
    ['เวลาทดสอบ', new Date(record.testedAt).toLocaleString('th-TH')],
    ['Voltage (V)', record.voltage ?? '—'],
    ['Current (mA)', record.currentMa ?? '—'],
    ['Temperature (°C)', record.tempC ?? '—'],
    ['Fail Parameter', record.failParam ?? '—'],
    ['Notes', record.notes ?? '—'],
  ];
  return (
    <div className="modal-overlay">
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 'min(100%, 440px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <span style={{ fontSize: '1.4rem', width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, background: isFail ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)' }}>{isFail ? '❌' : '✅'}</span>
          <div>
            <h2 className="panel__title" style={{ margin: 0 }}>รายละเอียดการทดสอบ</h2>
            <p className="panel__subtitle" style={{ margin: 0 }}><code>{record.serial}</code></p>
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.87rem' }}>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '0.5rem 0', color: 'var(--text-muted)', width: '45%' }}>{k}</td>
                <td style={{ padding: '0.5rem 0', fontWeight: 600, color: k === 'Fail Parameter' && record.failParam ? '#ef4444' : '#1e293b' }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>ปิด</button>
          {isFail && (
            alreadyRequested ? (
              <span style={{ alignSelf: 'center', fontSize: '0.82rem', fontWeight: 600, color: '#f59e0b' }}>🔁 ขอ Retest แล้ว</span>
            ) : (
              <button type="button" className="btn" disabled={retesting} onClick={onRetest}
                style={{ background: '#f59e0b', borderColor: '#f59e0b', color: '#fff', fontWeight: 600 }}>
                {retesting ? 'กำลังส่ง...' : '🔁 สั่ง Retest'}
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}

/* ──────── Add Record Modal (กรอกผลทดสอบมือ) ──────── */
function AddRecordModal({ code, onClose }: { code: string; onClose: () => void }) {
  const [serial, setSerial] = useState('');
  const [result, setResult] = useState<'PASS' | 'FAIL'>('PASS');
  const [voltage, setVoltage] = useState('');
  const [currentMa, setCurrentMa] = useState('');
  const [tempC, setTempC] = useState('');
  const [failParam, setFailParam] = useState('');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState('');
  const mut = useJigRecordCreate(code);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (!serial.trim()) return setErr('กรุณาใส่ Serial');
    mut.mutate(
      { serial: serial.trim(), result, voltage, currentMa, tempC, failParam: result === 'FAIL' ? failParam : '', notes },
      { onSuccess: () => { showToast(`บันทึกผล ${serial.trim()} (${result})`, result === 'PASS' ? 'success' : 'error'); onClose(); },
        onError: (e: any) => setErr(e.message) }
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 'min(100%, 460px)' }}>
        <h2 className="panel__title" style={{ marginBottom: '1rem' }}>บันทึกผลทดสอบ Jig</h2>
        <form onSubmit={submit} className="stack" style={{ gap: '0.85rem' }}>
          <label className="field"><span>Serial *</span>
            <input value={serial} onChange={e => setSerial(e.target.value)} placeholder="เช่น SN-001" autoFocus required />
          </label>
          <label className="field"><span>ผลทดสอบ *</span>
            <select value={result} onChange={e => setResult(e.target.value as 'PASS' | 'FAIL')}>
              <option value="PASS">✅ PASS</option>
              <option value="FAIL">❌ FAIL</option>
            </select>
          </label>
          <div className="grid-3col">
            <label className="field"><span>Voltage (V)</span>
              <input type="number" step="0.01" value={voltage} onChange={e => setVoltage(e.target.value)} placeholder="3.30" />
            </label>
            <label className="field"><span>Current (mA)</span>
              <input type="number" step="0.01" value={currentMa} onChange={e => setCurrentMa(e.target.value)} placeholder="1.20" />
            </label>
            <label className="field"><span>Temp (°C)</span>
              <input type="number" step="0.1" value={tempC} onChange={e => setTempC(e.target.value)} placeholder="42" />
            </label>
          </div>
          {result === 'FAIL' && (
            <label className="field"><span>Fail Parameter</span>
              <input value={failParam} onChange={e => setFailParam(e.target.value)} placeholder="เช่น VOLTAGE_LOW" />
            </label>
          )}
          <label className="field"><span>หมายเหตุ</span>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="(ถ้ามี)" />
          </label>
          {err && <div className="notice err">{err}</div>}
          <div className="modal-actions">
            <button type="button" className="btn secondary" onClick={onClose}>ยกเลิก</button>
            <button type="submit" className="btn" disabled={mut.isPending}>{mut.isPending ? 'กำลังบันทึก...' : 'บันทึกผล'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ──────── Page ──────── */
export function JigProjectPage() {
  const { projectCode } = useParams<{ projectCode: string }>();
  const navigate = useNavigate();
  const [resultFilter, setResultFilter] = useState<'' | 'PASS' | 'FAIL'>('');
  const [dateFilter, setDateFilter] = useState('');
  const [selected, setSelected] = useState<JigRecord | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const isViewer = useIsViewer();

  const { data: project, isLoading: loadingProject, error: projError } = useJigProject(projectCode);
  const { data: records = [], isLoading: loadingRecords } = useJigRecords(projectCode, resultFilter);
  const { data: timeseries = [], isLoading: loadingTs } = useJigTimeseries(projectCode);
  const { data: retests = [] } = useJigRetests(projectCode);
  const retestMut = useJigRetestCreate(projectCode);

  // serial ที่ขอ retest ไปแล้ว (กันขอซ้ำ)
  const requestedSerials = useMemo(() => new Set(retests.map(r => r.serial)), [retests]);

  // filter วันที่ (client-side ตามวันที่ทดสอบ)
  const shownRecords = useMemo(
    () => (dateFilter ? records.filter(r => r.testedAt.slice(0, 10) === dateFilter) : records),
    [records, dateFilter]
  );

  function handleRetest(serial: string) {
    retestMut.mutate(serial, {
      onSuccess: () => { showToast(`ส่งคำสั่ง Retest: ${serial}`, 'success'); setSelected(null); },
      onError: (err: any) => showToast(err.message, 'error'),
    });
  }

  if (loadingProject) return <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>กำลังโหลด...</div>;
  if (projError || !project) return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <p style={{ color: 'var(--danger)' }}>ไม่พบโปรเจกต์ "{projectCode}"</p>
      <button className="btn secondary" style={{ marginTop: '1rem' }} onClick={() => navigate('/jig-test')}>← กลับ</button>
    </div>
  );

  const passColor = project.passRate >= 95 ? '#22c55e' : project.passRate >= 80 ? '#f59e0b' : '#ef4444';

  return (
    <section className="stack-lg">
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
            Test Records {loadingRecords ? '' : `(${shownRecords.length})`}
          </h2>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {!isViewer && <button type="button" className="btn" style={{ fontSize: '0.78rem', padding: '4px 12px' }} onClick={() => setShowAdd(true)}>+ บันทึกผล</button>}
            <input
              type="date"
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
              className="form-input"
              style={{ fontSize: '0.78rem', padding: '4px 8px', height: 30 }}
              title="กรองตามวันที่ทดสอบ"
            />
            {dateFilter && (
              <button className="btn secondary" title="ล้างการกรองตามวันที่" style={{ fontSize: '0.78rem', padding: '4px 10px' }} onClick={() => setDateFilter('')}>ล้างวันที่</button>
            )}
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
        ) : shownRecords.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>ไม่พบข้อมูล{dateFilter ? ` ในวันที่ ${dateFilter}` : ''}</div>
        ) : (
          <RecordsTable records={shownRecords} onSelect={setSelected} />
        )}
      </div>

      {selected && (
        <RecordDetailModal
          record={selected}
          onClose={() => setSelected(null)}
          onRetest={() => handleRetest(selected.serial)}
          retesting={retestMut.isPending}
          alreadyRequested={requestedSerials.has(selected.serial)}
        />
      )}

      {showAdd && projectCode && <AddRecordModal code={projectCode} onClose={() => setShowAdd(false)} />}
    </section>
  );
}
