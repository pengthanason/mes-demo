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

// mock ถูกเอาออกแล้ว (2026-08-03) — รอ endpoint จริงจากฝั่ง backend (ทีมอื่นดูแล)
// GET /api/inventory/drift ยังไม่มีตอนนี้ → หน้าจะเห็น TableState "error" + ปุ่ม Retry จนกว่าจะพร้อม (ไม่ใช่ error โค้ดฝั่งเรา)
export function useDriftReport() {
  return useQuery({
    queryKey: ['drift-report'],
    queryFn: async (): Promise<DriftRow[]> => {
      const res = await api.get('/api/inventory/drift');
      if (res.status >= 400 || res.status === 0) throw new Error('Failed to load drift data');
      return (res.data as any)?.data ?? [];
    },
  });
}
