import React, { useState } from 'react';
import { HashRouter, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { useMockAuth } from './lib/useMockStore.ts';
import { mockLogout } from './lib/mockStore.ts';
import { MesBackbonePage } from './pages/MesBackbonePage.tsx';
import { MesAuthPage } from './pages/MesAuthPage.tsx';
import { PmCoreFlowPage } from './pages/PmCoreFlowPage.tsx';
import { ScmCasesPage } from './pages/ScmCasesPage.tsx';
import BomEditorPage from './pages/BomEditorPage.tsx';
import WebCheckPage from './pages/WebCheckPage.tsx';
import { RouteAdminPage } from './pages/RouteAdminPage.tsx';
import SyncMonitorPage from './pages/SyncMonitorPage.tsx';
import QcBoard from './pages/quality/index.jsx';
import { RoutingHistoryPage } from './pages/RoutingHistoryPage.tsx';
import { SequenceBuilderPage } from './pages/SequenceBuilderPage.tsx';
import { ProductionReportPage } from './pages/ProductionReportPage.tsx';
import { WoDashboardPage } from './pages/WoDashboardPage.tsx';
import { WoDetailPage } from './pages/WoDetailPage.tsx';
import { CloseWoPage } from './pages/CloseWoPage.tsx';
import { ObaPage } from './pages/ObaPage.tsx';
import { FaiPage } from './pages/FaiPage.tsx';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ─── Sidebar nav items ─────────────────────────────────────────────
const MAIN_ITEMS = [
  { to: '/wo-dashboard',      label: 'WO Dashboard' },
  { to: '/production-report', label: 'Production Report' },
  { to: '/routing-history',   label: 'Routing History' },
  { to: '/sequence-builder',  label: 'Sequence Builder' },
  { to: '/qc-board',          label: 'QC Board' },
  { to: '/oba',               label: 'OBA' },
  { to: '/route-admin',       label: 'Route Admin' },
];

const DEV_ITEMS = [
  { to: '/mes-backbone', label: 'Backbone Tester' },
  { to: '/sync-monitor', label: 'Sync Monitor' },
  { to: '/web-check',    label: 'Health Check' },
  { to: '/bom-editor',   label: 'BOM Editor' },
  { to: '/pm-core-flow', label: 'PM Flow' },
  { to: '/scm-cases',    label: 'SCM Cases' },
];

const SIDEBAR_BG   = '#1e3a5f';
const SIDEBAR_TEXT = 'rgba(255,255,255,0.85)';
const SIDEBAR_ACTIVE_BG = 'rgba(255,255,255,0.15)';
const SIDEBAR_HOVER_BG  = 'rgba(255,255,255,0.08)';

// ─── Sidebar ───────────────────────────────────────────────────────
const SIDEBAR_W = 220; // expanded width
const ICON_W    = 58;  // collapsed width (icon strip)

function SidebarItem({ to, label, expanded, onClick }) {
  const location = useLocation();
  const isActive = location.hash === `#${to}` || location.pathname === to;
  return (
    <Link
      to={to}
      onClick={onClick}
      title={!expanded ? label : undefined}
      style={{
        display: 'block',
        padding: '0.5rem 0.75rem',
        borderRadius: 6,
        fontSize: '0.875rem',
        color: isActive && expanded ? '#fff' : SIDEBAR_TEXT,
        background: isActive && expanded ? SIDEBAR_ACTIVE_BG : 'transparent',
        fontWeight: isActive ? 600 : 400,
        textDecoration: 'none',
        marginBottom: 2,
        transition: 'background 0.12s',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        minHeight: '2rem',
      }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = SIDEBAR_HOVER_BG; }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
    >
      {expanded ? label : ''}
    </Link>
  );
}

function Sidebar() {
  const [expanded, setExpanded] = useState(false);
  const [devOpen, setDevOpen] = useState(false);
  const auth = useMockAuth();

  return (
    <div
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      style={{
        position: 'fixed',
        left: 0, top: 0, bottom: 0,
        width: expanded ? SIDEBAR_W : ICON_W,
        background: SIDEBAR_BG,
        transition: 'width 0.2s ease',
        overflow: 'hidden',
        zIndex: 200,
        boxShadow: expanded ? '4px 0 24px rgba(0,0,0,0.25)' : 'none',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Hamburger / logo row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: expanded ? 'flex-start' : 'center',
        gap: '0.75rem',
        padding: expanded ? '1rem 0.875rem' : '1rem 0',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        marginBottom: '0.5rem',
        flexShrink: 0,
        minHeight: 60,
        userSelect: 'none',
        cursor: 'default',
      }}>
        {/* Hamburger icon — always visible, centered when collapsed */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 6,
          cursor: 'default', flexShrink: 0,
        }}>
          <span style={{ display: 'block', width: 24, height: 2.5, background: '#fff', borderRadius: 2 }} />
          <span style={{ display: 'block', width: 24, height: 2.5, background: '#fff', borderRadius: 2 }} />
          <span style={{ display: 'block', width: 24, height: 2.5, background: '#fff', borderRadius: 2 }} />
        </div>
        {expanded && (
          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#fff', whiteSpace: 'nowrap', letterSpacing: '0.02em' }}>
            SYNTECH MES
          </span>
        )}
      </div>

      {/* Nav items */}
      <div style={{ padding: '0 0.5rem', flex: 1, overflowY: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {MAIN_ITEMS.map(item => (
          <SidebarItem key={item.to} to={item.to} label={item.label} expanded={expanded} onClick={() => {}} />
        ))}

        {/* Divider — only visible when expanded */}
        {expanded && <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '0.5rem 0.25rem' }} />}

        {/* Dev Tools accordion trigger — only clickable when expanded */}
        {expanded && (
          <button
            type="button"
            onClick={() => setDevOpen(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.5rem 0.75rem', width: '100%',
              background: 'transparent', border: 'none', borderRadius: 6,
              cursor: 'pointer', fontSize: '0.875rem',
              color: SIDEBAR_TEXT, fontWeight: 500,
              marginBottom: 2, transition: 'background 0.12s',
              whiteSpace: 'nowrap', userSelect: 'none',
            }}
            onMouseEnter={e => e.currentTarget.style.background = SIDEBAR_HOVER_BG}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span style={{ flex: 1, textAlign: 'left', pointerEvents: 'none' }}>Dev Tools</span>
            <span style={{ fontSize: '0.65rem', opacity: 0.6, pointerEvents: 'none' }}>{devOpen ? '▲' : '▼'}</span>
          </button>
        )}

        {devOpen && DEV_ITEMS.map(item => (
          <SidebarItem key={item.to} to={item.to} label={item.label} expanded={expanded} onClick={() => {}} />
        ))}
      </div>

      {/* Login / Logout — pinned bottom */}
      <div style={{ padding: '0.5rem', flexShrink: 0 }}>
        {auth.isLoggedIn ? (
          <button
            type="button"
            title={!expanded ? 'Logout' : undefined}
            onClick={() => mockLogout()}
            style={{
              display: 'block', width: '100%', padding: '0.5rem 0.75rem',
              borderRadius: 6, fontSize: '0.875rem', color: SIDEBAR_TEXT,
              background: 'transparent', border: 'none', fontWeight: 400,
              cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap',
              overflow: 'hidden', minHeight: '2rem', transition: 'background 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = SIDEBAR_HOVER_BG; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            {expanded ? 'Logout' : ''}
          </button>
        ) : (
          <SidebarItem to="/mes-auth" label="Login" expanded={expanded} onClick={() => {}} />
        )}
      </div>
    </div>
  );
}

// ─── Error Boundary ────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('UI Error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="panel notice err" style={{ margin: '2rem' }}>
          <h3>Something went wrong</h3>
          <p style={{ color: 'red' }}>{this.state.error?.message || 'Unknown error'}</p>
          <button type="button" className="btn" onClick={() => this.setState({ hasError: false })} style={{ marginTop: '1rem' }}>
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Top nav link ──────────────────────────────────────────────────
function NavLink({ to, children }) {
  const location = useLocation();
  const isActive = location.hash === `#${to}` || location.pathname === to;
  return (
    <Link
      to={to}
      style={{
        padding: '0.4rem 0.85rem',
        borderRadius: 6,
        background: isActive ? 'rgba(255,255,255,0.18)' : 'transparent',
        color: isActive ? '#fff' : 'rgba(255,255,255,0.75)',
        textDecoration: 'none',
        border: `1px solid ${isActive ? 'rgba(255,255,255,0.35)' : 'transparent'}`,
        fontWeight: isActive ? 600 : 400,
        fontSize: '0.875rem',
        transition: 'all 0.15s',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </Link>
  );
}

// ─── Shell ─────────────────────────────────────────────────────────
function Shell({ children }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />

      <div style={{ flex: 1, marginLeft: ICON_W, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <style>{`
          .field input, .field select, .field textarea {
            width: 100%; padding: 0.6rem 0.8rem;
            border: 1px solid var(--border-color, #cbd5e1); border-radius: 6px;
            font-size: 0.95rem; background-color: #f8fafc; color: #334155;
            transition: all 0.2s ease; box-sizing: border-box; outline: none;
          }
          .field input:focus, .field select:focus, .field textarea:focus {
            border-color: var(--primary, #3b82f6); background-color: #fff;
            box-shadow: 0 0 0 3px rgba(59,130,246,0.15);
          }
          .field span {
            display: block; margin-bottom: 0.4rem; font-weight: 600;
            color: #475569; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em;
          }
          .filters-grid {
            display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1.25rem; margin-bottom: 1.5rem; background: white;
            padding: 1.25rem; border-radius: 8px; border: 1px solid #e2e8f0;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          }
          .table { width: 100%; border-collapse: collapse; }
          .table th {
            background-color: #f1f5f9; color: #475569; font-weight: 600;
            padding: 0.85rem 1rem; text-align: left; border-bottom: 2px solid #cbd5e1;
          }
          .table td { padding: 0.85rem 1rem; border-bottom: 1px solid #e2e8f0; vertical-align: middle; color: #334155; }
          .table tbody tr:nth-child(odd) { background-color: #fff; }
          .table tbody tr:nth-child(even) { background-color: #f8fafc; }
          .table tbody tr:hover { background-color: #f1f5f9; }
          .table.table-readonly tbody tr:hover td { background-color: transparent !important; }
          .mes-module-tabs { display: flex; gap: 1.5rem; border-bottom: 2px solid #e2e8f0; margin-bottom: 1.5rem; }
          .mes-module-tab { padding: 0.75rem 0; background: none; border: none; font-weight: 600; font-size: 1rem; color: #64748b; cursor: pointer; border-bottom: 3px solid transparent; margin-bottom: -2px; transition: all 0.2s; }
          .mes-module-tab:hover { color: #3b82f6; }
          .mes-module-tab.active { color: #3b82f6; border-bottom-color: #3b82f6; }
          .mes-light-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 2rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); margin-bottom: 2rem; }
          .mes-module-head { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 1rem; }
          .mes-module-code { background: var(--primary, #3b82f6); color: white; padding: 0.35rem 0.85rem; border-radius: 999px; font-weight: bold; font-size: 0.85rem; }
          .mes-endpoints { display: flex; flex-direction: column; gap: 0.5rem; margin: 1.5rem 0; padding: 1rem 1.5rem; background: #f8fafc; border-radius: 8px; border-left: 4px solid var(--primary, #3b82f6); }
          .mes-endpoints a { color: #2563eb; text-decoration: none; font-family: ui-monospace, monospace; font-size: 0.9rem; }
          .mes-endpoints a:hover { text-decoration: underline; }
          .mes-case-context { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; background: #f1f5f9; padding: 1.5rem; border-radius: 8px; margin: 1.5rem 0; border: 1px dashed #cbd5e1; }
          .mes-module-presets { display: flex; flex-wrap: wrap; gap: 0.75rem; margin: 1.5rem 0; }
          .mes-preset-chip { background: #f8fafc; border: 1px solid #cbd5e1; padding: 0.5rem 1rem; border-radius: 20px; cursor: pointer; font-size: 0.85rem; font-weight: 600; color: #475569; transition: all 0.2s; }
          .mes-preset-chip:hover:not(:disabled) { background: #e2e8f0; color: #0f172a; }
          .mes-preset-chip.active { background: var(--primary, #3b82f6); color: white; border-color: var(--primary, #3b82f6); }
          .mes-actions { display: flex; gap: 1rem; margin-top: 1.5rem; flex-wrap: wrap; align-items: center; }
        `}</style>

        {/* Top header */}
        <header style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: '1rem', flexWrap: 'wrap',
          padding: '0.875rem 1.5rem',
          borderBottom: '1px solid #0f2744',
          background: '#162d4a',
          position: 'sticky', top: 0, zIndex: 100,
        }}>
          <nav style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center', marginLeft: 'auto' }}>
            <NavLink to="/wo-dashboard">WO Board</NavLink>
            <NavLink to="/production-report">Report</NavLink>
            <NavLink to="/routing-history">History</NavLink>
            <NavLink to="/sequence-builder">Sequence Builder</NavLink>
            <NavLink to="/qc-board">QC Board</NavLink>
            <NavLink to="/oba">OBA</NavLink>
            <NavLink to="/route-admin">Route Admin</NavLink>
            <span style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.2)', display: 'inline-block', margin: '0 0.25rem' }} />
            <NavLink to="/system">⚙️ System</NavLink>
          </nav>
        </header>

        <main style={{ padding: '1.5rem', maxWidth: 1380, margin: '0 auto', flex: 1, width: '100%', boxSizing: 'border-box' }}>
          {children}
        </main>

        <footer style={{ padding: '1rem 1.5rem', marginBottom: '5px', borderTop: '1px solid #2d5a8e', textAlign: 'center', color: '#2d5a8e', fontSize: '0.8rem', flexShrink: 0 }}>
          © 2026 Synergy Technology · SYNTECH MES v0.1
        </footer>
      </div>
    </div>
  );
}

// ─── System / Dev tools page ───────────────────────────────────────
const CARD_SHADES = [
  '#1e3a5f','#1e3a5f','#1e3a5f','#1e3a5f',
  '#1e3a5f','#1e3a5f','#1e3a5f','#1e3a5f',
];

function SystemPage() {
  const auth = useMockAuth();
  const allItems = [...DEV_ITEMS, { to: '/mes-auth', label: auth.isLoggedIn ? 'Logout' : 'Login' }];
  return (
    <section className="stack-lg">
      <div className="panel">
        <h1 className="panel__title">System &amp; Developer Tools</h1>
        <p className="panel__subtitle">Internal tools for developers — not part of regular operator workflow</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
        {allItems.map((item, i) => {
          const bg = CARD_SHADES[i % CARD_SHADES.length];
          const isLogoutCard = auth.isLoggedIn && item.label === 'Logout';
          const cardDiv = (
            <div
              style={{
                background: bg,
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 10,
                padding: '1.75rem 1rem',
                textAlign: 'center',
                boxSizing: 'border-box',
                transition: 'filter 0.15s, transform 0.15s',
                cursor: 'pointer',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.filter = 'brightness(1.2)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.filter = '';
                e.currentTarget.style.transform = '';
              }}
            >
              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'rgba(255,255,255,0.9)' }}>{item.label}</div>
            </div>
          );
          return isLogoutCard ? (
            <div key={item.to} onClick={() => mockLogout()} style={{ textDecoration: 'none' }}>{cardDiv}</div>
          ) : (
            <Link key={item.to} to={item.to} style={{ textDecoration: 'none' }}>{cardDiv}</Link>
          );
        })}
      </div>
    </section>
  );
}

// ─── App ───────────────────────────────────────────────────────────
const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Shell>
          <ErrorBoundary>
            <Routes>
              <Route path="/"                  element={<Navigate to="/wo-dashboard" replace />} />
              <Route path="/system"            element={<SystemPage />} />
              <Route path="/mes-backbone"      element={<MesBackbonePage />} />
              <Route path="/mes-auth"          element={<MesAuthPage />} />
              <Route path="/pm-core-flow"      element={<PmCoreFlowPage />} />
              <Route path="/scm-cases"         element={<ScmCasesPage />} />
              <Route path="/sync-monitor"      element={<SyncMonitorPage />} />
              <Route path="/qc-board"          element={<QcBoard />} />
              <Route path="/bom-editor"        element={<BomEditorPage />} />
              <Route path="/route-admin"       element={<RouteAdminPage />} />
              <Route path="/web-check"         element={<WebCheckPage />} />
              <Route path="/routing-history"   element={<RoutingHistoryPage />} />
              <Route path="/sequence-builder"  element={<SequenceBuilderPage />} />
              <Route path="/production-report" element={<ProductionReportPage />} />
              <Route path="/wo-dashboard"      element={<WoDashboardPage />} />
              <Route path="/wo/:woId"          element={<WoDetailPage />} />
              <Route path="/wo/:woId/close"    element={<CloseWoPage />} />
              <Route path="/oba"               element={<ObaPage />} />
              <Route path="/fai/:woId"         element={<FaiPage />} />
              <Route path="*"                  element={<Navigate to="/wo-dashboard" replace />} />
            </Routes>
          </ErrorBoundary>
        </Shell>
      </HashRouter>
    </QueryClientProvider>
  );
}
