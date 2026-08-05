import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useWoBoard, useWoPatch } from '../lib/woApi';
import { showToast } from '../lib/toast';
import { BlockState } from '../components/DataStates';

export function FaiPage() {
  const { woId } = useParams();
  const navigate = useNavigate();
  const { data: woList, isLoading, isError, refetch } = useWoBoard();
  const patchMut = useWoPatch();
  const wo = (woList ?? []).find(w => w.woId === woId) ?? null;

  const [checklist, setChecklist] = useState<Record<string, 'PASS' | 'FAIL' | ''>>({
    'chk-01': '', 'chk-02': '', 'chk-03': '',
  });
  const [inspectorId, setInspectorId] = useState('');
  const [approverId,  setApproverId]  = useState('');
  const [error,       setError]       = useState('');
  const [successMsg,  setSuccessMsg]  = useState('');

  const isChecklistComplete = Object.values(checklist).every(v => v !== '');
  const isDualKeyValid = inspectorId.trim() !== '' && approverId.trim() !== '' && inspectorId !== approverId;

  // แยก "โหลดไม่สำเร็จ" (เน็ต/API ล่ม) ออกจาก "หา WO ไม่เจอจริง" — เดิมรวมเป็นข้อความ "WO Not Found" เดียวกันหมด
  // ทำให้เข้าใจผิดว่า WO ไม่มีอยู่จริง ทั้งที่จริงๆ แค่โหลดไม่สำเร็จ กด Retry แล้วน่าจะเจอ
  if (isLoading || isError) {
    return (
      <div className="panel">
        <BlockState state={isLoading ? 'loading' : 'error'} onRetry={() => refetch()} />
      </div>
    );
  }
  if (!wo) {
    return (
      <div className="notice err" style={{ margin: '2rem' }}>
        WO Not Found: <strong>{woId}</strong>
        <div style={{ marginTop: '1rem' }}>
          <Link to="/wo-dashboard" className="btn secondary">← Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  const isQaStep  = wo.currentStep === 'WAIT_FAI_QA';
  const isMgrStep = wo.currentStep === 'WAIT_FAI_MGR';

  if (!isQaStep && !isMgrStep) {
    return (
      <div className="panel stack" style={{ textAlign: 'center', padding: '3rem 1rem', maxWidth: '500px', margin: '0 auto' }}>
        <div className="notice err" style={{ marginBottom: '1rem' }}>
          WO <strong>{woId}</strong> is at step <strong>{wo.currentStep}</strong> — FAI cannot be performed
        </div>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>FAI can only be performed at the WAIT_FAI_QA or WAIT_FAI_MGR steps</p>
        <button type="button" className="btn secondary" onClick={() => navigate(`/wo/${woId}`)}>Back to WO Detail</button>
      </div>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!isChecklistComplete) { setError('Please complete all checklist items'); return; }
    if (inspectorId === approverId) { setError('Inspector and Approver must not be the same person (Dual-Key Verification)'); return; }

    if (!wo) { setError('WO not found'); return; }

    if (wo.currentStep === 'WAIT_FAI_QA') {
      patchMut.mutate(
        { woId: woId || '', patch: { currentStep: 'WAIT_FAI_MGR', faiInspector: inspectorId } },
        {
          onSuccess: () => {
            showToast('FAI QA passed — waiting for manager approval', 'success');
            setSuccessMsg('FAI (QA) inspection result has been sent to the manager for approval\nStatus: WAIT_FAI_QA → WAIT_FAI_MGR');
          },
          onError: () => setError('Save failed — please try again'),
        }
      );
    } else {
      patchMut.mutate(
        { woId: woId || '', patch: { faiPassed: true, faiInspector: wo.faiInspector || inspectorId, faiApprover: approverId } },
        {
          onSuccess: () => {
            showToast('FAI approved — ready to close WO', 'success');
            setSuccessMsg('Manager has approved the FAI\nThe WO is still open — you can close it from the WO Detail page');
          },
          onError: () => setError('Save failed — please try again'),
        }
      );
    }
  }

  if (successMsg) {
    return (
      <div className="panel stack" style={{ textAlign: 'center', padding: '3rem 1rem', maxWidth: '500px', margin: '0 auto' }}>
        <h2 style={{ color: 'var(--success)', marginBottom: '1rem' }}>✅ FAI Complete</h2>
        <p style={{ marginBottom: '2rem', whiteSpace: 'pre-line', color: 'var(--text-muted)' }}>{successMsg}</p>
        <button type="button" className="btn" onClick={() => navigate(`/wo/${woId}`)}>Back to WO Detail</button>
      </div>
    );
  }

  return (
    <div className="panel stack">
      <div style={{ marginBottom: '0.75rem' }}>
        <Link to={`/wo/${woId}`} style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>← Back to WO Detail</Link>
      </div>
      <h2 className="panel__title">First Article Inspection (M05)</h2>
      <p className="panel__subtitle">
        {isQaStep ? '🔍 QA Inspection' : '✅ Manager Approval'} | WO: <strong>{woId}</strong>
      </p>
      <div className="notice info" style={{ fontSize: '0.85rem' }}>
        {isQaStep
          ? 'This step: QA inspects → send to manager for approval (WAIT_FAI_MGR)'
          : 'This step: Manager approves the FAI result → WO ready to close (Close WO)'}
      </div>

      {error && <div className="notice err">{error}</div>}

      <form className="stack" onSubmit={handleSubmit}>
        <div style={{ background: 'var(--bg-panel)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Inspection Items (Checklist)</h3>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {Object.keys(checklist).map((key, index) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', paddingBottom: '0.75rem', borderBottom: index < Object.keys(checklist).length - 1 ? '1px dashed var(--border-color)' : 'none' }}>
                <span style={{ fontSize: '0.95rem' }}>{index + 1}. Inspect point {index + 1}</span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className={`btn ${checklist[key] !== 'PASS' ? 'secondary' : ''}`}
                    onClick={() => setChecklist(prev => ({ ...prev, [key]: 'PASS' }))}
                    style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem', ...(checklist[key] === 'PASS' ? { background: '#10b981', borderColor: '#10b981', color: 'white' } : {}) }}>
                    PASS
                  </button>
                  <button type="button" className={`btn ${checklist[key] === 'FAIL' ? 'danger' : 'secondary'}`}
                    onClick={() => setChecklist(prev => ({ ...prev, [key]: 'FAIL' }))}
                    style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}>
                    FAIL
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: '#fffbeb', padding: '1rem', borderRadius: '8px', border: '1px solid #fde68a' }}>
          <h3 style={{ fontSize: '1rem', color: '#b45309', marginBottom: '0.5rem' }}>Dual-Key Approval</h3>
          <p style={{ fontSize: '0.85rem', color: '#b45309', marginBottom: '1rem' }}>Critical task: requires two employee IDs to confirm (must not be identical)</p>
          <div className="filters-grid">
            <label className="field">
              <span style={{ color: '#92400e', fontWeight: 600 }}>
                {isQaStep ? '1. Inspector (Inspector ID)' : '1. QA Inspector (previous)'}
              </span>
              <input
                value={inspectorId}
                onChange={e => setInspectorId(e.target.value)}
                placeholder={isQaStep ? 'e.g. OP-001' : `${wo.faiInspector || 'OP-001'}`}
                required
              />
            </label>
            <label className="field">
              <span style={{ color: '#92400e', fontWeight: 600 }}>
                {isQaStep ? '2. Approver (Approver ID)' : '2. Manager (Manager ID)'}
              </span>
              <input value={approverId} onChange={e => setApproverId(e.target.value)} placeholder="e.g. LD-005" required />
            </label>
          </div>
        </div>

        <button className="btn" type="submit" disabled={!isChecklistComplete || !isDualKeyValid || patchMut.isPending}
          style={{ marginTop: '0.5rem', padding: '1rem', fontSize: '1rem' }}>
          {patchMut.isPending ? 'Saving…' : isQaStep ? 'Send FAI result to manager' : 'Manager approve FAI'}
        </button>
      </form>
    </div>
  );
}
