import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { buildSteps } from '../lib/woLifecycle';
import { StatusStepper } from '../components/StatusStepper';
import api from '../lib/api';

export function WoDetailPage() {
  const { woId } = useParams();
  const [wo, setWo] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchWo() {
      try {
        const { data } = await api.get(`/wo/${woId}`);
        setWo(data.wo || data);
      } catch (err: any) {
        setError(err.message || 'Failed to load WO details');
      } finally {
        setIsLoading(false);
      }
    }
    fetchWo();
  }, [woId]);

  if (isLoading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading... ⏳</div>;
  if (error) return <div className="notice err" style={{ margin: '2rem' }}>{error}</div>;
  if (!wo) return <div className="notice err" style={{ margin: '2rem' }}>WO Not Found</div>;

  const currentStep = wo.status || 'OPEN';
  const steps = buildSteps(currentStep);

  return (
    <section className="stack-lg">
      <div className="panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="panel__title">Work Order Detail</h1>
          <p className="panel__subtitle">รายละเอียดรหัส: <strong>{wo.wo_number || woId}</strong></p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Link to={`/fai/${woId}`} className="btn" style={{ background: '#f59e0b', color: '#fff', border: 'none' }}>ตรวจ FAI</Link>
          <Link to={`/wo/${woId}/close`} className="btn danger">ปิดงาน (Close)</Link>
          <Link to="/wo-dashboard" className="btn secondary">กลับไป Dashboard</Link>
        </div>
      </div>

      <div className="panel">
        <h2 className="panel__title panel__title--sm" style={{ marginBottom: '1.5rem' }}>Lifecycle Timeline</h2>
        <StatusStepper steps={steps} size="normal" />
      </div>

      <div className="panel">
        <h2 className="panel__title panel__title--sm">General Information</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
          <div className="glass-panel" style={{ padding: '1rem' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Product Code</span>
            <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{wo.part_no || '-'}</div>
          </div>
          <div className="glass-panel" style={{ padding: '1rem' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Target Qty</span>
            <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{(wo.qty_target || 0).toLocaleString()} pcs</div>
          </div>
          <div className="glass-panel" style={{ padding: '1rem' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Good Qty</span>
            <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--success)' }}>{(wo.qty_good || 0).toLocaleString()} pcs</div>
          </div>
        </div>
      </div>
    </section>
  );
}