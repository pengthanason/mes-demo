// ── ด่านสุดท้ายของค่าวันที่: ปีต้องอยู่ในช่วงที่เป็นไปได้จริง ────────────────────
// 🔴 บทเรียน INC 2026-08-03: <input type="date"> (ตอนนั้นยังไม่มี min/max) ยอมให้พิมพ์ปีหลักเดียว
//    → `revised_date = 0001-04-11` เข้า DB ได้ → หน้า Dashboard ฝั่ง UI คิดช่วง Gantt เป็น
//    739,741 วัน แล้วพังทั้งหน้า (Maximum call stack size exceeded)
//
// ทำไมต้องกันที่ server ด้วยทั้งที่ใส่ min/max ใน input แล้ว:
//   min/max ของ <input> กันได้แค่คนกรอกผ่านหน้าเว็บ — ยิง API ตรง / เครื่องมือ import /
//   หน้าอื่นที่ลืมใส่ min ก็ยังส่งเข้ามาได้ · `Date.parse('0001-04-11')` ผ่านเฉยๆ
//   ด่านที่มีอยู่เดิมจึงจับไม่ได้
//
// ⚠️ ต้องเช็คเฉพาะ field ที่ "แก้รอบนี้" (changed) ไม่ใช่ค่ารวมทั้งแถว —
//    ไม่งั้นแถวที่มีค่าเสียอยู่แล้วจะแก้ field อื่นไม่ได้เลย (ล็อกตัวเอง)
//
// ตัวเลขต้องตรงกับ frontend/src/lib/dateRange.ts (DATE_YEAR_MIN / DATE_YEAR_MAX)
const YEAR_MIN = 2000;
const YEAR_MAX = new Date().getFullYear() + 10;

// true = ปีของค่านี้อยู่นอกช่วง (ค่าว่าง/null = ไม่ตรวจ ปล่อยให้ด่านอื่นจัดการ)
function badYear(v) {
  if (v == null || v === '') return false;
  const y = Number(String(v instanceof Date ? v.toISOString() : v).slice(0, 4));
  return !Number.isFinite(y) || y < YEAR_MIN || y > YEAR_MAX;
}

// คืน error string ตัวแรกที่เจอ (พร้อมป้ายชื่อ field ที่คนอ่านรู้เรื่อง) · null = ผ่านหมด
function firstBadYearError(changed, dateFields, labels = {}) {
  for (const k of dateFields) {
    if (k in changed && badYear(changed[k])) {
      return `${labels[k] || k}: ปีต้องอยู่ระหว่าง ${YEAR_MIN}–${YEAR_MAX} (ได้ค่า "${changed[k]}")`;
    }
  }
  return null;
}

module.exports = { YEAR_MIN, YEAR_MAX, badYear, firstBadYearError };
