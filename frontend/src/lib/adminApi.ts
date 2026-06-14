import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from './api';

export type AppRole = 'ADMIN' | 'MEMBER' | 'VIEWER';

export interface AppUser {
  id: number;
  username: string;
  fullName: string;
  role: AppRole;
  isActive: boolean;
  createdAt: string;
}

export interface AuditLog {
  id: number;
  actor: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  detail: string | null;
  createdAt: string;
}

function mapUser(r: any): AppUser {
  return { id: r.id, username: r.username, fullName: r.full_name, role: r.role, isActive: r.is_active, createdAt: r.created_at };
}

function mapLog(r: any): AuditLog {
  return { id: r.id, actor: r.actor, action: r.action, targetType: r.target_type, targetId: r.target_id, detail: r.detail, createdAt: r.created_at };
}

const USERS_KEY = ['admin-users'];
const LOGS_KEY  = ['audit-logs'];

export function useAdminUsers() {
  return useQuery({
    queryKey: USERS_KEY,
    queryFn: async (): Promise<AppUser[]> => {
      const res = await api.get('/admin/users');
      return ((res.data as any)?.data ?? []).map(mapUser);
    },
  });
}

export function useAdminUserCreate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { username: string; fullName: string; role: AppRole }) => {
      const res = await api.post('/admin/users', { username: p.username, full_name: p.fullName, role: p.role });
      if (res.status >= 400 || res.status === 0) throw new Error((res.data as any)?.message || 'สร้างผู้ใช้ไม่สำเร็จ');
      return mapUser((res.data as any)?.data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

export function useAdminUserUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: number; fullName?: string; role?: AppRole; isActive?: boolean }) => {
      const body: any = {};
      if (p.fullName !== undefined) body.full_name = p.fullName;
      if (p.role !== undefined)     body.role = p.role;
      if (p.isActive !== undefined) body.is_active = p.isActive;
      const res = await api.put(`/admin/users/${p.id}`, body);
      if (res.status >= 400 || res.status === 0) throw new Error((res.data as any)?.message || 'แก้ไขไม่สำเร็จ');
      return mapUser((res.data as any)?.data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

export function useAdminUserDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await api.delete(`/admin/users/${id}`);
      if (res.status >= 400 || res.status === 0) throw new Error('ลบผู้ใช้ไม่สำเร็จ');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

export function useAuditLogs(filters?: { actor?: string; action?: string }) {
  return useQuery({
    queryKey: [...LOGS_KEY, filters],
    queryFn: async (): Promise<AuditLog[]> => {
      const params: any = {};
      if (filters?.actor)  params.actor  = filters.actor;
      if (filters?.action) params.action = filters.action;
      const res = await api.get('/admin/audit-log', Object.keys(params).length ? { params } : undefined);
      return ((res.data as any)?.data ?? []).map(mapLog);
    },
  });
}
