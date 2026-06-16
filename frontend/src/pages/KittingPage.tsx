import { useState } from 'react';
import { useStock, useKittingIssues, useIssueMaterial } from '../lib/inventoryApi';
import { useIsViewer } from '../lib/useMockStore';
import { showToast } from '../lib/toast';
import { Paginator } from '../components/Paginator';
import { WoInput } from '../components/WoInput';

export function KittingPage() {
  const isViewer = useIsViewer();
  const { data: stock = [], isLoading: stockLoading } = useStock();
  const { data: issues = [] } = useKittingIssues();
  const issueMut = useIssueMaterial();

  const [woId,   setWoId]   = useState('');
  const [partNo, setPartNo] = useState('');
  const [qty,    setQty]    = useState('');

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const totalPages = Math.max(1, Math.ceil(issues.length / PAGE_SIZE));
  const paged = issues.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const selected = stock.find(s => s.partNo === partNo);

  function handleIssue(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(qty);
    if (!woId.trim() || !partNo || !n || n <= 0) return;
    issueMut.mutate(
      { woId: woId.trim(), partNo, qty: n },
      {
        onSuccess: () => {
          showToast(`เบิก ${partNo} จำนวน ${n.toLocaleString()} ให้ ${woId}`, 'success');
          setQty('');
        },
        onError: (err: any) => showToast(err.message, 'error'),
      }
    );
  }

  return (
    <section className="stack-lg">
      <div className="panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
          <span style={{ width: 48, height: 48, flexShrink: 0, borderRadius: 12, fontSize: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(99,102,241,0.12)' }}>🧰</span>
          <div>
            <h1 className="panel__title" style={{ margin: 0 }}>เบิกวัตถุดิบ (Kitting)</h1>
            <p className="panel__subtitle" style={{ margin: 0 }}>เบิกของจากล็อตที่ QA อนุมัติแล้ว ไปเข้าไลน์ผลิตตาม WO — ตัด stock แบบ FIFO (ล็อตเก่าก่อน)</p>
          </div>
        </div>

        <div className="grid-sidebar" style={{ marginTop: '1.5rem' }}>
          {/* ── Stock พร้อมเบิก ── */}
          <div className="panel" style={{ padding: '1rem', margin: 0 }}>
            <div className="panel__title panel__title--sm" style={{ marginBottom: '0.75rem' }}>Stock พร้อมเบิก</div>
            {stockLoading ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>กำลังโหลด...</p>
            ) : stock.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>ไม่มีของพร้อมเบิก (ต้องให้ QA อนุมัติล็อตก่อน)</p>
            ) : (
              <div className="stack" style={{ gap: '0.4rem' }}>
                {stock.map(s => (
                  <button
                    key={s.partNo}
                    type="button"
                    onClick={() => !isViewer && setPartNo(s.partNo)}
                    style={{
                      width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem', borderRadius: 6,
                      border: '1px solid', borderColor: partNo === s.partNo ? '#0ea5e9' : 'var(--border-color)',
                      background: partNo === s.partNo ? '#e0f2fe' : '#fff', cursor: isViewer ? 'default' : 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <code style={{ fontWeight: 600 }}>{s.partNo}</code>
                      <span style={{ fontWeight: 700, color: '#0369a1' }}>{s.qtyAvailable.toLocaleString()}</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.partName || '—'}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── ฟอร์มเบิก ── */}
          <div className="panel" style={{ padding: '1rem', margin: 0 }}>
            <div className="panel__title panel__title--sm" style={{ marginBottom: '0.75rem' }}>เบิกของ</div>
            {isViewer ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>👁 Viewer ดูได้อย่างเดียว เบิกไม่ได้</p>
            ) : (
              <form onSubmit={handleIssue} className="stack" style={{ gap: '0.85rem' }}>
                <label className="field">
                  <span>WO ที่จะเบิกให้ *</span>
                  <WoInput value={woId} onChange={setWoId} required />
                </label>
                <label className="field">
                  <span>Part No *</span>
                  <select value={partNo} onChange={e => setPartNo(e.target.value)} required>
                    <option value="">-- เลือกจาก stock --</option>
                    {stock.map(s => <option key={s.partNo} value={s.partNo}>{s.partNo} (เหลือ {s.qtyAvailable.toLocaleString()})</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>จำนวนที่เบิก *</span>
                  <input type="number" min="1" max={selected?.qtyAvailable || undefined} value={qty} onChange={e => setQty(e.target.value)} placeholder="เช่น 500" required />
                </label>
                {selected && Number(qty) > selected.qtyAvailable && (
                  <div className="notice err">เกิน stock ที่มี (เหลือ {selected.qtyAvailable.toLocaleString()})</div>
                )}
                <button type="submit" className="btn"
                  disabled={!woId.trim() || !partNo || !Number(qty) || (selected && Number(qty) > selected.qtyAvailable) || issueMut.isPending}
                  style={{ background: '#0ea5e9', borderColor: '#0ea5e9', color: '#fff', fontWeight: 600, padding: '0.75rem' }}>
                  {issueMut.isPending ? 'กำลังเบิก...' : 'เบิกของเข้าไลน์'}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* ── ประวัติการเบิก ── */}
        <h3 className="panel__title panel__title--sm" style={{ marginTop: '1.75rem', marginBottom: '0.75rem' }}>
          ประวัติการเบิก {issues.length > 0 && `(${issues.length})`}
        </h3>
        <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 8 }}>
          <table className="table table-readonly" style={{ minWidth: 560, width: '100%' }}>
            <thead>
              <tr>
                <th>WO</th>
                <th>Part No</th>
                <th>Lot ที่ตัด</th>
                <th style={{ textAlign: 'center' }}>จำนวน</th>
                <th style={{ textAlign: 'center' }}>เวลา</th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>ยังไม่มีการเบิก</td></tr>
              ) : paged.map(i => (
                <tr key={i.id}>
                  <td style={{ fontWeight: 600 }}>{i.woId}</td>
                  <td><code>{i.partNo}</code></td>
                  <td><code style={{ fontSize: '0.85rem' }}>{i.lotNo}</code></td>
                  <td style={{ textAlign: 'center' }}>{i.qty.toLocaleString()}</td>
                  <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                    {new Date(i.issuedAt).toLocaleString('th-TH')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Paginator page={page} totalPages={totalPages} onPage={setPage} total={issues.length} />
      </div>
    </section>
  );
}
