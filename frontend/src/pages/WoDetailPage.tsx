import { useParams, Link } from 'react-router-dom';
import { buildSteps, WO_LIFECYCLE } from '../lib/woLifecycle';
import { StatusStepper } from '../components/StatusStepper';
import { useMockAuth } from '../lib/useMockStore';
import { type WoStep } from '../lib/mockStore';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useWoBoard, useWoPatch } from '../lib/woApi';
import { useQcResults } from '../lib/qcResultApi';
import { useKittingIssues } from '../lib/inventoryApi';
import { ResultBadge } from '../components/ResultBadge';
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
  const { data: qcResults = [] } = useQcResults(woId);
  const { data: kitting = [] } = useKittingIssues(woId);
  const { data: scans = [] } = useQuery({
    queryKey: ['wo-scans', woId],
    enabled: !!woId,
    queryFn: async (): Promise<any[]> => {
      const r = await api.get('/production/scans', { params: { wo_id: woId, limit: 200 } });
      return (r.data as any)?.data ?? [];
    },
  });
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
              style={{ background: 'var(--brand)', borderColor: 'var(--brand)', color: '#fff', fontWeight: 600 }}
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
          <div style={{ padding: '1rem', background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: 8 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Product Code</span>
            <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{wo.productCode}</div>
          </div>
          <div style={{ padding: '1rem', background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: 8 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Customer</span>
            <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{wo.customer}</div>
          </div>
          <div style={{ padding: '1rem', background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: 8 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Station</span>
            <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{wo.station}</div>
          </div>
          <div style={{ padding: '1rem', background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: 8 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Target Qty</span>
            <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{wo.qty.toLocaleString()} pcs</div>
          </div>
          <div style={{ padding: '1rem', background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: 8 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Good Qty</span>
            <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--success)' }}>
              {wo.actualQty != null ? wo.actualQty.toLocaleString() : wo.qtyGood.toLocaleString()} pcs
            </div>
          </div>
          <div style={{ padding: '1rem', background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: 8 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Expected date</span>
            <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{wo.expectedDate ? new Date(wo.expectedDate).toLocaleDateString('th-TH') : '—'}</div>
          </div>
          <div style={{ padding: '1rem', background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: 8 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Status</span>
            <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{wo.currentStep}</div>
          </div>
        </div>
      </div>

      {/* ประวัติ QC / QA ของ WO นี้ */}
      <div className="panel">
        <h2 className="panel__title panel__title--sm" style={{ marginBottom: '1rem' }}>ประวัติ QC / QA {qcResults.length > 0 && `(${qcResults.length})`}</h2>
        {qcResults.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', padding: '0.5rem 0' }}>ยังไม่มีผล QC สำหรับ WO นี้ — บันทึกได้ที่หน้า QC → QC Result</div>
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 8 }}>
            <table className="table" style={{ minWidth: 820, width: '100%' }}>
              <thead>
                <tr>
                  <th>วันที่</th><th>Lot</th>
                  <th style={{ textAlign: 'center' }}>ตรวจ</th><th style={{ textAlign: 'center' }}>ผ่าน</th><th style={{ textAlign: 'center' }}>เสีย</th>
                  <th style={{ textAlign: 'center' }}>ผล QC</th><th>ของเสีย / หมายเหตุ</th><th>QA Verify</th>
                </tr>
              </thead>
              <tbody>
                {qcResults.map(r => (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem', color: 'var(--text-muted)' }}>{new Date(r.createdAt).toLocaleDateString('th-TH')}</td>
                    <td><code>{r.lotNo}</code></td>
                    <td style={{ textAlign: 'center' }}>{r.qtyChecked}</td>
                    <td style={{ textAlign: 'center', color: '#16a34a', fontWeight: 600 }}>{r.qtyPass}</td>
                    <td style={{ textAlign: 'center', color: r.qtyFail > 0 ? '#dc2626' : 'inherit', fontWeight: r.qtyFail > 0 ? 600 : 400 }}>{r.qtyFail}</td>
                    <td style={{ textAlign: 'center' }}><ResultBadge value={r.overall} /></td>
                    <td style={{ fontSize: '0.8rem', maxWidth: 240, whiteSpace: 'normal' }}>
                      {r.defectDesc && <div style={{ color: '#dc2626' }}>{r.defectDesc}</div>}
                      {r.remark && <div style={{ color: 'var(--text-muted)' }}>📝 {r.remark}</div>}
                      {!r.defectDesc && !r.remark && <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={{ fontSize: '0.82rem' }}>
                      {r.verdict
                        ? <span style={{ color: r.verdict === 'APPROVED' ? '#166534' : '#991b1b', fontWeight: 600 }}>{r.verdict === 'APPROVED' ? '✅ อนุมัติ' : '❌ ตีกลับ'} {r.verifiedBy ? `· ${r.verifiedBy}` : ''}</span>
                        : <span style={{ color: '#d97706' }}>⏳ รอ QA verify</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ประวัติการเบิกของ (Kitting) ของ WO นี้ */}
      <div className="panel">
        <h2 className="panel__title panel__title--sm" style={{ marginBottom: '1rem' }}>ประวัติการเบิกของ (Kitting) {kitting.length > 0 && `(${kitting.length})`}</h2>
        {kitting.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', padding: '0.5rem 0' }}>ยังไม่มีการเบิกของให้ WO นี้ — เบิกได้ที่หน้า Incoming & Kitting</div>
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 8 }}>
            <table className="table" style={{ minWidth: 560, width: '100%' }}>
              <thead><tr><th>เวลา</th><th>Part No</th><th>Lot ที่ตัด</th><th style={{ textAlign: 'center' }}>จำนวน</th></tr></thead>
              <tbody>
                {kitting.map(k => (
                  <tr key={k.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem', color: 'var(--text-muted)' }}>{new Date(k.issuedAt).toLocaleString('th-TH')}</td>
                    <td><code>{k.partNo}</code></td>
                    <td><code style={{ fontSize: '0.85rem' }}>{k.lotNo}</code></td>
                    <td style={{ textAlign: 'center' }}>{k.qty.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ประวัติการสแกนผลิต (Routing / Production) ของ WO นี้ */}
      <div className="panel">
        <h2 className="panel__title panel__title--sm" style={{ marginBottom: '1rem' }}>ประวัติการสแกนผลิต {scans.length > 0 && `(${scans.length})`}</h2>
        {scans.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', padding: '0.5rem 0' }}>ยังไม่มีการสแกนผลิตของ WO นี้</div>
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 8 }}>
            <table className="table" style={{ minWidth: 620, width: '100%' }}>
              <thead><tr><th>เวลา</th><th>Serial</th><th>สเตชัน</th><th style={{ textAlign: 'center' }}>ผล</th><th>ผู้ทำ</th></tr></thead>
              <tbody>
                {scans.map((s: any) => (
                  <tr key={s.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem', color: 'var(--text-muted)' }}>{new Date(s.scanned_at).toLocaleString('th-TH')}</td>
                    <td><code>{s.serial}</code></td>
                    <td>{s.station}</td>
                    <td style={{ textAlign: 'center' }}><ResultBadge value={s.result} /></td>
                    <td>{s.operator || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {wo.faiPassed && (
        <div className="panel">
          <h2 className="panel__title panel__title--sm">FAI Result</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
            <div style={{ padding: '1rem', background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: 8 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Inspector</span>
              <div style={{ fontWeight: 'bold' }}>{wo.faiInspector}</div>
            </div>
            <div style={{ padding: '1rem', background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: 8 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Approver</span>
              <div style={{ fontWeight: 'bold' }}>{wo.faiApprover}</div>
            </div>
            <div style={{ padding: '1rem', background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: 8 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Result</span>
              <div style={{ fontWeight: 'bold', color: 'var(--success)' }}>✅ PASSED</div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
