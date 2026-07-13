// รวม env config ที่เดียว — เลิกกระจาย import.meta.env ทั่วโค้ด · แก้/อ้างอิงง่าย
const env = (import.meta as any).env ?? {};

export const API_BASE_URL: string = env.VITE_API_BASE_URL ?? '';        // base URL ของ MES API (ว่าง = same-origin /api)
export const JIGAPI_URL: string = env.VITE_JIGAPI_URL ?? '';            // jig-api (Traceability ภายนอก)
export const IS_DEMO: boolean = env.VITE_DEMO_MODE === 'true';          // โหมดเดโม (Vercel) → เปิด MSW mock
