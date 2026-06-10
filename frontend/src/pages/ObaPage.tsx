import React, { useState } from 'react';
import { submitOba } from '../lib/operatorApi';

export function ObaPage() {
  const [woId, setWoId] = useState('');
  const [lotNo, setLotNo] = useState('');
  const [sampleQty, setSampleQty] = useState('');
  const [result, setResult] = useState<'PASS' | 'FAIL' | ''>('');
  const [defectNote, setDefectNote] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (result === 'FAIL' && !defectNote.trim()) {
      setError('กรุณาระบุหมายเหตุ (Defect Note) เมื่อผลการตรวจเป็น FAIL');
      return;
    }

    setLoading(true);
    try {
      await submitOba({
        woId,
        lotNo,
        sampleQty: Number(sampleQty),
        result: result as 'PASS' | 'FAIL',
        defectNote
      });
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการบันทึก OBA (ตรวจสอบ Network หรือ API)');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setWoId('');
    setLotNo('');
    setSampleQty('');
    setResult('');
    setDefectNote('');
    setSuccess(false);
    setError('');
  };

  if (success) {
    return (
      <div className="panel stack" style={{ textAlign: 'center', padding: '3rem 1rem', maxWidth: '400px', margin: '0 auto' }}>
        <h2 style={{ color: 'var(--success)', marginBottom: '1rem' }}>✅ บันทึก OBA สำเร็จ</h2>
        <p style={{ marginBottom: '2rem' }}>ผลการตรวจของ Lot: <strong>{lotNo}</strong> ถูกบันทึกแล้ว</p>
        <button className="btn" onClick={handleReset}>ตรวจรายการต่อไป</button>
      </div>
    );
  }

  return (
    <div className="panel stack" style={{ maxWidth: '400px', margin: '0 auto' }}>
      <h2 className="panel__title">Out-of-Box Audit (M08)</h2>
      <p className="panel__subtitle">บันทึกผลสุ่มเปิดกล่องตรวจก่อนส่งมอบ</p>
      
      {error && <div className="notice err">{error}</div>}

      <form className="stack" onSubmit={handleSubmit}>
        <label className="field">
          <span>Work Order</span>
          <input value={woId} onChange={e => setWoId(e.target.value)} placeholder="WO-..." required />
        </label>
        <label className="field">
          <span>Lot No.</span>
          <input value={lotNo} onChange={e => setLotNo(e.target.value)} placeholder="LOT-..." required />
        </label>
        <label className="field">
          <span>จำนวนที่สุ่มตรวจ (Sample Qty)</span>
          <input type="number" min="1" value={sampleQty} onChange={e => setSampleQty(e.target.value)} placeholder="เช่น 5" required />
        </label>
        <label className="field">
          <span>ผลการตรวจ (Result)</span>
          <select value={result} onChange={e => setResult(e.target.value as 'PASS' | 'FAIL')} style={{ padding: '0.75rem', fontSize: '1rem' }} required>
            <option value="">-- เลือกผลการตรวจ --</option>
            <option value="PASS">✅ PASS (ผ่าน)</option>
            <option value="FAIL">❌ FAIL (ไม่ผ่าน)</option>
          </select>
        </label>
        
        {result === 'FAIL' && (
          <label className="field">
            <span>หมายเหตุ (Defect Note) <span style={{color: 'var(--danger)'}}>*</span></span>
            <textarea value={defectNote} onChange={e => setDefectNote(e.target.value)} required placeholder="ระบุอาการเสีย..." />
          </label>
        )}

        <button className="btn" type="submit" disabled={loading || !woId || !lotNo || !sampleQty || !result} style={{ marginTop: '0.5rem', padding: '1rem', fontSize: '1rem' }}>
          {loading ? 'กำลังบันทึก...' : 'บันทึกผล OBA'}
        </button>
      </form>
    </div>
  );
}