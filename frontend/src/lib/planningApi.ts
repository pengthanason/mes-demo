import api from './api';

// ── Types ──────────────────────────────────────────────────────────

export type WoStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';

export interface WoItem {
  wo_id: number;
  wo_no: string;
  product_name: string;
  qty: number;
  status: WoStatus;
  created_at: string;
  due_date?: string;
}

export interface PreWoItem {
  req_id: string;
  bom_id: string;
  bom_name?: string;
  qty: number;
  due_date: string;
  status: 'PENDING' | 'APPROVED' | 'CONVERTED';
  created_at: string;
}

export interface BomHeader {
  bom_id: string;
  name: string;
  version: string;
  approved: boolean;
  approved_at?: string;
}

export interface BomLine {
  line_id: string;
  part_no: string;
  part_name: string;
  qty_per: number;
  unit: string;
}

export interface BomDetail {
  bom_id: string;
  name: string;
  version: string;
  approved: boolean;
  approved_at?: string;
  lines: BomLine[];
}

export interface CreatePreWoPayload {
  bom_id: string;
  qty: number;
  due_date: string;
}

export interface ConvertPreWoPayload {
  req_id: string;
}

// ── API calls ──────────────────────────────────────────────────────

export const getWoList   = ()              => api.get<{ data: WoItem[] }>('/wo/list');
export const getWoDetail = (woId: string)  => api.get<{ data: WoItem }>(`/wo/${woId}`);

export const getPreWoList   = ()                           => api.get<{ data: PreWoItem[] }>('/wo/req/list');
export const createPreWo    = (payload: CreatePreWoPayload) => api.post('/wo/req', payload);
export const approvePreWo   = (reqId: string | number)      => api.patch(`/wo/req/${reqId}/approve`);
export const convertPreWo   = (payload: ConvertPreWoPayload) => api.post('/wo/convert', payload);

export const getBomList   = ()              => api.get<{ data: BomHeader[] }>('/bom/headers');
export const getBomDetail = (bomId: string) => api.get<{ data: BomDetail }>(`/bom/${bomId}/review`);
export const approveBom   = (bomId: string) => api.put(`/bom/${bomId}/approve`);

export interface CreateBomPayload {
  name: string;
  version: string;
  lines: { part_no: string; part_name: string; qty_per: number; unit: string }[];
}
export const createBom = (payload: CreateBomPayload) => api.post('/bom', payload);

// รายชื่อ WO ทางการ (work_orders) — สำหรับ datalist ทุกหน้าที่อ้างถึง WO
export interface WoNumber { woNo: string; productName: string; }
export const getWoNumbers = () => api.get<{ data: any[] }>('/wo/board');
