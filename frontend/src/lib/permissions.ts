// ── สิทธิ์การเข้าถึงระดับหน้า (page-level permissions) ──
// admin กำหนดต่อคนได้ · ว่าง = ใช้ค่าเริ่มต้นตาม role · ADMIN = เข้าถึงได้ทุกหน้า
// key ต้องตรงกับ backend (server.js ROUTE_PERM) เพื่อบังคับสิทธิ์ให้ตรงกันทั้ง frontend + backend

export type PermKey =
  | 'dashboard' | 'production_plan' | 'incoming' | 'work_orders' | 'jig_test'
  | 'oba' | 'cr' | 'scm' | 'qc' | 'equipment' | 'notifications' | 'admin';

export const PERMISSIONS: { key: PermKey; label: string; route: string }[] = [
  { key: 'dashboard',       label: 'Dashboard',          route: '/dashboard' },
  { key: 'production_plan', label: 'Production Plan',     route: '/production-plan' },
  { key: 'incoming',        label: 'Incoming & Kitting',  route: '/incoming' },
  { key: 'work_orders',     label: 'Work Orders',         route: '/work-orders' },
  { key: 'jig_test',        label: 'Jig Test',            route: '/jig-test' },
  { key: 'oba',             label: 'OBA',                 route: '/oba' },
  { key: 'cr',              label: '4M Change',           route: '/4m-change' },
  { key: 'scm',             label: 'SCM Cases',           route: '/scm-cases' },
  { key: 'qc',              label: 'QC',                  route: '/qc-board' },
  { key: 'equipment',       label: 'Equipment Borrow',    route: '/equipment-borrow' },
  { key: 'notifications',   label: 'Notifications',       route: '/notifications' },
  { key: 'admin',           label: 'Admin Panel',         route: '/admin/panel' },
];

export const ALL_PERMS: PermKey[] = PERMISSIONS.map(p => p.key);

// ค่าเริ่มต้นตาม role (ตรงกับ MEMBER_ITEMS/VIEWER_ITEMS เดิม)
export const ROLE_DEFAULT_PERMS: Record<string, PermKey[]> = {
  admin: ALL_PERMS,
  member: ['dashboard', 'production_plan', 'incoming', 'work_orders', 'jig_test', 'oba', 'cr', 'scm', 'qc', 'equipment', 'notifications'],
  viewer: ['dashboard', 'cr', 'qc', 'jig_test', 'equipment', 'notifications'],
};

// สิทธิ์ที่ใช้จริง — ADMIN=ทุกหน้า · มี list กำหนดเอง=ใช้ list นั้น · ว่าง=ตาม role
export function effectivePerms(role: string | undefined, perms?: string[] | null): PermKey[] {
  const r = String(role || '').toLowerCase();
  if (r === 'admin') return ALL_PERMS;
  if (perms && perms.length) return perms.filter((p): p is PermKey => (ALL_PERMS as string[]).includes(p));
  return ROLE_DEFAULT_PERMS[r] || [];
}

export function hasPerm(role: string | undefined, perms: string[] | null | undefined, need: PermKey): boolean {
  return effectivePerms(role, perms).includes(need);
}
