import { useQuery } from '@tanstack/react-query';
import api from './api';

// #54 FE-CONNECT-7: Production Plan — Work Orders Overview
//   GET /api/planning/wo-overview?status=<optional>&limit=<default 100, max 500>
//   → { status:'success', work_orders:[...], summary_by_status:[{status,count}] }
export interface WoOverviewRow {
  id: number;
  woNumber: string;
  partNo: string;
  qtyTarget: number;
  qtyStarted: number;
  qtyGood: number;
  status: string;          // PENDING | IN_PROGRESS | DONE | CANCELLED
  yieldPct: number | null;
  openedAt: string | null;
  closedAt: string | null;
}
export interface WoStatusCount { status: string; count: number; }
export interface WoOverview { workOrders: WoOverviewRow[]; summary: WoStatusCount[]; }

export function useWoOverview(status?: string, limit = 100) {
  return useQuery({
    queryKey: ['wo-overview', status ?? '', limit],
    refetchInterval: 15000,          // live dashboard: ดึงซ้ำทุก 15 วิ
    queryFn: async (): Promise<WoOverview> => {
      const res = await api.get('/planning/wo-overview', { params: { ...(status ? { status } : {}), limit } });
      const d: any = res.data ?? {};
      const wos: any[] = d.work_orders ?? d.data ?? [];
      const sum: any[] = d.summary_by_status ?? [];
      return {
        workOrders: wos.map(r => {
          const target = Number(r.qty_target ?? 0);
          const good = Number(r.qty_good ?? 0);
          const yieldPct = r.yield_pct != null ? Number(r.yield_pct) : (target > 0 ? (good / target) * 100 : null);
          return {
            id: r.id,
            woNumber: r.wo_number ?? r.wo_no ?? '',
            partNo: r.part_no ?? r.product_name ?? '',
            qtyTarget: target,
            qtyStarted: Number(r.qty_started ?? 0),
            qtyGood: good,
            status: r.status ?? '',
            yieldPct,
            openedAt: r.opened_at ?? r.created_at ?? null,
            closedAt: r.closed_at ?? null,
          };
        }),
        summary: sum.map(s => ({ status: s.status, count: Number(s.count) })),
      };
    },
  });
}
