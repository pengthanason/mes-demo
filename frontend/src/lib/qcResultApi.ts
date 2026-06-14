import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from './api';

export type QcOverall = 'PASS' | 'FAIL' | 'PARTIAL';
export type ReworkStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE';
export type TransferVerdict = 'APPROVED' | 'REJECTED';

export interface QcResult {
  id: number;
  woId: string;
  lotNo: string;
  qtyChecked: number;
  qtyPass: number;
  qtyFail: number;
  overall: QcOverall;
  defectDesc: string | null;
  createdAt: string;
  // joined from transfer_verifications
  verifyId: number | null;
  verdict: TransferVerdict | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
}

export interface ReworkTicket {
  id: number;
  qcResultId: number;
  woId: string;
  defectType: string;
  assignedTo: string;
  dueDate: string | null;
  status: ReworkStatus;
  lotNo: string;
  qcOverall: QcOverall;
  createdAt: string;
}

export interface TransferVerification {
  id: number;
  qcResultId: number;
  woId: string;
  verdict: TransferVerdict;
  note: string | null;
  verifiedBy: string;
  createdAt: string;
  // joined from qc_results
  lotNo: string;
  qtyChecked: number;
  qtyPass: number;
  qtyFail: number;
  overall: QcOverall;
  defectDesc: string | null;
  qcCreatedAt: string;
}

function mapQcResult(r: any): QcResult {
  return {
    id:          r.id,
    woId:        r.wo_id,
    lotNo:       r.lot_no,
    qtyChecked:  Number(r.qty_checked),
    qtyPass:     Number(r.qty_pass),
    qtyFail:     Number(r.qty_fail),
    overall:     r.overall,
    defectDesc:  r.defect_desc ?? null,
    createdAt:   r.created_at,
    verifyId:    r.verify_id ?? null,
    verdict:     r.verdict ?? null,
    verifiedBy:  r.verified_by ?? null,
    verifiedAt:  r.verified_at ?? null,
  };
}

function mapRework(r: any): ReworkTicket {
  return {
    id:          r.id,
    qcResultId:  r.qc_result_id,
    woId:        r.wo_id,
    defectType:  r.defect_type,
    assignedTo:  r.assigned_to,
    dueDate:     r.due_date ?? null,
    status:      r.status,
    lotNo:       r.lot_no,
    qcOverall:   r.qc_overall,
    createdAt:   r.created_at,
  };
}

const QC_RESULT_KEY = (woId?: string) => woId ? ['qc-results', woId] : ['qc-results'];
const REWORK_KEY = ['rework-tickets'];

export function useQcResults(woId?: string) {
  return useQuery({
    queryKey: QC_RESULT_KEY(woId),
    queryFn: async (): Promise<QcResult[]> => {
      const res = await api.get('/qc/results', woId ? { params: { wo_id: woId } } : undefined);
      return ((res.data as any)?.data ?? []).map(mapQcResult);
    },
  });
}

export function useQcResultCreate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      woId: string; lotNo: string; qtyChecked: number;
      qtyPass: number; qtyFail: number; overall: QcOverall; defectDesc: string;
    }) => {
      const res = await api.post('/qc/result', {
        wo_id:       payload.woId,
        lot_no:      payload.lotNo,
        qty_checked: payload.qtyChecked,
        qty_pass:    payload.qtyPass,
        qty_fail:    payload.qtyFail,
        overall:     payload.overall,
        defect_desc: payload.defectDesc,
      });
      if (res.status >= 400 || res.status === 0) {
        const msg = (res.data as any)?.message || 'บันทึก QC Result ไม่สำเร็จ';
        throw new Error(msg);
      }
      return mapQcResult((res.data as any)?.data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['qc-results'] }),
  });
}

export function useReworkList() {
  return useQuery({
    queryKey: REWORK_KEY,
    queryFn: async (): Promise<ReworkTicket[]> => {
      const res = await api.get('/rework/list');
      return ((res.data as any)?.data ?? []).map(mapRework);
    },
  });
}

export function useReworkCreate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      qcResultId: number; defectType: string; assignedTo: string; dueDate: string;
    }) => {
      const res = await api.post('/rework/repair', {
        qc_result_id: payload.qcResultId,
        defect_type:  payload.defectType,
        assigned_to:  payload.assignedTo,
        due_date:     payload.dueDate || null,
      });
      if (res.status >= 400 || res.status === 0) {
        const msg = (res.data as any)?.message || 'เปิด Rework Ticket ไม่สำเร็จ';
        throw new Error(msg);
      }
      return mapRework((res.data as any)?.data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: REWORK_KEY }),
  });
}

export function useTransferVerify(qcResultId: number | null) {
  return useQuery({
    queryKey: ['transfer-verify', qcResultId],
    enabled: qcResultId !== null,
    queryFn: async (): Promise<TransferVerification | null> => {
      const res = await api.get(`/qc/transfer-verify/${qcResultId}`);
      if (res.status === 404) return null;
      return (res.data as any)?.data ?? null;
    },
  });
}

export function useTransferVerifyCreate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      qcResultId: number; verdict: TransferVerdict; note: string; verifiedBy: string;
    }) => {
      const res = await api.post('/qc/transfer-verify', {
        qc_result_id: payload.qcResultId,
        verdict:      payload.verdict,
        note:         payload.note,
        verified_by:  payload.verifiedBy,
      });
      if (res.status >= 400 || res.status === 0) {
        const msg = (res.data as any)?.message || 'Transfer verify ไม่สำเร็จ';
        throw new Error(msg);
      }
      return (res.data as any)?.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['qc-results'] });
      qc.invalidateQueries({ queryKey: ['transfer-verify'] });
    },
  });
}
