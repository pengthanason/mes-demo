import { useQuery } from '@tanstack/react-query';
import api from './api';

// รายชื่อ WO ทางการ (จาก work_orders) — ใช้ทำ datalist ทุกหน้าที่อ้างถึง WO
export function useWoNumbers() {
  return useQuery({
    queryKey: ['wo-numbers'],
    queryFn: async (): Promise<string[]> => {
      const res = await api.get('/wo/board');
      return ((res.data as any)?.data ?? []).map((r: any) => r.wo_no).filter(Boolean);
    },
  });
}

// lot ที่เคยใช้กับ WO นี้
export function useWoLots(woNo: string | undefined) {
  return useQuery({
    queryKey: ['wo-lots', woNo],
    enabled: !!woNo,
    queryFn: async (): Promise<string[]> => {
      const res = await api.get(`/wo/${encodeURIComponent(woNo as string)}/lots`);
      return ((res.data as any)?.data ?? []);
    },
  });
}

// สรุปจำนวนจาก Production Scan ต่อ WO (ไว้ autofill QC Result)
export interface ScanSummary { total: number; pass: number; fail: number; }
export function useScanSummary(woNo: string | undefined) {
  return useQuery({
    queryKey: ['scan-summary', woNo],
    enabled: !!woNo,
    queryFn: async (): Promise<ScanSummary> => {
      const res = await api.get('/production/units', { params: { wo_id: woNo } });
      const rows: any[] = (res.data as any)?.data ?? [];
      return {
        total: rows.length,
        pass: rows.filter(r => r.last_result === 'PASS').length,
        fail: rows.filter(r => r.last_result === 'FAIL').length,
      };
    },
  });
}
