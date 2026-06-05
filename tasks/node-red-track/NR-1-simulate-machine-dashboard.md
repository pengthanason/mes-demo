# NR-1 — จำลองเครื่องจักร + ทำ Dashboard 🏭📊

**ระดับ:** เริ่มต้น | **น่าจะใช้เวลา:** 2–3 วัน

---

## ทำไมต้องทำงานนี้

หน้าไลน์ผลิต MES อยากมี **จอ monitor** ที่โชว์ค่าจากเครื่องจักรแบบ real-time (อุณหภูมิ, สถานะเดิน/หยุด, จำนวนชิ้น)

แต่ตอนนี้เรายังไม่ได้ต่อเครื่องจริง — เลยจะ **"จำลอง" เครื่องจักรขึ้นมาก่อน** ด้วย Node-RED แล้วทำ dashboard โชว์ พอ Phase หลังเราค่อยเปลี่ยนข้อมูลจำลองเป็นของจริง (เหมือนที่ใน Frontend Track เราเริ่มด้วย mock ก่อน — หลักการเดียวกันเลย!)

## น้องจะได้ฝึกอะไร

- เข้าใจ **`msg.payload`** (ก้อนข้อมูลที่ไหลใน flow) ลึกขึ้น
- ใช้ node `inject` ยิงข้อมูลเป็นจังหวะ + `function` สร้างค่าจำลอง
- ทำ **Dashboard**: gauge (เกจวัด), chart (กราฟ), text (ข้อความสถานะ)

---

## ขั้นที่ 1 — ลง node-red-dashboard

- เมนู **☰ → Manage palette → Install** → ค้นคำว่า **`node-red-dashboard`** → กด install
- เสร็จแล้วจะมี node กลุ่ม **dashboard** โผล่ในซ้ายมือ (gauge, chart, text, ...)
- หน้า dashboard จะเปิดดูได้ที่ **http://localhost:1880/ui**

## ขั้นที่ 2 — จำลองอุณหภูมิเครื่องจักร

ทำ flow แบบนี้: `inject (ทุก 3 วิ) → function (สุ่มอุณหภูมิ) → gauge`

1. ลาก `inject` → ตั้งให้ยิงซ้ำทุก **3 วินาที** (ในหน้าตั้งค่ามีช่อง "Repeat → interval")
2. ลาก `function` เขียน:
   ```js
   // จำลองอุณหภูมิเครื่อง 50–90 °C
   msg.payload = Math.round(50 + Math.random() * 40);
   return msg;
   ```
3. ลาก node **`gauge`** (กลุ่ม dashboard) → ตั้งชื่อ "Machine Temp", หน่วย °C, ช่วง 0–120
4. ต่อสาย inject → function → gauge → **Deploy**
5. เปิด http://localhost:1880/ui → จะเห็นเข็มเกจขยับทุก 3 วิ 🎉

## ขั้นที่ 3 — เพิ่มกราฟเส้น (เห็นแนวโน้ม)

- ลาก node **`chart`** มาต่อจาก function ตัวเดิมด้วย (1 output ต่อได้หลายปลายทาง)
- ตั้งเป็น Line chart → Deploy → ดู /ui จะเห็นกราฟอุณหภูมิวิ่งเป็นเส้น

## ขั้นที่ 4 — เพิ่มสถานะเดิน/หยุด (run-state)

- ทำอีก flow: `inject (ทุก 5 วิ) → function (สุ่ม RUNNING/IDLE/DOWN) → text`
  ```js
  const states = ["RUNNING", "IDLE", "DOWN"];
  msg.payload = states[Math.floor(Math.random() * states.length)];
  return msg;
  ```
- ใช้ node **`text`** (dashboard) โชว์สถานะ
- 👉 ลองคิดต่อ: อยากให้ตัวอักษรเปลี่ยนสีตามสถานะไหม? (dashboard text มี option สีได้ หรือลองค้น "node-red dashboard text color")

## อยากให้ลองคิดเอง

- gauge กับ chart ต่างกันยังไง? อันไหนเหมาะดู "ค่าตอนนี้" อันไหนเหมาะดู "แนวโน้ม"
- ถ้ามีหลายเครื่อง (R1, R2, R3) น้องจะจัด layout dashboard ยังไงให้ดูง่าย? (dashboard มีแนวคิด Group/Tab ลองเล่นดู)

## ถ้าติด

- node-red-dashboard ลงไม่ขึ้น / ไม่เห็น /ui → ทักพี่
- งง flow → เปิดเว็บ flows.nodered.org ดูตัวอย่างคนอื่นได้ หรือค้น "node-red dashboard gauge example"

## เช็คตัวเองว่าใช่รึยัง

- [ ] เปิด /ui เห็น gauge อุณหภูมิขยับทุก 3 วิ
- [ ] มี chart เส้นอุณหภูมิ
- [ ] มี text โชว์สถานะ RUNNING/IDLE/DOWN
- [ ] export flow → `node-red-flows/nr-1-machine-sim.json` + PR `feat/nr-1-machine-dashboard` พร้อม screenshot /ui

นี่คือต้นแบบจอ monitor หน้าไลน์เลยนะ! Phase หน้าเราจะเอาข้อมูลจริงจาก MES มาแทนค่าสุ่ม 🔌
