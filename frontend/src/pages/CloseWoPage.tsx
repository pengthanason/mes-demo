import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { closeWo } from '../lib/operatorApi';

export function CloseWoPage() {
  const { woId } = useParams();
  const navigate = useNavigate();
  const [actualQty, setActualQty] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const targetQty = 1500;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const qty = Number(actualQty);
    if (isNaN(qty) || qty <= 0) {
      setError('กรุณาระบุจำนวนให้ถูกต้อง');
      return;
    }
    if (qty > targetQty) {
      setError(`จำนวนที่ผลิตได้ (${qty}) ห้ามเกินยอดสั่งผลิต (${targetQty})`);
      return;
    }

    setLoading(true);
    try {
      await closeWo(woId || '', { actualQty: qty });
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการปิดงาน (ตรวจสอบ Network หรือ API)');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="panel stack" style={{ textAlign: 'center', padding: '3rem 1rem', maxWidth: '400px', margin: '0 auto' }}>
        <h2 style={{ color: 'var(--success)', marginBottom: '1rem' }}>✅ ปิดงานสำเร็จ</h2>
        <p style={{ marginBottom: '2rem' }}>Work Order: <strong>{woId}</strong> ถูกปิดเรียบร้อยแล้ว</p>
        <button className="btn" onClick={() => navigate('/')}>กลับหน้าหลัก</button>
      </div>
    );
  }

  return (
    <div className="panel stack" style={{ maxWidth: '400px', margin: '0 auto' }}>
      <h2 className="panel__title">Close Work Order (M09)</h2>
      <p className="panel__subtitle">WO: <strong>{woId}</strong> | Target: {targetQty}</p>
      
      {error && <div className="notice err">{error}</div>}

      <form className="stack" onSubmit={handleSubmit}>
        <label className="field">
          <span>จำนวนที่ผลิตได้จริง (Actual Qty)</span>
          <input 
            type="number" 
            min="1"
            value={actualQty}
            onChange={(e) => setActualQty(e.target.value)}
            placeholder="เช่น 1500"
            required
            autoFocus
          />
        </label>
        <button className="btn" type="submit" disabled={loading || !actualQty} style={{ padding: '1rem', fontSize: '1rem' }}>
          {loading ? 'กำลังปิดงาน...' : 'ยืนยันปิดงาน'}
        </button>
      </form>
    </div>
  );
}