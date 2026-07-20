import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TRACE_URL } from '../lib/jigTrace';

const KEY = 'mes_flowguide_collapsed';

const STEPS = [
  { n: 1, icon: '📥', title: 'Incoming', desc: 'Receive raw materials as "lots" (thousands of pieces = 1 entry)', to: '/incoming', color: '#0ea5e9' },
  { n: 2, icon: '✅', title: 'QA Check', desc: 'QA inspects lots, approve/reject — approved lots enter stock', to: '/incoming', color: '#16a34a' },
  { n: 3, icon: '📦', title: 'Kitting', desc: 'Issue materials to a WO for the line, deduct stock FIFO', to: '/incoming', color: '#6366f1' },
  { n: 4, icon: '🔀', title: 'Production Plan · Workflow', desc: 'Scan Serial to run the process + record PASS/FAIL results', to: '/production-plan', color: '#8b5cf6' },
  { n: 5, icon: '🧪', title: 'QC / Jig Test', desc: 'Inspect product quality — QC Board / Jig / OBA', to: '/qc-board', color: '#f59e0b' },
  { n: 6, icon: '🧬', title: 'Traceability', desc: 'Search a Serial to view its history across all stations + daily report', to: '/traceability', external: TRACE_URL, color: '#0891b2' },
];

export function FlowGuide() {
  const nav = useNavigate();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(KEY) === '1');
  const toggle = () => { setCollapsed(c => { const n = !c; localStorage.setItem(KEY, n ? '1' : '0'); return n; }); };

  return (
    <div className="panel" style={{ background: 'linear-gradient(135deg,#f0f9ff,#faf5ff)', border: '1px solid #e0e7ff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>
          <h2 className="panel__title" style={{ margin: 0 }}>🚀 Getting Started — Workflow Steps</h2>
          <p className="panel__subtitle" style={{ margin: '0.25rem 0 0' }}>From incoming goods → to delivery, follow this order (click a card to go to each step)</p>
        </div>
        <button type="button" className="btn secondary" style={{ fontSize: '0.8rem', flexShrink: 0 }} onClick={toggle}>
          {collapsed ? 'Show steps ▼' : 'Hide ▲'}
        </button>
      </div>

      {!collapsed && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: 6, marginTop: '1.1rem' }}>
          {STEPS.map((s, i) => (
            <div key={s.n} style={{ display: 'flex', alignItems: 'stretch', gap: 6, flex: '1 1 200px', minWidth: 0 }}>
              <button type="button" onClick={() => s.external ? window.open(s.external, '_blank', 'noopener,noreferrer') : nav(s.to)}
                style={{ flex: 1, textAlign: 'left', background: '#fff', border: '1px solid var(--border-color)', borderRadius: 12, padding: '0.85rem 0.9rem', cursor: 'pointer', transition: 'transform 0.12s, box-shadow 0.12s', minWidth: 0 }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(0,0,0,0.10)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 8, background: s.color + '22', color: s.color, fontWeight: 800, fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{s.n}</span>
                  <span style={{ fontSize: '1.2rem' }}>{s.icon}</span>
                  <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.92rem' }}>{s.title}</span>
                </div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>{s.desc}</div>
              </button>
              {i < STEPS.length - 1 && (
                <div style={{ display: 'flex', alignItems: 'center', color: '#94a3b8', fontSize: '1.1rem', flexShrink: 0 }}>→</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
