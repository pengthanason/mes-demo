import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCrList, useCrCreate, type MType, type CrState } from '../lib/crApi';
import { useIsViewer } from '../lib/useMockStore';
import { showToast } from '../lib/toast';
import { Paginator } from '../components/Paginator';

export const CR_STATE_STYLE: Record<CrState, { bg: string; text: string; border: string; label: string }> = {
  DRAFT:       { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1', label: 'DRAFT' },
  G1_REVIEW:   { bg: '#fef9c3', text: '#854d0e', border: '#fde047', label: 'G1 REVIEW' },
  G2_APPROVED: { bg: '#dcfce7', text: '#166534', border: '#86efac', label: 'G2 APPROVED' },
  ACTIVE:      { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd', label: 'ACTIVE' },
};

const M_TYPE_ICON: Record<MType, string> = {
  Man: '👷', Machine: '⚙️', Material: '📦', Method: '📋',
};

export function CrStateBadge({ state }: { state: CrState }) {
  const s = CR_STATE_STYLE[state];
  return (
    <span style={{
      background: s.bg, color: s.text, border: `1px solid ${s.border}`,
      padding: '2px 10px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  );
}

export function FourMChangePage() {
  const isViewer = useIsViewer();
  const { data, isLoading } = useCrList();
  const createMut = useCrCreate();
  const crList = data ?? [];

  const [stateFilter, setStateFilter] = useState('');
  const [typeFilter,  setTypeFilter]  = useState('');
  const [showForm,    setShowForm]    = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  // form state
  const [mType,       setMType]       = useState<MType | ''>('');
  const [woRef,       setWoRef]       = useState('');
  const [description, setDescription] = useState('');
  const [impact,      setImpact]      = useState('');

  const filtered = useMemo(() => crList.filter(cr => {
    const matchState = stateFilter === '' || cr.state === stateFilter;
    const matchType  = typeFilter === ''  || cr.mType === typeFilter;
    return matchState && matchType;
  }), [crList, stateFilter, typeFilter]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!mType || !description.trim()) return;
    createMut.mutate(
      { mType, woRef, description, impact },
      {
        onSuccess: (cr) => {
          showToast(`เปิด CR สำเร็จ: ${cr.crNo}`, 'success');
          setShowForm(false);
          setMType(''); setWoRef(''); setDescription(''); setImpact('');
        },
        onError: (err) => showToast(err.message, 'error'),
      }
    );
  }

  return (
    <section className="stack-lg">
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 className="panel__title">4M Change Request</h1>
            <p className="panel__subtitle">เปิดและติดตาม Change Request — Man / Machine / Material / Method</p>
          </div>
          {!isViewer && (
            <button type="button" className="btn" onClick={() => setShowForm(v => !v)}
              style={{ background: 'var(--brand)', borderColor: 'var(--brand)', color: '#fff', fontWeight: 600 }}>
              {showForm ? '✕ ยกเลิก' : '+ เปิด CR ใหม่'}
            </button>
          )}
        </div>

        {showForm && (
          <div className="panel" style={{ borderLeft: '4px solid var(--brand)', marginTop: '1.25rem' }}>
            <h3 className="panel__title panel__title--sm">เปิด Change Request ใหม่</h3>
            <form onSubmit={handleSubmit} className="stack" style={{ maxWidth: 560, marginTop: '0.75rem' }}>
              <label className="field">
                <span>ประเภท 4M *</span>
                <select value={mType} onChange={e => setMType(e.target.value as MType)} required>
                  <option value="">-- เลือกประเภท --</option>
                  <option value="Man">👷 Man (คน)</option>
                  <option value="Machine">⚙️ Machine (เครื่องจักร)</option>
                  <option value="Material">📦 Material (วัตถุดิบ)</option>
                  <option value="Method">📋 Method (วิธีการ)</option>
                </select>
              </label>
              <label className="field">
                <span>WO / Product ที่เกี่ยวข้อง</span>
                <input value={woRef} onChange={e => setWoRef(e.target.value)} placeholder="เช่น WO-202606-001 หรือ PCB-A100" />
              </label>
              <label className="field">
                <span>รายละเอียดการเปลี่ยนแปลง (what + why) *</span>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
                  placeholder="เปลี่ยนอะไร เพราะอะไร..." required />
              </label>
              <label className="field">
                <span>ผลกระทบที่คาดว่าจะเกิด</span>
                <textarea value={impact} onChange={e => setImpact(e.target.value)} rows={2}
                  placeholder="กระทบไลน์ไหน คุณภาพ/เวลา/ต้นทุนอย่างไร..." />
              </label>
              <button type="submit" className="btn" disabled={!mType || !description.trim() || createMut.isPending}
                style={{ background: 'var(--brand)', borderColor: 'var(--brand)', color: '#fff', fontWeight: 600, padding: '0.75rem' }}>
                {createMut.isPending ? 'กำลังเปิด CR...' : 'ยืนยันเปิด CR'}
              </button>
            </form>
          </div>
        )}

        <div className="filters-grid" style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>
          <label className="field">
            <span>Filter ประเภท 4M</span>
            <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}>
              <option value="">All Types</option>
              <option value="Man">Man</option>
              <option value="Machine">Machine</option>
              <option value="Material">Material</option>
              <option value="Method">Method</option>
            </select>
          </label>
          <label className="field">
            <span>Filter State</span>
            <select value={stateFilter} onChange={e => { setStateFilter(e.target.value); setPage(1); }}>
              <option value="">All States</option>
              <option value="DRAFT">DRAFT</option>
              <option value="G1_REVIEW">G1 REVIEW</option>
              <option value="G2_APPROVED">G2 APPROVED</option>
              <option value="ACTIVE">ACTIVE</option>
            </select>
          </label>
        </div>

        <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 8 }}>
          <table className="table table-readonly" style={{ minWidth: 700, width: '100%' }}>
            <thead>
              <tr>
                <th>CR No.</th>
                <th style={{ textAlign: 'center' }}>ประเภท</th>
                <th>WO / Product</th>
                <th style={{ width: '32%' }}>รายละเอียด</th>
                <th style={{ textAlign: 'center' }}>State</th>
                <th style={{ textAlign: 'center' }}>วันที่เปิด</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>กำลังโหลด...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>{(stateFilter || typeFilter) ? 'ไม่พบรายการตามตัวกรอง — ล้างตัวกรองเพื่อดูทั้งหมด' : 'ยังไม่มี Change Request — กด “+ เปิด CR ใหม่” มุมขวาบนเพื่อเริ่ม'}</td></tr>
              ) : (
                filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(cr => (
                  <tr key={cr.id}>
                    <td style={{ fontWeight: 600 }}>
                      <Link to={`/4m-change/${cr.id}`} style={{ color: 'var(--primary)', textDecoration: 'none' }}>{cr.crNo}</Link>
                    </td>
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>{M_TYPE_ICON[cr.mType]} {cr.mType}</td>
                    <td>{cr.woRef || '—'}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                      {cr.description.length > 80 ? cr.description.slice(0, 80) + '…' : cr.description}
                    </td>
                    <td style={{ textAlign: 'center' }}><CrStateBadge state={cr.state} /></td>
                    <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      {new Date(cr.createdAt).toLocaleDateString('th-TH')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Paginator page={page} totalPages={Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))} onPage={setPage} total={filtered.length} />
      </div>
    </section>
  );
}
