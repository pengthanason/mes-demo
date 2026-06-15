import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from './api';

export type LotStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface InventoryLot {
  id: number;
  partNo: string;
  partName: string;
  lotNo: string;
  qtyReceived: number;
  qtyAvailable: number;
  status: LotStatus;
  note: string | null;
  receivedAt: string;
  reviewedAt: string | null;
}

export interface StockItem {
  partNo: string;
  partName: string;
  qtyAvailable: number;
}

export interface KittingIssue {
  id: number;
  woId: string;
  partNo: string;
  qty: number;
  lotNo: string;
  issuedAt: string;
}

function rowsOf(res: { data: unknown }): any[] {
  return (res.data as any)?.data ?? [];
}

function mapLot(r: any): InventoryLot {
  return {
    id: r.id, partNo: r.part_no, partName: r.part_name ?? '', lotNo: r.lot_no,
    qtyReceived: Number(r.qty_received), qtyAvailable: Number(r.qty_available),
    status: r.status, note: r.note ?? null, receivedAt: r.received_at, reviewedAt: r.reviewed_at ?? null,
  };
}

const LOTS_KEY  = ['inventory-lots'];
const STOCK_KEY = ['inventory-stock'];

export function useInventoryLots(status?: LotStatus) {
  return useQuery({
    queryKey: [...LOTS_KEY, status ?? 'ALL'],
    queryFn: async (): Promise<InventoryLot[]> => {
      const res = await api.get('/inventory/lots', { params: status ? { status } : undefined });
      return rowsOf(res).map(mapLot);
    },
  });
}

export function useReceiveLot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { partNo: string; partName: string; lotNo: string; qty: number }) => {
      const res = await api.post('/inventory/receive', {
        part_no: input.partNo, part_name: input.partName, lot_no: input.lotNo, qty: input.qty,
      });
      if (res.status >= 400 || res.status === 0) throw new Error((res.data as any)?.message || 'รับของไม่สำเร็จ');
      return res.data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: LOTS_KEY }); qc.invalidateQueries({ queryKey: STOCK_KEY }); },
  });
}

export function useReviewLot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: number; status: 'APPROVED' | 'REJECTED'; note?: string }) => {
      const res = await api.post(`/inventory/lots/${input.id}/review`, { status: input.status, note: input.note });
      if (res.status >= 400 || res.status === 0) throw new Error((res.data as any)?.message || 'บันทึกผลตรวจไม่สำเร็จ');
      return res.data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: LOTS_KEY }); qc.invalidateQueries({ queryKey: STOCK_KEY }); },
  });
}

export function useDeleteLot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await api.delete(`/inventory/lots/${id}`);
      if (res.status >= 400 || res.status === 0) throw new Error((res.data as any)?.message || 'ลบไม่สำเร็จ');
      return res.data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: LOTS_KEY }); qc.invalidateQueries({ queryKey: STOCK_KEY }); },
  });
}

export function useStock() {
  return useQuery({
    queryKey: STOCK_KEY,
    queryFn: async (): Promise<StockItem[]> => {
      const res = await api.get('/inventory/stock');
      return rowsOf(res).map(r => ({ partNo: r.part_no, partName: r.part_name ?? '', qtyAvailable: Number(r.qty_available) }));
    },
  });
}

export function useKittingIssues(woId?: string) {
  return useQuery({
    queryKey: ['kitting-issues', woId ?? 'ALL'],
    queryFn: async (): Promise<KittingIssue[]> => {
      const res = await api.get('/inventory/issues', { params: woId ? { wo_id: woId } : undefined });
      return rowsOf(res).map(r => ({
        id: r.id, woId: r.wo_id, partNo: r.part_no, qty: Number(r.qty), lotNo: r.lot_no, issuedAt: r.issued_at,
      }));
    },
  });
}

export function useIssueMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { woId: string; partNo: string; qty: number }) => {
      const res = await api.post('/inventory/issue', { wo_id: input.woId, part_no: input.partNo, qty: input.qty });
      if (res.status >= 400 || res.status === 0) throw new Error((res.data as any)?.message || 'เบิกของไม่สำเร็จ');
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kitting-issues'] });
      qc.invalidateQueries({ queryKey: STOCK_KEY });
      qc.invalidateQueries({ queryKey: LOTS_KEY });
    },
  });
}
