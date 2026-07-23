import { useMemo, useState } from 'react';
import { useStationMonitor } from '../lib/stationApi';

// #52: WIP รายสถานี (live poll 8 วิ) — ดีไซน์ตาม MES dashboard: KPI strip + ตาราง grid + บาร์ proportional บาง
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

// ระบบสีเดียวทั้ง widget — WIP ฟ้า / Rework เหลืองอำพัน / Pass เขียวมรกต
const C = {
  wip: '#0ea5e9', wipBg: '#e0f2fe', wipFg: '#0369a1',
  rw: '#f59e0b', rwBg: '#fef3c7', rwFg: '#b45309',
  pass: '#10b981', passBg: '#d1fae5', passFg: '#047857',
  muteBg: '#f1f5f9', muteFg: '#94a3b8',
};
const COLS = '1.4fr 2fr 198px 46px';   // Station | Breakdown | WIP·RW·Pass | Updated

const CARD: React.CSSProperties = { background: '#fff', border: '1px solid var(--border-color)', borderRadius: 12, padding: '1.15rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' };
const TITLE: React.CSSProperties = { fontSize: '1.1rem', fontWeight: 800, color: '#1e293b', userSelect: 'none', cursor: 'default' };
const SEARCH: React.CSSProperties = { fontSize: '0.85rem', padding: '7px 12px', border: '1px solid var(--border-color)', borderRadius: 8, outline: 'none', width: 200, maxWidth: '45%' };

// KPI มินิการ์ด (KPI strip ด้านบน)
function Kpi({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ flex: 1, minWidth: 90, background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: 10, padding: '9px 13px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: color, flexShrink: 0 }} />
        <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{value.toLocaleString()}</span>
      </div>
      <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: 4 }}>{label}</div>
    </div>
  );
}

// chip ตัวเลขต่อสถานะ (พื้นจาง สีตรงกับ segment) — เต็มความกว้างคอลัมน์เพื่อจัดแนวเป็นตาราง
function Chip({ label, n, bg, fg }: { label: string; n: number; bg: string; fg: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 3, padding: '3px 4px', borderRadius: 6, background: bg, color: fg, fontSize: '0.62rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
      {label}<b style={{ fontSize: '0.74rem' }}>{n}</b>
    </span>
  );
}

export function StationMonitorWidget() {
  const { data = [], isLoading, isError } = useStationMonitor();
  const [q, setQ] = useState('');

  const summary = useMemo(() => data.reduce((a, s) => ({
    inWip: a.inWip + s.unitsInStation, rework: a.rework + s.unitsReworkRequired, pass: a.pass + s.scanOutPassCount,
  }), { inWip: 0, rework: 0, pass: 0 }), [data]);

  // สเกลความยาวบาร์ = total ของสถานีเทียบสถานีที่มากสุด → บาร์ยาว = โหลดจริงเยอะ (คงที่ไม่ขึ้นกับคำค้น)
  const maxTotal = useMemo(() => Math.max(1, ...data.map(s => s.unitsInStation + s.unitsReworkRequired + s.scanOutPassCount)), [data]);

  // เรียง: rework มากก่อน → งานค้าง (WIP) มาก · แล้วกรองด้วยคำค้น
  const rows = useMemo(() => {
    const sorted = [...data].sort((a, b) => (b.unitsReworkRequired - a.unitsReworkRequired) || (b.unitsInStation - a.unitsInStation));
    const kw = q.trim().toLowerCase();
    return kw ? sorted.filter(s => `${s.stationName} ${s.routeCode}`.toLowerCase().includes(kw)) : sorted;
  }, [data, q]);

  return (
    <div style={CARD}>
      {/* หัว: title + search */}
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
          {/* KPI strip */}
          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <Kpi label="Stations" value={data.length} color="#64748b" />
            <Kpi label="In WIP" value={summary.inWip} color={C.wip} />
            <Kpi label="Rework" value={summary.rework} color={C.rw} />
            <Kpi label="Pass" value={summary.pass} color={C.pass} />
          </div>

          {/* ตาราง: หัว sticky + แถว อยู่ใน scroll เดียวกัน + scrollbar-gutter คงที่ → คอลัมน์ตรงกันเสมอ, ขอบขวาตรงกันทั้ง 2 การ์ด */}
          <div style={{ maxHeight: 360, overflowY: 'auto', overflowX: 'hidden', scrollbarGutter: 'stable', marginTop: 12 }}>
            <div style={{ position: 'sticky', top: 0, zIndex: 1, background: '#fff', display: 'grid', gridTemplateColumns: COLS, gap: 14, alignItems: 'center', padding: '0 8px 7px', fontSize: '0.6rem', fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
              <span>Station</span>
              <span>Load breakdown</span>
              <span style={{ textAlign: 'center' }}>WIP · Rework · Pass</span>
              <span style={{ textAlign: 'right' }}>Upd.</span>
            </div>
            {rows.map(s => {
              const wip = s.unitsInStation, rw = s.unitsReworkRequired, pass = s.scanOutPassCount;
              const total = wip + rw + pass;
              const fillPct = (total / maxTotal) * 100;
              const segs = [{ v: wip, c: C.wip }, { v: rw, c: C.rw }, { v: pass, c: C.pass }].filter(x => x.v > 0);
              const segTotal = total || 1;
              // ไฟสถานะ: มี rework=เหลือง (ต้องสนใจ) / มี WIP=ฟ้า (กำลังทำ) / เหลือแต่ผ่าน=เขียว / ว่าง=เทา
              const dot = rw > 0 ? C.rw : wip > 0 ? C.wip : pass > 0 ? C.pass : '#cbd5e1';
              return (
                <div key={`${s.routeCode}-${s.stationName}`}
                  onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  style={{ display: 'grid', gridTemplateColumns: COLS, gap: 14, alignItems: 'center', padding: '9px 8px', borderRadius: 10, borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}>
                  {/* Station + ไฟสถานะ */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: dot, flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.routeCode ? `${s.stationName} · ${s.routeCode}` : s.stationName}>{s.stationName}</div>
                      {s.routeCode && s.routeCode.trim().toLowerCase() !== s.stationName.trim().toLowerCase() && <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.routeCode}</div>}
                    </div>
                  </div>
                  {/* บาร์ proportional บาง — ความยาว = โหลดเทียบสถานีสูงสุด, ในบาร์แบ่งสัดส่วน WIP/RW/Pass */}
                  <div style={{ height: 8, background: '#eef2f7', borderRadius: 999, overflow: 'hidden' }} title={`In WIP ${wip} · Rework ${rw} · Pass ${pass}`}>
                    <div style={{ display: 'flex', height: '100%', width: `${fillPct}%` }}>
                      {segs.map((x, i) => (
                        <div key={x.c} style={{ width: `${(x.v / segTotal) * 100}%`, background: x.c, borderRight: i < segs.length - 1 ? '1.5px solid #fff' : undefined }} />
                      ))}
                    </div>
                  </div>
                  {/* chips */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                    <Chip label="WIP" n={wip} bg={C.wipBg} fg={C.wipFg} />
                    <Chip label="RW" n={rw} bg={rw ? C.rwBg : C.muteBg} fg={rw ? C.rwFg : C.muteFg} />
                    <Chip label="PASS" n={pass} bg={C.passBg} fg={C.passFg} />
                  </div>
                  {/* เวลาอัปเดตล่าสุด */}
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'right', whiteSpace: 'nowrap' }}>{ago(s.lastScanAt)}</div>
                </div>
              );
            })}
            {rows.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '1.5rem 0' }}>No station matches “{q}”.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
