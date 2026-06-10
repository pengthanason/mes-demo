import { HistoryRow, HistoryData } from '../components/HistoryRow';

const MOCK_HISTORY: HistoryData[] = [
  { id: 1,  ts: '2026-06-10 09:14:02', serial: 'SN-00101', sequence: 'SMT → AOI → ASSY', result: 'PASS', totalSec: 142 },
  { id: 2,  ts: '2026-06-10 09:28:47', serial: 'SN-00102', sequence: 'SMT → AOI → ASSY', result: 'PASS', totalSec: 138 },
  { id: 3,  ts: '2026-06-10 09:43:11', serial: 'SN-00103', sequence: 'SMT → AOI → ASSY', result: 'FAIL', totalSec: 156 },
  { id: 4,  ts: '2026-06-10 09:57:30', serial: 'SN-00104', sequence: 'SMT → AOI → ASSY', result: 'PASS', totalSec: 141 },
  { id: 5,  ts: '2026-06-10 10:12:05', serial: 'SN-00105', sequence: 'SMT → AOI → ASSY', result: 'PASS', totalSec: 135 },
  { id: 6,  ts: '2026-06-10 10:26:44', serial: 'SN-00201', sequence: 'ASSY → FCT → PACK', result: 'PASS', totalSec: 220 },
  { id: 7,  ts: '2026-06-10 10:41:19', serial: 'SN-00202', sequence: 'ASSY → FCT → PACK', result: 'PASS', totalSec: 215 },
  { id: 8,  ts: '2026-06-10 10:55:52', serial: 'SN-00203', sequence: 'ASSY → FCT → PACK', result: 'FAIL', totalSec: 240 },
  { id: 9,  ts: '2026-06-10 11:10:37', serial: 'SN-00204', sequence: 'ASSY → FCT → PACK', result: 'PASS', totalSec: 218 },
  { id: 10, ts: '2026-06-10 11:25:03', serial: 'SN-00301', sequence: 'FCT → QC → SHIP',  result: 'PASS', totalSec: 180 },
  { id: 11, ts: '2026-06-10 11:39:28', serial: 'SN-00302', sequence: 'FCT → QC → SHIP',  result: 'PASS', totalSec: 177 },
  { id: 12, ts: '2026-06-10 11:54:01', serial: 'SN-00303', sequence: 'FCT → QC → SHIP',  result: 'PASS', totalSec: 182 },
];

export function RoutingHistoryPage() {
  const passCount = MOCK_HISTORY.filter(r => r.result === 'PASS').length;
  const failCount = MOCK_HISTORY.filter(r => r.result === 'FAIL').length;

  return (
    <div className="mes-light-card">
      <div className="mes-module-head">
        <span className="mes-module-code">HIS</span>
        <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#1e293b' }}>Routing History</h2>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap' }}>
        <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, padding: '0.5rem 1.25rem', fontSize: '0.9rem', fontWeight: 600, color: '#15803d' }}>
          ✅ PASS: {passCount}
        </div>
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '0.5rem 1.25rem', fontSize: '0.9rem', fontWeight: 600, color: '#b91c1c' }}>
          ❌ FAIL: {failCount}
        </div>
        <div style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8, padding: '0.5rem 1.25rem', fontSize: '0.9rem', fontWeight: 600, color: '#475569' }}>
          Total: {MOCK_HISTORY.length}
        </div>
      </div>

      <div style={{ marginTop: '1.5rem', overflowX: 'auto' }}>
        <table className="table table-readonly">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Serial</th>
              <th>Sequence</th>
              <th>Result</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_HISTORY.map(row => (
              <HistoryRow key={row.id} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
