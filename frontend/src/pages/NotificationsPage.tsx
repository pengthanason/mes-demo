import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wrench, XCircle, CheckCircle2, PackageCheck, Hammer, Bell, type LucideIcon } from 'lucide-react';
import { useNotifications, useMarkRead, useMarkAllRead } from '../lib/notificationsApi';
import { Paginator } from '../components/Paginator';
import { BlockState } from '../components/DataStates';
import { timeAgo } from '../lib/format';
import { showToast } from '../lib/toast';

// ไอคอน+สีต่อประเภท (เดิมเป็นอิโมจิ สีสัน/น้ำหนักภาพไม่คงเส้นคงวา — เปลี่ยนเป็นไอคอนชุดเดียวกับที่อื่นในแอป (lucide) ในตราวงกลมสี ดูเป็นมาตรฐานเดียวกัน)
const TYPE_META: Record<string, { icon: LucideIcon; color: string; bg: string; label: string }> = {
  WO_OPEN:     { icon: Wrench,       color: '#2563eb', bg: 'rgba(37, 99, 235, 0.12)',  label: 'Work Order Opened' },
  QC_FAIL:     { icon: XCircle,      color: '#dc2626', bg: 'rgba(220, 38, 38, 0.12)',  label: 'QC Failed' },
  CR_APPROVED: { icon: CheckCircle2, color: '#16a34a', bg: 'rgba(22, 163, 74, 0.12)',  label: 'Change Request Approved' },
  WO_CLOSED:   { icon: PackageCheck, color: '#0f766e', bg: 'rgba(15, 118, 110, 0.12)', label: 'Work Order Closed' },
  REWORK:      { icon: Hammer,       color: '#d97706', bg: 'rgba(217, 119, 6, 0.12)',  label: 'Rework' },
  DEFAULT:     { icon: Bell,         color: '#64748b', bg: 'rgba(100, 116, 139, 0.12)', label: 'Notification' },
};
const typeMeta = (t: string) => TYPE_META[t] ?? { ...TYPE_META.DEFAULT, label: t };

export function NotificationsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const NOTIF_ROW_H = 58;   // ความสูงคงที่ต่อรายการ (px) — ใช้ทั้งการ์ดจริงและช่องว่างที่เติม
  const { data, isLoading, isError, refetch } = useNotifications(false);
  const markRead = useMarkRead();
  const markAll  = useMarkAllRead();
  const [typeFilter, setTypeFilter] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  // ทั้งหมด เรียงตามเวลา ใหม่สุดอยู่บน
  const allList = useMemo(() => [...(data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [data]);
  const types = useMemo(() => [...new Set(allList.map(n => n.type))], [allList]);
  const list = useMemo(() => {
    let l = allList;
    if (typeFilter) l = l.filter(n => n.type === typeFilter);
    if (unreadOnly) l = l.filter(n => !n.isRead);
    return l;
  }, [allList, typeFilter, unreadOnly]);
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const pagedList = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleClick(n: typeof list[0]) {
    if (!n.isRead) markRead.mutate(n.id);
    if (n.link) navigate(n.link);
  }

  return (
    <section className="stack-lg">
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 className="panel__title">Notifications</h1>
            <p className="panel__subtitle">Notifications from the MES system</p>
          </div>
          <button type="button" className="btn secondary" disabled={markAll.isPending}
            onClick={() => markAll.mutate(undefined, {
              onSuccess: () => showToast('All notifications marked as read', 'success'),
              onError: (e: any) => showToast(e?.message || 'Failed to mark all read', 'error'),
            })}>
            {markAll.isPending ? 'Working...' : 'Mark All Read'}
          </button>
        </div>

        {allList.length > 0 && (
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end', marginTop: '1rem' }}>
            <label className="field" style={{ flex: '0 1 200px' }}>
              <span>Type</span>
              <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}>
                <option value="">All types</option>
                {types.map(t => <option key={t} value={t}>{typeMeta(t).label}</option>)}
              </select>
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: 'var(--text-muted)', paddingBottom: 10 }}>
              <input type="checkbox" checked={unreadOnly} onChange={e => { setUnreadOnly(e.target.checked); setPage(1); }} style={{ width: 16, height: 16 }} />
              Unread only
            </label>
          </div>
        )}

        {isLoading && <BlockState state="loading" />}

        {!isLoading && isError && <BlockState state="error" onRetry={() => refetch()} />}

        {!isLoading && !isError && allList.length === 0 && (
          <BlockState state="empty" emptyText="No notifications yet" />
        )}

        {!isLoading && !isError && allList.length > 0 && list.length === 0 && (
          <BlockState state="empty" emptyText="No notifications match the filter" />
        )}

        <div className="stack" style={{ gap: 0, marginTop: list.length ? '0.5rem' : 0 }}>
          {pagedList.map(n => {
            const meta = typeMeta(n.type);
            const Icon = meta.icon;
            return (
            <div
              key={n.id}
              onClick={() => handleClick(n)}
              role={n.link ? 'button' : undefined} tabIndex={n.link ? 0 : undefined}
              onKeyDown={n.link ? (e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(n); } }) : undefined}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.875rem',
                padding: '0.875rem 1rem',
                // ล็อกความสูงต่อรายการ — ข้อความยาวไม่เท่ากันทำให้การ์ดสูงไม่เท่า
                // → รวมกันแล้วความสูงลิสต์เปลี่ยนทุกหน้า ปุ่มเปลี่ยนหน้าขยับ (กดรัวๆ พลาด)
                height: NOTIF_ROW_H, overflow: 'hidden',
                background: n.isRead ? 'transparent' : 'rgba(46,125,79,0.06)',
                borderLeft: n.isRead ? '3px solid transparent' : '3px solid var(--brand)',
                borderRadius: 6,
                cursor: n.link ? 'pointer' : 'default',
                marginBottom: 2,
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { if (n.link) (e.currentTarget as HTMLDivElement).style.background = 'rgba(46,125,79,0.1)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = n.isRead ? 'transparent' : 'rgba(46,125,79,0.06)'; }}
            >
              <span title={meta.label} style={{
                width: 34, height: 34, borderRadius: '50%', background: meta.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Icon size={17} color={meta.color} strokeWidth={2.25} />
              </span>
              {/* ตัดข้อความยาวด้วย … (hover ดูเต็มได้จาก title) — กันการ์ดสูงเกิน NOTIF_ROW_H */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: n.isRead ? 400 : 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={n.title}>{n.title}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={n.message}>{n.message}</div>
              </div>
              <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }} title={new Date(n.createdAt).toLocaleString('en-GB')}>
                  {timeAgo(n.createdAt)}
                </span>
                {!n.isRead && (
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--brand)', display: 'inline-block' }} />
                )}
              </div>
            </div>
            );
          })}
          {/* ช่องว่างเติมให้ครบหน้า — ความสูงลิสต์คงที่ ปุ่มเปลี่ยนหน้าไม่ขยับ (ข้ามเมื่อมีหน้าเดียว) */}
          {totalPages > 1 && Array.from({ length: Math.max(0, PAGE_SIZE - pagedList.length) }, (_, i) => (
            <div key={`__nfill-${i}`} aria-hidden="true" style={{ height: NOTIF_ROW_H, marginBottom: 2 }} />
          ))}
        </div>
        <Paginator page={page} totalPages={totalPages} onPage={setPage} total={list.length} />
      </div>
    </section>
  );
}
