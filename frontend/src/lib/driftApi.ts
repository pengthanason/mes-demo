import { useQuery } from '@tanstack/react-query';
import api from './api';

// contract (ตกลงกับ #30): 1 แถว = 1 item ที่เทียบสต็อก "เรา vs Odoo"
export interface DriftRow {
  item_code: string;
  item_name: string;
  location: string;
  our_qty: number;
  odoo_qty: number;
  diff: number;       // our_qty - odoo_qty (บวก = ของเรามากกว่า, ลบ = น้อยกว่า)
}

// meta ที่ backend ส่งมาด้วย — ต้องโชว์ให้เห็น ไม่ใช่เก็บเงียบๆ
// source='snapshot' = เลขไม่ใช่ ณ วินาทีนี้ · live_unavailable มีค่า = ขอสดแต่ Odoo ล่มจึงถอยไป snapshot
export interface DriftMeta {
  source: 'live' | 'snapshot' | null;
  live_unavailable: string | null;
  snapshot_date: string | null;
  items_compared: number | null;
  drift_count: number | null;
  level: 'item+location' | 'item';
  truncated: boolean;
  cached: boolean;
  fetched_at: string | null;
}

export interface DriftReport { rows: DriftRow[]; meta: DriftMeta | null }

// ⚠️ 2026-08-04: ของเดิมคืน MOCK 12 แถว (ตัวเลขปลอมที่ดูเหมือนจริง) โดยหน้าเว็บไม่มีทางรู้
//    อันตรายกว่าไม่มีข้อมูล เพราะเอาไปตัดสินใจได้ · ตอนนี้ต่อของจริง:
//      my-api GET /api/inventory/drift → WMS GET /ots/reports/qty-drift (read-only)
//    อ่านไม่ได้ = throw ให้หน้าเว็บขึ้น error state · **ห้ามกลับไป fallback ข้อมูลปลอม**
export function useDriftReport() {
  return useQuery({
    queryKey: ['drift-report'],
    queryFn: async (): Promise<DriftReport> => {
      const res = await api.get('/api/inventory/drift');
      if (res.status >= 400 || res.status === 0) {
        throw new Error((res.data as any)?.message || 'โหลดข้อมูลเทียบสต็อกไม่สำเร็จ');
      }
      const body = res.data as any;
      return { rows: body?.data ?? [], meta: body?.meta ?? null };
    },
    // live read คุย Odoo จริง (~12 วิครั้งแรก · backend cache 2 นาที) — อย่า refetch ถี่
    staleTime: 120000,
    refetchOnWindowFocus: false,
  });
}
