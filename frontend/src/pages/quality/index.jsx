import { useState } from 'react';
import { CheckCircle2, XCircle, Scan } from 'lucide-react';
import { useQcHistory, useQcCreate } from '../../lib/recordsApi';
import { useIsViewer } from '../../lib/useMockStore';
import { showToast } from '../../lib/toast';
import { TableState } from '../../components/DataStates';
import { useEscapeKey } from '../../lib/useEscapeKey';

// สี badge ตามสถานะ (PASS=เขียว, REPAIRED=เหลืองอำพัน, NG/อื่นๆ=แดง) — #51 status = PASS/NG/REPAIRED
function badgeStyle(st) {
  if (st === 'PASS')     return { background: '#dcfce7', color: '#166534', border: '1px solid #16a34a' };
  if (st === 'REPAIRED') return { background: '#fef3c7', color: '#92400e', border: '1px solid #d97706' };
  return { background: '#fee2e2', color: '#991b1b', border: '1px solid #dc2626' };   // NG / FAIL
}

export default function QcBoard() {
  const isViewer = useIsViewer();

  const [unitSn, setUnitSn] = useState('');
  const [showFailModal, setShowFailModal] = useState(false);
  const { data, isLoading: histLoading, isError: histError, refetch: histRefetch } = useQcHistory();
  const createMut = useQcCreate();
  const history = data ?? [];
  const isLoading = createMut.isPending;
  const [globalError, setGlobalError] = useState('');
  useEscapeKey(showFailModal, () => setShowFailModal(false));

  const submitQc = (result, isScrap = false) => {
    if (isViewer) return;
    if (!unitSn.trim()) {
      setGlobalError('Please enter a Unit SN first.');
      return;
    }
    setGlobalError('');

    const sn = unitSn.trim();
    createMut.mutate(
      { sn, status: result, error: isScrap ? 'Scrapped by QC' : null, scrapped: isScrap },
      {
        onSuccess: () => {
          setUnitSn('');
          setShowFailModal(false);
          showToast(`QC ${result}${isScrap ? ' (SCRAPPED - WMS Stock Adjusted)' : ''}: ${sn}`, result === 'PASS' ? 'success' : 'error');
        },
        onError: () => setGlobalError('Save failed — please try again'),
      }
    );
  };

  const handleFailClick = () => {
    if (isViewer) return;
    if (!unitSn.trim()) {
      setGlobalError('Please enter a Unit SN first.');
      return;
    }
    setGlobalError('');
    setShowFailModal(true);
  };

  return (
    <div className="panel">

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ padding: '0.75rem', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '12px' }}>
          <Scan color="var(--primary)" size={28} />
        </div>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>QC Board</h2>
          <p style={{ color: 'var(--text-muted)' }}>Scan the unit serial and record the PASS / FAIL result</p>
        </div>
      </div>

      {globalError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          {globalError}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>Unit Serial Number (SN)</label>
          <input
            type="text"
            className="form-input"
            placeholder="Scan barcode or type manually..."
            value={unitSn}
            onChange={(e) => setUnitSn(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitQc('PASS'); }}
            disabled={isLoading}
            autoFocus
            style={{ fontSize: '1.25rem', padding: '1rem' }}
          />
          {isLoading && <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>⏳ Saving result...</div>}
        </div>

        {isViewer && (
          <div style={{ background: 'rgba(100,116,139,0.12)', border: '1px solid rgba(100,116,139,0.3)', borderRadius: 8, padding: '0.75rem 1rem', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            👁 Viewer mode — read only, cannot submit QC results
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1rem' }}>
          <button
            className="btn success"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', minWidth: 0, padding: '1.25rem 0.5rem', fontSize: '1.15rem', opacity: isViewer ? 0.45 : 1, cursor: isViewer ? 'not-allowed' : undefined }}
            onClick={() => submitQc('PASS')}
            disabled={isLoading || !unitSn || isViewer}
          >
            <CheckCircle2 size={28} />
            PASS (OK)
          </button>

          <button
            className="btn danger"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', minWidth: 0, padding: '1.25rem 0.5rem', fontSize: '1.15rem', opacity: isViewer ? 0.45 : 1, cursor: isViewer ? 'not-allowed' : undefined }}
            onClick={handleFailClick}
            disabled={isLoading || !unitSn || isViewer}
          >
            <XCircle size={28} />
            FAIL (NG)
          </button>
        </div>
      </div>

      {/* FAIL Option Modal */}
      {showFailModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="panel" style={{ maxWidth: 460, width: '100%', border: '1px solid rgba(239, 68, 68, 0.4)', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ padding: '0.5rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px' }}>
                <XCircle color="#ef4444" size={26} />
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 600, color: '#ef4444', margin: 0 }}>
                Result: FAIL (NG)
              </h3>
            </div>

            <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              Serial Number: <strong style={{ color: 'var(--text-main)' }}>{unitSn}</strong>
              <br />
              Please choose the next action for this unit:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn danger"
                onClick={() => submitQc('FAIL', true)}
                disabled={isLoading}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.85rem', fontSize: '1rem', fontWeight: 600 }}
              >
                🗑️ Scrap Unit (Scrap & Adjust WMS Stock)
              </button>

              <button
                type="button"
                className="btn secondary"
                onClick={() => submitQc('FAIL', false)}
                disabled={isLoading}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.85rem', fontSize: '1rem' }}
              >
                🛠️ Send to Rework (Rework Only)
              </button>

              <button
                type="button"
                className="btn outline"
                onClick={() => setShowFailModal(false)}
                disabled={isLoading}
                style={{ marginTop: '0.25rem', padding: '0.6rem', fontSize: '0.875rem' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: '3rem' }}>
        {/* #51: snapshot สถานะล่าสุดต่อชิ้น (unit) ไม่ใช่ timeline ทุกครั้งที่สแกน */}
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text-muted)' }}>Unit Status (latest)</h3>
        <div className="table-container">
          <table className="table table-readonly">
            <thead>
              <tr>
                <th>Updated</th>
                <th>Unit SN</th>
                <th>WO No.</th>
                <th>Part No.</th>
                <th>Station</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {histLoading ? <TableState colSpan={6} state="loading" />
               : histError ? <TableState colSpan={6} state="error" onRetry={() => histRefetch()} />
               : history.map((h) => {
                const st = String(h.status || '').toUpperCase();
                const when = h.updatedAt ? new Date(h.updatedAt).toLocaleString() : '—';
                return (
                  <tr key={h.sn}>
                    <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{when}</td>
                    <td style={{ fontWeight: 500 }}>{h.sn}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{h.woNumber || '—'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{h.partNo || '—'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{h.station || '—'}</td>
                    <td>
                      <span className="badge" style={badgeStyle(st)}>{h.status || '—'}</span>
                    </td>
                  </tr>
                );
              })}
              {!histLoading && !histError && history.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No units yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
