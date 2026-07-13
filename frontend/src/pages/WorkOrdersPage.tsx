import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWoBoard, useWoCreate } from '../lib/woApi';
import { useIsViewer } from '../lib/useMockStore';
import { showToast } from '../lib/toast';
import { Paginator } from '../components/Paginator';
import { TableState } from '../components/DataStates';

const STEP_STYLE: Record<string, { label: string; bg: string; text: string; border: string }> = {
  DRAFT:        { label: 'ร่าง',          bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
  OPEN:         { label: 'เปิดงาน',        bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd' },
  READY:        { label: 'พร้อมผลิต',      bg: '#cffafe', text: '#0e7490', border: '#67e8f9' },
  RUNNING:      { label: 'กำลังผลิต',      bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
  WAIT_FAI_QA:  { label: 'รอ FAI (QA)',   bg: '#ede9fe', text: '#6d28d9', border: '#c4b5fd' },
  WAIT_FAI_MGR: { label: 'รอ FAI (MGR)',  bg: '#ede9fe', text: '#6d28d9', border: '#c4b5fd' },
  CLOSED:       { label: 'ปิดงานแล้ว',     bg: '#dcfce7', text: '#166534', border: '#86efac' },
};

function StepBadge({ step }: { step: string }) {
  const s = STEP_STYLE[step] ?? STEP_STYLE.DRAFT;
  return <span className="status-badge" style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}` }}>{s.label}</span>;
}

export function WorkOrdersPage() {
  const navigate = useNavigate();
  const isViewer = useIsViewer();
  const { data: wos = [], isLoading, isError, refetch } = useWoBoard();
  const create = useWoCreate();
  const [showForm, setShowForm] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE = 12;
  const totalPages = Math.max(1, Math.ceil(wos.length / PAGE));
  const paged = wos.slice((page - 1) * PAGE, page * PAGE);

  // ฟอร์มเปิด WO ใหม่ (inline เหนือตาราง — อ่านตารางไปพร้อมกันได้ เหมือนหน้า 4M Change)
  const [productCode, setProductCode] = useState('');
  const [customer, setCustomer] = useState('');
  const [qty, setQty] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [err, setErr] = useState('');
  const [fErr, setFErr] = useState<{ productCode?: string; qty?: string }>({});

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    const next: { productCode?: string; qty?: string } = {};
    if (!productCode.trim()) next.productCode = 'กรุณากรอก Product Code';
    const n = Number(qty);
    if (!qty.trim()) next.qty = 'กรุณากรอกจำนวน';
    else if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) next.qty = 'จำนวนต้องเป็นตัวเลข 1–1,000,000';
    setFErr(next);
    if (Object.keys(next).length) return;
    create.mutate(
      { productCode: productCode.trim(), customer: customer.trim() || '—', qty: n, station: '', currentStep: 'DRAFT', expectedDate: expectedDate || undefined },
      { onSuccess: () => {
          showToast('สร้าง Work Order แล้ว (สถานะ: ร่าง)', 'success');
          setProductCode(''); setCustomer(''); setQty(''); setExpectedDate(''); setFErr({}); setShowForm(false);
        },
        onError: (e: any) => setErr(e.message) }
    );
  }

  return (
    <section className="stack-lg">
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 className="panel__title">Work Orders</h1>
            <p className="panel__subtitle">เปิด/ปล่อยงานผลิต (WO Release) และติดตามสถานะ — กดที่ WO เพื่อดูรายละเอียด · FAI · ปิดงาน</p>
          </div>
          {!isViewer && (
            <button type="button" className="btn" title="เปิด Work Order ใหม่" onClick={() => { setShowForm(v => !v); setErr(''); setFErr({}); }}
              style={{ background: 'var(--brand)', borderColor: 'var(--brand)', color: '#fff', fontWeight: 600 }}>
              {showForm ? '✕ ยกเลิก' : '+ เปิด WO'}
            </button>
          )}
        </div>

        {showForm && !isViewer && (
          <div className="panel" style={{ borderLeft: '4px solid var(--brand)', marginTop: '1.25rem' }}>
            <h3 className="panel__title panel__title--sm">เปิด Work Order ใหม่</h3>
            <form onSubmit={submit} className="stack" style={{ maxWidth: 560, marginTop: '0.75rem', gap: '0.85rem' }}>
              <div className="grid-2col">
                <label className="field"><span>Product Code *</span>
                  <input value={productCode} onChange={e => { setProductCode(e.target.value); if (fErr.productCode) setFErr(p => ({ ...p, productCode: undefined })); }} placeholder="เช่น PCB-A100" autoFocus aria-required="true" aria-invalid={!!fErr.productCode} style={fErr.productCode ? { borderColor: '#dc2626' } : undefined} />
                  {fErr.productCode && <span style={{ color: '#dc2626', fontSize: '0.75rem' }}>{fErr.productCode}</span>}
                </label>
                <label className="field"><span>Customer</span>
                  <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="เช่น Toyota TH" />
                </label>
              </div>
              <div className="grid-2col">
                <label className="field"><span>จำนวน (Qty) *</span>
                  <input type="number" value={qty} onChange={e => { setQty(e.target.value); if (fErr.qty) setFErr(p => ({ ...p, qty: undefined })); }} placeholder="เช่น 200" aria-required="true" aria-invalid={!!fErr.qty} style={fErr.qty ? { borderColor: '#dc2626' } : undefined} />
                  {fErr.qty && <span style={{ color: '#dc2626', fontSize: '0.75rem' }}>{fErr.qty}</span>}
                </label>
                <label className="field"><span>Expected date</span>
                  <input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} />
                </label>
              </div>
              {err && <div className="notice err">{err}</div>}
              <button type="submit" className="btn" disabled={create.isPending}
                style={{ background: 'var(--brand)', borderColor: 'var(--brand)', color: '#fff', fontWeight: 600, padding: '0.75rem' }}>
                {create.isPending ? 'กำลังสร้าง...' : 'เปิด WO'}
              </button>
            </form>
          </div>
        )}

        <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 8, marginTop: '1.25rem' }}>
          <table className="table" style={{ minWidth: 760, width: '100%' }}>
            <thead>
              <tr>
                <th>WO No</th><th>Product</th><th>Customer</th>
                <th style={{ textAlign: 'center' }}>Qty</th><th style={{ textAlign: 'center' }}>Good</th>
                <th style={{ textAlign: 'center' }}>Expected</th>
                <th style={{ textAlign: 'center' }}>สถานะ</th><th>Station</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableState colSpan={8} state="loading" />
              ) : isError ? (
                <TableState colSpan={8} state="error" onRetry={() => refetch()} />
              ) : paged.length === 0 ? (
                <TableState colSpan={8} state="empty" emptyText="ยังไม่มี Work Order — กด “+ เปิด WO” เพื่อเริ่ม" />
              ) : paged.map(w => (
                <tr key={w.woId} style={{ cursor: 'pointer' }} onClick={() => navigate(`/wo/${w.woId}`)}
                  tabIndex={0} role="button" aria-label={`ดูรายละเอียด WO ${w.woId}`}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/wo/${w.woId}`); } }}
                  title="กดเพื่อดูรายละเอียด / FAI / ปิดงาน">
                  <td style={{ fontWeight: 600, color: 'var(--brand)' }}>{w.woId}</td>
                  <td>{w.productCode}</td>
                  <td>{w.customer}</td>
                  <td style={{ textAlign: 'center' }}>{w.qty.toLocaleString()}</td>
                  <td style={{ textAlign: 'center', fontWeight: 600, color: '#0369a1' }}>{(w.actualQty ?? w.qtyGood).toLocaleString()}</td>
                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{w.expectedDate ? new Date(w.expectedDate).toLocaleDateString('th-TH') : '—'}</td>
                  <td style={{ textAlign: 'center' }}><StepBadge step={w.currentStep} /></td>
                  <td>{w.station}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Paginator page={page} totalPages={totalPages} onPage={setPage} total={wos.length} />
      </div>
    </section>
  );
}
