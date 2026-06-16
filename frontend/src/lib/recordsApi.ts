import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from './api';
import type { ObaRecord, QcRecord, RoutingRecord } from './mockStore';

function rowsOf(res: { data: unknown }): any[] {
  return (res.data as any)?.data ?? [];
}

// ── OBA ────────────────────────────────────────────────────────────

const OBA_KEY = ['oba-records'];

export function useObaRecords() {
  return useQuery({
    queryKey: OBA_KEY,
    queryFn: async (): Promise<ObaRecord[]> => {
      const res = await api.get('/oba/list');
      return rowsOf(res).map(r => ({
        id:        String(r.id),
        woId:      r.wo_id,
        lotNo:     r.lot_no,
        sampleQty: Number(r.sample_qty),
        result:    r.result,
        defectNote: r.defect_note ?? '',
        timestamp: r.created_at,
      }));
    },
  });
}

export function useObaCreate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rec: Omit<ObaRecord, 'id' | 'timestamp'>) => {
      const res = await api.post('/oba', {
        wo_id:       rec.woId,
        lot_no:      rec.lotNo,
        sample_qty:  rec.sampleQty,
        result:      rec.result,
        defect_note: rec.defectNote,
      });
      if (res.status >= 400 || res.status === 0) throw new Error('บันทึก OBA ไม่สำเร็จ');
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: OBA_KEY }),
  });
}

// ── QC ─────────────────────────────────────────────────────────────

const QC_KEY = ['qc-records'];

export function useQcRecords() {
  return useQuery({
    queryKey: QC_KEY,
    queryFn: async (): Promise<QcRecord[]> => {
      const res = await api.get('/qc/list');
      return rowsOf(res).map(r => ({
        id:     String(r.id),
        sn:     r.sn,
        status: r.status,
        time:   new Date(r.created_at).toLocaleTimeString(),
        error:  r.error ?? null,
      }));
    },
  });
}

export function useQcCreate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rec: { sn: string; status: string; error?: string | null }) => {
      const res = await api.post('/qc', rec);
      if (res.status >= 400 || res.status === 0) throw new Error('บันทึก QC ไม่สำเร็จ');
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QC_KEY }),
  });
}

// ── Routing History ────────────────────────────────────────────────

const ROUTING_KEY = ['routing-records'];

export function useRoutingRecords() {
  return useQuery({
    queryKey: ROUTING_KEY,
    queryFn: async (): Promise<RoutingRecord[]> => {
      const res = await api.get('/routing/list');
      return rowsOf(res).map(r => ({
        id:       String(r.id),
        ts:       new Date(r.created_at).toLocaleString(),
        woId:     r.wo_id ?? '',
        serial:   r.serial,
        sequence: r.sequence,
        result:   r.result,
        totalSec: Number(r.total_sec),
      }));
    },
  });
}

export function useRoutingCreate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rec: { serial: string; sequence: string; result: string; totalSec: number; woId?: string }) => {
      const res = await api.post('/routing', {
        serial:    rec.serial,
        sequence:  rec.sequence,
        result:    rec.result,
        total_sec: rec.totalSec,
        wo_id:     rec.woId ?? '',
      });
      if (res.status >= 400 || res.status === 0) throw new Error('บันทึก Routing ไม่สำเร็จ');
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ROUTING_KEY }),
  });
}

export function useRoutingDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/routing/${id}`);
      if (res.status >= 400 || res.status === 0) throw new Error('ลบไม่สำเร็จ');
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ROUTING_KEY }),
  });
}
