import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications, useMarkRead, useMarkAllRead } from '../lib/notificationsApi';

const TYPE_ICON: Record<string, string> = {
  WO_OPEN: '🔧', QC_FAIL: '❌', CR_APPROVED: '✅', WO_CLOSED: '✔️', REWORK: '🔨',
  DEFAULT: '🔔',
};

export function NotificationsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'unread' | 'all'>('unread');
  const { data, isLoading } = useNotifications(tab === 'unread');
  const markRead = useMarkRead();
  const markAll  = useMarkAllRead();
  const list = data ?? [];

  function handleClick(n: typeof list[0]) {
    if (!n.isRead) markRead.mutate(n.id);
    if (n.link) navigate(n.link);
  }

  return (
    <section className="stack-lg" style={{ maxWidth: 720, margin: '0 auto' }}>
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

        <div className="mes-module-tabs" style={{ marginTop: '1.25rem' }}>
          <button className={`mes-module-tab ${tab === 'unread' ? 'active' : ''}`} onClick={() => setTab('unread')}>
            ยังไม่อ่าน
          </button>
          <button className={`mes-module-tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>
            ทั้งหมด
          </button>
        </div>

        {isLoading && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>กำลังโหลด...</div>}

        {!isLoading && list.length === 0 && (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            {tab === 'unread' ? '✓ ไม่มีการแจ้งเตือนที่ยังไม่อ่าน' : 'ยังไม่มีการแจ้งเตือน'}
          </div>
        )}

        <div className="stack" style={{ gap: 0, marginTop: list.length ? '0.5rem' : 0 }}>
          {list.map(n => (
            <div
              key={n.id}
              onClick={() => handleClick(n)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.875rem',
                padding: '0.875rem 1rem',
                background: n.isRead ? 'transparent' : 'rgba(59,130,246,0.06)',
                borderLeft: n.isRead ? '3px solid transparent' : '3px solid #3b82f6',
                borderRadius: 6,
                cursor: n.link ? 'pointer' : 'default',
                marginBottom: 2,
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { if (n.link) (e.currentTarget as HTMLDivElement).style.background = 'rgba(59,130,246,0.1)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = n.isRead ? 'transparent' : 'rgba(59,130,246,0.06)'; }}
            >
              <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>{TYPE_ICON[n.type] ?? TYPE_ICON.DEFAULT}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: n.isRead ? 400 : 600, fontSize: '0.9rem' }}>{n.title}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 2 }}>{n.message}</div>
              </div>
              <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {new Date(n.createdAt).toLocaleDateString('th-TH')}
                </span>
                {!n.isRead && (
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }} />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
