import api from './api';

export type WoSummary = {
  woId: string;
  productCode: string;
  customer: string;
  qty: number;
  currentStep: string;
  station: string;
  updatedAt: string;
};

type ApiWo = {
  wo_number: string;
  part_no: string;
  qty_target: number;
  status: string;
  opened_at: string | null;
  created_at: string;
};

export async function fetchWoList(): Promise<WoSummary[]> {
  const { data } = await api.get<{ wos: ApiWo[] }>('/wo/list');
  return data.wos.map(wo => ({
    woId: wo.wo_number,
    productCode: wo.part_no,
    qty: wo.qty_target,
    currentStep: wo.status,
    customer: '-',
    station: '-',
    updatedAt: wo.opened_at ?? wo.created_at,
  }));
}
