import React, { useState, useEffect, useRef } from 'react';
import { HashRouter, Routes, Route, Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useMockAuth } from './lib/useMockStore.ts';
import { mockLogout } from './lib/mockStore.ts';
import { ROLE_COLOR } from './lib/roles.ts';
import { MesAuthPage } from './pages/MesAuthPage.tsx';
import QcBoard from './pages/quality/index.jsx';
import { WoDetailPage } from './pages/WoDetailPage.tsx';
import { CloseWoPage } from './pages/CloseWoPage.tsx';
import { FaiPage } from './pages/FaiPage.tsx';
import { ProductionPlanPage } from './pages/ProductionPlanPage.tsx';
import { FourMChangePage } from './pages/FourMChangePage.tsx';
import { CrDetailPage } from './pages/CrDetailPage.tsx';
import { QcResultPage } from './pages/QcResultPage.tsx';
import { QaVerifyPage } from './pages/QaVerifyPage.tsx';
import { NotificationsPage } from './pages/NotificationsPage.tsx';
import { AdminPanelPage } from './pages/AdminPanelPage.tsx';
import { TraceabilityPage } from './pages/TraceabilityPage.tsx';
import { JigProjectPage } from './pages/JigProjectPage.tsx';
import { JigTestPage } from './pages/JigTestPage.tsx';
import { ScmCasesPage } from './pages/ScmCasesPage.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { IncomingKittingPage } from './pages/IncomingKittingPage.tsx';
import { useUnreadCount, useNotifications, useMarkRead } from './lib/notificationsApi.ts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ─── Sidebar nav items ─────────────────────────────────────────────
const MAIN_ITEMS = [
  { to: '/dashboard',        label: 'Dashboard' },
  { to: '/production-plan',  label: 'Production Plan' },
  { to: '/incoming',         label: 'Incoming & Kitting' },
  { to: '/qc-board',         label: 'QC Board' },
  { to: '/qc-result',        label: 'QC Result' },
  { to: '/jig-test',         label: 'Jig Test' },
  { to: '/traceability',     label: 'Traceability' },
  { to: '/4m-change',        label: '4M Change' },
  { to: '/scm-cases',        label: 'SCM Cases' },
  { to: '/equipment-borrow', label: 'ยืม-คืนอุปกรณ์' },
  { to: '/notifications',    label: 'Notifications' },
  { to: '/admin/panel',      label: 'Admin Panel' },
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
      onClick={(e) => {
        // ตอนแถบย่อ (มือถือ/ไม่มี hover): tap แรก = เปิดแถบก่อน ไม่ navigate
        if (!expanded) { e.preventDefault(); }
        onClick?.(e);
      }}
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

const VIEWER_ITEMS = ['/dashboard', '/4m-change', '/qc-board', '/qc-result', '/jig-test', '/traceability', '/equipment-borrow', '/notifications'];
const MEMBER_ITEMS = ['/dashboard', '/production-plan', '/incoming', '/4m-change', '/qc-board', '/qc-result', '/jig-test', '/scm-cases', '/traceability', '/equipment-borrow', '/notifications'];

function visibleMainItems(role) {
  if (!role || role === 'viewer') return MAIN_ITEMS.filter(i => VIEWER_ITEMS.includes(i.to));
  if (role === 'member') return MAIN_ITEMS.filter(i => MEMBER_ITEMS.includes(i.to));
  return MAIN_ITEMS; // admin
}

function Sidebar() {
  const [expanded, setExpanded] = useState(false);
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
      {/* Hamburger / logo row — กดเพื่อเปิด/ปิดได้ (รองรับ touch ที่ไม่มี hover) */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{
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
          cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, cursor: 'pointer', flexShrink: 0 }}>
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
          <SidebarItem key={item.to} to={item.to} label={item.label} expanded={expanded} onClick={() => setExpanded(true)} innerRef={setItemRef(item.to)} />
        ))}

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
            onClick={() => { if (!expanded) { setExpanded(true); } else { mockLogout(); } }}
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
          <SidebarItem to="/mes-auth" label="Login" expanded={expanded} onClick={() => setExpanded(true)} />
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

// label เต็มบน desktop / ย่อบนจอแคบ (สลับด้วย media query ใน Shell)
function NavLabel({ full, short }) {
  return (
    <>
      <span className="nav-label-full">{full}</span>
      <span className="nav-label-short">{short}</span>
    </>
  );
}

// ─── Notification Bell + Dropdown ─────────────────────────────────
const NOTIF_ICON = { WO_OPEN: '🔧', QC_FAIL: '❌', CR_APPROVED: '✅', WO_CLOSED: '✔️', REWORK: '🔨' };

function NotificationBell() {
  const { data: count = 0 } = useUnreadCount();
  const { data: notifs = [] } = useNotifications(false);
  const markRead = useMarkRead();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const recent = notifs.slice(0, 5);

  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function handleClick(n) {
    if (!n.isRead) markRead.mutate(n.id);
    setOpen(false);
    if (n.link) navigate(n.link);
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        title="Notifications"
        onClick={() => setOpen(v => !v)}
        style={{
          position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 36, height: 36, borderRadius: 8, flexShrink: 0, border: 'none', cursor: 'pointer',
          background: open ? 'rgba(255,255,255,0.15)' : 'transparent',
          color: 'rgba(255,255,255,0.8)', fontSize: '1.1rem', transition: 'background 0.15s',
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'transparent'; }}
      >
        🔔
        {count > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            background: '#ef4444', color: '#fff', fontSize: '0.6rem', fontWeight: 800,
            minWidth: 16, height: 16, borderRadius: 99,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 3px', lineHeight: 1, border: '1.5px solid #162d4a',
          }}>
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 340, maxWidth: '90vw',
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
          boxShadow: '0 12px 32px rgba(0,0,0,0.18)', zIndex: 300, overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderBottom: '1px solid #f1f5f9' }}>
            <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.9rem' }}>การแจ้งเตือน</span>
            {count > 0 && <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#ef4444' }}>{count} ใหม่</span>}
          </div>

          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {recent.length === 0 ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>ไม่มีการแจ้งเตือน</div>
            ) : recent.map(n => (
              <div
                key={n.id}
                onClick={() => handleClick(n)}
                style={{
                  display: 'flex', gap: '0.6rem', padding: '0.7rem 1rem', cursor: 'pointer',
                  borderBottom: '1px solid #f1f5f9',
                  background: n.isRead ? '#fff' : 'rgba(59,130,246,0.06)',
                  borderLeft: n.isRead ? '3px solid transparent' : '3px solid #3b82f6',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; }}
                onMouseLeave={e => { e.currentTarget.style.background = n.isRead ? '#fff' : 'rgba(59,130,246,0.06)'; }}
              >
                <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{NOTIF_ICON[n.type] ?? '🔔'}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: n.isRead ? 500 : 700, fontSize: '0.85rem', color: '#1e293b' }}>{n.title}</div>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.message}</div>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 2 }}>{new Date(n.createdAt).toLocaleString('th-TH')}</div>
                </div>
              </div>
            ))}
          </div>

          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            style={{ display: 'block', textAlign: 'center', padding: '0.7rem', fontSize: '0.85rem', fontWeight: 600, color: '#3b82f6', textDecoration: 'none', borderTop: '1px solid #f1f5f9' }}
          >
            ดูทั้งหมด →
          </Link>
        </div>
      )}
    </div>
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
    const left  = elRect.left - navRect.left + nav.scrollLeft;
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
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginLeft: 'auto', minWidth: 0, maxWidth: '100%' }}>
    <nav ref={navRef} style={{
      display: 'flex', gap: '0.4rem', flexWrap: 'nowrap', alignItems: 'center',
      position: 'relative', minWidth: 0,
      overflowX: 'auto', overflowY: 'hidden',
      scrollbarWidth: 'none', msOverflowStyle: 'none',
      WebkitOverflowScrolling: 'touch',
    }}>
      {/* sliding pill */}
      <div ref={sliderRef} style={{
        position: 'absolute', top: '50%', height: '1.8rem',
        transform: 'translateY(-50%)',
        background: 'rgba(255,255,255,0.2)',
        borderRadius: 6, pointerEvents: 'none', zIndex: 0, opacity: 0,
      }} />
      <NavLink to="/dashboard"       innerRef={ref('/dashboard')}><NavLabel full="Dashboard" short="Home" /></NavLink>
      {(role === 'admin' || role === 'member') && <NavLink to="/production-plan" innerRef={ref('/production-plan')}><NavLabel full="Production Plan" short="Plan" /></NavLink>}
      {(role === 'admin' || role === 'member') && <NavLink to="/incoming" innerRef={ref('/incoming')}><NavLabel full="Incoming & Kitting" short="คลัง" /></NavLink>}
      <NavLink to="/qc-board"        innerRef={ref('/qc-board')}><NavLabel full="QC Board" short="QC" /></NavLink>
      {(role === 'admin' || role === 'member') && <NavLink to="/qc-result" innerRef={ref('/qc-result')}><NavLabel full="QC Result" short="Result" /></NavLink>}
      <NavLink to="/jig-test"        innerRef={ref('/jig-test')}><NavLabel full="Jig Test" short="Jig" /></NavLink>
      <NavLink to="/traceability"    innerRef={ref('/traceability')}><NavLabel full="Traceability" short="Trace" /></NavLink>
      <NavLink to="/4m-change"       innerRef={ref('/4m-change')}><NavLabel full="4M Change" short="4M" /></NavLink>
      {(role === 'admin' || role === 'member') && <NavLink to="/scm-cases" innerRef={ref('/scm-cases')}><NavLabel full="SCM Cases" short="SCM" /></NavLink>}
      <NavLink to="/equipment-borrow" innerRef={ref('/equipment-borrow')}><NavLabel full="ยืม-คืนอุปกรณ์" short="ยืม-คืน" /></NavLink>
      {role === 'admin' && <NavLink to="/admin/panel" innerRef={ref('/admin/panel')}><NavLabel full="Admin Panel" short="Admin" /></NavLink>}
    </nav>
      <NotificationBell />
    </div>
  );
}

// ─── Equipment Borrow iframe page ────────────────────────────────
function EquipmentBorrowPage() {
  return (
    <div style={{ margin: '-1.5rem', overflow: 'hidden' }}>
      <iframe
        src="https://pengthanason.github.io/equipment-dashboard/"
        title="ระบบยืม-คืนอุปกรณ์"
        style={{ width: '100%', height: 'calc(100vh - 56px)', border: 'none', display: 'block' }}
      />
    </div>
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
  if (!allowed.includes(auth.role)) return <Navigate to="/dashboard" replace />;
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

      <div style={{ flex: 1, marginLeft: ICON_W, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#f1f5f9' }}>
        <style>{`
          .field input, .field select, .field textarea {
            width: 100%; padding: 0.55rem 0.75rem;
            border: 1px solid #e2e8f0; border-radius: 6px;
            font-size: 0.875rem; background-color: #fff; color: #334155;
            transition: border-color 0.2s, box-shadow 0.2s; box-sizing: border-box; outline: none;
            font-family: inherit;
          }
          .field input:focus, .field select:focus, .field textarea:focus {
            border-color: #3b82f6;
            box-shadow: 0 0 0 3px rgba(59,130,246,0.12);
          }
          .field span {
            display: block; margin-bottom: 0.35rem; font-weight: 600;
            color: #475569; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.05em;
          }
          .filters-grid {
            display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem; margin-bottom: 1.25rem; background: #fff;
            padding: 1.25rem; border-radius: 10px; border: 1px solid #e2e8f0;
            box-shadow: 0 1px 3px rgba(0,0,0,0.04);
          }
          header nav::-webkit-scrollbar { display: none; }
          .nav-label-short { display: none; }
          .app-header { padding: 0.875rem 1.5rem; }
          .app-main   { padding: 1.5rem; }
          .app-footer { padding: 1rem 1.5rem; }
          @media (max-width: 768px) {
            .nav-label-full  { display: none; }
            .nav-label-short { display: inline; }
          }
          @media (max-width: 600px) {
            .app-header { padding: 0.6rem 0.75rem; }
            .app-main   { padding: 0.75rem; }
            .app-footer { padding: 0.75rem; font-size: 0.72rem; }
          }
          @media (max-width: 380px) {
            .app-main { padding: 0.5rem; }
          }
        `}</style>

        {/* Top header */}
        <header className="app-header" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: '1rem', flexWrap: 'wrap',
          borderBottom: '1px solid #0f2744',
          background: '#162d4a',
          position: 'sticky', top: 0, zIndex: 100,
        }}>
          <TopNav />
        </header>

        <main className="app-main" style={{ maxWidth: 1380, margin: '0 auto', flex: 1, width: '100%', boxSizing: 'border-box' }}>
          {children}
        </main>

        <footer className="app-footer" style={{ marginBottom: '5px', borderTop: '1px solid #2d5a8e', textAlign: 'center', color: '#2d5a8e', fontSize: '0.8rem', flexShrink: 0 }}>
          © 2026 Synergy Technology · SYNTECH MES v0.1
        </footer>
      </div>
    </div>
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
              <Route path="/"                  element={<Navigate to="/dashboard" replace />} />
              <Route path="/mes-auth"          element={<MesAuthPage />} />
              <Route path="/dashboard"         element={<AuthGuard><DashboardPage /></AuthGuard>} />
              {/* legacy redirects */}
              <Route path="/wo-dashboard"      element={<Navigate to="/dashboard" replace />} />
              <Route path="/production-report" element={<Navigate to="/dashboard" replace />} />
              <Route path="/routing-history"   element={<Navigate to="/dashboard" replace />} />
              <Route path="/scm-cases"         element={<RoleGuard allowed={['admin','member']}><ScmCasesPage /></RoleGuard>} />
              <Route path="/jig-test"          element={<AuthGuard><JigTestPage /></AuthGuard>} />
              {/* active routes */}
              <Route path="/production-plan"   element={<RoleGuard allowed={['admin','member']}><ProductionPlanPage /></RoleGuard>} />
              <Route path="/incoming"          element={<RoleGuard allowed={['admin','member']}><IncomingKittingPage /></RoleGuard>} />
              <Route path="/kitting"           element={<Navigate to="/incoming" replace />} />
              <Route path="/4m-change"         element={<AuthGuard><FourMChangePage /></AuthGuard>} />
              <Route path="/4m-change/:crId"   element={<AuthGuard><CrDetailPage /></AuthGuard>} />
              <Route path="/qc-board"          element={<AuthGuard><QcBoard /></AuthGuard>} />
              <Route path="/qc-result"         element={<AuthGuard><QcResultPage /></AuthGuard>} />
              <Route path="/qc/:woId"          element={<RoleGuard allowed={['admin','member']}><QcResultPage /></RoleGuard>} />
              <Route path="/qa-verify/:reqId"  element={<RoleGuard allowed={['admin','member']}><QaVerifyPage /></RoleGuard>} />
              <Route path="/wo/:woId"          element={<AuthGuard><WoDetailPage /></AuthGuard>} />
              <Route path="/wo/:woId/close"    element={<RoleGuard allowed={['admin','member']}><CloseWoPage /></RoleGuard>} />
              <Route path="/fai/:woId"         element={<RoleGuard allowed={['admin','member']}><FaiPage /></RoleGuard>} />
              <Route path="/notifications"     element={<AuthGuard><NotificationsPage /></AuthGuard>} />
              <Route path="/traceability"      element={<AuthGuard><TraceabilityPage /></AuthGuard>} />
              <Route path="/jig-test/:projectCode" element={<AuthGuard><JigProjectPage /></AuthGuard>} />
              <Route path="/admin/panel"       element={<RoleGuard allowed={['admin']}><AdminPanelPage /></RoleGuard>} />
              <Route path="/equipment-borrow" element={<AuthGuard><EquipmentBorrowPage /></AuthGuard>} />
              <Route path="*"                  element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </ErrorBoundary>
        </Shell>
      </HashRouter>
    </QueryClientProvider>
  );
}
