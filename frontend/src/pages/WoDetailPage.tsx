import { useParams, Link } from 'react-router-dom';
import { buildSteps, WO_LIFECYCLE } from '../lib/woLifecycle';
import { StatusStepper } from '../components/StatusStepper';
import { useMockAuth } from '../lib/useMockStore';
import { type WoStep } from '../lib/mockStore';
import { useWoBoard, useWoPatch } from '../lib/woApi';
import { showToast } from '../lib/toast';

const ADVANCE_LABEL: Partial<Record<WoStep, string>> = {
  DRAFT:    'Release งาน →',
  OPEN:     'Kitting พร้อม →',
  READY:    'เริ่มผลิต →',
  RUNNING:  'ส่ง FAI →',
};

export function WoDetailPage() {
  const { woId } = useParams();
  const { data: woList, isLoading } = useWoBoard();
  const patchMut = useWoPatch();
  const auth = useMockAuth();
  const wo = (woList ?? []).find(w => w.woId === woId) ?? null;

  if (isLoading) {
    return <div className="panel" style={{ margin: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>กำลังโหลด...</div>;
  }

  if (!wo) {
    return (
      <div className="notice err" style={{ margin: '2rem' }}>
        WO Not Found: <strong>{woId}</strong>
        <div style={{ marginTop: '1rem' }}>
          <Link to="/work-orders" className="btn secondary">← กลับ Work Orders</Link>
        </div>
      </div>
    );
  }

  const steps = buildSteps(wo.currentStep);
  const canFai = (wo.currentStep === 'WAIT_FAI_QA' || wo.currentStep === 'WAIT_FAI_MGR') && !wo.faiPassed;
  const canAct = auth.role === 'admin' || auth.role === 'member';

  const advanceLabel = ADVANCE_LABEL[wo.currentStep as WoStep];
  const currentIdx   = WO_LIFECYCLE.findIndex(s => s.key === wo.currentStep);
  const nextStep     = currentIdx >= 0 && currentIdx < WO_LIFECYCLE.length - 1
    ? WO_LIFECYCLE[currentIdx + 1].key as WoStep
    : null;

  function handleAdvance() {
    if (!nextStep) return;
    patchMut.mutate(
      { woId: wo!.woId, patch: { currentStep: nextStep } },
      {
        onSuccess: () => showToast(`${wo!.woId} → ${nextStep}`, 'success'),
        onError:   () => showToast('อัปเดตไม่สำเร็จ', 'error'),
      }
    );
  }

  return (
    <section className="stack-lg">
      <div className="panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="panel__title">Work Order Detail</h1>
          <p className="panel__subtitle">รายละเอียดรหัส: <strong>{wo.woId}</strong></p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {canAct && advanceLabel && nextStep && (
            <button
              type="button"
              className="btn"
              style={{ background: '#6366f1', borderColor: '#6366f1', color: '#fff', fontWeight: 600 }}
              onClick={handleAdvance}
              disabled={patchMut.isPending}
            >
              {advanceLabel}
            </button>
          )}
          {canAct && canFai && (
            <Link to={`/fai/${wo.woId}`} className="btn" style={{ background: '#f59e0b', color: '#fff', border: 'none' }}>
              {wo.currentStep === 'WAIT_FAI_QA' ? 'ตรวจ FAI (QA)' : 'อนุมัติ FAI (MGR)'}
            </Link>
          )}
          {canAct && wo.currentStep !== 'CLOSED' && (
            <Link to={`/wo/${wo.woId}/close`} className="btn danger">ปิดงาน (Close)</Link>
          )}
          <Link to="/work-orders" className="btn secondary">กลับไป Work Orders</Link>
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

      {wo.faiPassed && (
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
