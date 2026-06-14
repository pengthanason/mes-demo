import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from './api';

export type MType   = 'Man' | 'Machine' | 'Material' | 'Method';
export type CrState = 'DRAFT' | 'G1_REVIEW' | 'G2_APPROVED' | 'ACTIVE';

export interface ChangeRequest {
  id: number;
  crNo: string;
  mType: MType;
  woRef: string;
  description: string;
  impact: string;
  state: CrState;
  g1Note: string | null;
  g1At: string | null;
  g2Note: string | null;
  g2At: string | null;
  g3Note: string | null;
  g3At: string | null;
  createdAt: string;
}

function mapRow(r: any): ChangeRequest {
  return {
    id:          r.id,
    crNo:        r.cr_no,
    mType:       r.m_type,
    woRef:       r.wo_ref ?? '',
    description: r.description ?? '',
    impact:      r.impact ?? '',
    state:       r.state,
    g1Note:      r.g1_note,
    g1At:        r.g1_at,
    g2Note:      r.g2_note,
    g2At:        r.g2_at,
    g3Note:      r.g3_note,
    g3At:        r.g3_at,
    createdAt:   r.created_at,
  };
}

const CR_KEY = ['change-requests'];

export function useCrList() {
  return useQuery({
    queryKey: CR_KEY,
    queryFn: async (): Promise<ChangeRequest[]> => {
      const res = await api.get('/cr/list');
      return ((res.data as any)?.data ?? []).map(mapRow);
    },
  });
}

export function useCrCreate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { mType: MType; woRef: string; description: string; impact: string }) => {
      const res = await api.post('/cr', {
        m_type:      payload.mType,
        wo_ref:      payload.woRef,
        description: payload.description,
        impact:      payload.impact,
      });
      if (res.status >= 400 || res.status === 0) throw new Error('เปิด CR ไม่สำเร็จ');
      return mapRow((res.data as any)?.data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CR_KEY }),
  });
}

export function useCrApproveGate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, gate, note }: { id: number; gate: 'g1' | 'g2' | 'g3'; note: string }) => {
      const res = await api.put(`/cr/${id}/gate-${gate}`, { note });
      if (res.status >= 400 || res.status === 0) {
        const msg = (res.data as any)?.message || 'อนุมัติ gate ไม่สำเร็จ';
        throw new Error(msg);
      }
      return mapRow((res.data as any)?.data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CR_KEY }),
  });
}
