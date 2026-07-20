import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  useSerialTrace, useSerialList, useBoxList, useBoxDetail, useDailyReport,
  type TraceStep, type DailyReport,
} from '../lib/traceApi';
import { TableState, BlockState } from '../components/DataStates';

// ── helpers ──
const fmt = (s: string) => { try { return new Date(s).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }); } catch { return s; } };
const fmtDate = (s: string) => { try { return new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); } catch { return s; } };

function StatusPill({ status }: { status: 'PASS' | 'FAIL' | null }) {
  if (status == null) return (   // routing scan-in / ยังไม่มีผล → กลางๆ (ไม่ใช่ fail)
    <span className="status-badge" style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' }}>• Scan</span>
  );
  const ok = status === 'PASS';
  return (
    <span className="status-badge" style={{ background: ok ? '#dcfce7' : '#fee2e2', color: ok ? '#166534' : '#991b1b', border: `1px solid ${ok ? '#86efac' : '#fca5a5'}` }}>
      {ok ? '✓ PASS' : '✗ FAIL'}
    </span>
  );
}

// ── Timeline ── แสดง event ตามลำดับเวลา (เส้นแนวตั้ง + จุด)
function Timeline({ steps }: { steps: TraceStep[] }) {
  return (
    <div style={{ position: 'relative', paddingLeft: 28 }}>
      <div style={{ position: 'absolute', left: 9, top: 8, bottom: 8, width: 2, background: '#e2e8f0' }} />
      {steps.map((s, i) => {
        const st = s.status;   // 'PASS' | 'FAIL' | null (null = scan-in/ยังไม่มีผล)
        const dotBg = st === 'PASS' ? '#16a34a' : st === 'FAIL' ? '#dc2626' : '#94a3b8';
        const dotIcon = st === 'PASS' ? '✓' : st === 'FAIL' ? '✗' : '•';
        const cardBorder = st === 'FAIL' ? '#fca5a5' : '#e2e8f0';
        return (
          <div key={i} style={{ position: 'relative', marginBottom: i === steps.length - 1 ? 0 : 18 }}>
            <span style={{ position: 'absolute', left: -28, top: 2, width: 20, height: 20, borderRadius: '50%', background: dotBg, color: '#fff', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 3px #fff' }}>{dotIcon}</span>
            <div style={{ background: '#fff', border: `1px solid ${cardBorder}`, borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '0.92rem', color: '#1e293b' }}>{i + 1}. {s.step}</strong>
                <StatusPill status={s.status} />
              </div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span>🕒 {fmt(s.at)}</span>
                <span>👤 {s.operator}</span>
                <span>🏭 {s.station}</span>
              </div>
              {s.note && <div style={{ fontSize: '0.8rem', color: st === 'FAIL' ? '#b91c1c' : '#64748b', marginTop: 4, fontStyle: 'italic' }}>📝 {s.note}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Tab 1: ค้นหา Serial → Timeline ──
function SearchTab({ sn, setSn, goBox }: { sn: string; setSn: (s: string) => void; goBox: (b: string) => void }) {
  const [q, setQ] = useState(sn);
  const { data: serials = [] } = useSerialList();
  const { data: trace, isLoading, isError, error } = useSerialTrace(sn || null);

  const submit = (e: React.FormEvent) => { e.preventDefault(); setSn(q.trim()); };

  return (
    <div className="stack" style={{ marginTop: '1.25rem' }}>
      <form onSubmit={submit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input list="trace-serials" value={q} onChange={e => setQ(e.target.value)} placeholder="Enter / scan Serial Number e.g. SN-A100-0001" aria-label="Search Serial Number"
          style={{ flex: 1, minWidth: 220, padding: '0.6rem 0.8rem', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: '0.95rem' }} autoFocus />
        <datalist id="trace-serials">{serials.map(s => <option key={s} value={s} />)}</datalist>
        <button type="submit" className="btn" disabled={!q.trim()} style={{ fontWeight: 600 }}>🔍 Search</button>
      </form>

      {!sn && (
        <div style={{ padding: '1rem', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 8, color: '#64748b', fontSize: '0.88rem' }}>
          Type or scan a Serial and press Search — you will see the history of that item across every station
          {serials.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {serials.slice(0, 8).map(s => (
                <button key={s} type="button" onClick={() => { setQ(s); setSn(s); }}
                  style={{ padding: '6px 12px', borderRadius: 999, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: '0.8rem', color: '#334155' }}>{s}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {sn && isLoading && <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Searching...</div>}

      {sn && isError && (
        <div style={{ padding: '1.25rem', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, color: '#b91c1c', textAlign: 'center' }}>
          ⚠️ {(error as Error)?.message || 'Serial not found'}<br />
          <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Check the Serial number again, or choose from the list above</span>
        </div>
      )}

      {sn && trace && (
        <>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1e3a8a' }}>{trace.serial}</div>
            {trace.product && <><span style={{ color: '#94a3b8' }}>·</span><span style={{ fontSize: '0.88rem', color: '#334155' }}>Product: <strong>{trace.product}</strong></span></>}
            {trace.wo && <span style={{ fontSize: '0.88rem', color: '#334155' }}>Route/WO: <strong>{trace.wo}</strong></span>}
            {trace.box && (
              <button type="button" onClick={() => goBox(trace.box)}
                style={{ marginLeft: 'auto', padding: '8px 14px', borderRadius: 8, border: '1px solid #93c5fd', background: '#fff', color: '#1d4ed8', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
                📦 {trace.box} →
              </button>
            )}
          </div>
          <div style={{ marginTop: 4 }}><Timeline steps={trace.steps} /></div>
        </>
      )}
    </div>
  );
}

// ── Tab 2: กล่อง (Boxes) ──
function BoxesTab({ boxId, setBox, goSerial }: { boxId: string; setBox: (b: string) => void; goSerial: (s: string) => void }) {
  const { data: boxes = [], isLoading, isError: boxesError, refetch: refetchBoxes } = useBoxList();
  const { data: box, isLoading: boxLoading, isError } = useBoxDetail(boxId || null);

  if (boxId) {
    return (
      <div className="stack" style={{ marginTop: '1.25rem' }}>
        <button type="button" className="btn secondary" style={{ alignSelf: 'flex-start', fontSize: '0.82rem' }} onClick={() => setBox('')}>← Back to box list</button>
        {boxLoading && <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Loading...</div>}
        {isError && <div style={{ padding: '1rem', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, color: '#b91c1c', textAlign: 'center' }}>⚠️ Box not found</div>}
        {box && (
          <>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px', fontSize: '0.88rem' }}>
              <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>📦 {box.box_id}</span>
              <span>Product: <strong>{box.product}</strong></span>
              <span>WO: <strong>{box.wo}</strong></span>
              <span>Packed: {fmt(box.packed_at)}</span>
              <span style={{ marginLeft: 'auto', color: '#64748b' }}>{box.items.length} pcs</span>
            </div>
            <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 8 }}>
              <table className="table" style={{ minWidth: 480, width: '100%' }}>
                <thead><tr><th>Serial</th><th>Product</th><th>Last step</th><th style={{ textAlign: 'center' }}>Result</th></tr></thead>
                <tbody>
                  {box.items.map(it => (
                    <tr key={it.serial} style={{ cursor: 'pointer' }} onClick={() => goSerial(it.serial)}
                      tabIndex={0} role="button" aria-label={`View timeline of ${it.serial}`}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goSerial(it.serial); } }}
                      title="View timeline of this serial">
                      <td style={{ fontWeight: 600, color: 'var(--brand)' }}>{it.serial}</td>
                      <td>{it.product}</td>
                      <td>{it.last_step}</td>
                      <td style={{ textAlign: 'center' }}><StatusPill status={it.last_status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="stack" style={{ marginTop: '1.25rem' }}>
      {isLoading ? (
        <BlockState state="loading" />
      ) : boxesError ? (
        <BlockState state="error" onRetry={() => refetchBoxes()} />
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 8 }}>
          <table className="table" style={{ minWidth: 520, width: '100%' }}>
            <thead><tr><th>Box</th><th>Product</th><th>WO</th><th>Packed at</th><th style={{ textAlign: 'center' }}>Qty</th></tr></thead>
            <tbody>
              {boxes.length === 0 ? (
                <TableState colSpan={5} state="empty" emptyText="No boxes yet" />
              ) : boxes.map(b => (
                <tr key={b.box_id} style={{ cursor: 'pointer' }} onClick={() => setBox(b.box_id)}
                  tabIndex={0} role="button" aria-label={`Open box ${b.box_id}`}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setBox(b.box_id); } }}
                  title="View serials in the box">
                  <td style={{ fontWeight: 600, color: 'var(--brand)' }}>📦 {b.box_id}</td>
                  <td>{b.product}</td>
                  <td>{b.wo}</td>
                  <td style={{ whiteSpace: 'nowrap', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{fmt(b.packed_at)}</td>
                  <td style={{ textAlign: 'center' }}>{b.serial_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Tab 3: รายงานรายวัน + export CSV ──
function ReportTab() {
  const { data: report = [], isLoading, isError, refetch } = useDailyReport();

  const exportCsv = () => {
    const head = ['date', 'total', 'pass', 'fail', 'pass_rate'];
    const rows = report.map((r: DailyReport) => [r.date, r.total, r.pass, r.fail, r.pass_rate]);
    const csv = [head, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `traceability-daily-report.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="stack" style={{ marginTop: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" className="btn secondary" style={{ fontSize: '0.82rem' }} disabled={report.length === 0} onClick={exportCsv}>⬇️ Export CSV</button>
      </div>
      {isLoading ? (
        <BlockState state="loading" />
      ) : isError ? (
        <BlockState state="error" onRetry={() => refetch()} />
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 8 }}>
          <table className="table" style={{ minWidth: 480, width: '100%' }}>
            <thead><tr><th>Date</th><th style={{ textAlign: 'center' }}>Produced</th><th style={{ textAlign: 'center' }}>Pass</th><th style={{ textAlign: 'center' }}>Fail</th><th style={{ textAlign: 'center' }}>% Pass</th></tr></thead>
            <tbody>
              {report.length === 0 ? (
                <TableState colSpan={5} state="empty" emptyText="No data" />
              ) : report.map(r => (
                <tr key={r.date}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</td>
                  <td style={{ textAlign: 'center' }}>{r.total}</td>
                  <td style={{ textAlign: 'center', color: '#16a34a', fontWeight: 600 }}>{r.pass}</td>
                  <td style={{ textAlign: 'center', color: '#dc2626', fontWeight: 600 }}>{r.fail}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: r.pass_rate >= 95 ? '#16a34a' : r.pass_rate >= 80 ? '#d97706' : '#dc2626' }}>{r.pass_rate.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type Tab = 'search' | 'boxes' | 'report';

export function TraceabilityPage() {
  const [params, setParams] = useSearchParams();
  const p = params.get('tab');
  const tab: Tab = (p === 'boxes' || p === 'report') ? p : 'search';
  const sn = params.get('sn') || '';
  const box = params.get('box') || '';

  const patch = (next: Record<string, string | null>) => {
    const n = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) { if (v) n.set(k, v); else n.delete(k); }
    setParams(n, { replace: true });
  };
  const setTab = (t: Tab) => patch({ tab: t });
  const setSn = (s: string) => patch({ tab: 'search', sn: s || null });
  const setBox = (b: string) => patch({ tab: 'boxes', box: b || null });
  const goSerial = (s: string) => patch({ tab: 'search', sn: s, box: null });
  const goBox = (b: string) => patch({ tab: 'boxes', box: b, sn: null });

  const TABS: { key: Tab; label: string }[] = [
    { key: 'search', label: '🔍 Search Serial' },
    { key: 'boxes', label: '📦 Boxes' },
    { key: 'report', label: '📊 Daily report' },
  ];

  return (
    <section className="stack-lg">
      <div className="panel">
        <h1 className="panel__title">Traceability — Track Item History</h1>
        <p className="panel__subtitle">Search a Serial → view every station it passed · view boxes/daily report</p>

        <div className="mes-module-tabs" style={{ marginTop: '1.25rem' }}>
          {TABS.map(t => (
            <button key={t.key} type="button" className={`mes-module-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>

        {tab === 'search' && <SearchTab sn={sn} setSn={setSn} goBox={goBox} />}
        {tab === 'boxes' && <BoxesTab boxId={box} setBox={setBox} goSerial={goSerial} />}
        {tab === 'report' && <ReportTab />}
      </div>
    </section>
  );
}
