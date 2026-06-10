import { useParams, Link } from 'react-router-dom';
import { buildSteps } from '../lib/woLifecycle';
import { StatusStepper } from '../components/StatusStepper';
import { useMockWoList } from '../lib/useMockStore';

export function WoDetailPage() {
  const { woId } = useParams();
  const woList = useMockWoList();
  const wo = woList.find(w => w.woId === woId) ?? null;

  if (!wo) {
    return (
      <div className="notice err" style={{ margin: '2rem' }}>
        WO Not Found: <strong>{woId}</strong>
        <div style={{ marginTop: '1rem' }}>
          <Link to="/wo-dashboard" className="btn secondary">← กลับ Dashboard</Link>
        </div>
      </div>
    );
  }

  const steps = buildSteps(wo.currentStep);

  return (
    <section className="stack-lg">
      <div className="panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="panel__title">Work Order Detail</h1>
          <p className="panel__subtitle">รายละเอียดรหัส: <strong>{wo.woId}</strong></p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Link to={`/fai/${wo.woId}`} className="btn" style={{ background: '#f59e0b', color: '#fff', border: 'none' }}>ตรวจ FAI</Link>
          <Link to={`/wo/${wo.woId}/close`} className="btn danger">ปิดงาน (Close)</Link>
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
            <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{wo.productCode}</div>
          </div>
          <div className="glass-panel" style={{ padding: '1rem' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Customer</span>
            <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{wo.customer}</div>
          </div>
          <div className="glass-panel" style={{ padding: '1rem' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Station</span>
            <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{wo.station}</div>
          </div>
          <div className="glass-panel" style={{ padding: '1rem' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Target Qty</span>
            <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{wo.qty.toLocaleString()} pcs</div>
          </div>
          <div className="glass-panel" style={{ padding: '1rem' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Good Qty</span>
            <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--success)' }}>
              {wo.actualQty != null ? wo.actualQty.toLocaleString() : wo.qtyGood.toLocaleString()} pcs
            </div>
          </div>
          <div className="glass-panel" style={{ padding: '1rem' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Status</span>
            <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{wo.currentStep}</div>
          </div>
        </div>
      </div>

      {(wo.faiPassed) && (
        <div className="panel">
          <h2 className="panel__title panel__title--sm">FAI Result</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
            <div className="glass-panel" style={{ padding: '1rem' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Inspector</span>
              <div style={{ fontWeight: 'bold' }}>{wo.faiInspector}</div>
            </div>
            <div className="glass-panel" style={{ padding: '1rem' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Approver</span>
              <div style={{ fontWeight: 'bold' }}>{wo.faiApprover}</div>
            </div>
            <div className="glass-panel" style={{ padding: '1rem' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Result</span>
              <div style={{ fontWeight: 'bold', color: 'var(--success)' }}>✅ PASSED</div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
