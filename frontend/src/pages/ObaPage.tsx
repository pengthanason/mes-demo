import { useState } from 'react';
import { addObaRecord } from '../lib/mockStore';
import { useMockObaRecords } from '../lib/useMockStore';
import { showToast } from '../lib/toast';

export function ObaPage() {
  const records = useMockObaRecords();

  const [woId,       setWoId]       = useState('');
  const [lotNo,      setLotNo]      = useState('');
  const [sampleQty,  setSampleQty]  = useState('');
  const [result,     setResult]     = useState<'PASS' | 'FAIL' | ''>('');
  const [defectNote, setDefectNote] = useState('');
  const [error,      setError]      = useState('');
  const [saved,      setSaved]      = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (result === 'FAIL' && !defectNote.trim()) {
      setError('กรุณาระบุหมายเหตุ (Defect Note) เมื่อผลการตรวจเป็น FAIL');
      return;
    }
    addObaRecord({ woId, lotNo, sampleQty: Number(sampleQty), result: result as 'PASS' | 'FAIL', defectNote });
    showToast(`OBA ${result}: ${woId} / ${lotNo}`, result === 'PASS' ? 'success' : 'error');
    setWoId(''); setLotNo(''); setSampleQty(''); setResult(''); setDefectNote('');
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="stack-lg" style={{ maxWidth: '700px', margin: '0 auto' }}>
      {/* ── Form ── */}
      <div className="panel stack">
        <h2 className="panel__title">Out-of-Box Audit (M08)</h2>
        <p className="panel__subtitle">บันทึกผลสุ่มเปิดกล่องตรวจก่อนส่งมอบ</p>

        {error  && <div className="notice err">{error}</div>}
        {saved  && <div className="notice ok">✅ บันทึกสำเร็จ!</div>}

        <style>{`.oba-input::placeholder { color: #94a3b8; opacity: 1; }`}</style>

        <form className="stack" onSubmit={handleSubmit}>
          <label className="field">
            <span>Work Order</span>
            <input className="oba-input" value={woId} onChange={e => setWoId(e.target.value)} placeholder="WO-..." required />
          </label>
          <label className="field">
            <span>Lot No.</span>
            <input className="oba-input" value={lotNo} onChange={e => setLotNo(e.target.value)} placeholder="LOT-..." required />
          </label>
          <label className="field">
            <span>จำนวนที่สุ่มตรวจ (Sample Qty)</span>
            <input className="oba-input" type="number" min="1" value={sampleQty} onChange={e => setSampleQty(e.target.value)} placeholder="เช่น 5" required />
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
              <span>หมายเหตุ (Defect Note) <span style={{ color: 'var(--danger)' }}>*</span></span>
              <textarea className="oba-input" value={defectNote} onChange={e => setDefectNote(e.target.value)} placeholder="ระบุอาการเสีย..." required />
            </label>
          )}
          <button className="btn" type="submit" disabled={!woId || !lotNo || !sampleQty || !result}
            style={{ marginTop: '0.5rem', padding: '1rem', fontSize: '1rem' }}>
            บันทึกผล OBA
          </button>
        </form>
      </div>

      {/* ── History table ── */}
      {records.length > 0 && (
        <div className="panel">
          <h3 className="panel__title panel__title--sm" style={{ marginBottom: '1rem' }}>
            ประวัติผล OBA ({records.length} รายการ)
          </h3>
          <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
            <table className="table table-readonly" style={{ minWidth: '550px', width: '100%' }}>
              <thead>
                <tr>
                  <th>WO ID</th>
                  <th>Lot No.</th>
                  <th style={{ textAlign: 'center' }}>Sample Qty</th>
                  <th style={{ textAlign: 'center' }}>Result</th>
                  <th>Defect Note</th>
                  <th style={{ textAlign: 'center' }}>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {records.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.woId}</td>
                    <td>{r.lotNo}</td>
                    <td style={{ textAlign: 'center' }}>{r.sampleQty}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{
                        padding: '2px 10px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 700,
                        background: r.result === 'PASS' ? '#dcfce7' : '#fee2e2',
                        color:      r.result === 'PASS' ? '#15803d' : '#b91c1c',
                        border:     `1px solid ${r.result === 'PASS' ? '#86efac' : '#fca5a5'}`,
                      }}>
                        {r.result}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{r.defectNote || '—'}</td>
                    <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                      {new Date(r.timestamp).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
