import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { HistoryRow } from '../components/HistoryRow';
import api from '../lib/api';

export function RoutingHistoryPage() {
  const {
    data: history = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['routing-history'],
    queryFn: async () => {
      const { data } = await api.get('/routing/history');
      return data || [];
    },
  });

  return (
    <div className="mes-light-card">
      <div className="mes-module-head">
        <span className="mes-module-code">HIS</span>
        <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#1e293b' }}>Routing History</h2>
      </div>

      <div style={{ marginTop: '1.5rem', overflowX: 'auto' }}>
        {isLoading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading history... ⏳</div>
        ) : isError ? (
          <div className="notice err">Error fetching history: {error.message}</div>
        ) : history.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
            No production execution history found
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
              </tr>
            </thead>
            <tbody>
              {history.map((row: any) => (
                <HistoryRow key={row.id || `${row.serial}-${row.ts}`} row={row} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}