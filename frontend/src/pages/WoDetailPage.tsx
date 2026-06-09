import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { buildSteps } from '../lib/woLifecycle';
import { StatusStepper } from '../components/StatusStepper';

export function WoDetailPage() {
  const { woId } = useParams();
  
  // สมมติว่าดึงข้อมูล WO มาจาก API
  const mockWo = {
    woId: woId || 'WO-2026-001',
    productCode: 'PCB-ASSY-01',
    customer: 'SYNTECH',
    qty: 1500,
    currentStep: 'WAIT_FAI', // กลับมาเทสสเตปกลางๆ จะได้เห็นว่าอนาคตก็มีสีแล้ว
    updatedAt: new Date().toLocaleString()
  };

  const steps = buildSteps(mockWo.currentStep);

  return (
    <section className="stack-lg">
      <div className="panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="panel__title">Work Order Detail</h1>
          <p className="panel__subtitle">รายละเอียดรหัส: <strong>{mockWo.woId}</strong></p>
        </div>
        <Link to="/wo-dashboard" className="btn secondary">กลับไป Dashboard</Link>
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
            <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{mockWo.productCode}</div>
          </div>
        </div>
      </div>
    </section>
  );
}