import { useMemo, useState } from 'react';
import { useStationMonitor } from '../lib/stationApi';

// #52: WIP รายสถานี (live poll 8 วิ) — ดีไซน์เรียบ: สรุปบรรทัดเดียว + ตารางสะอาด เรียง rework/งานค้างมากก่อน
function ago(iso: string | null): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '—';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const CARD: React.CSSProperties = { background: '#fff', border: '1px solid var(--border-color)', borderRadius: 12, padding: '1.15rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' };
// หัวข้อ + ช่องค้นหา ให้เป็นชุดเดียวกับ Work Orders widget
const TITLE: React.CSSProperties = { fontSize: '1.1rem', fontWeight: 800, color: '#1e293b', userSelect: 'none', cursor: 'default' };
const SEARCH: React.CSSProperties = { fontSize: '0.85rem', padding: '7px 12px', border: '1px solid var(--border-color)', borderRadius: 8, outline: 'none', width: 200, maxWidth: '45%' };
const TH: React.CSSProperties = { textAlign: 'center', fontSize: '0.66rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0 8px 8px', position: 'sticky', top: 0, background: '#fff' };
const TD: React.CSSProperties = { textAlign: 'center', fontSize: '0.85rem', padding: '8px', borderTop: '1px solid var(--border-color)', whiteSpace: 'nowrap' };

export function StationMonitorWidget() {
  const { data = [], isLoading, isError } = useStationMonitor();
  const [q, setQ] = useState('');

  const summary = useMemo(() => data.reduce((a, s) => ({
    inWip: a.inWip + s.unitsInStation, rework: a.rework + s.unitsReworkRequired, pass: a.pass + s.scanOutPassCount,
  }), { inWip: 0, rework: 0, pass: 0 }), [data]);

  // เรียง: rework มากก่อน → งานค้าง (WIP) มาก → ที่ต้องสนใจลอยขึ้นบน · แล้วกรองด้วยคำค้น
  const rows = useMemo(() => {
    const sorted = [...data].sort((a, b) => (b.unitsReworkRequired - a.unitsReworkRequired) || (b.unitsInStation - a.unitsInStation));
    const kw = q.trim().toLowerCase();
    return kw ? sorted.filter(s => `${s.stationName} ${s.routeCode}`.toLowerCase().includes(kw)) : sorted;
  }, [data, q]);

  return (
    <div style={CARD}>
      {/* หัว: title ใหญ่ + search (ชุดเดียวกับ Work Orders) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span style={TITLE}>Station Status</span>
        {!isLoading && !isError && data.length > 0 && (
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search station…" style={SEARCH} />
        )}
      </div>

      {isLoading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 12 }}>Loading…</div>
      ) : isError ? (
        <div style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: 12 }}>Cannot reach the station monitor endpoint.</div>
      ) : data.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 12 }}>No station activity.</div>
      ) : (
        <>
          {/* สรุปบรรทัดเดียว */}
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 10 }}>
            <b style={{ color: '#1e293b' }}>{data.length}</b> stations · <b style={{ color: 'var(--brand)' }}>{summary.inWip.toLocaleString()}</b> in WIP · <b style={{ color: summary.rework ? '#ea580c' : '#1e293b' }}>{summary.rework.toLocaleString()}</b> rework · <b style={{ color: '#16a34a' }}>{summary.pass.toLocaleString()}</b> pass
          </div>

          {/* ตารางสะอาด — สูงจำกัด + เลื่อนในตัว */}
          <div style={{ maxHeight: 260, overflowY: 'auto', marginTop: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              {/* กำหนดความกว้างคอลัมน์ตายตัว → หัว/ข้อมูลตรงกันเป๊ะ ไม่เยื้องตามชื่อสถานี */}
              {/* กว้างเป็น % → 4 ช่องหลังเท่ากันช่องละ 12% · Station ที่เหลือ 52% */}
              <colgroup>
                <col style={{ width: '52%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '12%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={{ ...TH, textAlign: 'left' }}>Station</th>
                  <th style={TH}>In WIP</th>
                  <th style={TH}>Rework</th>
                  <th style={TH}>Pass</th>
                  <th style={TH}>Last</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s, i) => (
                  <tr key={`${s.routeCode}-${s.stationName}`} style={i % 2 ? { background: '#f8fafc' } : undefined}>
                    <td style={{ ...TD, textAlign: 'left', fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.routeCode ? `${s.stationName} · ${s.routeCode}` : s.stationName}>{s.stationName}</td>
                    <td style={{ ...TD, fontWeight: 700 }}>{s.unitsInStation}</td>
                    <td style={{ ...TD, fontWeight: 700, color: s.unitsReworkRequired ? '#ea580c' : 'var(--text-muted)' }}>{s.unitsReworkRequired || '—'}</td>
                    <td style={{ ...TD, color: '#16a34a' }}>{s.scanOutPassCount}</td>
                    <td style={{ ...TD, color: 'var(--text-muted)', fontSize: '0.76rem' }}>{ago(s.lastScanAt)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={5} style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem 0' }}>No station matches “{q}”.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
