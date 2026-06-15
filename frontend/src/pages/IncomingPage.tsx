import { useMemo, useState } from 'react';
import { useInventoryLots, useReceiveLot, useReviewLot, useDeleteLot, type LotStatus } from '../lib/inventoryApi';
import { useIsViewer } from '../lib/useMockStore';
import { showToast } from '../lib/toast';
import { Paginator } from '../components/Paginator';

const STATUS_STYLE: Record<LotStatus, { bg: string; text: string; border: string; label: string }> = {
  PENDING:  { bg: '#fef9c3', text: '#854d0e', border: '#fde047', label: '🕒 รอตรวจรับ' },
  APPROVED: { bg: '#dcfce7', text: '#166534', border: '#86efac', label: '✅ ผ่าน' },
  REJECTED: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5', label: '❌ ตีกลับ' },
};

function StatusBadge({ status }: { status: LotStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}`, padding: '2px 10px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
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
        <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#1e293b' }}>{value}</div>
        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>{label}</div>
      </div>
    </div>
  );
}

export function IncomingPage() {
  const isViewer = useIsViewer();
  const { data: lots = [], isLoading } = useInventoryLots();
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
          showToast(`รับเข้า ${partNo} ล็อต ${lotNo} จำนวน ${n.toLocaleString()} ชิ้น`, 'success');
          setPartNo(''); setPartName(''); setLotNo(''); setQty(''); setShowForm(false);
        },
        onError: (err: any) => showToast(err.message, 'error'),
      }
    );
  }

  function handleReview(id: number, status: 'APPROVED' | 'REJECTED') {
    const lot = lots.find(l => l.id === id);
    const desc = lot ? `${lot.partNo} · ล็อต ${lot.lotNo} · ${lot.qtyReceived.toLocaleString()} ชิ้น` : `ล็อต #${id}`;
    const msg = status === 'APPROVED'
      ? `อนุมัติล็อตนี้?\n\n${desc}\n\nของจะพร้อมเบิกไปผลิต`
      : `ตีกลับล็อตนี้?\n\n${desc}\n\nของจะใช้ผลิตไม่ได้`;
    if (!confirm(msg)) return;
    reviewMut.mutate(
      { id, status },
      {
        onSuccess: () => showToast(status === 'APPROVED' ? 'อนุมัติล็อตแล้ว' : 'ตีกลับล็อตแล้ว', status === 'APPROVED' ? 'success' : 'error'),
        onError: (err: any) => showToast(err.message, 'error'),
      }
    );
  }

  function handleDelete(id: number) {
    const lot = lots.find(l => l.id === id);
    const desc = lot ? `${lot.partNo} · ล็อต ${lot.lotNo}` : `ล็อต #${id}`;
    if (!confirm(`ลบล็อตนี้ทิ้ง?\n\n${desc}\n\nลบแล้วกู้คืนไม่ได้`)) return;
    deleteMut.mutate(id, {
      onSuccess: () => showToast('ลบล็อตแล้ว', 'info'),
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
              <h1 className="panel__title" style={{ margin: 0 }}>รับวัตถุดิบเข้า (Incoming)</h1>
              <p className="panel__subtitle" style={{ margin: 0 }}>รับของเป็น "ล็อต" — ของพันชิ้น = 1 รายการ · QA ตรวจรับทั้งล็อต</p>
            </div>
          </div>
          {!isViewer && (
            <button type="button" className="btn" onClick={() => setShowForm(v => !v)}
              style={{ background: '#0ea5e9', borderColor: '#0ea5e9', color: '#fff', fontWeight: 600 }}>
              {showForm ? '✕ ยกเลิก' : '+ รับของเข้า'}
            </button>
          )}
        </div>

        {/* KPI */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
          <StatCard icon="🕒" label="รอตรวจรับ" value={kpis.pending}  accent="#f59e0b" />
          <StatCard icon="✅" label="ผ่านแล้ว"   value={kpis.approved} accent="#10b981" />
          <StatCard icon="⛔" label="ตีกลับ"     value={kpis.rejected} accent="#ef4444" />
        </div>

        {/* Receive form */}
        {showForm && !isViewer && (
          <div className="panel" style={{ borderLeft: '4px solid #0ea5e9', marginTop: '1.25rem' }}>
            <h3 className="panel__title panel__title--sm">รับของเข้าใหม่</h3>
            <form onSubmit={handleReceive} className="stack" style={{ marginTop: '0.75rem', gap: '0.85rem' }}>
              <div className="grid-2col">
                <label className="field">
                  <span>Part No *</span>
                  <input value={partNo} onChange={e => setPartNo(e.target.value)} placeholder="เช่น R-100K" required />
                </label>
                <label className="field">
                  <span>ชื่อชิ้นส่วน</span>
                  <input value={partName} onChange={e => setPartName(e.target.value)} placeholder="เช่น Resistor 100K Ohm" />
                </label>
              </div>
              <div className="grid-2col">
                <label className="field">
                  <span>Lot No *</span>
                  <input value={lotNo} onChange={e => setLotNo(e.target.value)} placeholder="เช่น LOT-A-0615" required />
                </label>
                <label className="field">
                  <span>จำนวน (ทั้งล็อต) *</span>
                  <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} placeholder="เช่น 1000" required />
                </label>
              </div>
              <button type="submit" className="btn" disabled={!partNo.trim() || !lotNo.trim() || !Number(qty) || receiveMut.isPending}
                style={{ background: '#0ea5e9', borderColor: '#0ea5e9', color: '#fff', fontWeight: 600, padding: '0.75rem' }}>
                {receiveMut.isPending ? 'กำลังบันทึก...' : 'บันทึกรับของ (สถานะ: รอ QA ตรวจ)'}
              </button>
            </form>
          </div>
        )}

        {/* Filter */}
        <div style={{ marginTop: '1.5rem', marginBottom: '1rem', maxWidth: 280 }}>
          <label className="field">
            <span>กรองสถานะ</span>
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value as LotStatus | ''); setPage(1); }}>
              <option value="">ทั้งหมด</option>
              <option value="PENDING">รอตรวจรับ</option>
              <option value="APPROVED">ผ่านแล้ว</option>
              <option value="REJECTED">ตีกลับ</option>
            </select>
          </label>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 8 }}>
          <table className="table table-readonly" style={{ minWidth: 720, width: '100%' }}>
            <thead>
              <tr>
                <th>Part No</th>
                <th>ชื่อชิ้นส่วน</th>
                <th>Lot No</th>
                <th style={{ textAlign: 'center' }}>รับเข้า</th>
                <th style={{ textAlign: 'center' }}>คงเหลือ</th>
                <th style={{ textAlign: 'center' }}>สถานะ</th>
                <th style={{ textAlign: 'center' }}>วันที่รับ</th>
                {!isViewer && <th style={{ textAlign: 'center' }}>QA ตรวจรับ</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={isViewer ? 7 : 8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>กำลังโหลด...</td></tr>
              ) : paged.length === 0 ? (
                <tr><td colSpan={isViewer ? 7 : 8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>ยังไม่มีล็อตวัตถุดิบ</td></tr>
              ) : paged.map(lot => (
                <tr key={lot.id}>
                  <td style={{ fontWeight: 600 }}><code>{lot.partNo}</code></td>
                  <td>{lot.partName || '—'}</td>
                  <td><code style={{ fontSize: '0.85rem' }}>{lot.lotNo}</code></td>
                  <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{lot.qtyReceived.toLocaleString()}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: lot.qtyAvailable > 0 ? '#0369a1' : '#94a3b8' }}>{lot.qtyAvailable.toLocaleString()}</td>
                  <td style={{ textAlign: 'center' }}><StatusBadge status={lot.status} /></td>
                  <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                    {new Date(lot.receivedAt).toLocaleDateString('th-TH')}
                  </td>
                  {!isViewer && (
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
                        {lot.status === 'PENDING' ? (
                          <>
                            <button type="button" className="btn success" style={{ padding: '4px 12px', fontSize: '0.78rem', height: 28, lineHeight: 1 }} disabled={reviewMut.isPending} onClick={() => handleReview(lot.id, 'APPROVED')}>ผ่าน</button>
                            <button type="button" className="btn danger" style={{ padding: '4px 12px', fontSize: '0.78rem', height: 28, lineHeight: 1 }} disabled={reviewMut.isPending} onClick={() => handleReview(lot.id, 'REJECTED')}>ตีกลับ</button>
                          </>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>ตรวจแล้ว</span>
                        )}
                        <button
                          type="button"
                          style={{ width: 28, height: 28, padding: 0, borderRadius: 6, border: '1px solid #fca5a5', background: '#fee2e2', color: '#dc2626', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}
                          disabled={deleteMut.isPending}
                          onClick={() => handleDelete(lot.id)}
                          title="ลบล็อต"
                          onMouseEnter={e => { e.currentTarget.style.background = '#dc2626'; e.currentTarget.style.color = '#fff'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#dc2626'; }}
                        >✕</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Paginator page={page} totalPages={totalPages} onPage={setPage} total={filtered.length} />
      </div>
    </section>
  );
}
