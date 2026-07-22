import { useMemo, useState } from 'react';
import { useWoOverview } from '../lib/planningApi';

// #54: Work Orders Overview บน Dashboard — ความคืบหน้าใบสั่งผลิต (target/done/yield/status) จาก /api/planning/wo-overview
const CARD: React.CSSProperties = { background: '#fff', border: '1px solid var(--border-color)', borderRadius: 12, padding: '1.15rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' };
// หัวข้อ + ช่องค้นหา ให้เป็นชุดเดียวกันทั้ง 2 widget
const TITLE: React.CSSProperties = { fontSize: '1.1rem', fontWeight: 800, color: '#1e293b', userSelect: 'none', cursor: 'default' };
const SEARCH: React.CSSProperties = { fontSize: '0.85rem', padding: '7px 12px', border: '1px solid var(--border-color)', borderRadius: 8, outline: 'none', width: 200, maxWidth: '45%' };
const TH: React.CSSProperties = { textAlign: 'center', fontSize: '0.66rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0 8px 8px', position: 'sticky', top: 0, background: '#fff' };
const TD: React.CSSProperties = { textAlign: 'center', fontSize: '0.85rem', padding: '8px', borderTop: '1px solid var(--border-color)', whiteSpace: 'nowrap' };

const ST_STYLE: Record<string, { bg: string; text: string; border: string; label: string }> = {
  PENDING:     { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1', label: 'Pending' },
  IN_PROGRESS: { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd', label: 'In progress' },
  DONE:        { bg: '#dcfce7', text: '#166534', border: '#86efac', label: 'Done' },
  CANCELLED:   { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5', label: 'Cancelled' },
};
function StatusPill({ status }: { status: string }) {
  const s = ST_STYLE[status] ?? { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1', label: status || '—' };
  return <span className="status-badge" style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}` }}>{s.label}</span>;
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

  // summary จาก backend ถ้ามี ไม่งั้นนับเอง
  const summary = useMemo(() => {
    if (data?.summary?.length) return data.summary;
    const m: Record<string, number> = {};
    workOrders.forEach(w => { m[w.status] = (m[w.status] || 0) + 1; });
    return Object.entries(m).map(([status, count]) => ({ status, count }));
  }, [data, workOrders]);

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
          {/* summary by status */}
          <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
            {summary.map(s => (
              <span key={s.status} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                <StatusPill status={s.status} /> <b style={{ color: '#1e293b' }}>{s.count}</b>
              </span>
            ))}
          </div>

          <div style={{ maxHeight: 260, overflowY: 'auto', marginTop: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              {/* กว้างเป็น % → กระจายเต็มความกว้าง สมส่วน ไม่เหลือช่องว่างโล่ง */}
              <colgroup>
                <col style={{ width: '20%' }} />
                <col style={{ width: '30%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '14%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={{ ...TH, textAlign: 'left' }}>WO No.</th>
                  <th style={{ ...TH, textAlign: 'left' }}>Product</th>
                  <th style={TH}>Target</th>
                  <th style={TH}>Good</th>
                  <th style={TH}>Yield</th>
                  {/* +10px = padding ซ้ายของ pill → หัว "Status" ตรงกับตัวอักษรใน badge พอดี */}
                  <th style={{ ...TH, textAlign: 'left', padding: '0 8px 8px 18px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((w, i) => (
                  <tr key={w.id} style={i % 2 ? { background: '#f8fafc' } : undefined}>
                    <td style={{ ...TD, textAlign: 'left', fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis' }} title={w.woNumber}>{w.woNumber}</td>
                    <td style={{ ...TD, textAlign: 'left', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }} title={w.partNo}>{w.partNo || '—'}</td>
                    <td style={TD}>{w.qtyTarget.toLocaleString()}</td>
                    <td style={{ ...TD, color: '#16a34a', fontWeight: 700 }}>{w.qtyGood.toLocaleString()}</td>
                    <td style={{ ...TD, fontWeight: 700, color: w.yieldPct == null ? 'var(--text-muted)' : w.yieldPct >= 95 ? '#16a34a' : w.yieldPct >= 80 ? '#d97706' : '#dc2626' }}>{w.yieldPct == null ? '—' : `${w.yieldPct.toFixed(1)}%`}</td>
                    <td style={{ ...TD, textAlign: 'left' }}><StatusPill status={w.status} /></td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={6} style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem 0' }}>No work order matches “{q}”.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
