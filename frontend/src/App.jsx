import React, { useState, useEffect, useRef } from 'react';
import { HashRouter, Routes, Route, Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useMockAuth } from './lib/useMockStore.ts';
import { mockLogout } from './lib/mockStore.ts';
import { ROLE_COLOR } from './lib/roles.ts';
import { MesAuthPage } from './pages/MesAuthPage.tsx';
import { WoDetailPage } from './pages/WoDetailPage.tsx';
import { CloseWoPage } from './pages/CloseWoPage.tsx';
import { FaiPage } from './pages/FaiPage.tsx';
import { ProductionPlanPage } from './pages/ProductionPlanPage.tsx';
import { ObaPage } from './pages/ObaPage.tsx';
import { FourMChangePage } from './pages/FourMChangePage.tsx';
import { CrDetailPage } from './pages/CrDetailPage.tsx';
import { QcResultPage } from './pages/QcResultPage.tsx';
import { QaVerifyPage } from './pages/QaVerifyPage.tsx';
import { NotificationsPage } from './pages/NotificationsPage.tsx';
import { AdminPanelPage } from './pages/AdminPanelPage.tsx';
import { JigProjectPage } from './pages/JigProjectPage.tsx';
import { JigTestPage } from './pages/JigTestPage.tsx';
import { ScmCasesPage } from './pages/ScmCasesPage.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { IncomingKittingPage } from './pages/IncomingKittingPage.tsx';
import { WorkOrdersPage } from './pages/WorkOrdersPage.tsx';
import { QcPage } from './pages/QcPage.tsx';
import { useUnreadCount, useNotifications, useMarkRead } from './lib/notificationsApi.ts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ─── Sidebar nav items ─────────────────────────────────────────────
// sub = เมนูย่อย (แท็บในหน้า) → คลิกไป ?tab=<tab> · แท็บแรก = ค่าเริ่มต้นของหน้า
const MAIN_ITEMS = [
  { to: '/dashboard',        label: 'Dashboard' },
  { to: '/production-plan',  label: 'Production Plan', sub: [
    { tab: 'add',      label: 'Production Plan' },
    { tab: 'workflow', label: 'Workflow' },
  ] },
  { to: '/incoming',         label: 'Incoming & Kitting' },
  { to: '/work-orders',      label: 'Work Orders' },
  { to: '/jig-test',         label: 'Jig Test' },
  { to: '/oba',              label: 'OBA' },
  { to: '/4m-change',        label: '4M Change' },
  { to: '/scm-cases',        label: 'SCM Cases' },
  { to: '/qc-board',         label: 'QC', sub: [
    { tab: 'board',  label: 'QC Board' },
    { tab: 'result', label: 'QC Result' },
    { tab: 'rework', label: 'Rework' },
  ] },
  { to: '/equipment-borrow', label: 'Equipment Borrow' },
  { to: '/notifications',    label: 'Notifications' },
  { to: '/admin/panel',      label: 'Admin Panel', sub: [
    { tab: 'users', label: 'จัดการผู้ใช้' },
    { tab: 'audit', label: 'Audit Log' },
  ] },
];

const SIDEBAR_BG   = 'var(--sidebar-bg)';
const SIDEBAR_TEXT = 'var(--frame-text)';
const SIDEBAR_ACTIVE_BG = 'var(--frame-active-bg)';
const SIDEBAR_HOVER_BG  = 'var(--frame-hover-bg)';

// ─── Sidebar ───────────────────────────────────────────────────────
const SIDEBAR_W = 220; // expanded width
const ICON_W    = 58;  // collapsed width (icon strip)

// hook: เช็คขนาดจอ — desktop (เปิดค้าง) vs มือถือ (กดเปิด/ปิด)
function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = () => setMatches(mq.matches);
    handler();
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [query]);
  return matches;
}

// route ย่อยที่ prefix ไม่ตรงกับเมนู → ให้ยังไฮไลต์เมนูแม่ (เช่น เปิด WO รายตัว = ยังอยู่ Work Orders)
const SIDEBAR_ALIAS = {
  '/work-orders': ['/wo/', '/fai/'],
  '/qc-board':    ['/qc/', '/qa-verify/'],
};
function menuActive(path, to) {
  if (path === to || path.startsWith(`${to}/`)) return true;          // ตรง หรือเป็น sub-route prefix เดียวกัน (เช่น /4m-change/:id, /jig-test/:code)
  return (SIDEBAR_ALIAS[to] || []).some(p => path.startsWith(p));      // sub-route คนละ prefix
}

// เมนูย่อย (แท็บ) — ลิงก์ไป ?tab= · แสดงเยื้องเข้ามาใต้เมนูแม่ (accordion)
function SubLink({ to, label, active, onClick, innerRef }) {
  const [hov, setHov] = useState(false);
  return (
    <Link
      ref={innerRef}
      to={to}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'block',
        padding: '0.45rem 0.75rem 0.45rem 1.75rem',
        borderRadius: 6,
        fontSize: '0.95rem',
        color: (active || hov) ? 'var(--frame-text-active)' : 'rgba(255,255,255,0.62)',
        background: 'transparent',   // ไฮไลต์ใช้ pill ที่เลื่อนได้ (ครอบทั้งเมนูหลัก/ย่อย) · hover = แค่ตัวอักษรขาว
        fontWeight: active ? 600 : 400,
        textDecoration: 'none',
        marginBottom: 2,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        position: 'relative',
        zIndex: 1,
        transition: 'color 0.15s',
      }}
    >
      {label}
    </Link>
  );
}

function SidebarItem({ to, label, expanded, onClick, innerRef, external, hasSub, subOpen }) {
  const location = useLocation();
  const isActive = !external && menuActive(location.pathname, to);
  const [hov, setHov] = useState(false);
  const labelNode = hasSub ? (
    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      <span style={{ fontSize: 10, opacity: 0.7, transition: 'transform 0.15s', transform: subOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▾</span>
    </span>
  ) : label;
  const itemStyle = {
    display: 'block',
    padding: '0.55rem 0.75rem',
    borderRadius: 6,
    fontSize: '1.02rem',
    color: (isActive || hov) ? 'var(--frame-text-active)' : SIDEBAR_TEXT,
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
    userSelect: 'none',
  };
  // เมนูลิงก์ภายนอก (เช่น Traceability) — กดแล้วเปิดแท็บใหม่ ไม่เข้าหน้าในแอป
  if (external) {
    return (
      <a
        ref={innerRef}
        href={external}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          // ตอนแถบย่อ: tap แรก = เปิดแถบก่อน ไม่เปิดลิงก์
          if (!expanded) { e.preventDefault(); }
          onClick?.(e);
        }}
        title={!expanded ? label : undefined}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={itemStyle}
      >
        {expanded ? `${label} ↗` : ''}
      </a>
    );
  }
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
      style={itemStyle}
    >
      {expanded ? labelNode : ''}
    </Link>
  );
}

const VIEWER_ITEMS = ['/dashboard', '/4m-change', '/qc-board', '/jig-test', '/equipment-borrow', '/notifications'];
const MEMBER_ITEMS = ['/dashboard', '/production-plan', '/incoming', '/work-orders', '/4m-change', '/qc-board', '/jig-test', '/oba', '/scm-cases', '/equipment-borrow', '/notifications'];

function visibleMainItems(role) {
  if (!role || role === 'viewer') return MAIN_ITEMS.filter(i => VIEWER_ITEMS.includes(i.to));
  if (role === 'member') return MAIN_ITEMS.filter(i => MEMBER_ITEMS.includes(i.to));
  return MAIN_ITEMS; // admin
}

function Sidebar({ expanded, setExpanded, isDesktop }) {
  // state expanded/isDesktop ถูกยกไปไว้ที่ Shell แล้ว — แชร์ให้ content ดันตามความกว้าง sidebar (กันทับตอนจอเล็ก/ซูม)
  const auth     = useMockAuth();
  const location = useLocation();
  const items    = visibleMainItems(auth.role);
  const listRef   = useRef(null);
  const sliderRef = useRef(null);
  const itemRefs  = useRef({});
  const initialized = useRef(false);
  const [openKey, setOpenKey] = useState(null);   // เมนูแม่ที่กำลัง hover → กาง accordion เมนูย่อย
  const searchTab = new URLSearchParams(location.search).get('tab');
  const SLIDE_TR = 'top 0.28s cubic-bezier(0.4,0,0.2,1), height 0.28s cubic-bezier(0.4,0,0.2,1), opacity 0.15s';

  // element ที่ active จริง — เมนูย่อยที่เลือกอยู่ (ถ้าหน้านั้นมีแท็บ) ไม่งั้นเมนูหลัก → แถบไฮไลต์ครอบทั้งหลัก/รอง
  const resolveActiveEl = () => {
    const activeItem = items.find(it => menuActive(location.pathname, it.to));
    if (!activeItem) return null;
    if (activeItem.sub && activeItem.sub.length) {
      const eff = searchTab || activeItem.sub[0].tab;
      return itemRefs.current[`${activeItem.to}?tab=${eff}`] || itemRefs.current[activeItem.to] || null;
    }
    return itemRefs.current[activeItem.to] || null;
  };

  // (A) เปลี่ยนหน้า/แท็บย่อย/เปิด-ปิดแถบ → แถบไฮไลต์ค่อยๆ slide ไปช่อง active ใหม่ (ทั้งเมนูหลักและเมนูย่อย)
  useEffect(() => {
    const slider = sliderRef.current;
    const list   = listRef.current;
    if (!slider || !list) return;
    if (!expanded) { slider.style.opacity = '0'; return; }
    const el = resolveActiveEl();
    if (!el) { slider.style.opacity = '0'; return; }
    const apply = () => { slider.style.top = `${el.offsetTop}px`; slider.style.height = `${el.offsetHeight}px`; slider.style.opacity = '1'; };
    if (!initialized.current) {
      slider.style.transition = 'none';
      apply();
      requestAnimationFrame(() => { if (slider) slider.style.transition = SLIDE_TR; });
      initialized.current = true;
      return;
    }
    slider.style.transition = SLIDE_TR;
    // chase ช่วงสั้นๆ เผื่อ accordion ของหน้าใหม่กำลังกาง (target ยังขยับ) → pill slide ตามจนนิ่ง
    let raf; let stopped = false;
    const t0 = performance.now();
    const step = (now) => { apply(); if (!stopped && now - t0 < 340) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => { stopped = true; cancelAnimationFrame(raf); };
  }, [location.pathname, location.search, auth.role, expanded]);   // eslint-disable-line react-hooks/exhaustive-deps

  // (B) accordion เปิด/ปิด (hover) → เมนูอื่นขยับตำแหน่ง · ให้แถบไฮไลต์ตามช่อง active แบบเรียลไทม์ทุกเฟรม (sync เป๊ะ ไม่หน่วง)
  useEffect(() => {
    const slider = sliderRef.current;
    if (!slider || !expanded) return;
    const el = resolveActiveEl();
    if (!el) return;
    slider.style.transition = 'none';   // ตามช่องเฟรมต่อเฟรม ไม่ให้มี lag ซ้อน
    let raf; let stopped = false;
    const t0 = performance.now();
    const follow = (now) => {
      slider.style.top = `${el.offsetTop}px`;
      slider.style.height = `${el.offsetHeight}px`;
      if (!stopped && now - t0 < 340) raf = requestAnimationFrame(follow);   // ตามจนกว่า accordion (0.3s) จะเลื่อนจบ
      else slider.style.transition = SLIDE_TR;
    };
    raf = requestAnimationFrame(follow);
    return () => { stopped = true; cancelAnimationFrame(raf); slider.style.transition = SLIDE_TR; };
  }, [openKey]);   // eslint-disable-line react-hooks/exhaustive-deps

  const setItemRef = (to) => (el) => { if (el) itemRefs.current[to] = el; else delete itemRefs.current[to]; };

  return (
    <div
      // เดสก์ท็อป: เอาเมาส์ชี้เข้าแถบ = กางอัตโนมัติ · ออก = ยุบ + ปิด accordion
      onMouseEnter={() => { if (isDesktop) setExpanded(true); }}
      onMouseLeave={() => { if (isDesktop) { setExpanded(false); setOpenKey(null); } }}
      onClick={() => { if (!expanded) setExpanded(true); }}   // มือถือ (ไม่มี hover): แตะที่แถบตอนยุบ = เปิด
      style={{
        position: 'fixed',
        left: 0, top: 0, bottom: 0,
        width: expanded ? SIDEBAR_W : ICON_W,
        background: SIDEBAR_BG,
        borderRight: '1px solid var(--frame-line)',
        transition: 'width 0.2s ease',
        overflow: 'hidden',
        zIndex: 200,
        boxShadow: expanded ? '4px 0 24px rgba(0,0,0,0.25)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',   // กันคลิกตัวอักษรในเมนู/role/ชื่อ แล้วขึ้น caret พิมพ์
        cursor: expanded ? 'default' : 'pointer',   // ยุบ=มือทั้งแถบ(กดเปิด) · เปิด=มือเฉพาะเมนู (พื้นที่ว่าง=ลูกศร)
      }}
    >
      {/* โลโก้/หัว sidebar — กดปุ่มสามขีดเพื่อเปิด/ปิด (ทั้งคอม+มือถือ) */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: expanded ? 'flex-start' : 'center',
          gap: '0.75rem',
          padding: expanded ? '0 0.875rem' : '0',
          borderBottom: '1px solid var(--frame-line)',
          marginBottom: '0.5rem',
          flexShrink: 0,
          height: 'var(--topbar-h)',
          userSelect: 'none',
          cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, cursor: 'pointer', flexShrink: 0 }}>
          <span style={{ display: 'block', width: 24, height: 2.5, background: 'var(--frame-logo)', borderRadius: 2 }} />
          <span style={{ display: 'block', width: 24, height: 2.5, background: 'var(--frame-logo)', borderRadius: 2 }} />
          <span style={{ display: 'block', width: 24, height: 2.5, background: 'var(--frame-logo)', borderRadius: 2 }} />
        </div>
        {expanded && (
          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--frame-logo)', whiteSpace: 'nowrap', letterSpacing: '0.02em' }}>
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
        {items.map(item => {
          const hasSub = expanded && item.sub && item.sub.length > 0;
          const parentActive = menuActive(location.pathname, item.to);
          const open = hasSub && (openKey === item.to || parentActive);   // กางเมื่อ hover เมนูแม่ หรือกำลังอยู่หน้านั้น
          const effTab = searchTab || (item.sub ? item.sub[0].tab : null);
          return (
            <div key={item.to} onMouseEnter={() => setOpenKey(item.to)}>
              <SidebarItem to={item.to} label={item.label} external={item.external} expanded={expanded}
                onClick={() => setExpanded(isDesktop)} innerRef={setItemRef(item.to)}
                hasSub={hasSub} subOpen={open} />
              {hasSub && (
                // เมนูย่อย: animate ความสูงด้วย grid-rows 0fr↔1fr → ค่อยๆ เปิด/ปิด ลื่นๆ
                <div style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', transition: 'grid-template-rows 0.3s cubic-bezier(0.4,0,0.2,1)' }}>
                  <div style={{ overflow: 'hidden', minHeight: 0 }}>
                    {item.sub.map(s => (
                      <SubLink key={s.tab} to={`${item.to}?tab=${s.tab}`} label={s.label}
                        active={parentActive && effTab === s.tab}
                        innerRef={setItemRef(`${item.to}?tab=${s.tab}`)}
                        onClick={() => setExpanded(isDesktop)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

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
          <SidebarItem to="/mes-auth" label="Login" expanded={expanded} onClick={() => setExpanded(isDesktop)} />
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
          background: open ? 'var(--frame-active-bg)' : 'transparent',
          color: 'var(--frame-text)', fontSize: '1.1rem', transition: 'background 0.15s',
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.background = 'var(--frame-hover-bg)'; }}
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
                  background: n.isRead ? '#fff' : 'rgba(46,125,79,0.07)',
                  borderLeft: n.isRead ? '3px solid transparent' : '3px solid var(--brand)',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; }}
                onMouseLeave={e => { e.currentTarget.style.background = n.isRead ? '#fff' : 'rgba(46,125,79,0.07)'; }}
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
            style={{ display: 'block', textAlign: 'center', padding: '0.7rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand)', textDecoration: 'none', borderTop: '1px solid #f1f5f9' }}
          >
            ดูทั้งหมด →
          </Link>
        </div>
      )}
    </div>
  );
}

// ─── Equipment Borrow iframe page ────────────────────────────────
function EquipmentBorrowPage() {
  return (
    <div style={{ margin: '-1.5rem', overflow: 'hidden' }}>
      <iframe
        src={`${import.meta.env.BASE_URL}equipment-borrow/index.html`}
        title="ระบบยืม-คืนอุปกรณ์"
        style={{ width: '100%', height: 'calc(100vh - var(--topbar-h))', border: 'none', display: 'block' }}
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

// ─── Top info bar (นาฬิกา + สถานะ) — แทนแถบเมนู (เมนูย้ายไปอยู่ sidebar) ───
function TopBar() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const dateStr = now.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' });
  const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', minWidth: 0, color: 'var(--frame-text)' }}>
        <span className="topbar-extra" style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{dateStr}</span>
        <span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#fff', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>{timeStr}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.76rem', whiteSpace: 'nowrap' }}>
          <span style={{ width: 8, height: 8, borderRadius: 99, background: '#4ade80', boxShadow: '0 0 0 3px rgba(74,222,128,0.25)', display: 'inline-block' }} />
          ออนไลน์
        </span>
      </div>
      <NotificationBell />
    </>
  );
}

// ─── Shell ─────────────────────────────────────────────────────────
function Shell({ children }) {
  const location = useLocation();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [expanded, setExpanded] = useState(false);   // เริ่มยุบเสมอ — เดสก์ท็อป: เอาเมาส์ชี้เข้าแถบ = กางอัตโนมัติ · มือถือ: แตะเปิด
  // เปิด sidebar = เนื้อหาขยับขวา "นิดเดียว" (SHIFT_ON_OPEN) ไม่ดันเต็มความกว้าง sidebar · sidebar กางทับส่วนที่เหลือแบบ drawer
  // เนื้อหายังอยู่กึ่งกลาง (margin auto) · ปรับเลข SHIFT_ON_OPEN เพื่อเพิ่ม/ลดระยะขยับ (0 = ไม่ขยับเลย)
  const SHIFT_ON_OPEN =  150;
  const contentLeft = isDesktop && expanded ? ICON_W + SHIFT_ON_OPEN : ICON_W;
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar expanded={expanded} setExpanded={setExpanded} isDesktop={isDesktop} />

      <div style={{ flex: 1, marginLeft: contentLeft, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#f1f5f9', transition: 'margin-left 0.2s ease' }}>
        <style>{`
          .field input, .field select, .field textarea {
            width: 100%; padding: 0.55rem 0.75rem;
            border: 1px solid #e2e8f0; border-radius: 6px;
            font-size: 0.875rem; background-color: #fff; color: #334155;
            transition: border-color 0.2s, box-shadow 0.2s; box-sizing: border-box; outline: none;
            font-family: inherit;
          }
          .field input:focus, .field select:focus, .field textarea:focus {
            border-color: var(--brand);
            box-shadow: 0 0 0 3px rgba(0,0,0,0.12);
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
          .app-header { padding: 0 1.5rem; }
          .app-main   { padding: 1.5rem; }
          .app-footer { padding: 1rem 1.5rem; }
          @media (max-width: 768px) {
            .nav-label-full  { display: none; }
            .nav-label-short { display: inline; }
          }
          @media (max-width: 600px) {
            .app-header { padding: 0 0.75rem; }
            .app-main   { padding: 0.75rem; }
            .app-footer { padding: 0.75rem; font-size: 0.72rem; }
            .topbar-extra { display: none !important; }
          }
          @media (max-width: 380px) {
            .app-main { padding: 0.5rem; }
          }
        `}</style>

        {/* Top header */}
        <header className="app-header" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          gap: '1.1rem', flexWrap: 'nowrap',
          borderBottom: '1px solid var(--frame-line)',
          background: 'var(--header-bg)',
          position: 'sticky', top: 0, zIndex: 100,
          height: 'var(--topbar-h)',
        }}>
          <TopBar />
        </header>

        <main className="app-main" style={{ maxWidth: 1380, margin: '0 auto', flex: 1, width: '100%', boxSizing: 'border-box' }}>
          <div key={location.pathname} className="page-fade">{children}</div>
        </main>

        <footer className="app-footer" style={{ marginBottom: '5px', borderTop: '1px solid var(--border-color)', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', flexShrink: 0 }}>
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
              <Route path="/wo-dashboard"      element={<Navigate to="/work-orders" replace />} />
              <Route path="/production-report" element={<Navigate to="/dashboard" replace />} />
              <Route path="/routing-history"   element={<Navigate to="/dashboard" replace />} />
              <Route path="/scm-cases"         element={<RoleGuard allowed={['admin','member']}><ScmCasesPage /></RoleGuard>} />
              <Route path="/jig-test"          element={<AuthGuard><JigTestPage /></AuthGuard>} />
              {/* active routes */}
              <Route path="/production-plan"   element={<RoleGuard allowed={['admin','member']}><ProductionPlanPage /></RoleGuard>} />
              <Route path="/oba"               element={<RoleGuard allowed={['admin','member']}><ObaPage /></RoleGuard>} />
              <Route path="/incoming"          element={<RoleGuard allowed={['admin','member']}><IncomingKittingPage /></RoleGuard>} />
              <Route path="/kitting"           element={<Navigate to="/incoming" replace />} />
              <Route path="/4m-change"         element={<AuthGuard><FourMChangePage /></AuthGuard>} />
              <Route path="/4m-change/:crId"   element={<AuthGuard><CrDetailPage /></AuthGuard>} />
              <Route path="/work-orders"       element={<RoleGuard allowed={['admin','member']}><WorkOrdersPage /></RoleGuard>} />
              <Route path="/qc-board"          element={<AuthGuard><QcPage /></AuthGuard>} />
              <Route path="/qc-result"         element={<Navigate to="/qc-board" replace />} />
              <Route path="/qc/:woId"          element={<RoleGuard allowed={['admin','member']}><QcResultPage /></RoleGuard>} />
              <Route path="/qa-verify/:reqId"  element={<RoleGuard allowed={['admin','member']}><QaVerifyPage /></RoleGuard>} />
              <Route path="/wo/:woId"          element={<AuthGuard><WoDetailPage /></AuthGuard>} />
              <Route path="/wo/:woId/close"    element={<RoleGuard allowed={['admin','member']}><CloseWoPage /></RoleGuard>} />
              <Route path="/fai/:woId"         element={<RoleGuard allowed={['admin','member']}><FaiPage /></RoleGuard>} />
              <Route path="/notifications"     element={<AuthGuard><NotificationsPage /></AuthGuard>} />
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
