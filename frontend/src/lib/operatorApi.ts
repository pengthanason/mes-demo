import api from './api';

export type CloseWoPayload = {
  actualQty: number;
};

export type ObaPayload = {
  woId: string;
  lotNo: string;
  sampleQty: number;
  result: 'PASS' | 'FAIL';
  defectNote?: string;
};

export type FaiPayload = {
  woId: string;
  checklistResults: Record<string, 'PASS' | 'FAIL'>;
  inspectorId: string;
  approverId: string;
};

export async function closeWo(woId: string, payload: CloseWoPayload): Promise<void> {
  await api.post('/wo/close', { wo_id: woId, actual_qty: payload.actualQty });
}

export async function submitOba(payload: ObaPayload): Promise<void> {
  await api.post('/qa/oba', payload);
}

export async function submitFai(payload: FaiPayload): Promise<void> {
  await api.post('/fai/submit', payload);
}