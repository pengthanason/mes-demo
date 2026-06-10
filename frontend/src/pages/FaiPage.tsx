import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { submitFai } from '../lib/operatorApi';

export function FaiPage() {
  const { woId } = useParams();
  const navigate = useNavigate();
  
  const [checklist, setChecklist] = useState<Record<string, 'PASS' | 'FAIL' | ''>>({
    'chk-01': '',
    'chk-02': '',
    'chk-03': ''
  });

  const [inspectorId, setInspectorId] = useState('');
  const [approverId, setApproverId] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const isChecklistComplete = Object.values(checklist).every(val => val !== '');
  const isDualKeyValid = inspectorId.trim() !== '' && approverId.trim() !== '' && inspectorId !== approverId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isChecklistComplete) {
      setError('กรุณาตรวจให้ครบทุกรายการ');
      return;
    }
    if (inspectorId === approverId) {
      setError('ผู้ตรวจและผู้รับรองต้องไม่ใช่คนเดียวกัน (Dual-Key Verification)');
      return;
    }

    setLoading(true);
    try {
      await submitFai({
        woId: woId || '',
        checklistResults: checklist as Record<string, 'PASS' | 'FAIL'>,
        inspectorId,
        approverId
      });
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการยืนยัน FAI (ตรวจสอบ Network หรือ API)');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="panel stack" style={{ textAlign: 'center', padding: '3rem 1rem', maxWidth: '500px', margin: '0 auto' }}>
        <h2 style={{ color: 'var(--success)', marginBottom: '1rem' }}>✅ FAI Approved</h2>
        <p style={{ marginBottom: '2rem' }}>First Article Inspection สำหรับ WO: <strong>{woId}</strong> ได้รับการอนุมัติแล้ว</p>
        <button className="btn" onClick={() => navigate('/')}>กลับหน้าหลัก</button>
      </div>
    );
  }

  return (
    <div className="panel stack" style={{ maxWidth: '500px', margin: '0 auto' }}>
      <h2 className="panel__title">First Article Inspection (M05)</h2>
      <p className="panel__subtitle">ตรวจสอบชิ้นแรก | WO: <strong>{woId}</strong></p>
      
      {error && <div className="notice err">{error}</div>}

      <form className="stack" onSubmit={handleSubmit}>
        
        <div style={{ background: 'var(--bg-panel)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>รายการตรวจ (Checklist)</h3>
          
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {Object.keys(checklist).map((key, index) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', paddingBottom: '0.75rem', borderBottom: index < Object.keys(checklist).length - 1 ? '1px dashed var(--border-color)' : 'none' }}>
                <span style={{ fontSize: '0.95rem' }}>{index + 1}. ตรวจสอบจุดที่ {index + 1}</span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button 
                    type="button" 
                    className={`btn ${checklist[key] !== 'PASS' ? 'secondary' : ''}`} 
                    onClick={() => setChecklist(prev => ({ ...prev, [key]: 'PASS' }))}
                    style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem', ...(checklist[key] === 'PASS' ? { background: '#10b981', borderColor: '#10b981', color: 'white' } : {}) }}
                  >PASS</button>
                  <button 
                    type="button" 
                    className={`btn ${checklist[key] === 'FAIL' ? 'danger' : 'secondary'}`} 
                    onClick={() => setChecklist(prev => ({ ...prev, [key]: 'FAIL' }))}
                    style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                  >FAIL</button>
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
              <span style={{ color: '#92400e', fontWeight: 600 }}>1. ผู้ตรวจ (Inspector ID)</span>
              <input value={inspectorId} onChange={e => setInspectorId(e.target.value)} placeholder="เช่น OP-001" required />
            </label>
            <label className="field">
              <span style={{ color: '#92400e', fontWeight: 600 }}>2. ผู้รับรอง (Approver ID)</span>
              <input value={approverId} onChange={e => setApproverId(e.target.value)} placeholder="เช่น LD-005" required />
            </label>
          </div>
        </div>

        <button className="btn" type="submit" disabled={loading || !isChecklistComplete || !isDualKeyValid} style={{ marginTop: '0.5rem', padding: '1rem', fontSize: '1rem' }}>
          {loading ? 'กำลังส่งข้อมูล...' : 'ยืนยันผล FAI (Dual-Key)'}
        </button>
      </form>
    </div>
  );
}