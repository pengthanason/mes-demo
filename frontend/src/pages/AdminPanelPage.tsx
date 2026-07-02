import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useMockAuth } from '../lib/useMockStore';
import {
  useAdminUsers, useAdminUserCreate, useAdminUserUpdate, useAdminUserDelete,
  useAuditLogs, AppRole, AppUser,
} from '../lib/adminApi';
import { PERMISSIONS, ROLE_DEFAULT_PERMS } from '../lib/permissions';
import { Paginator } from '../components/Paginator';

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
          {isAdmin ? 'ADMIN เข้าถึงได้ทุกหน้าเสมอ' : usingDefault ? `ยังไม่กำหนดเอง — ใช้ค่าเริ่มต้นของ ${role}` : 'กำหนดสิทธิ์เอง (override)'}
        </span>
        {!isAdmin && !usingDefault && (
          <button type="button" onClick={() => onChange([])} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '0.75rem', padding: 0 }}>รีเซ็ตเป็นค่า role</button>
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
        <button type="button" title={show ? 'ซ่อนรหัส' : 'ดูรหัส'} onClick={() => setShow(s => !s)}
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

function UserRow({ u, onEdit, onToggle, onDelete }: { u: AppUser; onEdit: (u: AppUser) => void; onToggle: (u: AppUser) => void; onDelete: (u: AppUser) => void }) {
  return (
    <tr>
      <td style={{ padding: '0.6rem 0.75rem' }}><code style={{ fontSize: '0.85rem' }}>{u.username}</code></td>
      <td style={{ padding: '0.6rem 0.75rem' }}>{u.fullName}</td>
      <td style={{ padding: '0.6rem 0.75rem' }}><RoleBadge role={u.role} /></td>
      <td style={{ padding: '0.6rem 0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
        {u.role === 'ADMIN' ? 'ทุกหน้า' : u.permissions.length ? `${u.permissions.length} หน้า (กำหนดเอง)` : 'ตาม role'}
      </td>
      <td style={{ padding: '0.6rem 0.75rem' }}>
        <span style={{ color: u.isActive ? '#22c55e' : '#9ca3af', fontSize: '0.82rem' }}>
          {u.isActive ? '● Active' : '○ Inactive'}
        </span>
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
  const [form, setForm] = useState({ username: '', fullName: '', role: 'MEMBER' as AppRole, password: '', permissions: [] as string[] });
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
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 'min(100%, 480px)', maxHeight: '90vh', overflowY: 'auto' }}>
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
          <div className="field">
            <span>สิทธิ์การเข้าถึง (หน้าที่เข้าได้)</span>
            <PermChecklist role={form.role} value={form.permissions} onChange={v => setForm(f => ({ ...f, permissions: v }))} />
          </div>
          <PasswordField label="รหัสผ่าน *" value={form.password} onChange={v => setForm(f => ({ ...f, password: v }))} required />
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
  const [form, setForm] = useState({ fullName: user.fullName, role: user.role, password: '', permissions: user.permissions ?? [] });
  const update = useAdminUserUpdate();
  const [err, setErr] = useState('');

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
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 'min(100%, 480px)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
          <span style={{ fontSize: '1.4rem', width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, background: 'rgba(59,130,246,0.12)' }}>✏️</span>
          <div>
            <h2 className="panel__title" style={{ margin: 0 }}>แก้ไขผู้ใช้ + สิทธิ์</h2>
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
          <div className="field">
            <span>สิทธิ์การเข้าถึง (หน้าที่เข้าได้)</span>
            <PermChecklist role={form.role} value={form.permissions} onChange={v => setForm(f => ({ ...f, permissions: v }))} />
          </div>
          <PasswordField label="ตั้ง/รีเซ็ตรหัสผ่านใหม่ (เว้นว่าง = ไม่เปลี่ยน)" value={form.password} onChange={v => setForm(f => ({ ...f, password: v }))} />
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
        <button className="btn" onClick={() => setShowCreate(true)}>+ เพิ่มผู้ใช้</button>
      </div>
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>กำลังโหลด...</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.87rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                {['Username', 'ชื่อ', 'Role', 'สิทธิ์', 'สถานะ', 'Actions'].map(h => (
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
          {users.length === 0 && <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>ยังไม่มีผู้ใช้ — กด “+ เพิ่มผู้ใช้” เพื่อสร้างบัญชีแรก</div>}
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
    case 'scm':           return '/scm-cases';
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
  LOGIN:       { bg: 'rgba(34,197,94,0.12)',  text: '#16a34a' },
  CREATE_USER: { bg: 'rgba(59,130,246,0.1)',  text: '#3b82f6' },
  UPDATE_USER: { bg: 'rgba(234,179,8,0.14)',  text: '#a16207' },
  DELETE_USER: { bg: 'rgba(239,68,68,0.12)',  text: '#dc2626' },
};

function ActivityTable({ withFilter }: { withFilter: boolean }) {
  const nav = useNavigate();
  const { data: users = [] } = useAdminUsers();
  const [actor, setActor] = useState('');
  const [page, setPage] = useState(1);
  const PAGE = 15;
  const { data: logs = [], isLoading } = useAuditLogs(actor ? { actor } : undefined);
  useEffect(() => { setPage(1); }, [actor, logs.length]);
  const totalPages = Math.max(1, Math.ceil(logs.length / PAGE));
  const paged = logs.slice((page - 1) * PAGE, page * PAGE);

  return (
    <>
      {withFilter && (
        <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label className="field" style={{ marginBottom: 0, minWidth: 240 }}>
            <span>กรองตามชื่อผู้ใช้</span>
            <select value={actor} onChange={e => setActor(e.target.value)}>
              <option value="">— ทุกคน —</option>
              {users.map(u => <option key={u.id} value={u.username}>{u.username} ({u.fullName})</option>)}
            </select>
          </label>
          {actor && <button type="button" className="btn secondary" onClick={() => setActor('')}>ล้างค่า</button>}
          <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: '0.82rem', color: 'var(--text-muted)' }}>{logs.length} รายการ</span>
        </div>
      )}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>กำลังโหลด...</div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  {['เวลา', 'ผู้ทำ', 'กิจกรรม', 'รายละเอียด', ''].map((h, i) => (
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
                      title={link ? 'คลิกเพื่อดูข้อมูลที่เกี่ยวข้อง' : undefined}
                      onMouseEnter={e => { if (link) e.currentTarget.style.background = 'rgba(59,130,246,0.06)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                      <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: '0.78rem' }}>{new Date(log.createdAt).toLocaleString('th-TH')}</td>
                      <td style={{ padding: '0.5rem 0.75rem' }}><code style={{ fontSize: '0.82rem' }}>{log.actor}</code></td>
                      <td style={{ padding: '0.5rem 0.75rem' }}>
                        <span style={{ background: ac.bg, color: ac.text, padding: '2px 8px', borderRadius: 4, fontSize: '0.78rem', fontWeight: 600 }}>{log.action}</span>
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.82rem', color: '#334155', maxWidth: 340 }}>
                        {log.detail ?? (log.targetType ? `${log.targetType}#${log.targetId}` : '—')}
                        {link && <span style={{ color: '#3b82f6', marginLeft: 6, fontSize: '0.78rem' }}>↗</span>}
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: '#cbd5e1' }}>{link ? '›' : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {logs.length === 0 && <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>ไม่พบกิจกรรม</div>}
          </div>
          {logs.length > 0 && <Paginator page={page} totalPages={totalPages} onPage={setPage} total={logs.length} />}
        </>
      )}
    </>
  );
}

type Tab = 'users' | 'activities' | 'audit';
const TABS: { key: Tab; label: string }[] = [
  { key: 'users', label: 'จัดการผู้ใช้ + สิทธิ์' },
  { key: 'activities', label: 'Activities' },
  { key: 'audit', label: 'Audit Log' },
];

export function AdminPanelPage() {
  const { role } = useMockAuth();
  const [params, setParams] = useSearchParams();
  const p = params.get('tab');
  const tab: Tab = (p === 'activities' || p === 'audit') ? p : 'users';   // แท็บอ่านจาก URL (?tab=)
  const setTab = (t: Tab) => setParams({ tab: t }, { replace: true });

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
        <p className="panel__subtitle">จัดการผู้ใช้ · กำกับสิทธิ์รายหน้า · ดูกิจกรรม/Audit</p>

        <div className="mes-module-tabs" style={{ marginTop: '1.25rem' }}>
          {TABS.map(t => (
            <button key={t.key} className={`mes-module-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>

        <div style={{ marginTop: '1.25rem' }}>
          {tab === 'users' && <UsersTab />}
          {tab === 'activities' && <ActivityTable withFilter />}
          {tab === 'audit' && <ActivityTable withFilter={false} />}
        </div>
      </div>
    </section>
  );
}
