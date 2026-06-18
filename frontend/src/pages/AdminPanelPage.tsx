import { useState } from 'react';
import { useMockAuth } from '../lib/useMockStore';
import {
  useAdminUsers, useAdminUserCreate, useAdminUserUpdate, useAdminUserDelete,
  useAuditLogs, AppRole, AppUser,
} from '../lib/adminApi';

const ROLES: AppRole[] = ['ADMIN', 'MEMBER', 'VIEWER'];
const ROLE_BADGE: Record<AppRole, string> = { ADMIN: '#ef4444', MEMBER: '#3b82f6', VIEWER: '#6b7280' };

function RoleBadge({ role }: { role: AppRole }) {
  return (
    <span style={{ background: ROLE_BADGE[role], color: '#fff', fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99 }}>
      {role}
    </span>
  );
}

function UserRow({ u, onEdit, onToggle, onDelete }: { u: AppUser; onEdit: (u: AppUser) => void; onToggle: (u: AppUser) => void; onDelete: (u: AppUser) => void }) {
  return (
    <tr>
      <td style={{ padding: '0.6rem 0.75rem' }}><code style={{ fontSize: '0.85rem' }}>{u.username}</code></td>
      <td style={{ padding: '0.6rem 0.75rem' }}>{u.fullName}</td>
      <td style={{ padding: '0.6rem 0.75rem' }}><RoleBadge role={u.role} /></td>
      <td style={{ padding: '0.6rem 0.75rem' }}>
        <span style={{ color: u.isActive ? '#22c55e' : '#9ca3af', fontSize: '0.82rem' }}>
          {u.isActive ? '● Active' : '○ Inactive'}
        </span>
      </td>
      <td style={{ padding: '0.6rem 0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
        {new Date(u.createdAt).toLocaleDateString('th-TH')}
      </td>
      <td style={{ padding: '0.6rem 0.75rem' }}>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn secondary" style={{ padding: '3px 10px', fontSize: '0.78rem' }} onClick={() => onEdit(u)}>แก้ไข</button>
          <button className="btn secondary" style={{ padding: '3px 10px', fontSize: '0.78rem' }} onClick={() => onToggle(u)}>
            {u.isActive ? 'Disable' : 'Enable'}
          </button>
          <button className="btn danger" style={{ padding: '3px 10px', fontSize: '0.78rem' }} onClick={() => onDelete(u)}>ลบ</button>
        </div>
      </td>
    </tr>
  );
}

function CreateUserModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ username: '', fullName: '', role: 'MEMBER' as AppRole, password: '' });
  const create = useAdminUserCreate();
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      await create.mutateAsync(form);
      onClose();
    } catch (e: any) { setErr(e.message); }
  }

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 'min(100%, 440px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
          <span style={{ fontSize: '1.4rem', width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, background: 'rgba(59,130,246,0.12)' }}>👤</span>
          <div>
            <h2 className="panel__title" style={{ margin: 0 }}>เพิ่มผู้ใช้ใหม่</h2>
            <p className="panel__subtitle" style={{ margin: 0 }}>สร้างบัญชีผู้ใช้และกำหนดสิทธิ์</p>
          </div>
        </div>
        <form onSubmit={submit} className="stack" style={{ marginTop: '1rem', gap: '0.85rem' }}>
          <label className="field">
            <span>Username</span>
            <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="เช่น somchai" autoFocus required />
          </label>
          <label className="field">
            <span>ชื่อ-สกุล</span>
            <input value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} placeholder="สมชาย ใจดี" required />
          </label>
          <label className="field">
            <span>Role</span>
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as AppRole }))}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label className="field">
            <span>รหัสผ่าน *</span>
            <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="อย่างน้อย 4 ตัวอักษร" required />
          </label>
          {err && <div className="notice err">{err}</div>}
          <div className="modal-actions" style={{ marginTop: '0.25rem' }}>
            <button type="button" className="btn secondary" onClick={onClose}>ยกเลิก</button>
            <button type="submit" className="btn" disabled={create.isPending || form.password.length < 4}>
              {create.isPending ? 'กำลังสร้าง...' : 'สร้างผู้ใช้'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditUserModal({ user, onClose }: { user: AppUser; onClose: () => void }) {
  const [form, setForm] = useState({ fullName: user.fullName, role: user.role, password: '' });
  const update = useAdminUserUpdate();
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      await update.mutateAsync({ id: user.id, fullName: form.fullName, role: form.role, password: form.password || undefined });
      onClose();
    } catch (e: any) { setErr(e.message); }
  }

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 'min(100%, 440px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
          <span style={{ fontSize: '1.4rem', width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, background: 'rgba(59,130,246,0.12)' }}>✏️</span>
          <div>
            <h2 className="panel__title" style={{ margin: 0 }}>แก้ไขผู้ใช้</h2>
            <p className="panel__subtitle" style={{ margin: 0 }}><code>{user.username}</code></p>
          </div>
        </div>
        <form onSubmit={submit} className="stack" style={{ marginTop: '1rem', gap: '0.85rem' }}>
          <label className="field">
            <span>ชื่อ-สกุล</span>
            <input value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} autoFocus required />
          </label>
          <label className="field">
            <span>Role</span>
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as AppRole }))}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label className="field">
            <span>รหัสผ่านใหม่ (เว้นว่าง = ไม่เปลี่ยน)</span>
            <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••" />
          </label>
          {err && <div className="notice err">{err}</div>}
          <div className="modal-actions" style={{ marginTop: '0.25rem' }}>
            <button type="button" className="btn secondary" onClick={onClose}>ยกเลิก</button>
            <button type="submit" className="btn" disabled={update.isPending}>
              {update.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UsersTab() {
  const { data: users = [], isLoading } = useAdminUsers();
  const updateUser = useAdminUserUpdate();
  const deleteUser = useAdminUserDelete();
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<AppUser | null>(null);

  function handleToggle(u: AppUser) {
    if (!confirm(`${u.isActive ? 'Disable' : 'Enable'} ผู้ใช้ ${u.username}?`)) return;
    updateUser.mutate({ id: u.id, isActive: !u.isActive });
  }
  function handleDelete(u: AppUser) {
    if (!confirm(`ลบผู้ใช้ "${u.username}" ออกจากระบบ?`)) return;
    deleteUser.mutate(u.id);
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button className="btn primary" onClick={() => setShowCreate(true)}>+ เพิ่มผู้ใช้</button>
      </div>
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>กำลังโหลด...</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.87rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                {['Username', 'ชื่อ', 'Role', 'สถานะ', 'วันที่สร้าง', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: h === 'Actions' ? 'center' : 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.78rem' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <UserRow key={u.id} u={u} onEdit={setEditUser} onToggle={handleToggle} onDelete={handleDelete} />
              ))}
            </tbody>
          </table>
          {users.length === 0 && <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>ยังไม่มีผู้ใช้</div>}
        </div>
      )}
      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} />}
      {editUser && <EditUserModal user={editUser} onClose={() => setEditUser(null)} />}
    </>
  );
}

function AuditTab() {
  const [actor, setActor] = useState('');
  const { data: users = [] } = useAdminUsers();
  const { data: logs = [], isLoading } = useAuditLogs(actor ? { actor } : undefined);

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <label className="field" style={{ marginBottom: 0, minWidth: 220 }}>
          <span>กรองตามผู้ใช้ (Actor)</span>
          <select value={actor} onChange={e => setActor(e.target.value)}>
            <option value="">— ทั้งหมด —</option>
            {users.map(u => (
              <option key={u.id} value={u.username}>{u.username} ({u.fullName})</option>
            ))}
          </select>
        </label>
        {actor && (
          <button type="button" className="btn secondary" style={{ alignSelf: 'flex-end' }} onClick={() => setActor('')}>ล้างค่า</button>
        )}
      </div>
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>กำลังโหลด...</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                {['เวลา', 'Actor', 'Action', 'Target', 'Detail'].map(h => (
                  <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.78rem' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                    {new Date(log.createdAt).toLocaleString('th-TH')}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem' }}><code style={{ fontSize: '0.82rem' }}>{log.actor}</code></td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>
                    <span style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', padding: '2px 8px', borderRadius: 4, fontSize: '0.78rem', fontWeight: 600 }}>
                      {log.action}
                    </span>
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {log.targetType ? `${log.targetType}#${log.targetId}` : '—'}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', maxWidth: 300 }}>{log.detail ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {logs.length === 0 && <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>ไม่พบ audit log</div>}
        </div>
      )}
    </>
  );
}

export function AdminPanelPage() {
  const { role } = useMockAuth();
  const [tab, setTab] = useState<'users' | 'audit'>('users');

  if (role !== 'admin') {
    return (
      <div className="panel" style={{ maxWidth: 480, margin: '2rem auto', textAlign: 'center' }}>
        <p style={{ color: 'var(--danger)', fontWeight: 600 }}>⛔ เฉพาะ Admin เท่านั้น</p>
      </div>
    );
  }

  return (
    <section className="stack-lg" style={{ maxWidth: 960, margin: '0 auto' }}>
      <div className="panel">
        <h1 className="panel__title">Admin Panel</h1>
        <p className="panel__subtitle">จัดการผู้ใช้และดู Audit Log</p>

        <div className="mes-module-tabs" style={{ marginTop: '1.25rem' }}>
          <button className={`mes-module-tab ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>
            จัดการผู้ใช้
          </button>
          <button className={`mes-module-tab ${tab === 'audit' ? 'active' : ''}`} onClick={() => setTab('audit')}>
            Audit Log
          </button>
        </div>

        <div style={{ marginTop: '1.25rem' }}>
          {tab === 'users' ? <UsersTab /> : <AuditTab />}
        </div>
      </div>
    </section>
  );
}
