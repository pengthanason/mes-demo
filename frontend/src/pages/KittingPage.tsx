import { useState, useMemo } from 'react';
import { useStock, useKittingIssues, useIssueMaterial } from '../lib/inventoryApi';
import { useIsViewer } from '../lib/useMockStore';
import { showToast } from '../lib/toast';
import { Paginator } from '../components/Paginator';
import { ROW_H, fillerCount, FillerRows } from '../components/TableFill';
import { WoInput } from '../components/WoInput';
import { TableState, BlockState } from '../components/DataStates';

export function KittingPage() {
  const isViewer = useIsViewer();
  const { data: stock = [], isLoading: stockLoading } = useStock();
  const { data: issues = [], isLoading: issuesLoading, isError: issuesError, refetch: refetchIssues } = useKittingIssues();
  const issueMut = useIssueMaterial();

  const [woId,   setWoId]   = useState('');
  const [partNo, setPartNo] = useState('');
  const [qty,    setQty]    = useState('');

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const [histQ, setHistQ] = useState('');
  const filteredIssues = useMemo(() => {
    const s = histQ.trim().toLowerCase();
    if (!s) return issues;
    return issues.filter(i =>
      i.woId.toLowerCase().includes(s) ||
      i.partNo.toLowerCase().includes(s) ||
      i.lotNo.toLowerCase().includes(s)
    );
  }, [issues, histQ]);
  const totalPages = Math.max(1, Math.ceil(filteredIssues.length / PAGE_SIZE));
  const paged = filteredIssues.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const selected = stock.find(s => s.partNo === partNo);

  function handleIssue(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(qty);
    if (!woId.trim() || !partNo || !n || n <= 0) return;
    issueMut.mutate(
      { woId: woId.trim(), partNo, qty: n },
      {
        onSuccess: () => {
          showToast(`Issued ${partNo}, ${n.toLocaleString()} to ${woId}`, 'success');
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
            <h1 className="panel__title" style={{ margin: 0 }}>Kitting</h1>
            <p className="panel__subtitle" style={{ margin: 0 }}>Issue goods from QA-approved lots to the production line by WO — deducts stock FIFO (oldest lot first)</p>
          </div>
        </div>

        <div className="grid-sidebar" style={{ marginTop: '1.5rem' }}>
          {/* ── Stock พร้อมเบิก ── */}
          <div className="panel" style={{ padding: '1rem', margin: 0 }}>
            <div className="panel__title panel__title--sm" style={{ marginBottom: '0.75rem' }}>Stock Ready to Issue</div>
            {stockLoading ? (
              <BlockState state="loading" />
            ) : stock.length === 0 ? (
              <BlockState state="empty" emptyText="No goods ready to issue (QA must approve a lot first)" />
            ) : (
              <div className="stack" style={{ gap: '0.4rem' }}>
                {stock.map(s => (
                  <button
                    key={s.partNo}
                    type="button"
                    onClick={() => !isViewer && setPartNo(s.partNo)}
                    style={{
                      width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem', borderRadius: 6,
                      border: '1px solid', borderColor: partNo === s.partNo ? 'var(--brand)' : 'var(--border-color)',
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
            <div className="panel__title panel__title--sm" style={{ marginBottom: '0.75rem' }}>Issue Goods</div>
            {isViewer ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>👁 Viewer is read-only, cannot issue</p>
            ) : (
              <form onSubmit={handleIssue} className="stack" style={{ gap: '0.85rem' }}>
                <label className="field">
                  <span>WO to issue to *</span>
                  <WoInput value={woId} onChange={setWoId} required placeholder="Select or type WO…" />
                </label>
                <label className="field">
                  <span>Part No *</span>
                  <select value={partNo} onChange={e => setPartNo(e.target.value)} required>
                    <option value="">-- Select from stock --</option>
                    {stock.map(s => <option key={s.partNo} value={s.partNo}>{s.partNo} ({s.qtyAvailable.toLocaleString()} left)</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Qty to issue *</span>
                  <input type="number" min="1" max={selected?.qtyAvailable || undefined} value={qty} onChange={e => setQty(e.target.value)} placeholder="e.g. 500" required />
                </label>
                {selected && Number(qty) > selected.qtyAvailable && (
                  <div className="notice err">Exceeds available stock ({selected.qtyAvailable.toLocaleString()} left)</div>
                )}
                <button type="submit" className="btn"
                  disabled={!woId.trim() || !partNo || !Number(qty) || (selected && Number(qty) > selected.qtyAvailable) || issueMut.isPending}
                  style={{ background: 'var(--brand)', borderColor: 'var(--brand)', color: '#fff', fontWeight: 600, padding: '0.75rem' }}>
                  {issueMut.isPending ? 'Issuing...' : 'Issue to Line'}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* ── ประวัติการเบิก ── */}
        <h3 className="panel__title panel__title--sm" style={{ marginTop: '1.75rem', marginBottom: '0.75rem' }}>
          Issue History {issues.length > 0 && `(${issues.length})`}
        </h3>
        {issues.length > 0 && (
          <label className="field" style={{ maxWidth: 320, marginBottom: '0.75rem' }}>
            <span>Search</span>
            <input value={histQ} onChange={e => { setHistQ(e.target.value); setPage(1); }} placeholder="WO / Part No / Lot..." />
          </label>
        )}
        <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 8 }}>
          {/* tableLayout fixed + colgroup = คอลัมน์/ความสูงนิ่งเวลาเปลี่ยนหน้า (ดู components/TableFill.tsx) */}
          <table className="table table-readonly" style={{ minWidth: 760, width: '100%', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '20%' }} />{/* WO */}
              <col style={{ width: '15%' }} />{/* Part No */}
              <col style={{ width: '20%' }} />{/* Lot Deducted */}
              <col style={{ width: '10%' }} />{/* Qty */}
              <col style={{ width: '35%' }} />{/* Time */}
            </colgroup>
            <thead>
              <tr>
                <th>WO</th>
                <th>Part No</th>
                <th>Lot Deducted</th>
                <th style={{ textAlign: 'center' }}>Qty</th>
                <th style={{ textAlign: 'center' }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {issuesLoading ? (
                <TableState colSpan={5} state="loading" />
              ) : issuesError ? (
                <TableState colSpan={5} state="error" onRetry={() => refetchIssues()} />
              ) : paged.length === 0 ? (
                <TableState colSpan={5} state="empty" emptyText={issues.length > 0 ? 'No issues match the search' : 'No issues yet — select goods from Stock above, enter a WO, then click “Issue to Line”'} />
              ) : paged.map(i => (
                <tr key={i.id}>
                  <td style={{ height: ROW_H, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={i.woId}>{i.woId}</td>
                  <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={i.partNo}><code>{i.partNo}</code></td>
                  <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={i.lotNo}><code style={{ fontSize: '0.85rem' }}>{i.lotNo}</code></td>
                  <td style={{ textAlign: 'center' }}>{i.qty.toLocaleString()}</td>
                  <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                    {new Date(i.issuedAt).toLocaleString('en-GB')}
                  </td>
                </tr>
              ))}
              <FillerRows count={fillerCount(paged.length, PAGE_SIZE, totalPages)} cols={5} />
            </tbody>
          </table>
        </div>
        <Paginator page={page} totalPages={totalPages} onPage={setPage} total={filteredIssues.length} />
      </div>
    </section>
  );
}
