import { useState } from 'react';
import {
  useSerialTrace, useSerialList, useBoxes, useBoxDetail, useDailyReport,
  SerialTrace, BoxContent,
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
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, marginBottom: '0.75rem' }}>
        <input
          className="input" list="serial-list" placeholder="กรอก Serial Number..."
          value={input} onChange={e => setInput(e.target.value)}
          style={{ flex: 1 }}
        />
        <datalist id="serial-list">
          {serials.map(s => <option key={s} value={s} />)}
        </datalist>
        <button type="submit" className="btn primary">ค้นหา</button>
        {search && <button type="button" className="btn secondary" onClick={() => { setSearch(null); setInput(''); }}>ล้าง</button>}
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

function BoxDetailView({ box }: { box: BoxContent }) {
  return (
    <div className="panel" style={{ marginTop: '1rem' }}>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div><span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Box ID</span><div style={{ fontWeight: 700, fontFamily: 'monospace' }}>{box.box_id}</div></div>
        <div><span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Product</span><div style={{ fontWeight: 600 }}>{box.product}</div></div>
        <div><span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>WO</span><div style={{ fontWeight: 600 }}>{box.wo}</div></div>
        <div><span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Packed</span><div style={{ fontWeight: 600 }}>{new Date(box.packed_at).toLocaleString('th-TH')}</div></div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)' }}>
            {['Serial', 'Product', 'Last Step', 'Status'].map(h => (
              <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.78rem' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {box.items.map(item => (
            <tr key={item.serial} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'monospace', fontSize: '0.82rem' }}>{item.serial}</td>
              <td style={{ padding: '0.5rem 0.75rem' }}>{item.product}</td>
              <td style={{ padding: '0.5rem 0.75rem' }}>{item.last_step}</td>
              <td style={{ padding: '0.5rem 0.75rem' }}>
                <span style={{
                  fontSize: '0.72rem', fontWeight: 700, padding: '1px 7px', borderRadius: 99,
                  background: STATUS_COLOR[item.last_status as 'PASS' | 'FAIL'] ?? '#9ca3af', color: '#fff',
                }}>{item.last_status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BoxTab() {
  const { data: boxes = [], isLoading: loadingBoxes } = useBoxes();
  const [selectedBox, setSelectedBox] = useState<string | null>(null);
  const { data: boxDetail, isLoading: loadingDetail } = useBoxDetail(selectedBox);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '1rem' }}>
        {loadingBoxes ? (
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>กำลังโหลด...</span>
        ) : (
          boxes.map((b: any) => (
            <button
              key={b.box_id}
              className={`btn ${selectedBox === b.box_id ? 'primary' : 'secondary'}`}
              onClick={() => setSelectedBox(b.box_id)}
              style={{ fontSize: '0.82rem' }}
            >
              {b.box_id} <span style={{ opacity: 0.7 }}>({b.serial_count} items)</span>
            </button>
          ))
        )}
      </div>

      {selectedBox && (
        loadingDetail ? (
          <div style={{ padding: '1rem', color: 'var(--text-muted)' }}>กำลังโหลด...</div>
        ) : boxDetail ? (
          <BoxDetailView box={boxDetail} />
        ) : null
      )}

      {!selectedBox && boxes.length > 0 && (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>เลือก Box เพื่อดูรายละเอียด</div>
      )}
    </div>
  );
}

function DailyReportTab() {
  const { data: rows = [], isLoading } = useDailyReport();

  if (isLoading) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>กำลังโหลด...</div>;

  return (
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
  );
}

export function TraceabilityPage() {
  const [tab, setTab] = useState<'serial' | 'box' | 'daily'>('serial');

  return (
    <section className="stack-lg" style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="panel">
        <h1 className="panel__title">Traceability</h1>
        <p className="panel__subtitle">ติดตามประวัติการผลิตและบรรจุหีบห่อ</p>

        <div className="mes-module-tabs" style={{ marginTop: '1.25rem' }}>
          <button className={`mes-module-tab ${tab === 'serial' ? 'active' : ''}`} onClick={() => setTab('serial')}>
            Serial Search
          </button>
          <button className={`mes-module-tab ${tab === 'box' ? 'active' : ''}`} onClick={() => setTab('box')}>
            Box View
          </button>
          <button className={`mes-module-tab ${tab === 'daily' ? 'active' : ''}`} onClick={() => setTab('daily')}>
            Daily Report
          </button>
        </div>

        <div style={{ marginTop: '1.25rem' }}>
          {tab === 'serial' && <SerialSearchTab />}
          {tab === 'box'    && <BoxTab />}
          {tab === 'daily'  && <DailyReportTab />}
        </div>
      </div>
    </section>
  );
}
