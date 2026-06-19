import { useState } from 'react';
import {
  useSerialTrace, useSerialList, useDailyReport,
  SerialTrace,
} from '../lib/traceApi';

const STATUS_COLOR = { PASS: '#22c55e', FAIL: '#ef4444' };

function TimelineView({ trace }: { trace: SerialTrace }) {
  return (
    <div className="panel" style={{ marginTop: '1rem' }}>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div><span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Serial</span><div style={{ fontWeight: 700, fontFamily: 'monospace' }}>{trace.serial}</div></div>
        <div><span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Product</span><div style={{ fontWeight: 600 }}>{trace.product}</div></div>
        <div><span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>WO</span><div style={{ fontWeight: 600 }}>{trace.wo}</div></div>
        <div><span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Box</span><div style={{ fontWeight: 600 }}>{trace.box || '—'}</div></div>
      </div>
      <div style={{ position: 'relative', paddingLeft: '1.5rem' }}>
        <div style={{ position: 'absolute', left: 9, top: 0, bottom: 0, width: 2, background: 'var(--border)' }} />
        {trace.steps.map((s, i) => (
          <div key={i} style={{ position: 'relative', marginBottom: '1rem', paddingLeft: '1.25rem' }}>
            <div style={{
              position: 'absolute', left: -1, top: 3,
              width: 12, height: 12, borderRadius: '50%',
              background: STATUS_COLOR[s.status] ?? '#9ca3af',
              border: '2px solid var(--bg-base)',
            }} />
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{s.step}</span>
              <span style={{
                fontSize: '0.72rem', fontWeight: 700, padding: '1px 7px', borderRadius: 99,
                background: STATUS_COLOR[s.status] ?? '#9ca3af', color: '#fff',
              }}>{s.status}</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{s.station}</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{s.operator}</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                {new Date(s.at).toLocaleString('th-TH')}
              </span>
            </div>
            {s.note && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>{s.note}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function SerialSearchTab() {
  const [input, setInput] = useState('');
  const [search, setSearch] = useState<string | null>(null);
  const { data: serials = [] } = useSerialList();
  const { data: trace, isLoading, error } = useSerialTrace(search);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (input.trim()) setSearch(input.trim());
  }

  return (
    <div>
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'stretch' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <span style={{
            position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-muted)', fontSize: '1rem', pointerEvents: 'none',
          }}>🔍</span>
          <input
            className="form-input" list="serial-list"
            placeholder="กรอก Serial Number..."
            value={input} onChange={e => setInput(e.target.value)}
            style={{ paddingLeft: '2.25rem', height: '2.75rem', fontSize: '1rem', fontFamily: 'ui-monospace, monospace' }}
          />
        </div>
        <datalist id="serial-list">
          {serials.map(s => <option key={s} value={s} />)}
        </datalist>
        <button type="submit" className="btn" style={{ height: '2.75rem', padding: '0 1.5rem', fontSize: '0.95rem' }}>ค้นหา</button>
        {search && <button type="button" className="btn secondary" style={{ height: '2.75rem' }} onClick={() => { setSearch(null); setInput(''); }}>ล้าง</button>}
      </form>

      {serials.length > 0 && !search && (
        <div style={{ marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Serial ที่มีในระบบ: </span>
          {serials.map(s => (
            <button key={s} className="btn secondary" style={{ fontSize: '0.75rem', padding: '2px 8px', margin: '2px 4px 2px 0' }} onClick={() => { setInput(s); setSearch(s); }}>
              {s}
            </button>
          ))}
        </div>
      )}

      {isLoading && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>กำลังค้นหา...</div>}
      {error && <div style={{ padding: '1rem', color: 'var(--danger)', background: 'rgba(239,68,68,0.08)', borderRadius: 6 }}>ไม่พบ serial: {search}</div>}
      {trace && <TimelineView trace={trace} />}
    </div>
  );
}


function toCsv(rows: { date: string; total: number; pass: number; fail: number; pass_rate: number }[]): string {
  const header = ['Date', 'Total', 'Pass', 'Fail', 'Pass Rate (%)'];
  const body = rows.map(r => [r.date, r.total, r.pass, r.fail, r.pass_rate.toFixed(1)]);
  // ใส่ BOM ให้ Excel อ่านภาษาไทย/encoding ถูก
  return '﻿' + [header, ...body].map(cols => cols.join(',')).join('\r\n');
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function DailyReportTab() {
  const { data: rows = [], isLoading } = useDailyReport();

  function handleExport() {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`daily-report-${stamp}.csv`, toCsv(rows));
  }

  if (isLoading) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>กำลังโหลด...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
        <button type="button" className="btn secondary" onClick={handleExport} disabled={rows.length === 0}
          style={{ fontSize: '0.82rem' }} title={rows.length === 0 ? 'ไม่มีข้อมูลให้ export' : 'ดาวน์โหลดเป็นไฟล์ CSV'}>
          ⬇️ Export CSV
        </button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.87rem' }}>
      <thead>
        <tr style={{ borderBottom: '2px solid var(--border)' }}>
          {['วันที่', 'Total', 'Pass', 'Fail', 'Pass Rate'].map(h => (
            <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.78rem' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.date} style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'monospace' }}>{row.date}</td>
            <td style={{ padding: '0.5rem 0.75rem' }}>{row.total}</td>
            <td style={{ padding: '0.5rem 0.75rem', color: '#22c55e', fontWeight: 600 }}>{row.pass}</td>
            <td style={{ padding: '0.5rem 0.75rem', color: '#ef4444', fontWeight: 600 }}>{row.fail}</td>
            <td style={{ padding: '0.5rem 0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ width: `${row.pass_rate}%`, height: '100%', background: row.pass_rate >= 90 ? '#22c55e' : row.pass_rate >= 70 ? '#f59e0b' : '#ef4444', borderRadius: 99 }} />
                </div>
                <span style={{ minWidth: 40, fontWeight: 600 }}>{row.pass_rate.toFixed(1)}%</span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

export function TraceabilityPage() {
  const [tab, setTab] = useState<'serial' | 'daily'>('serial');

  return (
    <section className="stack-lg">
      <div className="panel">
        <h1 className="panel__title">Traceability</h1>
        <p className="panel__subtitle">ติดตามประวัติการผลิตของแต่ละ Serial</p>

        <div className="mes-module-tabs" style={{ marginTop: '1.25rem' }}>
          <button className={`mes-module-tab ${tab === 'serial' ? 'active' : ''}`} onClick={() => setTab('serial')}>
            Serial Search
          </button>
          <button className={`mes-module-tab ${tab === 'daily' ? 'active' : ''}`} onClick={() => setTab('daily')}>
            Daily Report
          </button>
        </div>

        <div style={{ marginTop: '1.25rem' }}>
          {tab === 'serial' && <SerialSearchTab />}
          {tab === 'daily'  && <DailyReportTab />}
        </div>
      </div>
    </section>
  );
}
