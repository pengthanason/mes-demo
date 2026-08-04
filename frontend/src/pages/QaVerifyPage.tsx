import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQcResults, useTransferVerifyCreate, type TransferVerdict } from '../lib/qcResultApi';
import { useIsViewer } from '../lib/useMockStore';
import { useAdminUsers } from '../lib/adminApi';
import { showToast } from '../lib/toast';
import { ComboBoxInput } from '../components/ComboBoxInput';

export function QaVerifyPage() {
  const { reqId } = useParams<{ reqId: string }>();
  const qcResultId = Number(reqId);
  const isViewer = useIsViewer();

  const { data, isLoading, isError, refetch } = useQcResults();
  const verifyMut = useTransferVerifyCreate();
  const { data: users = [] } = useAdminUsers();
  const qcResult = (data ?? []).find(r => r.id === qcResultId) ?? null;

  const [verdict,     setVerdict]     = useState<TransferVerdict | ''>('');
  const [note,        setNote]        = useState('');
  const [verifiedBy,  setVerifiedBy]  = useState('');

  if (isLoading) {
    return <div className="panel" style={{ margin: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>;
  }

  if (isError) {
    return (
      <div className="notice err" style={{ margin: '2rem' }}>
        Failed to load QC data
        <div style={{ marginTop: '1rem' }}>
          <button type="button" className="btn secondary" onClick={() => refetch()}>Retry</button>
        </div>
      </div>
    );
  }

  if (!qcResult) {
    return (
      <div className="notice err" style={{ margin: '2rem' }}>
        QC Result not found
        <div style={{ marginTop: '1rem' }}>
          <Link to="/qc-result" className="btn secondary">← Back to QC list</Link>
        </div>
      </div>
    );
  }

  const alreadyVerified = qcResult.verifyId !== null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!verdict || !verifiedBy.trim()) return;
    verifyMut.mutate(
      { qcResultId, verdict, note, verifiedBy },
      {
        onSuccess: () => {
          showToast(`Transfer Verify — ${verdict}`, verdict === 'APPROVED' ? 'success' : 'error');
          setVerdict(''); setNote(''); setVerifiedBy('');
        },
        onError: (err) => showToast(err.message, 'error'),
      }
    );
  }

  const overallColor = qcResult.overall === 'PASS' ? '#16a34a' : qcResult.overall === 'FAIL' ? '#dc2626' : '#b45309';

  return (
    <section className="stack-lg">
      <div className="panel">
        <div style={{ marginBottom: '0.75rem' }}>
          <Link to="/qc-result" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>← Back to QC Result list</Link>
        </div>
        <h1 className="panel__title">Transfer Verify</h1>
        <p className="panel__subtitle">QA inspection before delivery</p>
      </div>

      {/* ─── QC Result Info ─────────────────────────────────────── */}
      <div className="panel">
        <h2 className="panel__title panel__title--sm" style={{ marginBottom: '1rem' }}>QC Result #{qcResult.id} Info</h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
          {[
            { label: 'WO',           value: qcResult.woId },
            { label: 'Lot No',       value: qcResult.lotNo },
            { label: 'QC Date',      value: new Date(qcResult.createdAt).toLocaleDateString('en-GB') },
            { label: 'Checked',      value: String(qcResult.qtyChecked) },
            { label: 'Pass',         value: String(qcResult.qtyPass) },
            { label: 'Fail',         value: String(qcResult.qtyFail) },
          ].map(({ label, value }) => (
            <div key={label} style={{ padding: '0.875rem', background: 'var(--surface-1)', border: '1px solid var(--border-color)', borderRadius: 10 }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>{label}</div>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--ink-1)' }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '1rem', padding: '0.75rem 1rem', background: 'var(--surface-1)', borderRadius: 6 }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Overall Result:</span>
          <span style={{ fontWeight: 700, color: overallColor, fontSize: '1rem' }}>{qcResult.overall}</span>
        </div>

        {qcResult.defectDesc && (
          <div style={{ marginTop: '0.75rem', padding: '0.75rem 1rem', background: '#fef2f2', borderRadius: 6, border: '1px solid #fca5a5' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#dc2626', textTransform: 'uppercase', marginBottom: 4 }}>Defect Description</div>
            <div style={{ whiteSpace: 'pre-wrap', color: '#7f1d1d' }}>{qcResult.defectDesc}</div>
          </div>
        )}
      </div>

      {/* ─── Already Verified ─────────────────────────────────── */}
      {alreadyVerified && (
        <div className="panel" style={{ borderLeft: `4px solid ${qcResult.verdict === 'APPROVED' ? '#10b981' : '#ef4444'}` }}>
          <h2 className="panel__title panel__title--sm">Verification Result</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
            <span style={{ fontWeight: 700, fontSize: '1.1rem', color: qcResult.verdict === 'APPROVED' ? '#16a34a' : '#dc2626' }}>
              {qcResult.verdict === 'APPROVED' ? '✓ APPROVED' : '✗ REJECTED'}
            </span>
            {qcResult.verifiedBy && <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>By: {qcResult.verifiedBy}</span>}
            {qcResult.verifiedAt && <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{new Date(qcResult.verifiedAt).toLocaleDateString('en-GB')}</span>}
          </div>
        </div>
      )}

      {/* ─── Verify Form ────────────────────────────────────────── */}
      {!alreadyVerified && !isViewer && (
        <div className="panel">
          <h2 className="panel__title panel__title--sm" style={{ marginBottom: '1rem' }}>QA Verify</h2>
          <form onSubmit={handleSubmit} className="stack" style={{ gap: '0.75rem' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--ink-3)', textTransform: 'uppercase', marginBottom: '0.6rem' }}>Verdict *</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setVerdict('APPROVED')}
                  style={{
                    padding: '1rem', borderRadius: 8, border: `2px solid ${verdict === 'APPROVED' ? '#10b981' : 'var(--line-3)'}`,
                    background: verdict === 'APPROVED' ? '#dcfce7' : '#fff',
                    color: verdict === 'APPROVED' ? '#166534' : 'var(--ink-4)',
                    fontWeight: 700, fontSize: '1rem', cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  ✓ APPROVE
                </button>
                <button
                  type="button"
                  onClick={() => setVerdict('REJECTED')}
                  style={{
                    padding: '1rem', borderRadius: 8, border: `2px solid ${verdict === 'REJECTED' ? '#ef4444' : 'var(--line-3)'}`,
                    background: verdict === 'REJECTED' ? '#fee2e2' : '#fff',
                    color: verdict === 'REJECTED' ? '#991b1b' : 'var(--ink-4)',
                    fontWeight: 700, fontSize: '1rem', cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  ✗ REJECT
                </button>
              </div>
            </div>

            <label className="field">
              <span>Remark</span>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Reason or supporting remark..." />
            </label>

            <label className="field">
              <span>QA Inspector Name *</span>
              <ComboBoxInput value={verifiedBy} onChange={setVerifiedBy} options={users.map(u => u.fullName)}
                placeholder="Select/type a name..." required ariaLabel="QA Inspector Name" />
            </label>

            <button type="submit" className="btn" disabled={!verdict || !verifiedBy.trim() || verifyMut.isPending}
              style={{ background: 'var(--brand)', borderColor: 'var(--brand)', color: '#fff', fontWeight: 600, padding: '0.75rem' }}>
              {verifyMut.isPending ? 'Saving...' : 'Confirm Transfer Verify'}
            </button>
          </form>
        </div>
      )}

      {!alreadyVerified && isViewer && (
        <div className="notice info">
          👁 Viewer mode — cannot verify
        </div>
      )}
    </section>
  );
}
