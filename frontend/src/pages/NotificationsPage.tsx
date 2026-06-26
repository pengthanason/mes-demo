import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications, useMarkRead, useMarkAllRead } from '../lib/notificationsApi';
import { Paginator } from '../components/Paginator';
import { timeAgo } from '../lib/format';

const TYPE_ICON: Record<string, string> = {
  WO_OPEN: '🔧', QC_FAIL: '❌', CR_APPROVED: '✅', WO_CLOSED: '✔️', REWORK: '🔨',
  DEFAULT: '🔔',
};

export function NotificationsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const { data, isLoading } = useNotifications(false);
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
            <p className="panel__subtitle">การแจ้งเตือนจากระบบ MES</p>
          </div>
          <button type="button" className="btn secondary" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
            {markAll.isPending ? 'กำลังทำ...' : 'Mark All Read'}
          </button>
        </div>

        {isLoading && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', marginTop: '1rem' }}>กำลังโหลด...</div>}

        {!isLoading && list.length === 0 && (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', marginTop: '1rem' }}>
            ยังไม่มีการแจ้งเตือน
          </div>
        )}

        <div className="stack" style={{ gap: 0, marginTop: list.length ? '0.5rem' : 0 }}>
          {pagedList.map(n => (
            <div
              key={n.id}
              onClick={() => handleClick(n)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.875rem',
                padding: '0.875rem 1rem',
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
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: n.isRead ? 400 : 600, fontSize: '0.9rem' }}>{n.title}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 2 }}>{n.message}</div>
              </div>
              <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }} title={new Date(n.createdAt).toLocaleString('th-TH')}>
                  {timeAgo(n.createdAt)}
                </span>
                {!n.isRead && (
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--brand)', display: 'inline-block' }} />
                )}
              </div>
            </div>
          ))}
        </div>
        <Paginator page={page} totalPages={totalPages} onPage={setPage} total={list.length} />
      </div>
    </section>
  );
}
