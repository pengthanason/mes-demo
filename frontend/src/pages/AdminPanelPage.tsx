import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useMockAuth } from '../lib/useMockStore';
import { confirmDialog } from '../lib/confirm';
import { useEscapeKey } from '../lib/useEscapeKey';
import { useFocusTrap } from '../lib/useFocusTrap';
import {
  useAdminUsers, useAdminUserCreate, useAdminUserUpdate, useAdminUserDelete,
  useAuditLogs, AppRole, AppUser,
} from '../lib/adminApi';
import { PERMISSIONS, ROLE_DEFAULT_PERMS } from '../lib/permissions';
import { Paginator } from '../components/Paginator';
import { ROW_H, fillerCount, FillerRows } from '../components/TableFill';
import { showToast } from '../lib/toast';
import { BlockState } from '../components/DataStates';

const ROLES: AppRole[] = ['ADMIN', 'MEMBER', 'VIEWER'];
const ROLE_BADGE: Record<AppRole, string> = { ADMIN: '#ef4444', MEMBER: '#3b82f6', VIEWER: '#6b7280' };

function RoleBadge({ role }: { role: AppRole }) {
  return (
    <span style={{ background: ROLE_BADGE[role], color: '#fff', fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99 }}>
      {role}
    </span>
  );
}

// ── ตัวเลือกสิทธิ์รายหน้า (checkbox) — ว่าง = ใช้ค่าเริ่มต้นของ role · ADMIN = ทุกหน้าเสมอ ──
function PermChecklist({ role, value, onChange }: { role: AppRole; value: string[]; onChange: (v: string[]) => void }) {
  const roleDefault = ROLE_DEFAULT_PERMS[role.toLowerCase()] || [];
  const isAdmin = role === 'ADMIN';
  const usingDefault = value.length === 0;
  const toggle = (k: string) => {
    const base = usingDefault ? [...roleDefault] : value;   // เริ่มจากค่า role ถ้ายังไม่เคยกำหนดเอง
    onChange(base.includes(k) ? base.filter(x => x !== k) : [...base, k]);
  };
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
          {isAdmin ? 'ADMIN always has access to all pages' : usingDefault ? `Not customized — using default for ${role}` : 'Custom permissions (override)'}
        </span>
        {!isAdmin && !usingDefault && (
          <button type="button" onClick={() => onChange([])} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '0.75rem', padding: '4px 6px' }}>Reset to role default</button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 6 }}>
        {PERMISSIONS.map(p => {
          const on = isAdmin ? true : (usingDefault ? roleDefault.includes(p.key) : value.includes(p.key));
          return (
            <label key={p.key} style={{
              display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem',
              color: isAdmin ? '#94a3b8' : '#334155', cursor: isAdmin ? 'default' : 'pointer',
              padding: '6px 10px', border: `1px solid ${on ? '#93c5fd' : '#e2e8f0'}`, borderRadius: 6,
              background: on && !isAdmin ? '#eff6ff' : '#fff', minWidth: 0,
            }}>
              <input type="checkbox" checked={on} disabled={isAdmin} onChange={() => toggle(p.key)}
                style={{ width: 16, height: 16, flexShrink: 0, margin: 0, accentColor: '#2563eb' }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ช่องรหัสผ่าน — ตั้ง/รีเซ็ตรหัสใหม่ + ปุ่ม 👁 กดเปิด/ปิดดูรหัสที่พิมพ์ (ไม่โชว์รหัสเดิม)
function PasswordField({ label, value, onChange, placeholder, required }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <span>{label}</span>
      <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
        <input type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder ?? '*******'} required={required} style={{ flex: 1, minWidth: 0 }} autoComplete="new-password" />
        <button type="button" aria-label={show ? 'Hide password' : 'Show password'} title={show ? 'Hide password' : 'Show password'} onClick={() => setShow(s => !s)}
          style={{ padding: '0 12px', borderRadius: 6, border: '1px solid var(--border-color)', background: '#fff', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
          {show ? (
            // ตาเปิด (กำลังแสดงรหัส)
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
          ) : (
            // ตาโดนขีด (รหัสถูกซ่อน)
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
          )}
        </button>
      </div>
    </div>
  );
}

function UserRow({ u, onEdit, onToggle, onDelete, busy }: { u: AppUser; onEdit: (u: AppUser) => void; onToggle: (u: AppUser) => void; onDelete: (u: AppUser) => void; busy?: boolean }) {
  return (
    <tr>
      <td style={{ padding: '0.6rem 0.75rem' }}><code style={{ fontSize: '0.85rem' }}>{u.username}</code></td>
      <td style={{ padding: '0.6rem 0.75rem' }}>{u.fullName}</td>
      <td style={{ padding: '0.6rem 0.75rem' }}><RoleBadge role={u.role} /></td>
      <td style={{ padding: '0.6rem 0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
        {u.role === 'ADMIN' ? 'All pages' : u.permissions.length ? `${u.permissions.length} pages (custom)` : 'By role'}
      </td>
      <td style={{ padding: '0.6rem 0.75rem' }}>
        <span style={{ color: u.isActive ? '#22c55e' : '#9ca3af', fontSize: '0.82rem' }}>
          {u.isActive ? '● Active' : '○ Inactive'}
        </span>
      </td>
      <td style={{ padding: '0.6rem 0.75rem' }}>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn secondary" style={{ padding: '3px 10px', fontSize: '0.78rem' }} onClick={() => onEdit(u)}>Edit</button>
          <button type="button" className="btn secondary" style={{ padding: '3px 10px', fontSize: '0.78rem' }} onClick={() => onToggle(u)} disabled={busy}>
            {u.isActive ? 'Disable' : 'Enable'}
          </button>
          <button type="button" className="btn danger" style={{ padding: '3px 10px', fontSize: '0.78rem' }} onClick={() => onDelete(u)} disabled={busy}>Delete</button>
        </div>
      </td>
    </tr>
  );
}

function CreateUserModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ username: '', fullName: '', role: 'MEMBER' as AppRole, password: '', permissions: [] as string[] });
  const create = useAdminUserCreate();
  const [err, setErr] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);
  useEscapeKey(true, onClose);
  useFocusTrap(true, modalRef);

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
      <div ref={modalRef} className="modal" role="dialog" aria-modal="true" aria-label="Add New User" onClick={e => e.stopPropagation()} style={{ width: 'min(100%, 480px)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
          <span style={{ fontSize: '1.4rem', width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, background: 'rgba(59,130,246,0.12)' }}>👤</span>
          <div>
            <h2 className="panel__title" style={{ margin: 0 }}>Add New User</h2>
            <p className="panel__subtitle" style={{ margin: 0 }}>Create a user account and set permissions</p>
          </div>
        </div>
        <form onSubmit={submit} className="stack" style={{ marginTop: '1rem', gap: '0.85rem' }}>
          <label className="field">
            <span>Username</span>
            <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="e.g. somchai" autoFocus required />
          </label>
          <label className="field">
            <span>Full Name</span>
            <input value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} placeholder="John Doe" required />
          </label>
          <label className="field">
            <span>Role</span>
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as AppRole }))}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <div className="field">
            <span>Access permissions (accessible pages)</span>
            <PermChecklist role={form.role} value={form.permissions} onChange={v => setForm(f => ({ ...f, permissions: v }))} />
          </div>
          <PasswordField label="Password *" value={form.password} onChange={v => setForm(f => ({ ...f, password: v }))} required />
          {err && <div role="alert" className="notice err">{err}</div>}
          <div className="modal-actions" style={{ marginTop: '0.25rem' }}>
            <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn" disabled={create.isPending || form.password.length < 4}>
              {create.isPending ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditUserModal({ user, onClose }: { user: AppUser; onClose: () => void }) {
  const [form, setForm] = useState({ fullName: user.fullName, role: user.role, password: '', permissions: user.permissions ?? [] });
  const update = useAdminUserUpdate();
  const [err, setErr] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);
  useEscapeKey(true, onClose);
  useFocusTrap(true, modalRef);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      await update.mutateAsync({ id: user.id, fullName: form.fullName, role: form.role, password: form.password || undefined, permissions: form.permissions });
      onClose();
    } catch (e: any) { setErr(e.message); }
  }

  return (
    <div className="modal-overlay">
      <div ref={modalRef} className="modal" role="dialog" aria-modal="true" aria-label={`Edit User ${user.username}`} onClick={e => e.stopPropagation()} style={{ width: 'min(100%, 480px)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
          <span style={{ fontSize: '1.4rem', width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, background: 'rgba(59,130,246,0.12)' }}>✏️</span>
          <div>
            <h2 className="panel__title" style={{ margin: 0 }}>Edit User + Permissions</h2>
            <p className="panel__subtitle" style={{ margin: 0 }}><code>{user.username}</code></p>
          </div>
        </div>
        <form onSubmit={submit} className="stack" style={{ marginTop: '1rem', gap: '0.85rem' }}>
          <label className="field">
            <span>Full Name</span>
            <input value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} autoFocus required />
          </label>
          <label className="field">
            <span>Role</span>
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as AppRole }))}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <div className="field">
            <span>Access permissions (accessible pages)</span>
            <PermChecklist role={form.role} value={form.permissions} onChange={v => setForm(f => ({ ...f, permissions: v }))} />
          </div>
          <PasswordField label="Set/reset new password (leave blank = unchanged)" value={form.password} onChange={v => setForm(f => ({ ...f, password: v }))} />
          {err && <div role="alert" className="notice err">{err}</div>}
          <div className="modal-actions" style={{ marginTop: '0.25rem' }}>
            <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn" disabled={update.isPending}>
              {update.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UsersTab() {
  const { data: users = [], isLoading, isError, refetch } = useAdminUsers();
  const updateUser = useAdminUserUpdate();
  const deleteUser = useAdminUserDelete();
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<AppUser | null>(null);

  async function handleToggle(u: AppUser) {
    if (!(await confirmDialog(`${u.isActive ? 'Disable' : 'Enable'} user ${u.username}?`, { danger: u.isActive, confirmText: u.isActive ? 'Disable' : 'Enable' }))) return;
    updateUser.mutate({ id: u.id, isActive: !u.isActive }, {
      onSuccess: () => showToast(`User ${u.username} ${u.isActive ? 'disabled' : 'enabled'}`, 'success'),
      onError: (e: any) => showToast(e?.message || 'Update failed', 'error'),
    });
  }
  async function handleDelete(u: AppUser) {
    if (!(await confirmDialog(`Delete user "${u.username}" from the system?`, { title: 'Delete User' }))) return;
    deleteUser.mutate(u.id, {
      onSuccess: () => showToast(`User "${u.username}" deleted`, 'success'),
      onError: (e: any) => showToast(e?.message || 'Delete failed', 'error'),
    });
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button type="button" className="btn" onClick={() => setShowCreate(true)}>+ Add User</button>
      </div>
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Loading...</div>
      ) : isError ? (
        <BlockState state="error" onRetry={() => refetch()} />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.87rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                {['Username', 'Name', 'Role', 'Permissions', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: h === 'Actions' ? 'center' : 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.78rem' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <UserRow key={u.id} u={u} onEdit={setEditUser} onToggle={handleToggle} onDelete={handleDelete}
                  busy={(updateUser.isPending && updateUser.variables?.id === u.id) || (deleteUser.isPending && deleteUser.variables === u.id)} />
              ))}
            </tbody>
          </table>
          {users.length === 0 && <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No users yet — click “+ Add User” to create the first account</div>}
        </div>
      )}
      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} />}
      {editUser && <EditUserModal user={editUser} onClose={() => setEditUser(null)} />}
    </>
  );
}

// ── ลิงก์ปลายทางของ log (คลิกไปดูข้อมูล/หน้าที่เกี่ยวข้อง) — มี id ไปหน้ารายตัว, ไม่มีก็ไปหน้ารวม ──
function targetLink(targetType: string | null, targetId: string | null): string | null {
  if (!targetType) return null;
  switch (targetType) {
    case 'wo':            return targetId ? `/wo/${targetId}` : '/work-orders';
    case 'cr':            return targetId ? `/4m-change/${targetId}` : '/4m-change';
    case 'workflow':      return '/production-plan?tab=workflow';
    case 'pp':            return targetId ? `/dashboard?pp=${targetId}` : '/dashboard';   // เปิดรายละเอียดรายการนั้นบน Dashboard
    case 'jig':           return targetId ? `/jig-test/${targetId}` : '/jig-test';
    case 'rework':        return '/qc-board?tab=rework';
    case 'inventory':     return '/incoming';
    case 'notifications': return '/notifications';
    case 'production':    return '/dashboard';
    case 'app_user':
    case 'user':          return '/admin/panel?tab=users';
    default:              return null;
  }
}

const ACTION_COLOR: Record<string, { bg: string; text: string }> = {
  LOGIN:         { bg: 'rgba(34,197,94,0.12)',  text: '#16a34a' },
  LOGOUT:        { bg: 'rgba(100,116,139,0.14)', text: '#475569' },
  CREATE_USER:   { bg: 'rgba(59,130,246,0.1)',  text: '#3b82f6' },
  UPDATE_USER:   { bg: 'rgba(234,179,8,0.14)',  text: '#a16207' },
  DELETE_USER:   { bg: 'rgba(239,68,68,0.12)',  text: '#dc2626' },
  EXPORT_BACKUP: { bg: 'rgba(168,85,247,0.13)', text: '#7e22ce' },   // ดาวน์โหลดข้อมูลทั้งระบบ = อ่อนไหว ให้เด่น
};

function ActivityTable({ withFilter, kind, emptyText }: { withFilter: boolean; kind: 'activity' | 'account'; emptyText: string }) {
  const nav = useNavigate();
  const { data: users = [] } = useAdminUsers();
  const [actor, setActor] = useState('');
  const [page, setPage] = useState(1);
  const PAGE = 15;
  const { data: logs = [], isLoading, isError, refetch } = useAuditLogs({ kind, ...(actor ? { actor } : {}) });
  useEffect(() => { setPage(1); }, [actor, logs.length]);
  const totalPages = Math.max(1, Math.ceil(logs.length / PAGE));
  const paged = logs.slice((page - 1) * PAGE, page * PAGE);
  // เติมแถวว่างให้ครบ PAGE เมื่อมีหลายหน้า → ความสูงตารางคงที่ ปุ่มเปลี่ยนหน้าไม่ขยับ กดรัวๆ ได้
  // (ถ้ามีหน้าเดียวไม่ต้องเติม จะได้ไม่เห็นตารางว่างโหวงตอนข้อมูลน้อย)
  const filler = fillerCount(paged.length, PAGE, totalPages);

  return (
    <>
      {withFilter && (
        <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label className="field" style={{ marginBottom: 0, minWidth: 240 }}>
            <span>Filter by username</span>
            <select value={actor} onChange={e => setActor(e.target.value)}>
              <option value="">— All users —</option>
              {users.map(u => <option key={u.id} value={u.username}>{u.username} ({u.fullName})</option>)}
            </select>
          </label>
          {actor && <button type="button" className="btn secondary" onClick={() => setActor('')}>Clear</button>}
          <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: '0.82rem', color: 'var(--text-muted)' }}>{logs.length} items</span>
        </div>
      )}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Loading...</div>
      ) : isError ? (
        <BlockState state="error" onRetry={() => refetch()} />
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            {/* tableLayout: fixed + colgroup = คอลัมน์กว้างตามที่กำหนด ไม่ยืด/หดตามความยาวเนื้อหา
                → เปลี่ยนหน้าแล้วคอลัมน์อยู่ที่เดิมเป๊ะ (ของเดิม auto จะวัดจากเนื้อหาในหน้านั้น จึงขยับทุกครั้ง)
                minWidth กันคอลัมน์บีบกันบนจอแคบ — ตัว wrapper มี overflowX ให้เลื่อนอยู่แล้ว */}
            <table style={{ width: '100%', minWidth: 720, tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <colgroup>
                <col style={{ width: 155 }} />{/* Time — วันเวลา en-GB ยาวคงที่ */}
                <col style={{ width: 130 }} />{/* Actor */}
                <col style={{ width: 165 }} />{/* Activity — ป้าย action */}
                <col />{/* Details — กินที่เหลือ */}
                <col style={{ width: 34 }} />{/* ลูกศร › */}
              </colgroup>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  {['Time', 'Actor', 'Activity', 'Details', ''].map((h, i) => (
                    <th key={i} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.78rem' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map(log => {
                  const link = targetLink(log.targetType, log.targetId);
                  const ac = ACTION_COLOR[log.action] || { bg: 'rgba(100,116,139,0.12)', text: '#475569' };
                  return (
                    <tr key={log.id}
                      onClick={link ? () => nav(link) : undefined}
                      style={{ borderBottom: '1px solid var(--border)', cursor: link ? 'pointer' : 'default' }}
                      title={link ? 'Click to view related information' : undefined}
                      onMouseEnter={e => { if (link) e.currentTarget.style.background = 'rgba(59,130,246,0.06)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                      {/* height บน cell = ความสูงขั้นต่ำของแถว → ทุกแถว (จริง+ว่าง) สูงเท่ากันเป๊ะ
                          ทุกคอลัมน์เป็น nowrap อยู่แล้ว จึงไม่มีแถวไหนสูงเกิน ROW_H */}
                      <td style={{ height: ROW_H, padding: '0.5rem 0.75rem', whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: '0.78rem' }}>{new Date(log.createdAt).toLocaleString('en-GB')}</td>
                      {/* ellipsis: เนื้อหายาวเกินให้ตัด … ไม่ดันคอลัมน์ให้กว้างขึ้น (title = hover ดูเต็มได้) */}
                      <td style={{ padding: '0.5rem 0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.actor}>
                        <code style={{ fontSize: '0.82rem' }}>{log.actor}</code>
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.action}>
                        <span style={{ background: ac.bg, color: ac.text, padding: '2px 8px', borderRadius: 4, fontSize: '0.78rem', fontWeight: 600 }}>{log.action}</span>
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.82rem', color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={log.detail ?? undefined}>
                        {log.detail ?? (log.targetType ? `${log.targetType}#${log.targetId}` : '—')}
                        {link && <span style={{ color: 'var(--primary)', marginLeft: 6, fontSize: '0.78rem' }}>↗</span>}
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: 'var(--line-3)' }}>{link ? '›' : ''}</td>
                    </tr>
                  );
                })}
                <FillerRows count={filler} cols={5} />
              </tbody>
            </table>
            {logs.length === 0 && <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>{emptyText}</div>}
          </div>
          {logs.length > 0 && <Paginator page={page} totalPages={totalPages} onPage={setPage} total={logs.length} />}
        </>
      )}
    </>
  );
}

type Tab = 'users' | 'activities' | 'audit';
// key 'audit' คงไว้ (ลิงก์เดิม ?tab=audit ยังใช้ได้) แต่เปลี่ยนความหมาย/ป้ายเป็นเรื่องบัญชี+การเข้าถึง
const TABS: { key: Tab; label: string }[] = [
  { key: 'users',      label: 'Manage Users + Permissions' },
  { key: 'activities', label: 'Activities' },
  { key: 'audit',      label: 'Account & Security' },
];
const TAB_DESC: Record<Tab, string> = {
  users:      'Manage users · control page permissions',
  activities: 'What each user did in the system — create/edit/delete records (WO · Production Plan · QC · Jig, etc.)',
  audit:      'Account and access — sign-ins · create/edit/delete users · full data downloads',
};

export function AdminPanelPage() {
  const { role } = useMockAuth();
  const [params, setParams] = useSearchParams();
  const p = params.get('tab');
  const tab: Tab = (p === 'activities' || p === 'audit') ? p : 'users';   // แท็บอ่านจาก URL (?tab=)
  const setTab = (t: Tab) => setParams({ tab: t }, { replace: true });

  if (role !== 'admin') {
    return (
      <div className="panel" style={{ maxWidth: 480, margin: '2rem auto', textAlign: 'center' }}>
        <p style={{ color: 'var(--danger)', fontWeight: 600 }}>⛔ Admin only</p>
      </div>
    );
  }

  return (
    <section className="stack-lg" style={{ maxWidth: 960, margin: '0 auto' }}>
      <div className="panel">
        <h1 className="panel__title">Admin Panel</h1>
        <p className="panel__subtitle">{TAB_DESC[tab]}</p>

        <div className="mes-module-tabs" style={{ marginTop: '1.25rem' }}>
          {TABS.map(t => (
            <button type="button" key={t.key} className={`mes-module-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>

        <div style={{ marginTop: '1.25rem' }}>
          {tab === 'users' && <UsersTab />}
          {tab === 'activities' && (
            <ActivityTable withFilter kind="activity" emptyText="No activity yet" />
          )}
          {tab === 'audit' && (
            <ActivityTable withFilter kind="account" emptyText="No account/access records yet" />
          )}
        </div>
      </div>
    </section>
  );
}
