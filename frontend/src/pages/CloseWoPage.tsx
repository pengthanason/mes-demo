import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useWoBoard, useWoPatch } from '../lib/woApi';
import { showToast } from '../lib/toast';
import { BlockState } from '../components/DataStates';

export function CloseWoPage() {
  const { woId }   = useParams();
  const navigate   = useNavigate();
  const { data: woList, isLoading, isError, refetch } = useWoBoard();
  const patchMut   = useWoPatch();
  const wo         = (woList ?? []).find(w => w.woId === woId) ?? null;
  const targetQty  = wo?.qty;

  const [actualQty, setActualQty] = useState('');
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const qty = Number(actualQty);
    if (isNaN(qty) || qty <= 0) { setError('Please enter a valid quantity'); return; }
    if (targetQty && qty > targetQty) { setError(`Actual quantity produced (${qty}) cannot exceed the ordered quantity (${targetQty})`); return; }

    patchMut.mutate(
      { woId: woId || '', patch: { currentStep: 'CLOSED', actualQty: qty, qtyGood: qty } },
      {
        onSuccess: () => { showToast(`WO ${woId} closed successfully`, 'success'); setSuccess(true); },
        onError:   () => setError('Failed to close WO — please try again'),
      }
    );
  }

  if (success) {
    return (
      <div className="panel stack" style={{ textAlign: 'center', padding: '3rem 1rem', maxWidth: '400px', margin: '0 auto' }}>
        <h2 style={{ color: 'var(--success)', marginBottom: '1rem' }}>✅ Closed successfully</h2>
        <p style={{ marginBottom: '2rem' }}>Work Order: <strong>{woId}</strong> has been closed</p>
        <button type="button" className="btn" onClick={() => navigate('/wo-dashboard')}>Back to WO Board</button>
      </div>
    );
  }

  // ต้องรอโหลด WO ให้เสร็จ/สำเร็จก่อนโชว์ฟอร์ม — เดิมถ้า fetch ล้มเหลว wo=null → targetQty=undefined
  // แล้วเงื่อนไข "qty > targetQty" ใน handleSubmit เทียบกับ undefined ได้ false เสมอ = ข้าม validation ไปเงียบๆ
  if (isLoading || isError) {
    return (
      <div className="panel">
        <h2 className="panel__title">Close Work Order (M09)</h2>
        <BlockState state={isLoading ? 'loading' : 'error'} onRetry={() => refetch()} />
      </div>
    );
  }
  if (!wo) {
    return (
      <div className="panel stack" style={{ textAlign: 'center', padding: '2rem' }}>
        <p className="notice err">Work Order "{woId}" not found</p>
        <Link to="/work-orders" className="btn secondary" style={{ alignSelf: 'center' }}>← Back to Work Orders</Link>
      </div>
    );
  }

  return (
    <div className="panel stack">
      <h2 className="panel__title">Close Work Order (M09)</h2>
      <p className="panel__subtitle">
        WO: <strong>{woId}</strong>
        {wo?.productCode && <> | {wo.productCode}</>}
        {targetQty && <> | Target: {targetQty.toLocaleString()} pcs</>}
      </p>
      <div style={{ marginBottom: '0.5rem' }}>
        <Link to={`/wo/${woId}`} style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>← Back to WO Detail</Link>
      </div>

      {error && <div className="notice err">{error}</div>}

      <form className="stack" onSubmit={handleSubmit}>
        <label className="field">
          <span>Actual Quantity Produced (Actual Qty)</span>
          <input
            type="number" min="1"
            value={actualQty}
            onChange={e => setActualQty(e.target.value)}
            placeholder="e.g. 1500"
            required autoFocus
          />
        </label>
        <button className="btn" type="submit" disabled={!actualQty || patchMut.isPending} style={{ padding: '1rem', fontSize: '1rem' }}>
          {patchMut.isPending ? 'Closing...' : 'Confirm Close'}
        </button>
      </form>
    </div>
  );
}
