import React, { useEffect, useState } from 'react';

type BomRow = {
  bom_no: string;
  bom_rev: string | null;
  status: string | null;
  part_no?: string | null;
  created_at?: string | null;
};

export default function BomEditorPage() {
  const [rows, setRows] = useState<BomRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/wo/boms', {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list: BomRow[] = Array.isArray(data) ? data : data.items || data.data || [];
      setRows(list);
    } catch (e: any) {
      setError(e?.message || 'Load failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <section className="stack-lg">
      <div style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Online BOM Editor</h2>
        <p style={{ color: 'var(--text-muted)', marginTop: '0.25rem' }}>
          รายการ BOM ที่ MES ดึงจาก MRP · อ่านอย่างเดียวใน MVP นี้ · ต่อ Draft/Edit ทีหลัง
        </p>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button
          onClick={load}
          disabled={loading}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: 6,
            background: 'var(--primary)',
            color: 'white',
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Loading…' : 'Reload'}
        </button>
      </div>

      {error && (
        <div style={{ padding: '0.75rem 1rem', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid var(--danger)', borderRadius: 6, marginBottom: '1rem' }}>
          Error: {error}
        </div>
      )}

      <div className="glass-panel" style={{ padding: '1rem', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>
              <th style={{ padding: '0.5rem 0.75rem' }}>BOM No</th>
              <th style={{ padding: '0.5rem 0.75rem' }}>Rev</th>
              <th style={{ padding: '0.5rem 0.75rem' }}>Status</th>
              <th style={{ padding: '0.5rem 0.75rem' }}>Part No</th>
              <th style={{ padding: '0.5rem 0.75rem' }}>Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={5} style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  ไม่มีข้อมูล — ต้อง login + มี BOM ใน MRP ก่อน
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.bom_no + (r.bom_rev || '')} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '0.5rem 0.75rem' }}>{r.bom_no}</td>
                <td style={{ padding: '0.5rem 0.75rem' }}>{r.bom_rev || '-'}</td>
                <td style={{ padding: '0.5rem 0.75rem' }}>{r.status || '-'}</td>
                <td style={{ padding: '0.5rem 0.75rem' }}>{r.part_no || '-'}</td>
                <td style={{ padding: '0.5rem 0.75rem' }}>{r.created_at || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
