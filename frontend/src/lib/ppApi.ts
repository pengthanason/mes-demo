import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from './api';

// สถานะงาน (ตาม Excel จริง)
export const PP_STATUS = ['DONE', 'ON_PROCESS', 'LATE', 'MATL_COMING'] as const;
export type PpStatus = typeof PP_STATUS[number];
export const PP_STATUS_LABEL: Record<string, string> = {
  DONE: 'Done', ON_PROCESS: 'On process', LATE: 'Late', MATL_COMING: "Mat'l coming",
};

export interface PpProject {
  id: number;
  status: string;
  wk: number | null;
  date_record: string | null;
  product_pn: string;
  model: string;
  customer: string;
  qty: number;
  syn_requestor: string;
  work_order: string;
  matl_coming: string;
  chk_man: boolean; chk_mac: boolean; chk_med: boolean; chk_mat: boolean;
  pd_pcba: boolean; pd_bbas: boolean; pd_test: boolean; pd_rma: boolean; pd_prep: boolean;
  pd_start_date: string | null;
  pd_finish_date: string | null;
  qa_test_rate: string;
  qa_finish_date: string | null;
  store_received: string | null;
  expected_date: string | null;
  revised_date: string | null;
  done: boolean;
  pd_pic: string;
  team_member: number;
  ok_per_day: number;
  total_ng: number;
  total_ok: number;
  remark: string;
}

export type PpFilters = {
  status?: string; customer?: string; product_pn?: string; model?: string;
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
      if (res.status >= 400 || res.status === 0) throw new Error((res.data as any)?.message || 'บันทึกไม่สำเร็จ');
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
      if (res.status >= 400 || res.status === 0) throw new Error((res.data as any)?.message || 'แก้ไขไม่สำเร็จ');
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
      if (res.status >= 400 || res.status === 0) throw new Error('ลบไม่สำเร็จ');
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
