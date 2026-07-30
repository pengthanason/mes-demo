import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications, useMarkRead, useMarkAllRead } from '../lib/notificationsApi';
import { Paginator } from '../components/Paginator';
import { BlockState } from '../components/DataStates';
import { timeAgo } from '../lib/format';
import { showToast } from '../lib/toast';

const TYPE_ICON: Record<string, string> = {
  WO_OPEN: '🔧', QC_FAIL: '❌', CR_APPROVED: '✅', WO_CLOSED: '✔️', REWORK: '🔨',
  DEFAULT: '🔔',
};

export function NotificationsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const NOTIF_ROW_H = 58;   // ความสูงคงที่ต่อรายการ (px) — ใช้ทั้งการ์ดจริงและช่องว่างที่เติม
  const { data, isLoading, isError, refetch } = useNotifications(false);
  const markRead = useMarkRead();
  const markAll  = useMarkAllRead();
  // ทั้งหมด เรียงตามเวลา ใหม่สุดอยู่บน
  const list = [...(data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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

        {isLoading && <BlockState state="loading" />}

        {!isLoading && isError && <BlockState state="error" onRetry={() => refetch()} />}

        {!isLoading && !isError && list.length === 0 && (
          <BlockState state="empty" emptyText="No notifications yet" />
        )}

        <div className="stack" style={{ gap: 0, marginTop: list.length ? '0.5rem' : 0 }}>
          {pagedList.map(n => (
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
              <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>{TYPE_ICON[n.type] ?? TYPE_ICON.DEFAULT}</span>
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
          ))}
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
