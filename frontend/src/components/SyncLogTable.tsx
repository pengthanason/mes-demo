import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

const fetchSyncLog = async (filters: Record<string, any>) => {
  const params = new URLSearchParams();
  Object.keys(filters).forEach(k => {
    if (filters[k]) params.set(k, String(filters[k]));
  });
  
  // ส่ง Header เพื่อทดสอบระบบ Auth ตาม Context ของโปรเจกต์
  const res = await fetch(`/api/admin/sync-log?${params.toString()}`, {
    headers: { 'x-user-role': 'ADMIN' }
  });
  if (!res.ok) throw new Error('Failed to fetch sync log');
  return res.json();
};

export default function SyncLogTable({ isPaused }: { isPaused: boolean }) {
  const [filters, setFilters] = useState({
    direction: '',
    status: '',
    from: '',
    to: '',
    page: 1,
    limit: 50
  });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['sync-log', filters],
    queryFn: () => fetchSyncLog(filters),
    refetchInterval: isPaused ? false : 30000,
  });

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, [e.target.name]: e.target.value, page: 1 }));
  };

  const getStatusBadge = (status: string) => {
    if (status === 'OK') return <span className="badge badge-pass" style={{ backgroundColor: 'var(--success)' }}>OK</span>;
    if (status === 'ERROR') return <span className="badge badge-ng" style={{ backgroundColor: 'var(--danger)' }}>ERROR</span>;
    return <span className="badge" style={{ backgroundColor: 'gray' }}>{status || 'PENDING'}</span>;
  };

  return (
    <div className="panel stack">
      <div className="filters-grid">
        <label className="field">
          <span>Direction</span>
          <select name="direction" value={filters.direction} onChange={handleFilterChange}>
            <option value="">All</option>
            <option value="MES->WMS">MES-&gt;WMS</option>
            <option value="MES->MRP">MES-&gt;MRP</option>
            <option value="MRP->MES">MRP-&gt;MES</option>
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select name="status" value={filters.status} onChange={handleFilterChange}>
            <option value="">All</option>
            <option value="OK">OK</option>
            <option value="ERROR">ERROR</option>
            <option value="PENDING">PENDING</option>
          </select>
        </label>
        <label className="field">
          <span>From Date</span>
          <input type="date" name="from" value={filters.from} onChange={handleFilterChange} />
        </label>
        <label className="field">
          <span>To Date</span>
          <input type="date" name="to" value={filters.to} onChange={handleFilterChange} />
        </label>
      </div>

      {isLoading ? (
        <div className="empty">Loading sync logs...</div>
      ) : isError ? (
        <div className="notice err">{(error as Error).message}</div>
      ) : !data?.data || data.data.length === 0 ? (
        <div className="empty">No sync records found.</div>
      ) : (
        <div className="table-wrap" style={{ overflowX: 'auto' }}>
          <table className="table compact">
            <thead>
              <tr>
                <th>ID</th>
                <th>Direction</th>
                <th>Event Type</th>
                <th>WO ID</th>
                <th>Status</th>
                <th>Created At</th>
                <th>Attempts</th>
                <th>Error Message</th>
              </tr>
            </thead>
            <tbody>
              {(Array.isArray(data?.data) ? data.data : []).map((row: any) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>{row.direction}</td>
                  <td>{row.event_type}</td>
                  <td>{row.wo_id || '-'}</td>
                  <td>{getStatusBadge(row.status)}</td>
                  <td>{new Date(row.created_at).toLocaleString()}</td>
                  <td>{row.attempts} / {row.max_attempts}</td>
                  <td 
                    style={{ color: 'var(--danger)', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} 
                    title={row.error_msg}>
                    {row.error_msg || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Total records: {data?.total || 0}
          </div>
        </div>
      )}
    </div>
  );
}