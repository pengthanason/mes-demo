import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from './api';
import type { MockWO, WoStep } from './mockStore';

// ── Row mapping (API snake_case → MockWO camelCase) ────────────────

type WoBoardRow = {
  id: number;
  wo_no: string;
  product_name: string;
  customer: string | null;
  qty: number;
  current_step: WoStep;
  station: string | null;
  qty_good: number;
  actual_qty: number | null;
  fai_inspector: string | null;
  fai_approver: string | null;
  fai_passed: boolean;
  created_at: string;
  updated_at: string;
};

function mapRow(row: WoBoardRow): MockWO {
  return {
    woId:         row.wo_no,
    productCode:  row.product_name,
    customer:     row.customer ?? '—',
    qty:          Number(row.qty),
    currentStep:  row.current_step,
    station:      row.station ?? '—',
    createdAt:    row.created_at,
    updatedAt:    row.updated_at,
    qtyGood:      Number(row.qty_good ?? 0),
    actualQty:    row.actual_qty != null ? Number(row.actual_qty) : undefined,
    faiInspector: row.fai_inspector ?? undefined,
    faiApprover:  row.fai_approver ?? undefined,
    faiPassed:    row.fai_passed || undefined,
  };
}

// ── Patch payload (camelCase → snake_case) ─────────────────────────

export type WoPatch = Partial<{
  currentStep: WoStep;
  qtyGood: number;
  actualQty: number;
  faiInspector: string;
  faiApprover: string;
  faiPassed: boolean;
}>;

function toApiPatch(patch: WoPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.currentStep  !== undefined) out.current_step  = patch.currentStep;
  if (patch.qtyGood      !== undefined) out.qty_good      = patch.qtyGood;
  if (patch.actualQty    !== undefined) out.actual_qty    = patch.actualQty;
  if (patch.faiInspector !== undefined) out.fai_inspector = patch.faiInspector;
  if (patch.faiApprover  !== undefined) out.fai_approver  = patch.faiApprover;
  if (patch.faiPassed    !== undefined) out.fai_passed    = patch.faiPassed;
  return out;
}

// ── Hooks ──────────────────────────────────────────────────────────

const WO_BOARD_KEY = ['wo-board'];

export function useWoBoard() {
  return useQuery({
    queryKey: WO_BOARD_KEY,
    queryFn: async (): Promise<MockWO[]> => {
      const res = await api.get<{ data: WoBoardRow[] }>('/wo/board');
      const rows = (res.data as any)?.data ?? [];
      return rows.map(mapRow);
    },
    refetchInterval: 30_000,
  });
}

export function useWoPatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ woId, patch }: { woId: string; patch: WoPatch }) => {
      const res = await api.patch(`/wo/board/${woId}`, toApiPatch(patch));
      if (res.status >= 400 || res.status === 0) throw new Error('อัปเดต WO ไม่สำเร็จ');
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: WO_BOARD_KEY }),
  });
}

export function useWoCreate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (wo: Pick<MockWO, 'productCode' | 'customer' | 'qty' | 'station' | 'currentStep'>) => {
      const res = await api.post('/wo/board', {
        product_name: wo.productCode,
        customer:     wo.customer,
        qty:          wo.qty,
        station:      wo.station,
        current_step: wo.currentStep,
      });
      if (res.status >= 400 || res.status === 0) throw new Error('สร้าง WO ไม่สำเร็จ');
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: WO_BOARD_KEY }),
  });
}
