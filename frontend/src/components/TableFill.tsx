/**
 * ล็อกความสูงตารางที่มีการแบ่งหน้า (pagination)
 *
 * ปัญหา: หน้าสุดท้ายมีแถวน้อยกว่าหน้าอื่น → ตารางเตี้ยลง → ปุ่มเปลี่ยนหน้าขยับขึ้น
 *        กดเปลี่ยนหน้ารัวๆ แล้วพลาด (กดไปโดนหน้าอื่น)
 *
 * วิธีใช้ (3 จุดต่อ 1 ตาราง):
 *   1) <table style={{ tableLayout:'fixed', ... }}> + <colgroup> กำหนดความกว้าง  → คอลัมน์ไม่ขยับ
 *   2) ใส่ height: ROW_H ที่ <td> ตัวแรกของแถวจริง                              → ทุกแถวสูงเท่ากัน
 *   3) ปิด <tbody> ด้วย <FillerRows count={fillerCount(...)} cols={N} />        → เติมแถวว่างให้ครบหน้า
 */

/** ความสูงคงที่ต่อแถว (px) — ต้องมากกว่าเนื้อหาที่สูงสุดในแถว (ป้าย badge ฯลฯ) */
export const ROW_H = 38;

/** ตารางแบบแน่น (.table--dense เช่น Dashboard) แถวเตี้ยกว่า — ส่งเข้า rowH ของ FillerRows ให้ตรงกัน */
export const ROW_H_DENSE = 30;

/**
 * จำนวนแถวว่างที่ต้องเติม
 * คืน 0 เมื่อมีหน้าเดียว — ไม่ต้องยืดตารางให้โหวงเวลาข้อมูลน้อย
 */
export function fillerCount(rowsOnPage: number, perPage: number, totalPages: number): number {
  if (totalPages <= 1) return 0;
  return Math.max(0, perPage - rowsOnPage);
}

/**
 * แถวว่างที่สูงเท่าแถวจริงเป๊ะ + มีเส้นคั่นเหมือนกัน (ไม่ให้ตารางเตี้ยลง)
 * rowH: ใส่เมื่อแถวจริงไม่ได้ใช้ ROW_H (เช่นตาราง dense ใช้ ROW_H_DENSE) — ต้องตรงกับแถวจริง ไม่งั้นความสูงรวมยังเปลี่ยน
 */
export function FillerRows({ count, cols, rowH = ROW_H }: { count: number; cols: number; rowH?: number }) {
  if (count <= 0) return null;
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <tr key={`__filler-${i}`} style={{ borderBottom: '1px solid var(--border)' }} aria-hidden="true">
          <td colSpan={cols} style={{ height: rowH, padding: '0.5rem 0.75rem' }}>&nbsp;</td>
        </tr>
      ))}
    </>
  );
}
