import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from './api';

// เครื่อง/สถานี (Work Center) — master data ที่ operation ใน workflow อ้างถึง
// นิยามจำนวนเครื่องขนาน + ประสิทธิภาพที่เดียว แล้วใช้ซ้ำได้ทุก product
export interface WorkCenter {
  id: number;
  name: string;
  stations: number;     // จำนวนเครื่อง/หัวที่ทำขนานกัน
  efficiency: number;   // % ความเร็วจริงเทียบมาตรฐาน (100 = ตามมาตรฐาน)
  note: string;
  created_at: string;
}

const KEY = ['work-centers'];

export function useWorkCenters() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<WorkCenter[]> => {
      const res = await api.get('/work-centers');
      return ((res.data as any)?.data ?? []).map((r: any) => ({
        id: r.id,
        name: r.name ?? '',
        stations: Number(r.stations) || 1,
        efficiency: Number(r.efficiency) || 100,
        note: r.note ?? '',
        created_at: r.created_at,
      }));
    },
  });
}

export function useWorkCenterCreate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; stations: number; efficiency: number; note?: string }) => {
      const res = await api.post('/work-centers', input);
      if (res.status >= 400 || res.status === 0) throw new Error((res.data as any)?.message || 'บันทึกเครื่อง/สถานีไม่สำเร็จ');
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useWorkCenterDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await api.delete(`/work-centers/${id}`);
      if (res.status >= 400 || res.status === 0) throw new Error('ลบไม่สำเร็จ');
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
