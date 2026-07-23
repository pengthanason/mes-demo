import { useMemo, useState } from 'react';
import { useWoOverview } from '../lib/planningApi';

// #54: Work Orders Overview บน Dashboard — ดีไซน์ชุดเดียวกับ Station Status: KPI strip + ตาราง grid + บาร์บาง
const CARD: React.CSSProperties = { background: '#fff', border: '1px solid var(--border-color)', borderRadius: 12, padding: '1.15rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' };
const TITLE: React.CSSProperties = { fontSize: '1.1rem', fontWeight: 800, color: '#1e293b', userSelect: 'none', cursor: 'default' };
const SEARCH: React.CSSProperties = { fontSize: '0.85rem', padding: '7px 12px', border: '1px solid var(--border-color)', borderRadius: 8, outline: 'none', width: 200, maxWidth: '45%' };
const COLS = '1.5fr 2fr 66px 108px';   // Work order | Progress | Yield | Status

const ST_STYLE: Record<string, { bg: string; text: string; border: string; bar: string; label: string }> = {
  PENDING:     { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1', bar: '#94a3b8', label: 'Pending' },
  IN_PROGRESS: { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd', bar: '#3b82f6', label: 'In progress' },
  DONE:        { bg: '#dcfce7', text: '#166534', border: '#86efac', bar: '#22c55e', label: 'Done' },
  CANCELLED:   { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5', bar: '#ef4444', label: 'Cancelled' },
};
const FALLBACK = { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1', bar: '#94a3b8', label: '' };
function StatusPill({ status }: { status: string }) {
  const s = ST_STYLE[status] ?? { ...FALLBACK, label: status || '—' };
  return <span className="status-badge" style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}` }}>{s.label}</span>;
}

// KPI มินิการ์ด (ชุดเดียวกับ Station Status)
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

export function WoOverviewWidget() {
  const { data, isLoading, isError } = useWoOverview();
  const workOrders = data?.workOrders ?? [];
  const [q, setQ] = useState('');

  // เรียง: กำลังผลิตก่อน แล้วใหม่สุด · แล้วกรองด้วยคำค้น (WO / product)
  const rows = useMemo(() => {
    const rank: Record<string, number> = { IN_PROGRESS: 0, PENDING: 1, DONE: 2, CANCELLED: 3 };
    const sorted = [...workOrders].sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || new Date(b.openedAt || 0).getTime() - new Date(a.openedAt || 0).getTime());
    const kw = q.trim().toLowerCase();
    return kw ? sorted.filter(w => `${w.woNumber} ${w.partNo}`.toLowerCase().includes(kw)) : sorted;
  }, [workOrders, q]);

  // นับตามสถานะ → KPI strip
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    workOrders.forEach(w => { m[w.status] = (m[w.status] || 0) + 1; });
    return m;
  }, [workOrders]);

  return (
    <div style={CARD}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span style={TITLE}>Work Orders</span>
        {!isLoading && !isError && workOrders.length > 0 && (
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search WO / product…" style={SEARCH} />
        )}
      </div>

      {isLoading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 12 }}>Loading…</div>
      ) : isError ? (
        <div style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: 12 }}>Cannot reach the work-order overview endpoint.</div>
      ) : workOrders.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 12 }}>No work orders.</div>
      ) : (
        <>
          {/* KPI strip (ชุดเดียวกับ Station Status) */}
          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <Kpi label="Total" value={workOrders.length} color="#64748b" />
            <Kpi label="In progress" value={counts.IN_PROGRESS || 0} color={ST_STYLE.IN_PROGRESS.bar} />
            <Kpi label="Done" value={counts.DONE || 0} color={ST_STYLE.DONE.bar} />
            <Kpi label="Pending" value={counts.PENDING || 0} color={ST_STYLE.PENDING.bar} />
          </div>

          {/* ตาราง: หัว sticky + แถว อยู่ใน scroll เดียวกัน + scrollbar-gutter คงที่ → ขอบขวาตรงกับ Station Status */}
          <div style={{ maxHeight: 340, overflowY: 'auto', overflowX: 'hidden', scrollbarGutter: 'stable', marginTop: 12 }}>
            <div style={{ position: 'sticky', top: 0, zIndex: 1, background: '#fff', display: 'grid', gridTemplateColumns: COLS, gap: 14, alignItems: 'center', padding: '0 8px 7px', fontSize: '0.6rem', fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
              <span>Work order</span>
              <span>Progress</span>
              <span style={{ textAlign: 'center' }}>Yield</span>
              <span style={{ textAlign: 'right' }}>Status</span>
            </div>
            {rows.map(w => {
              const pct = w.qtyTarget > 0 ? Math.min(100, Math.round((w.qtyGood / w.qtyTarget) * 100)) : 0;
              const st = ST_STYLE[w.status] ?? FALLBACK;
              const yCol = w.yieldPct == null ? 'var(--text-muted)' : w.yieldPct >= 95 ? '#16a34a' : w.yieldPct >= 80 ? '#d97706' : '#dc2626';
              const yBg = w.yieldPct == null ? '#f1f5f9' : w.yieldPct >= 95 ? '#dcfce7' : w.yieldPct >= 80 ? '#fef3c7' : '#fee2e2';
              return (
                <div key={w.id}
                  onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  style={{ display: 'grid', gridTemplateColumns: COLS, gap: 14, alignItems: 'center', padding: '9px 8px', borderRadius: 10, borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}>
                  {/* Work order + จุดสถานะ (mirror Station: dot + 2 บรรทัด) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: st.bar, flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={w.woNumber}>{w.woNumber}</div>
                      <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={w.partNo}>{w.partNo || '—'}</div>
                    </div>
                  </div>
                  {/* progress: จำนวน + % เหนือแท่งบาง 8px */}
                  <div style={{ minWidth: 0 }} title={`Good ${w.qtyGood.toLocaleString()} / Target ${w.qtyTarget.toLocaleString()} (${pct}%)`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        <b style={{ color: '#334155' }}>{w.qtyGood.toLocaleString()}</b> / {w.qtyTarget.toLocaleString()} pcs
                      </span>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: st.bar }}>{pct}%</span>
                    </div>
                    <div style={{ height: 8, background: '#eef2f7', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: st.bar, borderRadius: 999, transition: 'width 0.3s' }} />
                    </div>
                  </div>
                  {/* yield tag */}
                  <div style={{ textAlign: 'center' }} title="Yield">
                    <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 6, background: yBg, color: yCol, fontSize: '0.72rem', fontWeight: 700 }}>{w.yieldPct == null ? '—' : `${w.yieldPct.toFixed(0)}%`}</span>
                  </div>
                  {/* status */}
                  <div style={{ textAlign: 'right' }}><StatusPill status={w.status} /></div>
                </div>
              );
            })}
            {rows.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '1.5rem 0' }}>No work order matches “{q}”.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
