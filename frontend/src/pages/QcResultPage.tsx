import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  useQcResults, useQcResultCreate, useReworkCreate,
  type QcOverall, type QcResult,
} from '../lib/qcResultApi';
import { useIsViewer } from '../lib/useMockStore';
import { showToast } from '../lib/toast';
import { Paginator } from '../components/Paginator';
import { WoInput } from '../components/WoInput';
import { useWoLots, useScanSummary } from '../lib/lookups';

const OVERALL_STYLE: Record<QcOverall, { bg: string; text: string; border: string }> = {
  PASS:    { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  FAIL:    { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  PARTIAL: { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
};

function OverallBadge({ overall }: { overall: QcOverall }) {
  const s = OVERALL_STYLE[overall];
  return (
    <span style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}`, padding: '2px 10px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
      {overall}
    </span>
  );
}

function ReworkDialog({ qcResult, onClose }: { qcResult: QcResult; onClose: () => void }) {
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
          showToast(`เปิด Rework Ticket #${rw.id} สำเร็จ`, 'success');
          onClose();
        },
        onError: (err) => showToast(err.message, 'error'),
      }
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="panel" style={{ maxWidth: 480, width: '100%' }}>
        <h3 className="panel__title">เปิด Rework Ticket</h3>
        <p className="panel__subtitle" style={{ marginBottom: '1rem' }}>
          WO: <strong>{qcResult.woId}</strong> · Lot: {qcResult.lotNo} · NG: {qcResult.qtyFail} pcs
        </p>
        <form onSubmit={handleSubmit} className="stack" style={{ gap: '0.75rem' }}>
          <label className="field">
            <span>ประเภทของเสีย / Defect Type *</span>
            <input value={defectType} onChange={e => setDefectType(e.target.value)} placeholder="เช่น บัดกรีเสีย, ขาดั้มเสีย..." required />
          </label>
          <label className="field">
            <span>ผู้รับผิดชอบซ่อม</span>
            <input value={assignedTo} onChange={e => setAssignedTo(e.target.value)} placeholder="ชื่อช่างซ่อม..." />
          </label>
          <label className="field">
            <span>วันที่แก้เสร็จ (Due Date)</span>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </label>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button type="submit" className="btn" disabled={!defectType.trim() || reworkMut.isPending}
              style={{ flex: 1, background: '#ef4444', borderColor: '#ef4444', color: '#fff', fontWeight: 600 }}>
              {reworkMut.isPending ? 'กำลังเปิด...' : 'ยืนยันเปิด Rework Ticket'}
            </button>
            <button type="button" className="btn secondary" onClick={onClose} style={{ flex: 1 }}>ข้ามไปก่อน</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function QcResultPage() {
  const { woId: woIdParam } = useParams<{ woId?: string }>();
  const isViewer = useIsViewer();

  const { data, isLoading } = useQcResults();
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
          showToast(`บันทึก QC Result สำเร็จ — ${overall}`, overall === 'PASS' ? 'success' : 'error');
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
            <p className="panel__subtitle">บันทึกผลตรวจ QC และเปิด Rework Ticket</p>
          </div>
          {!isViewer && (
            <button type="button" className="btn" onClick={() => setShowForm(v => !v)}
              style={{ background: '#3b82f6', borderColor: '#3b82f6', color: '#fff', fontWeight: 600 }}>
              {showForm ? '✕ ยกเลิก' : '+ บันทึก QC Result'}
            </button>
          )}
        </div>

        {/* ─── Form ─────────────────────────────────────────────── */}
        {showForm && !isViewer && (
          <div className="panel" style={{ borderLeft: '4px solid #3b82f6', marginTop: '1.25rem' }}>
            <h3 className="panel__title panel__title--sm">บันทึกผล QC</h3>
            <form onSubmit={handleSubmit} className="stack" style={{ maxWidth: 560, marginTop: '0.75rem', gap: '0.75rem' }}>
              <div className="grid-2col">
                <label className="field">
                  <span>WO Number *</span>
                  <WoInput value={woId} onChange={setWoId} required />
                </label>
                <label className="field">
                  <span>Lot No *</span>
                  <input list="qc-lot-options" value={lotNo} onChange={e => setLotNo(e.target.value)}
                    placeholder={woId.trim() ? 'เลือก/พิมพ์ Lot' : 'ใส่ WO ก่อน'} disabled={!woId.trim()} required />
                  <datalist id="qc-lot-options">
                    {woLots.map(l => <option key={l} value={l} />)}
                  </datalist>
                </label>
              </div>

              {scan && scan.total > 0 && (
                <div className="notice info" style={{ fontSize: '0.82rem' }}>
                  📡 ดึงจาก Production Scan: ตรวจ {scan.total} · PASS {scan.pass} · FAIL {scan.fail} (แก้ไขได้)
                </div>
              )}

              <div className="grid-3col">
                <label className="field">
                  <span>จำนวนตรวจ (Checked)</span>
                  <input type="number" min="1" value={qtyChecked} onChange={e => setQtyChecked(e.target.value)} placeholder="100" required />
                </label>
                <label className="field">
                  <span>PASS (ผ่าน)</span>
                  <input type="number" min="0" max={qtyCheckedN || undefined} value={qtyPass} onChange={e => setQtyPass(e.target.value)} placeholder="95" />
                </label>
                <label className="field">
                  <span>FAIL (NG)</span>
                  <input type="number" readOnly value={qtyCheckedN > 0 ? qtyFailN : ''} style={{ background: '#f1f5f9' }} />
                </label>
              </div>

              {overall && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 1rem', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>ผลรวม:</span>
                  <OverallBadge overall={overall} />
                </div>
              )}

              {needsDefect && (
                <label className="field">
                  <span>รายละเอียดของเสีย (Defect Description) *</span>
                  <textarea value={defectDesc} onChange={e => setDefectDesc(e.target.value)} rows={2}
                    placeholder="ระบุตำแหน่ง / ลักษณะของเสียให้ชัดเจน..." required />
                </label>
              )}

              {needsDefect && (
                <label className="field">
                  <span>หมายเหตุ (Remark)</span>
                  <textarea value={remark} onChange={e => setRemark(e.target.value)} rows={2}
                    placeholder="หมายเหตุเพิ่มเติม (ไม่บังคับ) — เช่น สาเหตุเบื้องต้น, การติดตาม..." />
                </label>
              )}

              <button type="submit" className="btn"
                disabled={!woId.trim() || !lotNo.trim() || !qtyCheckedN || !overall || (needsDefect && !defectDesc.trim()) || createMut.isPending}
                style={{ background: '#3b82f6', borderColor: '#3b82f6', color: '#fff', fontWeight: 600, padding: '0.75rem' }}>
                {createMut.isPending ? 'กำลังบันทึก...' : 'ยืนยันบันทึก QC Result'}
              </button>
            </form>
          </div>
        )}

        {/* ─── Filter ───────────────────────────────────────────── */}
        <div style={{ marginTop: '1.5rem', marginBottom: '1rem', maxWidth: 320 }}>
          <label className="field">
            <span>Filter by WO</span>
            <input list="wo-options" value={woFilter} onChange={e => { setWoFilter(e.target.value); setPage(1); }} placeholder="พิมพ์ WO เพื่อกรอง..." />
          </label>
        </div>

        {/* ─── Table ────────────────────────────────────────────── */}
        <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 8 }}>
          <table className="table table-readonly" style={{ minWidth: 920, width: '100%' }}>
            <thead>
              <tr>
                <th>วันที่</th>
                <th>WO</th>
                <th>Lot</th>
                <th style={{ textAlign: 'center' }}>Checked</th>
                <th style={{ textAlign: 'center' }}>Pass</th>
                <th style={{ textAlign: 'center' }}>Fail</th>
                <th style={{ textAlign: 'center' }}>Overall</th>
                <th>ของเสีย / หมายเหตุ</th>
                <th style={{ textAlign: 'center' }}>QA Verify</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>กำลังโหลด...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>{woFilter.trim() ? 'ไม่พบรายการตามตัวกรอง — ล้างช่องค้นหา WO เพื่อดูทั้งหมด' : 'ยังไม่มีข้อมูล QC Result — กด “+ บันทึก QC Result” เพื่อเริ่ม'}</td></tr>
              ) : pagedList.map(r => (
                <tr key={r.id}>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{new Date(r.createdAt).toLocaleDateString('th-TH')}</td>
                  <td style={{ fontWeight: 600 }}>{r.woId}</td>
                  <td>{r.lotNo}</td>
                  <td style={{ textAlign: 'center' }}>{r.qtyChecked}</td>
                  <td style={{ textAlign: 'center', color: '#16a34a', fontWeight: 600 }}>{r.qtyPass}</td>
                  <td style={{ textAlign: 'center', color: r.qtyFail > 0 ? '#dc2626' : 'var(--text-muted)', fontWeight: r.qtyFail > 0 ? 600 : 400 }}>{r.qtyFail}</td>
                  <td style={{ textAlign: 'center' }}><OverallBadge overall={r.overall} /></td>
                  <td style={{ fontSize: '0.8rem', maxWidth: 260, whiteSpace: 'normal' }}>
                    {r.defectDesc && <div style={{ color: '#dc2626' }}>{r.defectDesc}</div>}
                    {r.remark && <div style={{ color: 'var(--text-muted)' }}>📝 {r.remark}</div>}
                    {!r.defectDesc && !r.remark && <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {r.verifyId ? (
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: r.verdict === 'APPROVED' ? '#16a34a' : '#dc2626' }}>
                        {r.verdict === 'APPROVED' ? '✓ Approved' : '✗ Rejected'}
                      </span>
                    ) : (
                      <Link to={`/qa-verify/${r.id}`} style={{ fontSize: '0.82rem', color: '#3b82f6', textDecoration: 'none', fontWeight: 600 }}>
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
            </tbody>
          </table>
        </div>
        <Paginator page={page} totalPages={totalPages} onPage={setPage} total={filtered.length} />
      </div>

      {reworkFor && <ReworkDialog qcResult={reworkFor} onClose={() => setReworkFor(null)} />}
    </section>
  );
}
