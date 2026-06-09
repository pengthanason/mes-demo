import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

const fetchJigResults = async (filters: Record<string, any>) => {
  const params = new URLSearchParams();
  Object.keys(filters).forEach(k => {
    if (filters[k]) params.set(k, String(filters[k]));
  });
  
  const res = await fetch(`/api/admin/jig-results?${params.toString()}`, {
    headers: { 'x-user-role': 'ADMIN' }
  });
  if (!res.ok) throw new Error('Failed to fetch jig results');
  return res.json();
};

export default function JigResultTable({ isPaused }: { isPaused: boolean }) {
  const [filters, setFilters] = useState({
    test_type: '',
    result_status: '',
    unit_sn: '',
    from: '',
    to: '',
    page: 1,
    limit: 50
  });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['jig-results', filters],
    queryFn: () => fetchJigResults(filters),
    refetchInterval: isPaused ? false : 30000,
  });

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, [e.target.name]: e.target.value, page: 1 }));
  };

  const getStatusBadge = (status: string) => {
    if (status === 'PASS') return <span className="badge badge-pass">PASS</span>;
    if (status === 'FAIL') return <span className="badge badge-ng">FAIL</span>;
    return <span className="badge" style={{ backgroundColor: 'gray' }}>{status || 'PENDING'}</span>;
  };

  return (
    <div className="panel stack">
      <div className="filters-grid">
        <label className="field">
          <span>Unit SN</span>
          <input type="text" name="unit_sn" placeholder="Search SN..." value={filters.unit_sn} onChange={handleFilterChange} />
        </label>
        <label className="field">
          <span>Test Type</span>
          <select name="test_type" value={filters.test_type} onChange={handleFilterChange}>
            <option value="">All</option>
            <option value="ICT">ICT</option>
            <option value="FCT">FCT</option>
          </select>
        </label>
        <label className="field">
          <span>Result</span>
          <select name="result_status" value={filters.result_status} onChange={handleFilterChange}>
            <option value="">All</option>
            <option value="PASS">PASS</option>
            <option value="FAIL">FAIL</option>
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
        <div className="empty">Loading jig results...</div>
      ) : isError ? (
        <div className="notice err">{(error as Error).message}</div>
      ) : !data?.data || data.data.length === 0 ? (
        <div className="empty">No test records found.</div>
      ) : (
        <div className="table-wrap" style={{ overflowX: 'auto' }}>
          <table className="table compact">
            <thead>
              <tr>
                <th>ID</th>
                <th>Unit SN</th>
                <th>WO ID</th>
                <th>Test Type</th>
                <th>Result</th>
                <th>Tested At</th>
                <th>Synced At</th>
              </tr>
            </thead>
            <tbody>
              {(Array.isArray(data?.data) ? data.data : []).map((row: any) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td><strong>{row.unit_sn}</strong></td>
                  <td>{row.wo_id || '-'}</td>
                  <td>{row.test_type}</td>
                  <td>{getStatusBadge(row.result_status)}</td>
                  <td>{row.tested_at ? new Date(row.tested_at).toLocaleString() : '-'}</td>
                  <td>{row.synced_at ? new Date(row.synced_at).toLocaleString() : '-'}</td>
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