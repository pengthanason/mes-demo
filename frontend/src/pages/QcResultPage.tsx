import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  useQcResults, useQcResultCreate, useReworkCreate,
  type QcOverall, type QcResult,
} from '../lib/qcResultApi';
import { useIsViewer } from '../lib/useMockStore';
import { showToast } from '../lib/toast';
import { Paginator } from '../components/Paginator';
import { ROW_H, fillerCount, FillerRows } from '../components/TableFill';
import { WoInput } from '../components/WoInput';
import { ComboBoxInput } from '../components/ComboBoxInput';
import { useWoLots, useScanSummary } from '../lib/lookups';
import { TableState } from '../components/DataStates';
import { useEscapeKey } from '../lib/useEscapeKey';
import { useFocusTrap } from '../lib/useFocusTrap';
import { DATE_INPUT_MIN, DATE_INPUT_MAX } from '../lib/dateRange';

const OVERALL_STYLE: Record<QcOverall, { bg: string; text: string; border: string }> = {
  PASS:    { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  FAIL:    { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  PARTIAL: { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
};

function OverallBadge({ overall }: { overall: QcOverall }) {
  const s = OVERALL_STYLE[overall];
  return (
    <span className="status-badge" style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}` }}>
      {overall}
    </span>
  );
}

function ReworkDialog({ qcResult, onClose }: { qcResult: QcResult; onClose: () => void }) {
  const modalRef = useRef<HTMLDivElement>(null);
  useEscapeKey(true, onClose);
  useFocusTrap(true, modalRef);
  const [defectType,  setDefectType]  = useState(qcResult.defectDesc ?? '');
  const [assignedTo,  setAssignedTo]  = useState('');
  const [dueDate,     setDueDate]     = useState('');
  const reworkMut = useReworkCreate();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!defectType.trim()) return;
    reworkMut.mutate(
      { qcResultId: qcResult.id, defectType, assignedTo, dueDate },
      {
        onSuccess: (rw) => {
          showToast(`Rework Ticket #${rw.id} opened successfully`, 'success');
          onClose();
        },
        onError: (err) => showToast(err.message, 'error'),
      }
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div ref={modalRef} className="panel" role="dialog" aria-modal="true" aria-label="Open Rework Ticket" style={{ maxWidth: 480, width: '100%' }}>
        <h3 className="panel__title">Open Rework Ticket</h3>
        <p className="panel__subtitle" style={{ marginBottom: '1rem' }}>
          WO: <strong>{qcResult.woId}</strong> · Lot: {qcResult.lotNo} · NG: {qcResult.qtyFail} pcs
        </p>
        <form onSubmit={handleSubmit} className="stack" style={{ gap: '0.75rem' }}>
          <label className="field">
            <span>Defect Type *</span>
            <input value={defectType} onChange={e => setDefectType(e.target.value)} placeholder="e.g. bad solder, damaged pin..." required />
          </label>
          <label className="field">
            <span>Assigned Technician</span>
            <input value={assignedTo} onChange={e => setAssignedTo(e.target.value)} placeholder="Technician name..." />
          </label>
          <label className="field">
            <span>Due Date</span>
            <input type="date" min={DATE_INPUT_MIN} max={DATE_INPUT_MAX} value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </label>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button type="submit" className="btn" disabled={!defectType.trim() || reworkMut.isPending}
              style={{ flex: 1, background: '#ef4444', borderColor: '#ef4444', color: '#fff', fontWeight: 600 }}>
              {reworkMut.isPending ? 'Opening...' : 'Confirm Open Rework Ticket'}
            </button>
            <button type="button" className="btn secondary" onClick={onClose} style={{ flex: 1 }}>Skip for now</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function QcResultPage() {
  const { woId: woIdParam } = useParams<{ woId?: string }>();
  const isViewer = useIsViewer();

  const { data, isLoading, isError, refetch } = useQcResults();
  const createMut = useQcResultCreate();
  const allResults = data ?? [];

  const [showForm,    setShowForm]    = useState(!!woIdParam);
  const [woFilter,    setWoFilter]    = useState(woIdParam ?? '');
  const [reworkFor,   setReworkFor]   = useState<QcResult | null>(null);

  // form fields
  const [woId,        setWoId]        = useState(woIdParam ?? '');
  const [lotNo,       setLotNo]       = useState('');
  const [qtyChecked,  setQtyChecked]  = useState('');
  const [qtyPass,     setQtyPass]     = useState('');
  const [defectDesc,  setDefectDesc]  = useState('');
  const [remark,      setRemark]      = useState('');

  const qtyCheckedN = Number(qtyChecked) || 0;
  const qtyPassN    = Number(qtyPass)    || 0;
  const qtyFailN    = Math.max(0, qtyCheckedN - qtyPassN);

  const overall: QcOverall | '' = qtyCheckedN === 0 ? ''
    : qtyFailN === 0 ? 'PASS'
    : qtyPassN === 0 ? 'FAIL'
    : 'PARTIAL';

  const needsDefect = overall === 'FAIL' || overall === 'PARTIAL';

  // ดึง lot ของ WO + สรุปจำนวนจาก Production Scan
  const { data: woLots = [] } = useWoLots(woId.trim() || undefined);
  const { data: scan } = useScanSummary(woId.trim() || undefined);

  // เมื่อเปลี่ยน WO → autofill จำนวนตรวจ/ผ่าน จาก Production Scan (ถ้ามี)
  useEffect(() => {
    if (scan && scan.total > 0) {
      setQtyChecked(String(scan.total));
      setQtyPass(String(scan.pass));
    }
  }, [woId, scan?.total, scan?.pass]);

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const filtered = useMemo(() =>
    woFilter.trim()
      ? allResults.filter(r => r.woId.toLowerCase().includes(woFilter.toLowerCase()))
      : allResults,
  [allResults, woFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pagedList  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!woId.trim() || !lotNo.trim() || !qtyCheckedN || !overall) return;
    createMut.mutate(
      { woId: woId.trim(), lotNo: lotNo.trim(), qtyChecked: qtyCheckedN, qtyPass: qtyPassN, qtyFail: qtyFailN, overall, defectDesc, remark },
      {
        onSuccess: (result) => {
          showToast(`QC Result saved — ${overall}`, overall === 'PASS' ? 'success' : 'error');
          // reset form
          setLotNo(''); setQtyChecked(''); setQtyPass(''); setDefectDesc(''); setRemark('');
          setShowForm(false);
          if (overall !== 'PASS') setReworkFor(result);
        },
        onError: (err) => showToast(err.message, 'error'),
      }
    );
  }

  return (
    <section className="stack-lg">
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 className="panel__title">QC Result</h1>
            <p className="panel__subtitle">Record QC inspection results and open Rework Tickets</p>
          </div>
          {!isViewer && (
            <button type="button" className="btn" onClick={() => setShowForm(v => !v)}
              style={{ background: 'var(--brand)', borderColor: 'var(--brand)', color: '#fff', fontWeight: 600 }}>
              {showForm ? '✕ Cancel' : '+ Record QC Result'}
            </button>
          )}
        </div>

        {/* ─── Form ─────────────────────────────────────────────── */}
        {showForm && !isViewer && (
          <div className="panel" style={{ borderLeft: '4px solid var(--brand)', marginTop: '1.25rem' }}>
            <h3 className="panel__title panel__title--sm">Record QC Result</h3>
            <form onSubmit={handleSubmit} className="stack" style={{ maxWidth: 560, marginTop: '0.75rem', gap: '0.75rem' }}>
              <div className="grid-2col">
                <label className="field">
                  <span>WO Number *</span>
                  <WoInput value={woId} onChange={setWoId} required />
                </label>
                <label className="field">
                  <span>Lot No *</span>
                  <ComboBoxInput value={lotNo} onChange={setLotNo} options={woLots} ariaLabel="Lot No"
                    placeholder={woId.trim() ? 'Select/type Lot' : 'Enter WO first'} disabled={!woId.trim()} required />
                </label>
              </div>

              {scan && scan.total > 0 && (
                <div className="notice info" style={{ fontSize: '0.82rem' }}>
                  📡 Pulled from Production Scan: Checked {scan.total} · PASS {scan.pass} · FAIL {scan.fail} (editable)
                </div>
              )}

              <div className="grid-3col">
                <label className="field">
                  <span>Qty Checked</span>
                  <input type="number" min="1" value={qtyChecked} onChange={e => setQtyChecked(e.target.value)} placeholder="100" required />
                </label>
                <label className="field">
                  <span>PASS</span>
                  <input type="number" min="0" max={qtyCheckedN || undefined} value={qtyPass} onChange={e => setQtyPass(e.target.value)} placeholder="95" />
                </label>
                <label className="field">
                  <span>FAIL (NG)</span>
                  <input type="number" readOnly value={qtyCheckedN > 0 ? qtyFailN : ''} style={{ background: 'var(--surface-2)' }} />
                </label>
              </div>

              {overall && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 1rem', background: 'var(--surface-1)', borderRadius: 6, border: '1px solid var(--line-2)' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Overall:</span>
                  <OverallBadge overall={overall} />
                </div>
              )}

              {needsDefect && (
                <label className="field">
                  <span>Defect Description *</span>
                  <textarea value={defectDesc} onChange={e => setDefectDesc(e.target.value)} rows={2} maxLength={2000}
                    placeholder="Clearly specify the location / nature of the defect..." required />
                </label>
              )}

              {needsDefect && (
                <label className="field">
                  <span>Remark</span>
                  <textarea value={remark} onChange={e => setRemark(e.target.value)} rows={2} maxLength={2000}
                    placeholder="Additional remark (optional) — e.g. preliminary cause, follow-up..." />
                </label>
              )}

              <button type="submit" className="btn"
                disabled={!woId.trim() || !lotNo.trim() || !qtyCheckedN || !overall || (needsDefect && !defectDesc.trim()) || createMut.isPending}
                style={{ background: 'var(--brand)', borderColor: 'var(--brand)', color: '#fff', fontWeight: 600, padding: '0.75rem' }}>
                {createMut.isPending ? 'Saving...' : 'Confirm Save QC Result'}
              </button>
            </form>
          </div>
        )}

        {/* ─── Filter ───────────────────────────────────────────── */}
        <div style={{ marginTop: '1.5rem', marginBottom: '1rem', maxWidth: 320 }}>
          <label className="field">
            <span>Filter by WO</span>
            <ComboBoxInput value={woFilter} onChange={v => { setWoFilter(v); setPage(1); }}
              options={[...new Set(allResults.map(r => r.woId).filter(Boolean))]} placeholder="Type WO to filter..." ariaLabel="Filter by WO" />
          </label>
        </div>

        {/* ─── Table ────────────────────────────────────────────── */}
        <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 8 }}>
          {/* tableLayout fixed + colgroup = คอลัมน์/ความสูงนิ่งเวลาเปลี่ยนหน้า (ดู components/TableFill.tsx) */}
          <table className="table table-readonly" style={{ minWidth: 950, width: '100%', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '9%' }} />{/* Date */}
              <col style={{ width: '15%' }} />{/* WO */}
              <col style={{ width: '11%' }} />{/* Lot */}
              <col style={{ width: '7%' }} />{/* Checked */}
              <col style={{ width: '6%' }} />{/* Pass */}
              <col style={{ width: '6%' }} />{/* Fail */}
              <col style={{ width: '9%' }} />{/* Overall */}
              <col style={{ width: '17%' }} />{/* Defect / Remark */}
              <col style={{ width: '10%' }} />{/* QA Verify */}
              <col style={{ width: '10%' }} />{/* Actions */}
            </colgroup>
            <thead>
              <tr>
                <th>Date</th>
                <th>WO</th>
                <th>Lot</th>
                <th style={{ textAlign: 'center' }}>Checked</th>
                <th style={{ textAlign: 'center' }}>Pass</th>
                <th style={{ textAlign: 'center' }}>Fail</th>
                <th style={{ textAlign: 'center' }}>Overall</th>
                <th style={{ textAlign: 'center' }}>Defect / Remark</th>
                <th style={{ textAlign: 'center' }}>QA Verify</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableState colSpan={10} state="loading" />
              ) : isError ? (
                <TableState colSpan={10} state="error" onRetry={() => refetch()} />
              ) : filtered.length === 0 ? (
                <TableState colSpan={10} state="empty" emptyText={woFilter.trim() ? 'No items match the filter — clear the WO search to see all' : 'No QC Result data yet — click “+ Record QC Result” to start'} />
              ) : pagedList.map(r => (
                <tr key={r.id}>
                  <td style={{ height: ROW_H, color: 'var(--text-muted)', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{new Date(r.createdAt).toLocaleDateString('en-GB')}</td>
                  <td style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.woId}>{r.woId}</td>
                  <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.lotNo}>{r.lotNo}</td>
                  <td style={{ textAlign: 'center' }}>{r.qtyChecked}</td>
                  <td style={{ textAlign: 'center', color: '#16a34a', fontWeight: 600 }}>{r.qtyPass}</td>
                  <td style={{ textAlign: 'center', color: r.qtyFail > 0 ? '#dc2626' : 'var(--text-muted)', fontWeight: r.qtyFail > 0 ? 600 : 400 }}>{r.qtyFail}</td>
                  <td style={{ textAlign: 'center' }}><OverallBadge overall={r.overall} /></td>
                  {/* รวมเป็นบรรทัดเดียว + ตัด … (เดิม 2 บรรทัดทำให้แถวสูงไม่เท่ากัน) · hover ดูเต็มได้ */}
                  <td style={{ fontSize: '0.8rem', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={[r.defectDesc, r.remark].filter(Boolean).join(' · ') || undefined}>
                    {r.defectDesc && <span style={{ color: '#dc2626' }}>{r.defectDesc}</span>}
                    {r.defectDesc && r.remark && <span style={{ color: 'var(--line-3)' }}> · </span>}
                    {r.remark && <span style={{ color: 'var(--text-muted)' }}>📝 {r.remark}</span>}
                    {!r.defectDesc && !r.remark && <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {r.verifyId ? (
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: r.verdict === 'APPROVED' ? '#16a34a' : '#dc2626' }}>
                        {r.verdict === 'APPROVED' ? '✓ Approved' : '✗ Rejected'}
                      </span>
                    ) : (
                      <Link to={`/qa-verify/${r.id}`} style={{ fontSize: '0.82rem', color: 'var(--brand)', textDecoration: 'none', fontWeight: 600 }}>
                        Verify →
                      </Link>
                    )}
                  </td>
                  <td>
                    {(r.overall === 'FAIL' || r.overall === 'PARTIAL') && !isViewer && (
                      <button type="button" className="btn secondary" onClick={() => setReworkFor(r)}
                        style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem', color: '#dc2626', borderColor: '#fca5a5' }}>
                        + Rework
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              <FillerRows count={fillerCount(pagedList.length, PAGE_SIZE, totalPages)} cols={10} />
            </tbody>
          </table>
        </div>
        <Paginator page={page} totalPages={totalPages} onPage={setPage} total={filtered.length} />
      </div>

      {reworkFor && <ReworkDialog qcResult={reworkFor} onClose={() => setReworkFor(null)} />}
    </section>
  );
}
