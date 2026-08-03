import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from './api';
import type { ObaRecord } from './mockStore';

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
      if (res.status >= 400 || res.status === 0) throw new Error((res.data as any)?.message || 'Failed to load OBA records');
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
      if (res.status >= 400 || res.status === 0) throw new Error((res.data as any)?.message || 'Failed to save OBA');
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: OBA_KEY }),
  });
}

// ── QC ─────────────────────────────────────────────────────────────

const QC_KEY = ['qc-records'];

export function useQcCreate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rec: { sn: string; status: string; error?: string | null; scrapped?: boolean }) => {
      const res = await api.post('/qc', rec);
      if (res.status >= 400 || res.status === 0) throw new Error((res.data as any)?.message || 'Failed to save QC');
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QC_KEY });
      qc.invalidateQueries({ queryKey: QC_HISTORY_KEY });   // #51: รีเฟรชตารางสถานะล่าสุดต่อชิ้นด้วย
    },
  });
}

// #51 FE-CONNECT-4: QC Board History — ต่อ endpoint จริง GET /api/qc/history
//   response: { status:'success', results:[{ sn, wo_id, wo_number, part_no, status, current_station, updated_at }] }
//   ⚠️ เป็น snapshot "สถานะล่าสุดต่อชิ้น" (unit) ไม่ใช่ timeline ทุกครั้งที่สแกน · status = PASS/NG/REPAIRED
export interface QcHistoryRow {
  sn: string; woNumber: string; partNo: string; status: string; station: string; updatedAt: string;
}
const QC_HISTORY_KEY = ['qc-history'];
export function useQcHistory(woId?: string, limit = 100) {
  return useQuery({
    queryKey: [...QC_HISTORY_KEY, woId ?? '', limit],
    queryFn: async (): Promise<QcHistoryRow[]> => {
      const res = await api.get('/qc/history', { params: { ...(woId ? { wo_id: woId } : {}), limit } });
      if (res.status >= 400 || res.status === 0) throw new Error((res.data as any)?.message || 'Failed to load QC history');
      const results = (res.data as any)?.results ?? (res.data as any)?.data ?? [];
      return results.map((r: any) => ({
        sn:        r.sn ?? '',
        woNumber:  r.wo_number ?? r.wo_id ?? '',
        partNo:    r.part_no ?? '',
        status:    r.status ?? '',
        station:   r.current_station ?? '',
        updatedAt: r.updated_at ?? r.created_at ?? '',
      }));
    },
  });
}

// ── Routing History (removed — feature deprecated) ──
