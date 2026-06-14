import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from './api';

export interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

function mapRow(r: any): Notification {
  return { id: r.id, type: r.type, title: r.title, message: r.message, link: r.link ?? null, isRead: r.is_read, createdAt: r.created_at };
}

const NOTIF_KEY = ['notifications'];
const COUNT_KEY = ['notifications-count'];

export function useNotifications(unreadOnly = false) {
  return useQuery({
    queryKey: [...NOTIF_KEY, unreadOnly],
    queryFn: async (): Promise<Notification[]> => {
      const res = await api.get('/notifications', unreadOnly ? { params: { unread_only: true } } : undefined);
      return ((res.data as any)?.data ?? []).map(mapRow);
    },
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: COUNT_KEY,
    queryFn: async (): Promise<number> => {
      const res = await api.get('/notifications/unread-count');
      return (res.data as any)?.count ?? 0;
    },
    refetchInterval: 30_000,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await api.post(`/notifications/${id}/read`);
      if (res.status >= 400 || res.status === 0) throw new Error('mark read failed');
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOTIF_KEY });
      qc.invalidateQueries({ queryKey: COUNT_KEY });
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.post('/notifications/read-all');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOTIF_KEY });
      qc.invalidateQueries({ queryKey: COUNT_KEY });
    },
  });
}
