// URL ระบบ Traceability ภายนอก (KNEX_GW) — อ่านจาก env var (ห้าม hardcode ใน source · FE-15)
// ตั้งค่าที่ VITE_JIGAPI_URL (ดู .env.example)
import { JIGAPI_URL } from './config';
export const TRACE_URL = JIGAPI_URL + '/traceability/knex_gw';
