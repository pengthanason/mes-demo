import { useQuery } from '@tanstack/react-query';
// import api from './api';   // ← เปิดใช้เมื่อ backend พร้อม ([DB-6] Drift Report / #30)

// contract (ตกลงกับ #30): 1 แถว = 1 item ที่เทียบสต็อก "เรา vs Odoo"
export interface DriftRow {
  item_code: string;
  item_name: string;
  location: string;
  our_qty: number;
  odoo_qty: number;
  diff: number;       // our_qty - odoo_qty (บวก = ของเรามากกว่า, ลบ = น้อยกว่า)
}

// mock ตาม contract — ทีมจะเปลี่ยน "ข้างใน queryFn" เป็น API จริงจุดเดียว เมื่อ #30 เสร็จ (หน้าไม่ต้องแก้)
const MOCK: DriftRow[] = [
  { item_code: 'R2010',   item_name: 'ตัวต้านทาน 10kΩ',        location: 'WH-A',   our_qty: 5000,  odoo_qty: 5000,  diff: 0 },
  { item_code: 'C1050',   item_name: 'คาปาซิเตอร์ 1µF',        location: 'WH-A',   our_qty: 3200,  odoo_qty: 3180,  diff: 20 },
  { item_code: 'IC-8051', item_name: 'ไมโครคอนโทรลเลอร์ 8051', location: 'WH-A',   our_qty: 480,   odoo_qty: 500,   diff: -20 },
  { item_code: 'LED-RED', item_name: 'LED สีแดง 3mm',           location: 'WH-B',   our_qty: 12000, odoo_qty: 11800, diff: 200 },
  { item_code: 'PCB-A100',item_name: 'บอร์ด PCBA-X200',         location: 'WH-B',   our_qty: 150,   odoo_qty: 150,   diff: 0 },
  { item_code: 'CONN-4P', item_name: 'คอนเนกเตอร์ 4 ขา',        location: 'WH-B',   our_qty: 890,   odoo_qty: 875,   diff: 15 },
  { item_code: 'SCR-M3',  item_name: 'สกรู M3×8',               location: 'LINE-1', our_qty: 25000, odoo_qty: 24000, diff: 1000 },
  { item_code: 'CASE-X',  item_name: 'เคสพลาสติก รุ่น X',        location: 'LINE-1', our_qty: 640,   odoo_qty: 645,   diff: -5 },
  { item_code: 'WIRE-22', item_name: 'สายไฟ 22AWG (ม้วน)',      location: 'WH-A',   our_qty: 75,    odoo_qty: 75,    diff: 0 },
  { item_code: 'FUSE-2A', item_name: 'ฟิวส์ 2A',                location: 'WH-B',   our_qty: 3400,  odoo_qty: 3398,  diff: 2 },
  { item_code: 'MOT-4500',item_name: 'มอเตอร์ 4500',            location: 'LINE-1', our_qty: 60,    odoo_qty: 72,    diff: -12 },
  { item_code: 'SEN-100', item_name: 'เซนเซอร์ SEN-100',         location: 'WH-A',   our_qty: 220,   odoo_qty: 205,   diff: 15 },
];

export function useDriftReport() {
  return useQuery({
    queryKey: ['drift-report'],
    queryFn: async (): Promise<DriftRow[]> => {
      // ── สลับเป็น API จริงจุดเดียวเมื่อ #30 พร้อม: ──
      // const res = await api.get('/api/inventory/drift');
      // if (res.status >= 400 || res.status === 0) throw new Error('โหลดข้อมูล drift ไม่สำเร็จ');
      // return (res.data as any)?.data ?? [];
      return new Promise<DriftRow[]>(resolve => setTimeout(() => resolve(MOCK), 250));
    },
  });
}
