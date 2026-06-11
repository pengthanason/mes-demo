import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getWo, updateWo } from '../lib/mockStore';
import { showToast } from '../lib/toast';

export function CloseWoPage() {
  const { woId }   = useParams();
  const navigate   = useNavigate();
  const wo         = getWo(woId || '');
  const targetQty  = wo?.qty;

  const [actualQty, setActualQty] = useState('');
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const qty = Number(actualQty);
    if (isNaN(qty) || qty <= 0) { setError('กรุณาระบุจำนวนให้ถูกต้อง'); return; }
    if (targetQty && qty > targetQty) { setError(`จำนวนที่ผลิตได้ (${qty}) ห้ามเกินยอดสั่งผลิต (${targetQty})`); return; }

    updateWo(woId || '', { currentStep: 'CLOSED', actualQty: qty, qtyGood: qty });
    showToast(`WO ${woId} ปิดงานสำเร็จ`, 'success');
    setSuccess(true);
  }

  if (success) {
    return (
      <div className="panel stack" style={{ textAlign: 'center', padding: '3rem 1rem', maxWidth: '400px', margin: '0 auto' }}>
        <h2 style={{ color: 'var(--success)', marginBottom: '1rem' }}>✅ ปิดงานสำเร็จ</h2>
        <p style={{ marginBottom: '2rem' }}>Work Order: <strong>{woId}</strong> ถูกปิดเรียบร้อยแล้ว</p>
        <button type="button" className="btn" onClick={() => navigate('/wo-dashboard')}>กลับ WO Board</button>
      </div>
    );
  }

  return (
    <div className="panel stack" style={{ maxWidth: '400px', margin: '0 auto' }}>
      <h2 className="panel__title">Close Work Order (M09)</h2>
      <p className="panel__subtitle">
        WO: <strong>{woId}</strong>
        {wo?.productCode && <> | {wo.productCode}</>}
        {targetQty && <> | Target: {targetQty.toLocaleString()} pcs</>}
      </p>
      <div style={{ marginBottom: '0.5rem' }}>
        <Link to={`/wo/${woId}`} style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>← กลับหน้า WO Detail</Link>
      </div>

      {error && <div className="notice err">{error}</div>}

      <form className="stack" onSubmit={handleSubmit}>
        <label className="field">
          <span>จำนวนที่ผลิตได้จริง (Actual Qty)</span>
          <input
            type="number" min="1"
            value={actualQty}
            onChange={e => setActualQty(e.target.value)}
            placeholder="เช่น 1500"
            required autoFocus
          />
        </label>
        <button className="btn" type="submit" disabled={!actualQty} style={{ padding: '1rem', fontSize: '1rem' }}>
          ยืนยันปิดงาน
        </button>
      </form>
    </div>
  );
}
