import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from './api';

export interface ProductionUnit {
  id: number;
  woId: string;
  serial: string;
  lastStation: string;
  lastResult: 'PASS' | 'FAIL';
  scanCount: number;
  updatedAt: string;
}

export interface ProductionScan {
  id: number;
  woId: string;
  serial: string;
  station: string;
  result: 'PASS' | 'FAIL';
  operator: string;
  note: string | null;
  scannedAt: string;
}

function rowsOf(res: { data: unknown }): any[] {
  return (res.data as any)?.data ?? [];
}

export function useProductionUnits(woId?: string) {
  return useQuery({
    queryKey: ['production-units', woId ?? 'ALL'],
    queryFn: async (): Promise<ProductionUnit[]> => {
      const res = await api.get('/production/units', { params: woId ? { wo_id: woId } : undefined });
      return rowsOf(res).map(r => ({
        id: r.id, woId: r.wo_id, serial: r.serial, lastStation: r.last_station,
        lastResult: r.last_result, scanCount: Number(r.scan_count), updatedAt: r.updated_at,
      }));
    },
  });
}

export function useProductionScans(params: { woId?: string; serial?: string; limit?: number }) {
  return useQuery({
    queryKey: ['production-scans', params.woId ?? 'ALL', params.serial ?? '', params.limit ?? 50],
    queryFn: async (): Promise<ProductionScan[]> => {
      const res = await api.get('/production/scans', {
        params: { wo_id: params.woId, serial: params.serial, limit: params.limit },
      });
      return rowsOf(res).map(r => ({
        id: r.id, woId: r.wo_id, serial: r.serial, station: r.station, result: r.result,
        operator: r.operator ?? '', note: r.note ?? null, scannedAt: r.scanned_at,
      }));
    },
  });
}

export function useScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { woId: string; serial: string; station: string; result: 'PASS' | 'FAIL'; operator?: string; note?: string }) => {
      const res = await api.post('/production/scan', {
        wo_id: input.woId, serial: input.serial, station: input.station,
        result: input.result, operator: input.operator, note: input.note,
      });
      if (res.status >= 400 || res.status === 0) throw new Error((res.data as any)?.message || 'สแกนไม่สำเร็จ');
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production-units'] });
      qc.invalidateQueries({ queryKey: ['production-scans'] });
    },
  });
}
