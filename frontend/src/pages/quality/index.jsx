import { useState } from 'react';
import { CheckCircle2, XCircle, Scan } from 'lucide-react';
import { useQcHistory, useQcCreate } from '../../lib/recordsApi';
import { useIsViewer } from '../../lib/useMockStore';
import { showToast } from '../../lib/toast';

// สี badge ตามสถานะ (PASS=เขียว, REPAIRED=เหลืองอำพัน, NG/อื่นๆ=แดง) — #51 status = PASS/NG/REPAIRED
function badgeStyle(st) {
  if (st === 'PASS')     return { background: '#dcfce7', color: '#166534', border: '1px solid #16a34a' };
  if (st === 'REPAIRED') return { background: '#fef3c7', color: '#92400e', border: '1px solid #d97706' };
  return { background: '#fee2e2', color: '#991b1b', border: '1px solid #dc2626' };   // NG / FAIL
}

export default function QcBoard() {
  const isViewer = useIsViewer();

  const [unitSn, setUnitSn] = useState('');
  const { data } = useQcHistory();
  const createMut = useQcCreate();
  const history = data ?? [];
  const isLoading = createMut.isPending;
  const [globalError, setGlobalError] = useState('');

  const handleQcSubmit = (result) => {
    if (isViewer) return;
    if (!unitSn.trim()) {
      setGlobalError('Please enter a Unit SN first.');
      return;
    }
    setGlobalError('');

    const sn = unitSn.trim();
    createMut.mutate(
      { sn, status: result, error: null },
      {
        onSuccess: () => {
          setUnitSn('');
          showToast(`QC ${result}: ${sn}`, result === 'PASS' ? 'success' : 'error');
        },
        onError: () => setGlobalError('Save failed — please try again'),
      }
    );
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
            onKeyDown={(e) => { if (e.key === 'Enter') handleQcSubmit('PASS'); }}
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
            onClick={() => handleQcSubmit('PASS')}
            disabled={isLoading || !unitSn || isViewer}
          >
            <CheckCircle2 size={28} />
            PASS (OK)
          </button>

          <button
            className="btn danger"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', minWidth: 0, padding: '1.25rem 0.5rem', fontSize: '1.15rem', opacity: isViewer ? 0.45 : 1, cursor: isViewer ? 'not-allowed' : undefined }}
            onClick={() => handleQcSubmit('FAIL')}
            disabled={isLoading || !unitSn || isViewer}
          >
            <XCircle size={28} />
            FAIL (NG)
          </button>
        </div>
      </div>

      <div style={{ marginTop: '3rem' }}>
        {/* #51: snapshot สถานะล่าสุดต่อชิ้น (unit) ไม่ใช่ timeline ทุกครั้งที่สแกน */}
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text-muted)' }}>Unit Status (latest)</h3>
        <div className="table-container">
          <table>
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
              {history.map((h) => {
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
              {history.length === 0 && (
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
