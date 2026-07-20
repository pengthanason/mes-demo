import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from './api';

// สถานะงาน (ตาม Excel จริง)
export const PP_STATUS = ['DONE', 'ON_PROCESS', 'DELAY', 'CANCEL'] as const;
export type PpStatus = typeof PP_STATUS[number];
export const PP_STATUS_LABEL: Record<string, string> = {
  DONE: 'Done', ON_PROCESS: 'On process', DELAY: 'Delay', CANCEL: 'Cancel',
};

// 1 รายการในประวัติ process: date=วันที่เกิด (YYYY-MM-DD), step=คีย์ process (pc_*), status=สถานะที่เปลี่ยนเป็น ('' | PP_STATUS)
export interface PpLogEntry { date: string; step: string; status: string; note?: string; }

export interface PpProject {
  id: number;
  status: string;
  status_color: string;            // สีของช่อง Status — คลิกในตารางเปลี่ยนได้เอง (ไม่กระทบชื่อสถานะ) · ว่าง = ใช้สีตาม status
  wk: number | null;
  date_record: string | null;
  product_pn: string;
  model: string;
  customer: string;
  qty: number;
  produce: number;                 // จำนวนที่ผลิตไปแล้ว (Produce) — Balance = qty − produce
  syn_requestor: string;           // แสดงเป็น "Owner"
  work_order: string;              // WO No. (คอลัมน์เดียว ไม่มี Name แล้ว)
  wo_name: string;                 // (เลิกใช้ — คงไว้กัน data เก่าพัง)
  matl_coming: string;             // (เลิกใช้ในตาราง/ฟอร์ม)
  chk_man: boolean; chk_mac: boolean; chk_med: boolean; chk_mat: boolean; chk_env: boolean;   // 4M1E (เลิกใช้)
  pd_pcba: boolean; pd_bbas: boolean; pd_test: boolean; pd_modified: boolean; pd_rma: boolean; pd_prep: boolean;   // Type
  pd_start_date: string | null;
  pd_finish_date: string | null;
  target_per_day: number;          // เป้าหมายต่อวัน (Target/day) — ใน PD PLAN
  qa_test_rate: string;
  qa_finish_date: string | null;
  qa_status: string;               // สถานะฝั่ง QA — แยกจาก status งาน แต่ตัวเลือกเดียวกัน (PP_STATUS)
  store_received: string | null;
  expected_date: string | null;
  revised_date: string | null;     // Revised date (แสดงก่อน Remark)
  bom_rec_date: string | null;     // Bom Rec — วันที่รับ BOM (กลุ่ม WO)
  done: boolean;                   // (เลิกใช้)
  pd_pic: string;
  pic_responsible: string;         // PIC → Responsible
  team_member: number;
  ok_per_day: number;              // (เลิกใช้)
  total_ng: number;
  total_ok: number;                // แสดงเป็น "Total FG"
  special_request: string;         // (เลิกใช้ตาม FM03)
  // Process — สถานะต่อ step (ค่า = '' | PP_STATUS) โชว์เป็นช่องสีในตาราง
  pc_prpo: string; pc_wait: string; pc_incoming: string; pc_smt: string;
  pc_thr: string; pc_test: string; pc_bbas: string; pc_packing: string;
  process_log: PpLogEntry[];       // ประวัติการเปลี่ยน process/สถานะ (วันที่ + step + สถานะ) — ใช้วาด Gantt หลายสี
  remark: string;
  // STATUS pipeline (ขั้นตอนการผลิต) — ติ๊กหลายช่อง · โชว์ฟอร์ม+Excel ไม่โชว์ตาราง Dashboard
  st_pr_po: boolean; st_wait_mat: boolean; st_incoming: boolean; st_create_bo: boolean;
  st_test: boolean; st_rework: boolean; st_smt: boolean; st_thr: boolean; st_bbas: boolean;
  created_at?: string;             // วันที่สร้าง (จาก backend/mock — ใช้เรียงลำดับ)
  updated_at?: string;
}

export type PpFilters = {
  status?: string; customer?: string; product_pn?: string; work_order?: string; model?: string;
  date_from?: string; date_to?: string;
};

// yield = OK / (OK+NG) * 100
export function ppYield(p: { total_ok: number; total_ng: number }): number | null {
  const sum = (p.total_ok || 0) + (p.total_ng || 0);
  return sum > 0 ? (p.total_ok / sum) * 100 : null;
}

const KEY = ['pp-projects'];

export function usePpProjects(filters: PpFilters = {}) {
  return useQuery({
    queryKey: [...KEY, filters],
    queryFn: async (): Promise<PpProject[]> => {
      const params: any = {};
      for (const [k, v] of Object.entries(filters)) if (v) params[k] = v;
      const res = await api.get('/pp/projects', Object.keys(params).length ? { params } : undefined);
      return ((res.data as any)?.data ?? []);
    },
  });
}

export function usePpCreate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<PpProject>) => {
      const res = await api.post('/pp/projects', data);
      if (res.status >= 400 || res.status === 0) throw new Error((res.data as any)?.message || 'Save failed');
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function usePpUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<PpProject> & { id: number }) => {
      const res = await api.put(`/pp/projects/${id}`, data);
      if (res.status >= 400 || res.status === 0) throw new Error((res.data as any)?.message || 'Update failed');
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function usePpDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await api.delete(`/pp/projects/${id}`);
      if (res.status >= 400 || res.status === 0) throw new Error('Delete failed');
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
