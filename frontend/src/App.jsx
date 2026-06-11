import React, { useState, useEffect, useRef } from 'react';
import { HashRouter, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { useMockAuth } from './lib/useMockStore.ts';
import { mockLogout, exportData, importData } from './lib/mockStore.ts';
import { ROLE_COLOR } from './lib/roles.ts';
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
import { MesWorkspacePage } from './pages/MesWorkspacePage.tsx';
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

function SidebarItem({ to, label, expanded, onClick, innerRef }) {
  const location = useLocation();
  const isActive = location.hash === `#${to}` || location.pathname === to;
  const [hov, setHov] = useState(false);
  return (
    <Link
      ref={innerRef}
      to={to}
      onClick={onClick}
      title={!expanded ? label : undefined}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'block',
        padding: '0.5rem 0.75rem',
        borderRadius: 6,
        fontSize: '0.875rem',
        color: (isActive || hov) ? '#fff' : SIDEBAR_TEXT,
        background: 'transparent',
        fontWeight: isActive ? 600 : 400,
        textDecoration: 'none',
        marginBottom: 2,
        transition: 'color 0.15s',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        minHeight: '2rem',
        position: 'relative',
        zIndex: 1,
        outline: 'none',
      }}
    >
      {expanded ? label : ''}
    </Link>
  );
}

const VIEWER_ITEMS = ['/wo-dashboard', '/production-report', '/routing-history', '/qc-board'];
const MEMBER_ITEMS = ['/wo-dashboard', '/production-report', '/routing-history', '/sequence-builder', '/qc-board', '/oba'];

function visibleMainItems(role) {
  if (!role || role === 'viewer') return MAIN_ITEMS.filter(i => VIEWER_ITEMS.includes(i.to));
  if (role === 'member') return MAIN_ITEMS.filter(i => MEMBER_ITEMS.includes(i.to));
  return MAIN_ITEMS; // admin
}

function Sidebar() {
  const [expanded, setExpanded] = useState(false);
  const [devOpen, setDevOpen] = useState(false);
  const auth     = useMockAuth();
  const location = useLocation();
  const items    = visibleMainItems(auth.role);
  const listRef   = useRef(null);
  const sliderRef = useRef(null);
  const itemRefs  = useRef({});
  const initialized = useRef(false);

  useEffect(() => {
    const slider = sliderRef.current;
    const list   = listRef.current;
    if (!slider || !list) return;
    if (!expanded) { slider.style.opacity = '0'; return; }
    const path = location.pathname;
    const el   = itemRefs.current[path];
    if (!el) { slider.style.opacity = '0'; return; }
    const top    = el.offsetTop;
    const height = el.offsetHeight;
    if (!initialized.current) {
      slider.style.transition = 'none';
      slider.style.top    = `${top}px`;
      slider.style.height = `${height}px`;
      slider.style.opacity = '1';
      requestAnimationFrame(() => {
        if (slider) slider.style.transition = 'top 0.28s cubic-bezier(0.4,0,0.2,1), height 0.28s cubic-bezier(0.4,0,0.2,1), opacity 0.15s';
      });
      initialized.current = true;
    } else {
      slider.style.top    = `${top}px`;
      slider.style.height = `${height}px`;
      slider.style.opacity = '1';
    }
  }, [location.pathname, auth.role, expanded]);

  const setItemRef = (to) => (el) => { if (el) itemRefs.current[to] = el; else delete itemRefs.current[to]; };

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, cursor: 'default', flexShrink: 0 }}>
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
      <div ref={listRef} style={{ padding: '0 0.5rem', flex: 1, overflowY: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none', position: 'relative' }}>
        {/* Vertical sliding pill */}
        <div ref={sliderRef} style={{
          position: 'absolute',
          left: 0, right: 0,
          borderRadius: 6,
          background: SIDEBAR_ACTIVE_BG,
          pointerEvents: 'none',
          zIndex: 0,
          opacity: 0,
        }} />
        {items.map(item => (
          <SidebarItem key={item.to} to={item.to} label={item.label} expanded={expanded} onClick={() => {}} innerRef={setItemRef(item.to)} />
        ))}

        {/* Dev Tools — admin only */}
        {auth.role === 'admin' && expanded && (
          <>
            <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '0.5rem 0.25rem' }} />
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
            {devOpen && DEV_ITEMS.map(item => (
              <SidebarItem key={item.to} to={item.to} label={item.label} expanded={expanded} onClick={() => {}} innerRef={setItemRef(item.to)} />
            ))}
          </>
        )}
      </div>

      {/* Role badge + Login/Logout — pinned bottom */}
      <div style={{ padding: '0.5rem', flexShrink: 0 }}>
        {auth.isLoggedIn && expanded && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.3rem 0.75rem', marginBottom: '0.25rem',
            fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)',
          }}>
            <span style={{
              background: ROLE_COLOR[auth.role] || '#64748b',
              color: '#fff', padding: '0.1rem 0.4rem', borderRadius: 999,
              fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase',
            }}>{auth.role}</span>
            <span>{auth.username}</span>
          </div>
        )}
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
function NavLink({ to, children, innerRef }) {
  const location = useLocation();
  const isActive = location.hash === `#${to}` || location.pathname === to;
  return (
    <Link
      ref={innerRef}
      to={to}
      style={{
        padding: '0.4rem 0.85rem',
        borderRadius: 6,
        color: isActive ? '#fff' : 'rgba(255,255,255,0.72)',
        textDecoration: 'none',
        fontWeight: isActive ? 600 : 400,
        fontSize: '0.875rem',
        whiteSpace: 'nowrap',
        position: 'relative',
        zIndex: 1,
        transition: 'color 0.2s',
        outline: 'none',
      }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = '#fff'; }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = 'rgba(255,255,255,0.72)'; }}
    >
      {children}
    </Link>
  );
}

// ─── Top nav (role-aware) ─────────────────────────────────────────
function TopNav() {
  const auth    = useMockAuth();
  const role    = auth.role;
  const location = useLocation();
  const navRef   = useRef(null);
  const sliderRef = useRef(null);
  const itemRefs  = useRef({});
  const initialized = useRef(false);

  useEffect(() => {
    const slider = sliderRef.current;
    const nav    = navRef.current;
    if (!slider || !nav) return;
    const path = location.pathname;
    const el   = itemRefs.current[path];
    if (!el) { slider.style.opacity = '0'; return; }
    const navRect = nav.getBoundingClientRect();
    const elRect  = el.getBoundingClientRect();
    const left  = elRect.left - navRect.left;
    const width = elRect.width;
    if (!initialized.current) {
      slider.style.transition = 'none';
      slider.style.left    = `${left}px`;
      slider.style.width   = `${width}px`;
      slider.style.opacity = '1';
      requestAnimationFrame(() => {
        if (slider) slider.style.transition = 'left 0.28s cubic-bezier(0.4,0,0.2,1), width 0.28s cubic-bezier(0.4,0,0.2,1), opacity 0.2s';
      });
      initialized.current = true;
    } else {
      slider.style.left    = `${left}px`;
      slider.style.width   = `${width}px`;
      slider.style.opacity = '1';
    }
  }, [location.pathname, role]);

  const ref = (to) => (el) => { if (el) itemRefs.current[to] = el; };

  return (
    <nav ref={navRef} style={{ display: 'flex', gap: '0.4rem', flexWrap: 'nowrap', alignItems: 'center', marginLeft: 'auto', position: 'relative' }}>
      {/* sliding pill */}
      <div ref={sliderRef} style={{
        position: 'absolute', top: '50%', height: '1.8rem',
        transform: 'translateY(-50%)',
        background: 'rgba(255,255,255,0.2)',
        borderRadius: 6, pointerEvents: 'none', zIndex: 0, opacity: 0,
      }} />
      <NavLink to="/wo-dashboard"      innerRef={ref('/wo-dashboard')}>WO Board</NavLink>
      <NavLink to="/production-report" innerRef={ref('/production-report')}>Report</NavLink>
      <NavLink to="/routing-history"   innerRef={ref('/routing-history')}>History</NavLink>
      {(role === 'admin' || role === 'member') && <NavLink to="/sequence-builder" innerRef={ref('/sequence-builder')}>Sequence Builder</NavLink>}
      <NavLink to="/qc-board"          innerRef={ref('/qc-board')}>QC Board</NavLink>
      {(role === 'admin' || role === 'member') && <NavLink to="/oba" innerRef={ref('/oba')}>OBA</NavLink>}
      {role === 'admin' && <NavLink to="/route-admin" innerRef={ref('/route-admin')}>Route Admin</NavLink>}
      {role === 'admin' && (
        <>
          <span style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.2)', display: 'inline-block', margin: '0 0.25rem', flexShrink: 0 }} />
          <NavLink to="/system" innerRef={ref('/system')}>⚙️ System</NavLink>
        </>
      )}
    </nav>
  );
}

// ─── Auth guard (force login) ─────────────────────────────────────
function AuthGuard({ children }) {
  const auth = useMockAuth();
  if (!auth.isLoggedIn) return <Navigate to="/mes-auth" replace />;
  return children;
}

// ─── Role guard ───────────────────────────────────────────────────
function RoleGuard({ allowed, children }) {
  const auth = useMockAuth();
  if (!auth.isLoggedIn) return <Navigate to="/mes-auth" replace />;
  if (!allowed.includes(auth.role)) return <Navigate to="/wo-dashboard" replace />;
  return children;
}

// ─── Toast container ──────────────────────────────────────────────
const TOAST_COLORS = { success: '#10b981', error: '#ef4444', info: '#3b82f6' };
const TOAST_ICONS  = { success: '✅', error: '❌', info: 'ℹ️' };
let _toastId = 0;

function ToastContainer() {
  const [toasts, setToasts] = useState([]);
  const timers = useRef([]);

  useEffect(() => {
    const handler = (e) => {
      const { msg, type } = e.detail;
      const id = ++_toastId;
      setToasts(prev => [...prev, { id, msg, type }]);
      const tid = setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
      timers.current.push(tid);
    };
    window.addEventListener('app:toast', handler);
    return () => {
      window.removeEventListener('app:toast', handler);
      timers.current.forEach(clearTimeout);
    };
  }, []);

  return (
    <>
      <style>{`@keyframes toastIn { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:translateX(0); } }`}</style>
      {toasts.length > 0 && (
        <div style={{ position: 'fixed', top: '4.5rem', right: '1rem', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '0.5rem', pointerEvents: 'none' }}>
          {toasts.map(t => (
            <div key={t.id} style={{
              background: TOAST_COLORS[t.type] || TOAST_COLORS.success,
              color: '#fff', padding: '0.75rem 1.25rem', borderRadius: 8,
              fontSize: '0.875rem', fontWeight: 500,
              boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              animation: 'toastIn 0.25s ease',
              minWidth: 240, maxWidth: 360,
            }}>
              <span>{TOAST_ICONS[t.type] || TOAST_ICONS.success}</span>
              <span>{t.msg}</span>
            </div>
          ))}
        </div>
      )}
    </>
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
          <TopNav />
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

function DataManagementPanel() {
  const [importStatus, setImportStatus] = useState('');

  function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImportStatus('กำลังโหลด...');
    importData(file)
      .then(() => { setImportStatus('✅ นำเข้าสำเร็จ — หน้าจอจะอัปเดตอัตโนมัติ'); })
      .catch(err => { setImportStatus(`❌ ${err.message}`); });
    e.target.value = '';
  }

  return (
    <div className="panel stack" style={{ borderLeft: '4px solid #f59e0b' }}>
      <h2 className="panel__title">💾 Data Backup / Restore</h2>
      <p className="panel__subtitle">ข้อมูลทั้งหมดเก็บใน localStorage — ควร export backup ไว้เป็นประจำ</p>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          className="btn"
          style={{ background: '#10b981', borderColor: '#10b981', color: '#fff', fontWeight: 600, padding: '0.6rem 1.25rem' }}
          onClick={exportData}
        >
          ⬇️ Export Backup (JSON)
        </button>

        <label style={{ cursor: 'pointer' }}>
          <span
            className="btn"
            style={{ background: '#f59e0b', borderColor: '#f59e0b', color: '#fff', fontWeight: 600, padding: '0.6rem 1.25rem', display: 'inline-block' }}
          >
            ⬆️ Import / Restore
          </span>
          <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
        </label>
      </div>

      {importStatus && (
        <div className={`notice ${importStatus.startsWith('✅') ? 'ok' : importStatus.startsWith('❌') ? 'err' : 'info'}`}>
          {importStatus}
        </div>
      )}

      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
        <strong>คำแนะนำ:</strong> Export backup ไว้ในโฟลเดอร์แยก อาทิตย์ละครั้ง
        หรือก่อน/หลังทำงานสำคัญ<br />
        ห้ามกด "Clear browsing data → Site data" ใน Chrome มิฉะนั้นข้อมูลจะหายทั้งหมด
      </div>
    </div>
  );
}

function SystemPage() {
  const auth = useMockAuth();
  const allItems = [...DEV_ITEMS, { to: '/mes-auth', label: auth.isLoggedIn ? 'Logout' : 'Login' }];
  return (
    <section className="stack-lg">
      <div className="panel">
        <h1 className="panel__title">System &amp; Developer Tools</h1>
        <p className="panel__subtitle">Internal tools for developers — not part of regular operator workflow</p>
      </div>

      <DataManagementPanel />

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
        <ToastContainer />
        <Shell>
          <ErrorBoundary>
            <Routes>
              <Route path="/"                  element={<Navigate to="/wo-dashboard" replace />} />
              <Route path="/mes-auth"          element={<MesAuthPage />} />
              <Route path="/wo-dashboard"      element={<AuthGuard><WoDashboardPage /></AuthGuard>} />
              <Route path="/production-report" element={<AuthGuard><ProductionReportPage /></AuthGuard>} />
              <Route path="/routing-history"   element={<AuthGuard><RoutingHistoryPage /></AuthGuard>} />
              <Route path="/qc-board"          element={<AuthGuard><QcBoard /></AuthGuard>} />
              <Route path="/wo/:woId"          element={<AuthGuard><WoDetailPage /></AuthGuard>} />
              <Route path="/sequence-builder"  element={<RoleGuard allowed={['admin','member']}><SequenceBuilderPage /></RoleGuard>} />
              <Route path="/oba"               element={<RoleGuard allowed={['admin','member']}><ObaPage /></RoleGuard>} />
              <Route path="/wo/:woId/close"    element={<RoleGuard allowed={['admin','member']}><CloseWoPage /></RoleGuard>} />
              <Route path="/fai/:woId"         element={<RoleGuard allowed={['admin','member']}><FaiPage /></RoleGuard>} />
              <Route path="/route-admin"       element={<RoleGuard allowed={['admin']}><RouteAdminPage /></RoleGuard>} />
              <Route path="/system"            element={<RoleGuard allowed={['admin']}><SystemPage /></RoleGuard>} />
              <Route path="/mes-backbone"      element={<RoleGuard allowed={['admin']}><MesBackbonePage /></RoleGuard>} />
              <Route path="/pm-core-flow"      element={<RoleGuard allowed={['admin']}><PmCoreFlowPage /></RoleGuard>} />
              <Route path="/scm-cases"         element={<RoleGuard allowed={['admin']}><ScmCasesPage /></RoleGuard>} />
              <Route path="/sync-monitor"      element={<RoleGuard allowed={['admin']}><SyncMonitorPage /></RoleGuard>} />
              <Route path="/bom-editor"        element={<RoleGuard allowed={['admin']}><BomEditorPage /></RoleGuard>} />
              <Route path="/workspace"         element={<RoleGuard allowed={['admin']}><MesWorkspacePage /></RoleGuard>} />
              <Route path="/web-check"         element={<RoleGuard allowed={['admin']}><WebCheckPage /></RoleGuard>} />
              <Route path="*"                  element={<Navigate to="/wo-dashboard" replace />} />
            </Routes>
          </ErrorBoundary>
        </Shell>
      </HashRouter>
    </QueryClientProvider>
  );
}
