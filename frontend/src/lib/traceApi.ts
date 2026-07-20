import { useQuery } from '@tanstack/react-query';
import api from './api';

export interface TraceStep {
  step: string;
  status: 'PASS' | 'FAIL' | null;      // routing scan: SCAN_IN ยังไม่มีผล → null (แสดงเป็นจุดกลาง ไม่ใช่ ✗)
  at: string;
  operator: string;
  station: string;
  action?: 'SCAN_IN' | 'SCAN_OUT';     // ประเภท scan (เข้า/ออก สเตชัน)
  note?: string;
}

export interface SerialTrace {
  serial: string;
  product: string;
  wo: string;
  box: string;
  steps: TraceStep[];
}

export interface DailyReport {
  date: string;
  total: number;
  pass: number;
  fail: number;
  pass_rate: number;
}

// งาน #11: ย้ายจาก endpoint interim (/jumbo/trace) → routing history จริง (mes_draft#5)
//   GET /api/routing/history/:unitSn → { data: { unit_sn, events: [...] } } (events เรียงเก่า→ใหม่)
//   map event (SCAN_IN/SCAN_OUT + status PASS/FAIL/null) ให้เข้ากับ Timeline เดิม (SerialTrace/TraceStep)
export function useSerialTrace(serial: string | null) {
  return useQuery({
    queryKey: ['trace', serial],
    enabled: !!serial,
    queryFn: async (): Promise<SerialTrace> => {
      const res = await api.get(`/routing/history/${encodeURIComponent(serial!)}`);
      if (res.status === 404 || res.status === 0) throw new Error((res.data as any)?.message || 'Serial not found');
      const d = (res.data as any)?.data ?? {};
      const events: any[] = Array.isArray(d.events) ? d.events : [];
      const actLabel = (a: string) => a === 'SCAN_IN' ? 'In' : a === 'SCAN_OUT' ? 'Out' : a;
      const steps: TraceStep[] = events.map(e => ({
        step: `${e.station_name || e.route_code || '-'}${e.action ? ` · ${actLabel(e.action)}` : ''}`,
        status: e.status === 'PASS' || e.status === 'FAIL' ? e.status : null,
        at: e.scanned_at,
        operator: e.scanned_by_username || '-',
        station: e.station_name || e.route_code || '-',
        action: e.action,
        note: e.note || undefined,
      }));
      return {
        serial: d.unit_sn || serial!,
        product: '',                                            // endpoint นี้ไม่ส่ง product
        wo: events[0]?.route_code || events[0]?.wo_id || '',    // ใช้ route_code เป็นตัวอ้างอิงงาน
        box: '',                                                // endpoint นี้ไม่ส่ง box
        steps,
      };
    },
    retry: false,
  });
}

export function useSerialList() {
  return useQuery({
    queryKey: ['serials'],
    queryFn: async (): Promise<string[]> => {
      const res = await api.get('/jumbo/serials');
      return (res.data as any)?.data ?? [];
    },
  });
}

export function useDailyReport() {
  return useQuery({
    queryKey: ['trace-report'],
    queryFn: async (): Promise<DailyReport[]> => {
      const res = await api.get('/jumbo/report/daily');
      if (res.status >= 400 || res.status === 0) throw new Error(res.status === 0 ? 'Connection failed' : 'Failed to load report');
      return (res.data as any)?.data ?? [];
    },
  });
}

export interface BoxSummary { box_id: string; product: string; wo: string; packed_at: string; serial_count: number; }
export interface BoxItem { serial: string; product: string; last_step: string; last_status: 'PASS' | 'FAIL'; }
export interface BoxDetail extends BoxSummary { items: BoxItem[]; }

export function useBoxList() {
  return useQuery({
    queryKey: ['trace-boxes'],
    queryFn: async (): Promise<BoxSummary[]> => {
      const res = await api.get('/jumbo/packing/boxes');
      if (res.status >= 400 || res.status === 0) throw new Error(res.status === 0 ? 'Connection failed' : 'Failed to load box list');
      return (res.data as any)?.data ?? [];
    },
  });
}

export function useBoxDetail(boxId: string | null) {
  return useQuery({
    queryKey: ['trace-box', boxId],
    enabled: !!boxId,
    queryFn: async (): Promise<BoxDetail> => {
      const res = await api.get(`/jumbo/packing/boxes/${encodeURIComponent(boxId!)}`);
      if (res.status === 404 || res.status === 0) throw new Error((res.data as any)?.message || 'Box not found');
      return (res.data as any)?.data;
    },
    retry: false,
  });
}
