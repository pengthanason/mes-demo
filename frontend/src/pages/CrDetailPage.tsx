import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useCrList, useCrApproveGate, type CrState, type ChangeRequest } from '../lib/crApi';
import { CrStateBadge } from './FourMChangePage';
import { useIsViewer } from '../lib/useMockStore';
import { showToast } from '../lib/toast';

type GateKey = 'g1' | 'g2' | 'g3';

const GATE_DEFS: { key: GateKey; title: string; reachedAt: CrState; fromState: CrState }[] = [
  { key: 'g1', title: 'G1: Engineering Review', reachedAt: 'G1_REVIEW',   fromState: 'DRAFT' },
  { key: 'g2', title: 'G2: QA Approved',        reachedAt: 'G2_APPROVED', fromState: 'G1_REVIEW' },
  { key: 'g3', title: 'G3: Active',             reachedAt: 'ACTIVE',      fromState: 'G2_APPROVED' },
];

const STATE_ORDER: CrState[] = ['DRAFT', 'G1_REVIEW', 'G2_APPROVED', 'ACTIVE'];

function gateInfo(cr: ChangeRequest, key: GateKey) {
  if (key === 'g1') return { note: cr.g1Note, at: cr.g1At };
  if (key === 'g2') return { note: cr.g2Note, at: cr.g2At };
  return { note: cr.g3Note, at: cr.g3At };
}

export function CrDetailPage() {
  const { crId } = useParams();
  const isViewer = useIsViewer();
  const { data, isLoading } = useCrList();
  const approveMut = useCrApproveGate();
  const cr = (data ?? []).find(c => String(c.id) === crId) ?? null;

  const [notes, setNotes] = useState<Record<GateKey, string>>({ g1: '', g2: '', g3: '' });

  if (isLoading) {
    return <div className="panel" style={{ margin: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>กำลังโหลด...</div>;
  }

  if (!cr) {
    return (
      <div className="notice err" style={{ margin: '2rem' }}>
        ไม่พบ Change Request
        <div style={{ marginTop: '1rem' }}>
          <Link to="/4m-change" className="btn secondary">← กลับรายการ CR</Link>
        </div>
      </div>
    );
  }

  const stateIdx = STATE_ORDER.indexOf(cr.state);

  function approve(key: GateKey) {
    approveMut.mutate(
      { id: cr!.id, gate: key, note: notes[key] },
      {
        onSuccess: (updated) => showToast(`${cr!.crNo} → ${updated.state}`, 'success'),
        onError:   (err) => showToast(err.message, 'error'),
      }
    );
  }

  return (
    <section className="stack-lg">
      <div className="panel">
        <div style={{ marginBottom: '0.75rem' }}>
          <Link to="/4m-change" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>← กลับรายการ CR</Link>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 className="panel__title">{cr.crNo}</h1>
            <p className="panel__subtitle">4M Change Request Detail</p>
          </div>
          <CrStateBadge state={cr.state} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1.25rem' }}>
          <div style={{ padding: '1rem', background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: 10 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>ประเภท 4M</span>
            <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#1e293b' }}>{cr.mType}</div>
          </div>
          <div style={{ padding: '1rem', background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: 10 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>WO / Product</span>
            <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#1e293b' }}>{cr.woRef || '—'}</div>
          </div>
          <div style={{ padding: '1rem', background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: 10 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>วันที่เปิด</span>
            <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#1e293b' }}>{new Date(cr.createdAt).toLocaleDateString('th-TH')}</div>
          </div>
        </div>

        <div className="stack" style={{ marginTop: '1.25rem', gap: '0.75rem' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>รายละเอียดการเปลี่ยนแปลง</div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{cr.description}</div>
          </div>
          {cr.impact && (
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>ผลกระทบที่คาด</div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{cr.impact}</div>
            </div>
          )}
        </div>
      </div>

      {/* Gate Timeline */}
      <div className="panel">
        <h2 className="panel__title panel__title--sm" style={{ marginBottom: '1.25rem' }}>Gate Timeline</h2>

        <div className="stack" style={{ gap: 0 }}>
          {GATE_DEFS.map((g, i) => {
            const reachedIdx = STATE_ORDER.indexOf(g.reachedAt);
            const passed     = stateIdx >= reachedIdx;            // gate นี้ผ่านแล้ว
            const isNext     = cr.state === g.fromState;           // gate นี้คือคิวถัดไป
            const info       = gateInfo(cr, g.key);
            const isLast     = i === GATE_DEFS.length - 1;

            return (
              <div key={g.key} style={{ display: 'flex', gap: '1rem' }}>
                {/* เส้น timeline + จุด */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 28, flexShrink: 0 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.7rem', fontWeight: 700, color: '#fff',
                    background: passed ? '#10b981' : isNext ? '#f59e0b' : '#cbd5e1',
                    border: '2px solid', borderColor: passed ? '#10b981' : isNext ? '#f59e0b' : '#cbd5e1',
                  }}>
                    {passed ? '✓' : i + 1}
                  </div>
                  {!isLast && (
                    <div style={{ width: 2, flex: 1, minHeight: 36, background: passed ? '#10b981' : '#e2e8f0' }} />
                  )}
                </div>

                {/* เนื้อหา gate */}
                <div style={{ paddingBottom: isLast ? 0 : '1.5rem', flex: 1 }}>
                  <div style={{ fontWeight: 600, color: passed ? '#0f766e' : isNext ? '#92400e' : 'var(--text-muted)' }}>
                    {g.title}
                  </div>

                  {passed && (
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 4 }}>
                      ผ่านเมื่อ {info.at ? new Date(info.at).toLocaleString('th-TH') : '—'}
                      {info.note && <div style={{ marginTop: 2 }}>หมายเหตุ: {info.note}</div>}
                    </div>
                  )}

                  {!passed && isNext && !isViewer && (
                    <div className="stack" style={{ marginTop: '0.6rem', maxWidth: 440, gap: '0.5rem' }}>
                      <input
                        value={notes[g.key]}
                        onChange={e => setNotes(prev => ({ ...prev, [g.key]: e.target.value }))}
                        placeholder="หมายเหตุการอนุมัติ (ไม่บังคับ)..."
                        style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--border-color, #cbd5e1)', borderRadius: 6, fontSize: '0.9rem' }}
                      />
                      <button
                        type="button"
                        className="btn"
                        onClick={() => approve(g.key)}
                        disabled={approveMut.isPending}
                        style={{ background: '#10b981', borderColor: '#10b981', color: '#fff', fontWeight: 600, alignSelf: 'flex-start' }}
                      >
                        {approveMut.isPending ? 'กำลังอนุมัติ...' : `อนุมัติ ${g.title}`}
                      </button>
                    </div>
                  )}

                  {!passed && !isNext && (
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4 }}>
                      รอ gate ก่อนหน้าผ่านก่อน
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
