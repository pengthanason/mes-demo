import { useState, useEffect, useRef } from 'react';
import { type Workflow } from '../../lib/workflowApi';
import { confirmDialog } from '../../lib/confirm';

/* ── โหลด preset ── */
export function PresetSelect({ workflows, onLoad, onDelete, canDelete }: {
  workflows: Workflow[]; onLoad: (w: Workflow) => void; onDelete: (id: number) => void; canDelete: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const showSearch = workflows.length > 10;   // preset เยอะ → มีช่องค้นหา
  const needle = q.trim().toLowerCase();
  const shown = needle ? workflows.filter(w => `${w.name} ${w.customer} ${w.model}`.toLowerCase().includes(needle)) : workflows;
  useEffect(() => { if (open && showSearch) requestAnimationFrame(() => searchRef.current?.focus()); }, [open, showSearch]);
  return (
    <div style={{ position: 'relative', flexGrow: 1, minWidth: 0 }}>
      <div onClick={() => { if (!open) setQ(''); setOpen(o => !o); }}
        role="button" tabIndex={0} aria-expanded={open} aria-label="Load saved preset"
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!open) setQ(''); setOpen(o => !o); } }}
        style={{ padding: '8px 10px', border: '1px solid #ccc', borderRadius: 4, background: '#f8fafc', color: '#64748b', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>📂 Load saved Preset...</span>
        <span style={{ fontSize: 10 }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: '#fff', border: '1px solid #ccc', borderRadius: 4, boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: 390, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {showSearch && (
              <div style={{ padding: 6, borderBottom: '1px solid #e2e8f0' }}>
                <input ref={searchRef} value={q} onChange={e => setQ(e.target.value)} onClick={e => e.stopPropagation()}
                  onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
                  placeholder="🔍 Search preset..." aria-label="Search preset"
                  style={{ width: '100%', padding: '6px 8px', border: '1px solid #ccc', borderRadius: 4, fontSize: '0.82rem', fontFamily: 'inherit' }} />
              </div>
            )}
            <div style={{ overflowY: 'auto' }}>
            {workflows.length === 0 && <div style={{ padding: '10px', color: '#94a3b8', fontSize: '0.85rem' }}>No saved presets yet</div>}
            {workflows.length > 0 && shown.length === 0 && <div style={{ padding: '10px', color: '#94a3b8', fontSize: '0.85rem' }}>No results for “{q}”</div>}
            {shown.map(w => (
              <div key={w.id} style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ flexGrow: 1, padding: '8px 10px', cursor: 'pointer', color: '#334155', minWidth: 0 }} onClick={() => { onLoad(w); setOpen(false); }}
                  role="button" tabIndex={0} aria-label={`Load preset ${w.name || w.model || ''}`}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onLoad(w); setOpen(false); } }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{w.name || `${w.customer || '—'} · ${w.model || '—'}`}</div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.steps.map(s => s.process).join(' → ')}</div>
                </div>
                {canDelete && w.id > 0 && (
                  <button onClick={async (e) => { e.preventDefault(); e.stopPropagation(); if (await confirmDialog('Delete this preset?')) onDelete(w.id); }}
                    style={{ background: 'transparent', border: 'none', color: '#e74c3c', cursor: 'pointer', padding: '8px 10px', fontSize: 12, fontWeight: 'bold', flexShrink: 0 }}
                    title="Delete" onMouseOver={e => e.currentTarget.style.background = '#fee2e2'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>✕</button>
                )}
              </div>
            ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
