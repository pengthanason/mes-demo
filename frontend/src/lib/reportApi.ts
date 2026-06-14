import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from './api';

export type ReportItem = {
  id: string;
  code: string;
  customer: string;
  status: string;
  qty: number;
  delivery: string;
  stage: string;
  isCompleted: boolean;
};

const REPORT_KEY = ['production-reports'];

function mapRow(r: any): ReportItem {
  return {
    id:          String(r.id),
    code:        r.code ?? '',
    customer:    r.customer ?? '',
    status:      r.status ?? '',
    qty:         Number(r.qty ?? 0),
    delivery:    r.delivery ?? '',
    stage:       r.stage ?? 'Planning',
    isCompleted: Boolean(r.is_completed),
  };
}

export function useReports() {
  return useQuery({
    queryKey: REPORT_KEY,
    queryFn: async (): Promise<ReportItem[]> => {
      const res = await api.get('/report/list');
      return ((res.data as any)?.data ?? []).map(mapRow);
    },
    refetchOnWindowFocus: false, // กัน refetch มาทับข้อมูลที่กำลังพิมพ์
  });
}

export function useReportCreate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<ReportItem> => {
      const res = await api.post('/report');
      if (res.status >= 400 || res.status === 0) throw new Error('สร้างไม่สำเร็จ');
      return mapRow((res.data as any)?.data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: REPORT_KEY }),
  });
}

export function useReportPatch() {
  return useMutation({
    // ไม่ invalidate — local state เป็นตัวจริงระหว่างแก้ไข กัน refetch ทับที่กำลังพิมพ์
    mutationFn: async (item: ReportItem) => {
      const res = await api.patch(`/report/${item.id}`, {
        code:         item.code,
        customer:     item.customer,
        status:       item.status,
        stage:        item.stage,
        qty:          item.qty,
        delivery:     item.delivery || null,
        is_completed: item.isCompleted,
      });
      if (res.status >= 400 || res.status === 0) throw new Error('บันทึกไม่สำเร็จ');
      return res.data;
    },
  });
}

export function useReportDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/report/${id}`);
      if (res.status >= 400 || res.status === 0) throw new Error('ลบไม่สำเร็จ');
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: REPORT_KEY }),
  });
}
