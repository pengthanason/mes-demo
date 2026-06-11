import { useState } from 'react';
import { CheckCircle2, XCircle, Scan } from 'lucide-react';
import { getQcRecords, addQcRecord } from '../../lib/mockStore';
import { useIsViewer } from '../../lib/useMockStore';
import { showToast } from '../../lib/toast';

export default function QcBoard() {
  const isViewer = useIsViewer();

  const [unitSn, setUnitSn] = useState('');
  const [history, setHistory] = useState(() => getQcRecords());
  const [isLoading, setIsLoading] = useState(false);
  const [globalError, setGlobalError] = useState('');

  const handleQcSubmit = (result) => {
    if (isViewer) return;
    if (!unitSn.trim()) {
      setGlobalError('Please enter a Unit SN first.');
      return;
    }
    setGlobalError('');
    setIsLoading(true);

    const entry = {
      sn: unitSn.trim(),
      status: result,
      time: new Date().toLocaleTimeString(),
      error: null,
    };

    addQcRecord(entry);
    setHistory(getQcRecords());
    setUnitSn('');
    setIsLoading(false);
    showToast(`QC ${result}: ${entry.sn}`, result === 'PASS' ? 'success' : 'error');
  };

  return (
    <div className="glass-panel" style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ padding: '0.75rem', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '12px' }}>
          <Scan color="var(--primary)" size={28} />
        </div>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Quality Control Terminal</h2>
          <p style={{ color: 'var(--text-muted)' }}>Scan unit serial numbers and submit test results.</p>
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
        </div>

        {isViewer && (
          <div style={{ background: 'rgba(100,116,139,0.12)', border: '1px solid rgba(100,116,139,0.3)', borderRadius: 8, padding: '0.75rem 1rem', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            👁 Viewer mode — read only, cannot submit QC results
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <button
            className="btn btn-success"
            style={{ padding: '1.5rem', fontSize: '1.25rem', opacity: isViewer ? 0.45 : 1, cursor: isViewer ? 'not-allowed' : undefined }}
            onClick={() => handleQcSubmit('PASS')}
            disabled={isLoading || !unitSn || isViewer}
          >
            <CheckCircle2 size={28} />
            PASS (OK)
          </button>

          <button
            className="btn btn-danger"
            style={{ padding: '1.5rem', fontSize: '1.25rem', opacity: isViewer ? 0.45 : 1, cursor: isViewer ? 'not-allowed' : undefined }}
            onClick={() => handleQcSubmit('FAIL')}
            disabled={isLoading || !unitSn || isViewer}
          >
            <XCircle size={28} />
            FAIL (NG)
          </button>
        </div>
      </div>

      <div style={{ marginTop: '3rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text-muted)' }}>Recent Scans</h3>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Unit SN</th>
                <th>Result</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td style={{ color: 'var(--text-muted)' }}>{h.time}</td>
                  <td style={{ fontWeight: 500 }}>{h.sn}</td>
                  <td>
                    <span className={`badge ${h.status === 'PASS' ? 'badge-pass' : 'badge-ng'}`}>
                      {h.status}
                    </span>
                  </td>
                  <td style={{ color: h.error ? 'var(--danger)' : 'var(--text-muted)' }}>
                    {h.error || 'Recorded successfully'}
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan="4" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No recent scans.
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
