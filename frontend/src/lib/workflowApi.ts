import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from './api';

// กระบวนการผลิตหลัก (เรียง A-Z)
export const PROCESSES = [
  'BBAS', 'CHECK MATERIAL', 'FCT TEST', 'FQC', 'ICT TEST', 'INSERT', 'IPQC',
  'MANUAL', 'PACKING', 'SET UP LINE', 'SMT', 'SOLDERING', 'TEST', 'WAV',
].slice().sort((a, b) => a.localeCompare(b));

export interface WfStep {
  process: string;
  seconds: number | null;
  pass?: boolean;              // ขั้นนี้ผ่านโดยปริยายไหม (false = มี FAIL path)
  failAction?: string;         // 'rework' | 'back' | 'rework_station' | 'scrap' | 'hold'
  backToIndex?: number | null; // ถ้า failAction='back' → index ของ step ปลายทาง (เก็บเป็น index กัน id เพี้ยนตอนโหลด)
  maxRetry?: number;
}

export interface Workflow {
  id: number;
  name: string;
  customer: string;
  model: string;
  steps: WfStep[];
  created_at: string;
}

// รองรับทั้งของเก่า (string[]) และใหม่ ({process, seconds}[])
function normSteps(raw: any): WfStep[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s: any) =>
    typeof s === 'string'
      ? { process: s, seconds: null }
      : {
          process: String(s?.process ?? ''),
          seconds: s?.seconds ?? null,
          pass: s?.pass !== false,                                            // เก่าที่ไม่มี field → true
          failAction: s?.failAction ?? 'rework',
          backToIndex: typeof s?.backToIndex === 'number' ? s.backToIndex : null,
          maxRetry: Number(s?.maxRetry) || 0,
        }
  );
}

export interface WorkflowResult {
  id: number;
  serial: string;
  customer: string;
  model: string;
  sequence: string;
  result: 'PASS' | 'FAIL';
  total_sec: number;
  created_at: string;
}

const KEY = ['workflows'];
const RESULT_KEY = ['workflow-results'];

export function useWorkflows() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Workflow[]> => {
      const res = await api.get('/workflow');
      return ((res.data as any)?.data ?? []).map((r: any) => ({
        id: r.id, name: r.name ?? '', customer: r.customer ?? '', model: r.model ?? '',
        steps: normSteps(r.steps), created_at: r.created_at,
      }));
    },
  });
}

export function useWorkflowCreate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; customer: string; model: string; steps: WfStep[] }) => {
      const res = await api.post('/workflow', input);
      if (res.status >= 400 || res.status === 0) throw new Error((res.data as any)?.message || 'บันทึก Workflow ไม่สำเร็จ');
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useWorkflowDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await api.delete(`/workflow/${id}`);
      if (res.status >= 400 || res.status === 0) throw new Error('ลบไม่สำเร็จ');
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/* ── Results (บันทึกผลเดินสายผลิต) ── */
export function useWorkflowResults() {
  return useQuery({
    queryKey: RESULT_KEY,
    queryFn: async (): Promise<WorkflowResult[]> => {
      const res = await api.get('/workflow/results');
      return ((res.data as any)?.data ?? []).map((r: any) => ({
        id: r.id, serial: r.serial ?? '', customer: r.customer ?? '', model: r.model ?? '',
        sequence: r.sequence ?? '', result: r.result === 'FAIL' ? 'FAIL' : 'PASS',
        total_sec: Number(r.total_sec) || 0, created_at: r.created_at,
      }));
    },
  });
}

export function useWorkflowResultCreate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { serial: string; customer: string; model: string; sequence: string; result: string; total_sec: number; steps?: { process: string; result: string }[] }) => {
      const res = await api.post('/workflow/results', input);
      if (res.status >= 400 || res.status === 0) throw new Error((res.data as any)?.message || 'บันทึกผลไม่สำเร็จ');
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: RESULT_KEY }),
  });
}

export function useWorkflowResultDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await api.delete(`/workflow/results/${id}`);
      if (res.status >= 400 || res.status === 0) throw new Error('ลบไม่สำเร็จ');
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: RESULT_KEY }),
  });
}
