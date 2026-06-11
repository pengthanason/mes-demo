import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { updateWo, getWo } from '../lib/mockStore';
import { useMockWoList } from '../lib/useMockStore';
import { showToast } from '../lib/toast';

export function FaiPage() {
  const { woId } = useParams();
  const navigate = useNavigate();
  const woList = useMockWoList();
  const wo = woList.find(w => w.woId === woId) ?? null;

  const [checklist, setChecklist] = useState<Record<string, 'PASS' | 'FAIL' | ''>>({
    'chk-01': '', 'chk-02': '', 'chk-03': '',
  });
  const [inspectorId, setInspectorId] = useState('');
  const [approverId,  setApproverId]  = useState('');
  const [error,       setError]       = useState('');
  const [successMsg,  setSuccessMsg]  = useState('');

  const isChecklistComplete = Object.values(checklist).every(v => v !== '');
  const isDualKeyValid = inspectorId.trim() !== '' && approverId.trim() !== '' && inspectorId !== approverId;

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

  const isQaStep  = wo.currentStep === 'WAIT_FAI_QA';
  const isMgrStep = wo.currentStep === 'WAIT_FAI_MGR';

  if (!isQaStep && !isMgrStep) {
    return (
      <div className="panel stack" style={{ textAlign: 'center', padding: '3rem 1rem', maxWidth: '500px', margin: '0 auto' }}>
        <div className="notice err" style={{ marginBottom: '1rem' }}>
          WO <strong>{woId}</strong> อยู่ที่ขั้นตอน <strong>{wo.currentStep}</strong> — ไม่สามารถทำ FAI ได้
        </div>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>FAI ทำได้เฉพาะที่ขั้นตอน WAIT_FAI_QA หรือ WAIT_FAI_MGR เท่านั้น</p>
        <button type="button" className="btn secondary" onClick={() => navigate(`/wo/${woId}`)}>กลับ WO Detail</button>
      </div>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!isChecklistComplete) { setError('กรุณาตรวจให้ครบทุกรายการ'); return; }
    if (inspectorId === approverId) { setError('ผู้ตรวจและผู้รับรองต้องไม่ใช่คนเดียวกัน (Dual-Key Verification)'); return; }

    const current = getWo(woId || '');
    if (!current) { setError('ไม่พบ WO'); return; }

    if (current.currentStep === 'WAIT_FAI_QA') {
      updateWo(woId || '', {
        currentStep:  'WAIT_FAI_MGR',
        faiInspector: inspectorId,
      });
      showToast('FAI QA ผ่านแล้ว — รอผู้จัดการอนุมัติ', 'success');
      setSuccessMsg('ผลการตรวจ FAI (QA) ถูกส่งให้ผู้จัดการอนุมัติแล้ว\nสถานะ: WAIT_FAI_QA → WAIT_FAI_MGR');
    } else {
      updateWo(woId || '', {
        faiPassed:    true,
        faiInspector: current.faiInspector || inspectorId,
        faiApprover:  approverId,
      });
      showToast('FAI อนุมัติแล้ว — พร้อมปิดงาน', 'success');
      setSuccessMsg('ผู้จัดการอนุมัติ FAI เรียบร้อยแล้ว\nงานยังคงเปิดอยู่ — ปิดงานได้จากหน้า WO Detail');
    }
  }

  if (successMsg) {
    return (
      <div className="panel stack" style={{ textAlign: 'center', padding: '3rem 1rem', maxWidth: '500px', margin: '0 auto' }}>
        <h2 style={{ color: 'var(--success)', marginBottom: '1rem' }}>✅ FAI Complete</h2>
        <p style={{ marginBottom: '2rem', whiteSpace: 'pre-line', color: 'var(--text-muted)' }}>{successMsg}</p>
        <button type="button" className="btn" onClick={() => navigate(`/wo/${woId}`)}>กลับ WO Detail</button>
      </div>
    );
  }

  return (
    <div className="panel stack" style={{ maxWidth: '500px', margin: '0 auto' }}>
      <div style={{ marginBottom: '0.75rem' }}>
        <Link to={`/wo/${woId}`} style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>← กลับหน้า WO Detail</Link>
      </div>
      <h2 className="panel__title">First Article Inspection (M05)</h2>
      <p className="panel__subtitle">
        {isQaStep ? '🔍 QA Inspection' : '✅ Manager Approval'} | WO: <strong>{woId}</strong>
      </p>
      <div className="notice info" style={{ fontSize: '0.85rem' }}>
        {isQaStep
          ? 'ขั้นตอนนี้: QA ตรวจสอบ → ส่งให้ผู้จัดการอนุมัติ (WAIT_FAI_MGR)'
          : 'ขั้นตอนนี้: ผู้จัดการอนุมัติผล FAI → งานพร้อมปิด (Close WO)'}
      </div>

      {error && <div className="notice err">{error}</div>}

      <form className="stack" onSubmit={handleSubmit}>
        <div style={{ background: 'var(--bg-panel)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>รายการตรวจ (Checklist)</h3>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {Object.keys(checklist).map((key, index) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', paddingBottom: '0.75rem', borderBottom: index < Object.keys(checklist).length - 1 ? '1px dashed var(--border-color)' : 'none' }}>
                <span style={{ fontSize: '0.95rem' }}>{index + 1}. ตรวจสอบจุดที่ {index + 1}</span>
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
          <p style={{ fontSize: '0.85rem', color: '#b45309', marginBottom: '1rem' }}>งานสำคัญ: จำเป็นต้องใช้รหัสพนักงาน 2 คนในการยืนยัน (ห้ามซ้ำกัน)</p>
          <div className="filters-grid">
            <label className="field">
              <span style={{ color: '#92400e', fontWeight: 600 }}>
                {isQaStep ? '1. ผู้ตรวจ (Inspector ID)' : '1. ผู้ตรวจ QA (ก่อนหน้า)'}
              </span>
              <input
                value={inspectorId}
                onChange={e => setInspectorId(e.target.value)}
                placeholder={isQaStep ? 'เช่น OP-001' : `${wo.faiInspector || 'OP-001'}`}
                required
              />
            </label>
            <label className="field">
              <span style={{ color: '#92400e', fontWeight: 600 }}>
                {isQaStep ? '2. ผู้รับรอง (Approver ID)' : '2. ผู้จัดการ (Manager ID)'}
              </span>
              <input value={approverId} onChange={e => setApproverId(e.target.value)} placeholder="เช่น LD-005" required />
            </label>
          </div>
        </div>

        <button className="btn" type="submit" disabled={!isChecklistComplete || !isDualKeyValid}
          style={{ marginTop: '0.5rem', padding: '1rem', fontSize: '1rem' }}>
          {isQaStep ? 'ส่งผล FAI ให้ผู้จัดการ' : 'ผู้จัดการอนุมัติ FAI'}
        </button>
      </form>
    </div>
  );
}
