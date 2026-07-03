// URL ระบบ Traceability ภายนอก (KNEX_GW) — อ่านจาก env var (ห้าม hardcode ใน source · FE-15)
// ตั้งค่าที่ VITE_JIGAPI_URL (ดู .env.example)
export const TRACE_URL = import.meta.env.VITE_JIGAPI_URL + '/traceability/knex_gw';
