// รันด้วย: node tests/dateGuard.test.js   (ไม่ต้องมี test runner / ไม่แตะ DB)
// ล็อกพฤติกรรมของด่านปีวันที่ — INC 2026-08-03: revised_date = 0001-04-11 ทำหน้า Dashboard พังทั้งหน้า
const assert = require('node:assert');
const { badYear, firstBadYearError, YEAR_MIN, YEAR_MAX } = require('../dateGuard');

const DATE_FIELDS = ['date_record', 'pd_start_date', 'pd_finish_date', 'qa_finish_date', 'store_received', 'expected_date', 'revised_date', 'bom_rec_date'];
const LABELS = { revised_date: 'Revised date', expected_date: 'Expected date', date_record: 'Date record' };
const err = (changed) => firstBadYearError(changed, DATE_FIELDS, LABELS);

const cases = [
  // [ชื่อเคส, ค่าที่ส่งมา, ต้องมี error ไหม]
  ['เคสจริงที่ทำ prod พัง — revised_date = 0001-04-11', { revised_date: '0001-04-11' }, true],
  ['ปีมากเกินไป — 9999-01-01', { expected_date: '9999-01-01' }, true],
  ['ISO datetime ปีเพี้ยน (pg คืนเป็น Date → toISOString)', { revised_date: '0001-04-11T00:00:00.000Z' }, true],
  ['Date object ปีเพี้ยน', { revised_date: new Date('0001-04-11T00:00:00Z') }, true],
  ['ต่ำกว่าขอบ 1 วัน — 1999-12-31', { date_record: '1999-12-31' }, true],
  ['วันที่ปกติ — 2026-06-20', { revised_date: '2026-06-20' }, false],
  ['ขอบล่างพอดี — 2000-01-01', { date_record: '2000-01-01' }, false],
  ['ล้างช่อง (empty string)', { revised_date: '' }, false],
  ['ล้างช่อง (null)', { revised_date: null }, false],
  ['ไม่ได้ส่ง field วันที่มาเลย', { status: 'DONE' }, false],
  // 🔑 กันล็อกตัวเอง: แถวที่ค่าเสียค้างอยู่ใน DB ต้องยังแก้ field อื่นได้
  ['แถวที่มีค่าเสียอยู่แล้ว แก้ remark เฉยๆ', { remark: 'x' }, false],
];

let pass = 0;
for (const [name, changed, shouldFail] of cases) {
  const got = err(changed);
  assert.strictEqual(got !== null, shouldFail, `[FAIL] ${name} → ได้ ${JSON.stringify(got)}`);
  if (shouldFail) assert.match(got, /ปีต้องอยู่ระหว่าง/, `[FAIL] ${name} → ข้อความไม่บอกช่วงปี`);
  pass++;
}

// badYear ตรงๆ
assert.strictEqual(badYear('0001-04-11'), true);
assert.strictEqual(badYear('2026-01-01'), false);
assert.strictEqual(badYear(undefined), false);
assert.ok(YEAR_MIN === 2000 && YEAR_MAX >= 2036, 'ช่วงปีต้องตรงกับ frontend/src/lib/dateRange.ts');

console.log(`✅ dateGuard: ผ่าน ${pass} เคส + badYear 3 เคส · ช่วงปี ${YEAR_MIN}–${YEAR_MAX}`);
