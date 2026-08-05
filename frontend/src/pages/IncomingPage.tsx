import { useMemo, useState } from 'react';
import { useInventoryLots, useReceiveLot, useReviewLot, useDeleteLot, type LotStatus } from '../lib/inventoryApi';
import { useIsViewer } from '../lib/useMockStore';
import { showToast } from '../lib/toast';
import { confirmDialog } from '../lib/confirm';
import { Paginator } from '../components/Paginator';
import { ROW_H, fillerCount, FillerRows } from '../components/TableFill';
import { TableState } from '../components/DataStates';

const STATUS_STYLE: Record<LotStatus, { bg: string; text: string; border: string; label: string }> = {
  PENDING:  { bg: '#fef9c3', text: '#854d0e', border: '#fde047', label: '🕒 Pending review' },
  APPROVED: { bg: '#dcfce7', text: '#166534', border: '#86efac', label: '✅ Approved' },
  REJECTED: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5', label: '❌ Rejected' },
};

function StatusBadge({ status }: { status: LotStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className="status-badge" style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}` }}>
      {s.label}
    </span>
  );
}

function StatCard({ icon, label, value, accent }: { icon: string; label: string; value: number; accent: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.85rem',
      background: '#fff', border: '1px solid var(--border-color)', borderRadius: 12,
      padding: '1rem 1.15rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      <span style={{
        width: 44, height: 44, flexShrink: 0, borderRadius: 11, fontSize: '1.3rem',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: accent + '1a', color: accent,
      }}>{icon}</span>
      <div style={{ lineHeight: 1.2 }}>
        <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--ink-1)' }}>{value}</div>
        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>{label}</div>
      </div>
    </div>
  );
}

export function IncomingPage() {
  const isViewer = useIsViewer();
  const { data: lots = [], isLoading, isError, refetch } = useInventoryLots();
  const receiveMut = useReceiveLot();
  const reviewMut  = useReviewLot();
  const deleteMut  = useDeleteLot();

  const [showForm, setShowForm] = useState(false);
  const [partNo,   setPartNo]   = useState('');
  const [partName, setPartName] = useState('');
  const [lotNo,    setLotNo]    = useState('');
  const [qty,      setQty]      = useState('');

  const [statusFilter, setStatusFilter] = useState<LotStatus | ''>('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const kpis = useMemo(() => ({
    pending:  lots.filter(l => l.status === 'PENDING').length,
    approved: lots.filter(l => l.status === 'APPROVED').length,
    rejected: lots.filter(l => l.status === 'REJECTED').length,
  }), [lots]);

  const filtered = statusFilter ? lots.filter(l => l.status === statusFilter) : lots;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleReceive(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(qty);
    if (!partNo.trim() || !lotNo.trim() || !n || n <= 0) return;
    receiveMut.mutate(
      { partNo: partNo.trim(), partName: partName.trim(), lotNo: lotNo.trim(), qty: n },
      {
        onSuccess: () => {
          showToast(`Received ${partNo} lot ${lotNo}, ${n.toLocaleString()} pcs`, 'success');
          setPartNo(''); setPartName(''); setLotNo(''); setQty(''); setShowForm(false);
        },
        onError: (err: any) => showToast(err.message, 'error'),
      }
    );
  }

  async function handleReview(id: number, status: 'APPROVED' | 'REJECTED') {
    const lot = lots.find(l => l.id === id);
    const desc = lot ? `${lot.partNo} · lot ${lot.lotNo} · ${lot.qtyReceived.toLocaleString()} pcs` : `lot #${id}`;
    const msg = status === 'APPROVED'
      ? `Approve this lot?\n\n${desc}\n\nGoods will be ready to issue for production`
      : `Reject this lot?\n\n${desc}\n\nGoods cannot be used for production`;
    if (!(await confirmDialog(msg, { danger: status === 'REJECTED', confirmText: status === 'APPROVED' ? 'Approve' : 'Reject' }))) return;
    reviewMut.mutate(
      { id, status },
      {
        onSuccess: () => showToast(status === 'APPROVED' ? 'Lot approved' : 'Lot rejected', status === 'APPROVED' ? 'success' : 'error'),
        onError: (err: any) => showToast(err.message, 'error'),
      }
    );
  }

  async function handleDelete(id: number) {
    const lot = lots.find(l => l.id === id);
    const desc = lot ? `${lot.partNo} · lot ${lot.lotNo}` : `lot #${id}`;
    if (!(await confirmDialog(`Delete this lot?\n\n${desc}\n\nThis cannot be undone`, { title: 'Delete Lot' }))) return;
    deleteMut.mutate(id, {
      onSuccess: () => showToast('Lot deleted', 'info'),
      onError: (err: any) => showToast(err.message, 'error'),
    });
  }

  return (
    <section className="stack-lg">
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
            <span style={{ width: 48, height: 48, flexShrink: 0, borderRadius: 12, fontSize: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(14,165,233,0.12)' }}>📦</span>
            <div>
              <h1 className="panel__title" style={{ margin: 0 }}>Incoming</h1>
              <p className="panel__subtitle" style={{ margin: 0 }}>Receive goods as "lots" — a thousand pieces = 1 entry · QA reviews the whole lot</p>
            </div>
          </div>
          {!isViewer && (
            <button type="button" className="btn" onClick={() => setShowForm(v => !v)}
              style={{ background: 'var(--brand)', borderColor: 'var(--brand)', color: '#fff', fontWeight: 600 }}>
              {showForm ? '✕ Cancel' : '+ Receive Goods'}
            </button>
          )}
        </div>

        {/* KPI */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
          <StatCard icon="🕒" label="Pending review" value={kpis.pending}  accent="#f59e0b" />
          <StatCard icon="✅" label="Approved"   value={kpis.approved} accent="#10b981" />
          <StatCard icon="⛔" label="Rejected"     value={kpis.rejected} accent="#ef4444" />
        </div>

        {/* Receive form */}
        {showForm && !isViewer && (
          <div className="panel" style={{ borderLeft: '4px solid var(--brand)', marginTop: '1.25rem' }}>
            <h3 className="panel__title panel__title--sm">Receive New Goods</h3>
            <form onSubmit={handleReceive} className="stack" style={{ marginTop: '0.75rem', gap: '0.85rem' }}>
              <div className="grid-2col">
                <label className="field">
                  <span>Part No *</span>
                  <input value={partNo} onChange={e => setPartNo(e.target.value)} placeholder="e.g. R-100K" autoFocus required />
                </label>
                <label className="field">
                  <span>Part Name</span>
                  <input value={partName} onChange={e => setPartName(e.target.value)} placeholder="e.g. Resistor 100K Ohm" />
                </label>
              </div>
              <div className="grid-2col">
                <label className="field">
                  <span>Lot No *</span>
                  <input value={lotNo} onChange={e => setLotNo(e.target.value)} placeholder="e.g. LOT-A-0615" required />
                </label>
                <label className="field">
                  <span>Qty (whole lot) *</span>
                  <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} placeholder="e.g. 1000" required />
                </label>
              </div>
              <button type="submit" className="btn" disabled={!partNo.trim() || !lotNo.trim() || !Number(qty) || receiveMut.isPending}
                style={{ background: 'var(--brand)', borderColor: 'var(--brand)', color: '#fff', fontWeight: 600, padding: '0.75rem' }}>
                {receiveMut.isPending ? 'Saving...' : 'Save Receipt (status: awaiting QA review)'}
              </button>
            </form>
          </div>
        )}

        {/* Filter */}
        <div style={{ marginTop: '1.5rem', marginBottom: '1rem', maxWidth: 280 }}>
          <label className="field">
            <span>Filter status</span>
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value as LotStatus | ''); setPage(1); }}>
              <option value="">All</option>
              <option value="PENDING">Pending review</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </label>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 8 }}>
          {/* tableLayout fixed + colgroup = คอลัมน์/ความสูงนิ่งเวลาเปลี่ยนหน้า (ดู components/TableFill.tsx)
              คอลัมน์ QA Review โชว์เฉพาะ non-viewer → <col> ตัวสุดท้ายต้องมีเงื่อนไขเดียวกัน */}
          <table className="table table-readonly" style={{ minWidth: isViewer ? 780 : 1000, width: '100%', tableLayout: 'fixed' }}>
            {isViewer ? (
              <colgroup>
                <col style={{ width: '15%' }} />{/* Part No */}
                <col style={{ width: '22%' }} />{/* Part Name */}
                <col style={{ width: '16%' }} />{/* Lot No */}
                <col style={{ width: '10%' }} />{/* Received */}
                <col style={{ width: '10%' }} />{/* Available */}
                <col style={{ width: '13%' }} />{/* Status */}
                <col style={{ width: '14%' }} />{/* Received Date */}
              </colgroup>
            ) : (
              <colgroup>
                <col style={{ width: '13%' }} />{/* Part No */}
                <col style={{ width: '17%' }} />{/* Part Name */}
                <col style={{ width: '13%' }} />{/* Lot No */}
                <col style={{ width: '8%' }} />{/* Received */}
                <col style={{ width: '8%' }} />{/* Available */}
                <col style={{ width: '11%' }} />{/* Status */}
                <col style={{ width: '11%' }} />{/* Received Date */}
                <col style={{ width: '19%' }} />{/* QA Review */}
              </colgroup>
            )}
            <thead>
              <tr>
                <th>Part No</th>
                <th>Part Name</th>
                <th>Lot No</th>
                <th style={{ textAlign: 'center' }}>Received</th>
                <th style={{ textAlign: 'center' }}>Available</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ textAlign: 'center' }}>Received Date</th>
                {!isViewer && <th style={{ textAlign: 'center' }}>QA Review</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableState colSpan={isViewer ? 7 : 8} state="loading" />
              ) : isError ? (
                <TableState colSpan={isViewer ? 7 : 8} state="error" onRetry={() => refetch()} />
              ) : paged.length === 0 ? (
                <TableState colSpan={isViewer ? 7 : 8} state="empty" emptyText={statusFilter ? 'No lots match the filter — select “All” to see all lots' : 'No material lots yet — click “+ Receive Goods” to start receiving'} />
              ) : paged.map(lot => (
                <tr key={lot.id}>
                  <td style={{ height: ROW_H, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={lot.partNo}><code>{lot.partNo}</code></td>
                  <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={lot.partName || undefined}>{lot.partName || '—'}</td>
                  <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={lot.lotNo}><code style={{ fontSize: '0.85rem' }}>{lot.lotNo}</code></td>
                  <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{lot.qtyReceived.toLocaleString()}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: lot.qtyAvailable > 0 ? '#0369a1' : 'var(--ink-5)' }}>{lot.qtyAvailable.toLocaleString()}</td>
                  <td style={{ textAlign: 'center' }}><StatusBadge status={lot.status} /></td>
                  <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                    {new Date(lot.receivedAt).toLocaleDateString('en-GB')}
                  </td>
                  {!isViewer && (
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
                        {lot.status === 'PENDING' ? (
                          <>
                            <button type="button" className="btn success" style={{ padding: '4px 12px', fontSize: '0.78rem', height: 28, lineHeight: 1 }} disabled={reviewMut.isPending} onClick={() => handleReview(lot.id, 'APPROVED')}>Approve</button>
                            <button type="button" className="btn danger" style={{ padding: '4px 12px', fontSize: '0.78rem', height: 28, lineHeight: 1 }} disabled={reviewMut.isPending} onClick={() => handleReview(lot.id, 'REJECTED')}>Reject</button>
                          </>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Reviewed</span>
                        )}
                        <button
                          type="button"
                          aria-label="Delete lot"
                          className="tap-sm"
                          style={{ width: 28, height: 28, padding: 0, borderRadius: 6, border: '1px solid #fca5a5', background: '#fee2e2', color: '#dc2626', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}
                          disabled={deleteMut.isPending}
                          onClick={() => handleDelete(lot.id)}
                          title="Delete lot"
                          onMouseEnter={e => { e.currentTarget.style.background = '#dc2626'; e.currentTarget.style.color = '#fff'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#dc2626'; }}
                        >✕</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              <FillerRows count={fillerCount(paged.length, PAGE_SIZE, totalPages)} cols={isViewer ? 7 : 8} />
            </tbody>
          </table>
        </div>
        <Paginator page={page} totalPages={totalPages} onPage={setPage} total={filtered.length} />
      </div>
    </section>
  );
}
