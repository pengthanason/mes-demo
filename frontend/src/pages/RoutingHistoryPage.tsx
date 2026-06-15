import { useState } from 'react';
import { useRoutingRecords, useRoutingDelete } from '../lib/recordsApi';
import { Paginator } from '../components/Paginator';

export function RoutingHistoryPage() {
  const { data } = useRoutingRecords();
  const deleteMut = useRoutingDelete();
  const history = data ?? [];
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const totalPages = Math.max(1, Math.ceil(history.length / PAGE_SIZE));
  const pagedHistory = history.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const passCount = history.filter(r => r.result === 'PASS').length;
  const failCount = history.filter(r => r.result === 'FAIL').length;

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
          Total: {history.length}
        </div>
      </div>

      <div style={{ marginTop: '1.5rem', overflowX: 'auto' }}>
        {history.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8', fontSize: '0.95rem' }}>
            ยังไม่มีประวัติ — บันทึก Routing ในหน้า Sequence Builder เพื่อเพิ่มข้อมูล
          </div>
        ) : (
          <table className="table table-readonly">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Serial</th>
                <th>Sequence</th>
                <th>Result</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pagedHistory.map(row => {
                const isPass = row.result.toUpperCase() === 'PASS';
                const badgeStyle = {
                  backgroundColor: isPass ? '#dcfce7' : '#fee2e2',
                  color: isPass ? '#166534' : '#991b1b',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '999px',
                  fontSize: '0.85rem',
                  fontWeight: 'bold' as const,
                  display: 'inline-block',
                };
                return (
                  <tr key={row.id}>
                    <td>{row.ts}</td>
                    <td>{row.serial}</td>
                    <td>{row.sequence}</td>
                    <td><span style={badgeStyle}>{row.result}</span></td>
                    <td>{row.totalSec}s</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => deleteMut.mutate(row.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '0.85rem', padding: '0.25rem 0.5rem', borderRadius: 4 }}
                        title="ลบรายการนี้"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <Paginator page={page} totalPages={totalPages} onPage={setPage} total={history.length} />
    </div>
  );
}
