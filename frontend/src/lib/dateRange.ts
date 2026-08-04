// ── ช่วงปีที่ระบบยอมรับสำหรับ "ทุกช่องวันที่" — ที่เดียวจบ ────────────────────
// 🔴 บทเรียน INC 2026-08-03: <input type="date"> ที่ไม่มี min/max ยอมให้พิมพ์ปีหลักเดียว
//    (เจอ revised_date = 0001-04-11 ใน WO 102026) → Gantt คิดช่วงเป็น 739,741 วัน
//    → หน้า Dashboard พังทั้งหน้า (Maximum call stack size exceeded)
//
// กันไว้ 3 ชั้น และทั้ง 3 ชั้นต้องใช้ "ตัวเลขชุดเดียวกัน" ไม่งั้นจะมีช่องที่หลุด:
//   1. ชั้นนี้ → min/max ของ <input type="date"> ทุกช่อง (กันพิมพ์ผิดที่ต้นทาง)
//   2. ppParts.tsx `gToDate` → ปีนอกช่วง = ถือว่าไม่มีค่า + โชว์เตือนใต้ Gantt
//   3. my-api `dateGuard.js` → validateData ตอบ 400 (กันคนยิง API ตรงข้าม UI)
export const DATE_YEAR_MIN = 2000;
export const DATE_YEAR_MAX = new Date().getFullYear() + 10;

// ใส่ลง prop min/max ของ input ได้ตรงๆ — เบราว์เซอร์จะบล็อกค่านอกช่วงตอน submit
export const DATE_INPUT_MIN = `${DATE_YEAR_MIN}-01-01`;
export const DATE_INPUT_MAX = `${DATE_YEAR_MAX}-12-31`;
