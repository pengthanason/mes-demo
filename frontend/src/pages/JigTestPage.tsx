import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useJigProjects, useJigProjectCreate, useJigProjectDelete, JigProject } from '../lib/jigApi';
import { useIsViewer } from '../lib/useMockStore';
import { showToast } from '../lib/toast';

function PassRateBar({ rate }: { rate: number }) {
  const color = rate >= 95 ? '#22c55e' : rate >= 80 ? '#f59e0b' : '#ef4444';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: 3 }}>
        <span style={{ color: 'var(--text-muted)' }}>Pass Rate</span>
        <span style={{ fontWeight: 700, color }}>{rate.toFixed(1)}%</span>
      </div>
      <div style={{ height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ width: `${rate}%`, height: '100%', background: color, borderRadius: 99, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  );
}

function ProjectCard({ p, onClick, onDelete }: { p: JigProject; onClick: () => void; onDelete?: () => void }) {
  const statusColor = p.isActive ? '#22c55e' : '#9ca3af';
  return (
    <div
      className="panel"
      onClick={onClick}
      style={{ cursor: 'pointer', transition: 'box-shadow 0.15s', border: '1px solid var(--border)', flex: '0 0 280px' }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.12)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>{p.name}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
            <code>{p.projectCode}</code> · Jig: <code>{p.jigId}</code>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: statusColor + '22', color: statusColor }}>
            {p.isActive ? 'ACTIVE' : 'INACTIVE'}
          </span>
          {onDelete && (
            <button type="button" title="ลบโปรเจกต์"
              onClick={e => { e.stopPropagation(); onDelete(); }}
              style={{ width: 26, height: 26, padding: 0, borderRadius: 6, border: '1px solid #fca5a5', background: '#fee2e2', color: '#dc2626', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, lineHeight: 1, flexShrink: 0 }}
              onMouseEnter={e => { e.currentTarget.style.background = '#dc2626'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#dc2626'; }}
            >✕</button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <div style={{ background: 'var(--bg-muted)', padding: '0.5rem', borderRadius: 6, textAlign: 'center' }}>
          <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{p.total}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Total</div>
        </div>
        <div style={{ background: 'rgba(34,197,94,0.08)', padding: '0.5rem', borderRadius: 6, textAlign: 'center' }}>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#22c55e' }}>{p.passCount}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Pass</div>
        </div>
        <div style={{ background: 'rgba(239,68,68,0.08)', padding: '0.5rem', borderRadius: 6, textAlign: 'center' }}>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ef4444' }}>{p.failCount}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Fail</div>
        </div>
      </div>

      <PassRateBar rate={p.passRate} />

      <div style={{ textAlign: 'right', marginTop: '0.5rem' }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--primary)' }}>ดูรายละเอียด →</span>
      </div>
    </div>
  );
}

function CreateJigProjectModal({ onClose }: { onClose: () => void }) {
  const [projectCode, setProjectCode] = useState('');
  const [name, setName] = useState('');
  const [jigId, setJigId] = useState('');
  const [err, setErr] = useState('');
  const mut = useJigProjectCreate();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (!projectCode.trim() || !name.trim()) return setErr('กรุณาใส่ Project Code และชื่อ');
    mut.mutate(
      { projectCode: projectCode.trim(), name: name.trim(), jigId: jigId.trim() },
      { onSuccess: () => { showToast('สร้างโปรเจกต์ Jig สำเร็จ', 'success'); onClose(); },
        onError: (e: any) => setErr(e.message) }
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 'min(100%, 420px)' }}>
        <h2 className="panel__title" style={{ marginBottom: '1rem' }}>เพิ่มโปรเจกต์ Jig</h2>
        <form onSubmit={submit} className="stack" style={{ gap: '0.85rem' }}>
          <label className="field"><span>Project Code *</span>
            <input value={projectCode} onChange={e => setProjectCode(e.target.value)} placeholder="เช่น PCB-A100" autoFocus required />
          </label>
          <label className="field"><span>ชื่อโปรเจกต์ *</span>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="เช่น PCB Assembly A100" required />
          </label>
          <label className="field"><span>Jig ID</span>
            <input value={jigId} onChange={e => setJigId(e.target.value)} placeholder="เช่น JIG-001" />
          </label>
          {err && <div className="notice err">{err}</div>}
          <div className="modal-actions">
            <button type="button" className="btn secondary" onClick={onClose}>ยกเลิก</button>
            <button type="submit" className="btn" disabled={mut.isPending}>{mut.isPending ? 'กำลังสร้าง...' : 'สร้างโปรเจกต์'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function JigTestPage() {
  const navigate = useNavigate();
  const { data: projects = [], isLoading, error } = useJigProjects();
  const [showCreate, setShowCreate] = useState(false);
  const isViewer = useIsViewer();
  const del = useJigProjectDelete();

  const handleDelete = (p: JigProject) => {
    if (!confirm(`ลบโปรเจกต์ "${p.name}" (${p.projectCode})?\nผลทดสอบทั้งหมดของโปรเจกต์นี้จะถูกลบด้วย — กู้คืนไม่ได้`)) return;
    del.mutate(p.projectCode, {
      onSuccess: () => showToast('ลบโปรเจกต์แล้ว', 'info'),
      onError: (e: any) => showToast(e.message, 'error'),
    });
  };

  const active   = projects.filter(p => p.isActive);
  const inactive = projects.filter(p => !p.isActive);

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 className="panel__title">Jig Test</h1>
          <p className="panel__subtitle">ผลการทดสอบ Jig แยกตามโปรเจกต์</p>
        </div>
        {!isViewer && <button type="button" className="btn" onClick={() => setShowCreate(true)}>+ เพิ่มโปรเจกต์</button>}
      </div>
      {showCreate && <CreateJigProjectModal onClose={() => setShowCreate(false)} />}

      {isLoading && <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>กำลังโหลด...</div>}
      {error && <div style={{ padding: '1rem', color: 'var(--danger)', background: 'rgba(239,68,68,0.08)', borderRadius: 8 }}>เกิดข้อผิดพลาด</div>}

      {active.length > 0 && (
        <div style={{ marginTop: '1.75rem' }}>
          <h2 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1.25rem' }}>
            Active Projects ({active.length})
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'center' }}>
            {active.map(p => (
              <ProjectCard key={p.id} p={p} onClick={() => navigate(`/jig-test/${p.projectCode}`)} onDelete={isViewer ? undefined : () => handleDelete(p)} />
            ))}
          </div>
        </div>
      )}

      {inactive.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <h2 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
            Inactive Projects ({inactive.length})
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'center' }}>
            {inactive.map(p => (
              <ProjectCard key={p.id} p={p} onClick={() => navigate(`/jig-test/${p.projectCode}`)} onDelete={isViewer ? undefined : () => handleDelete(p)} />
            ))}
          </div>
        </div>
      )}

      {!isLoading && projects.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>ยังไม่มีโปรเจกต์</div>
      )}
    </div>
  );
}
