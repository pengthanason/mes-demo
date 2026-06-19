import { useQuery } from '@tanstack/react-query';
import api from './api';

export interface TraceStep {
  step: string;
  status: 'PASS' | 'FAIL';
  at: string;
  operator: string;
  station: string;
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

export function useSerialTrace(serial: string | null) {
  return useQuery({
    queryKey: ['trace', serial],
    enabled: !!serial,
    queryFn: async (): Promise<SerialTrace> => {
      const res = await api.get(`/jumbo/trace/${encodeURIComponent(serial!)}`);
      if (res.status === 404 || res.status === 0) throw new Error((res.data as any)?.message || 'ไม่พบ serial นี้');
      return (res.data as any)?.data;
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
      return (res.data as any)?.data ?? [];
    },
  });
}
