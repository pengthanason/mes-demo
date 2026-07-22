// รวม env config ที่เดียว — เลิกกระจาย import.meta.env ทั่วโค้ด · แก้/อ้างอิงง่าย
const env = (import.meta as any).env ?? {};

export const API_BASE_URL: string = env.VITE_API_BASE_URL ?? '';        // base URL ของ MES API (ว่าง = same-origin /api)
export const JIGAPI_URL: string = env.VITE_JIGAPI_URL ?? '';            // jig-api (Traceability ภายนอก)
// โหมดเดโมเปิด "เฉพาะ" บนโดเมนเดโม (Vercel: hostname มี mes-demo) เท่านั้น
// → server จริง / เครื่องใครก็ตาม = ต่อ API จริงเสมอ (กันคนเอาโค้ดไปทำต่อแล้วเผลอได้ตัวเดโม)
// จะเทสเดโมในเครื่องเอง: ตั้ง VITE_DEMO_MODE=true เอง (opt-in เท่านั้น)
const onDemoHost = typeof window !== 'undefined' && /mes-demo/i.test(window.location.hostname);
export const IS_DEMO: boolean = env.VITE_DEMO_MODE === 'true' || onDemoHost;
