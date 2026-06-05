# FE-1 — แปลง "Execution History Log" ของน้อง → React component 🟢

**ระดับ:** เริ่มต้น (แต่ใช้ของจริงที่น้องเขียนเอง) | **น่าจะใช้เวลา:** 2–3 วัน

---

## ทำไมเริ่มที่ตรงนี้

ใน prototype ของน้อง (`your-prototype/mes.html`) มีตาราง **Execution History Log** ที่โชว์ประวัติการ scan — มี column: Timestamp, Serial Number, Operation Flow Sequence, Result, Total Cycle Time

เราจะเริ่มจากชิ้นนี้ก่อน เพราะมัน **อ่านอย่างเดียว** (ไม่มีปุ่มกด ไม่มี state ซับซ้อน) = จุดเริ่มที่ดีที่สุดในการทำความรู้จัก React โดยไม่ต้องเรียนทุกอย่างพร้อมกัน

> 🎯 เป้าหมาย: เอาตารางที่น้องเขียนด้วย HTML + `updateTable()` มาทำใหม่เป็น **React component** ที่รับข้อมูลเป็น array แล้ว render ออกมา

## เปิดดูของเดิมก่อน

เปิด `your-prototype/mes.html` หา:
- ส่วน `<table>` ... `<tbody id="historyTableBody">` (โครงตาราง)
- function `updateTable()` (ตรงนี้น้องสร้าง `<tr>` ทีละแถวด้วยการต่อ string)

👉 สังเกตว่าตอนเขียน vanilla JS น้องต้อง "สร้าง HTML เป็น string แล้วยัดเข้า DOM เอง" — ใน React เราจะทำแบบนั้นน้อยลงมาก เพราะ React จัดการ DOM ให้

## น้องจะได้ฝึกอะไร

- **JSX** — เขียน "HTML ใน JavaScript" (คล้ายของเดิมแต่เป็นส่วนหนึ่งของ component)
- **props** — ส่งข้อมูลเข้า component
- **`.map()`** — วน array ออกมาเป็นแถวตาราง (แทน loop ต่อ string เอง)

---

## มาเริ่มกันทีละขั้น

**ก้าวที่ 1 — เปิดหน้าเปล่าใน MES ก่อน**
สร้าง `frontend/src/pages/RoutingHistoryPage.tsx` ที่ render หัวข้อ "Routing History" เฉยๆ
ผูก route + เมนูใน `src/App.jsx` (ดูหน้าอื่นเป็นตัวอย่าง ลอกแบบมาได้)
👉 เป้าหมาย: คลิกเมนูแล้วเห็นหน้าเปล่า

**ก้าวที่ 2 — เตรียมข้อมูลตัวอย่าง (เลียนแบบของน้อง)**
ทำ array ตัวอย่างให้หน้าตาเหมือนข้อมูลที่ prototype น้องเก็บ:
```ts
const SAMPLE_HISTORY = [
  { ts: '2026-06-05 09:12', serial: 'SN-00123', sequence: 'SMT(30s) → AOI(15s) → FCT(40s)', result: 'PASS', totalSec: 85 },
  { ts: '2026-06-05 09:20', serial: 'SN-00124', sequence: 'SMT(30s) → AOI(15s)',            result: 'FAIL', totalSec: 45 },
];
```

**ก้าวที่ 3 — render ตารางด้วย JSX + map**
แทนที่จะต่อ string เหมือน `updateTable()` เดิม คราวนี้ลองแบบ React:
```tsx
<table>
  <thead>
    <tr><th>Timestamp</th><th>Serial</th><th>Sequence</th><th>Result</th><th>Total</th></tr>
  </thead>
  <tbody>
    {SAMPLE_HISTORY.map((row, i) => (
      <tr key={i}>
        <td>{row.ts}</td>
        <td>{row.serial}</td>
        <td>{row.sequence}</td>
        <td>{row.result}</td>
        <td>{row.totalSec}s</td>
      </tr>
    ))}
  </tbody>
</table>
```
👉 เปรียบเทียบกับ `updateTable()` เดิมของน้องสิ — ผลลัพธ์เหมือนกัน แต่ React ให้เราเขียน "หน้าตา" ตรงๆ ไม่ต้องต่อ string เอง สะอาดกว่าเยอะ

**ก้าวที่ 4 — แยกแถวเป็น component (ทำให้ reuse ได้)**
สร้าง `frontend/src/components/HistoryRow.tsx` รับ 1 row ผ่าน props แล้ว render `<tr>`
แล้วให้หน้าหลักเรียก `<HistoryRow row={r} />` ในลูป map
👉 นี่คือหัวใจของ React — แตกของใหญ่เป็นชิ้นเล็กที่ใช้ซ้ำได้

**ก้าวที่ 5 — ทำ Result เป็น badge สี (ของเดิมน้องก็มี)**
PASS = เขียว, FAIL = แดง (ใน CSS เดิมน้องก็ทำสีไว้แล้ว เอา concept มาใช้)
👉 ใบ้: เขียน helper `function resultColor(result) { return result === 'PASS' ? 'green' : 'red'; }`

---

## อยากให้ลองคิดเอง

- `key={i}` ในก้าวที่ 3 คืออะไร ทำไม React ต้องการ? (ลองค้น "react key prop" — เกี่ยวกับการที่ React รู้ว่าแถวไหนคือแถวไหน)
- ถ้า array ว่าง (ยังไม่มี history) ควรโชว์อะไร? (ของเดิมน้องโชว์ "No production execution history found" — ลองทำให้ React โชว์แบบนั้นตอน array ว่าง)

## ถ้าติด

- งง JSX/map → เปิด `frontend/src/pages/RouteAdminPage.tsx` ดูว่าหน้าจริงเขา map ตารางยังไง
- เทียบกับของเดิมตัวเองได้เสมอ — น้องรู้ว่าผลลัพธ์ควรหน้าตายังไง เพราะน้องเขียนมันมาแล้ว
- ติดเกิน 2 ชม. ทักพี่

## เช็คตัวเองว่าใช่รึยัง

- [ ] เปิดเมนูใหม่เห็นตาราง history แสดงข้อมูลตัวอย่าง
- [ ] แยก `HistoryRow` เป็น component ต่างหาก
- [ ] Result เป็น badge สี (PASS เขียว / FAIL แดง)
- [ ] array ว่าง → โชว์ข้อความ "ไม่มีประวัติ" ไม่ใช่ตารางเปล่า
- [ ] PR branch `feat/fe-1-history-table` + screenshot

พอชิ้นนี้ผ่าน น้องจะเก็ต React component แล้ว — FE-2 เราจะแตะของที่ยากขึ้น คือ **ตัวเพิ่ม/ลบ step** ที่น้องทำ drag-and-drop ไว้ (เอามาทำเป็น React state) 💪
