# NR-2 — ดึงข้อมูลจริงจาก MES มาโชว์ 🔌

**ระดับ:** เริ่ม–กลาง | **น่าจะใช้เวลา:** 2–4 วัน

---

## ทำไมต้องทำงานนี้

ใน NR-1 น้องโชว์ค่าสุ่มไปแล้ว คราวนี้เราจะให้ Node-RED **ไปดึงข้อมูลสถานะ station จริงจากระบบ MES** มาแสดงบน dashboard

นี่คือก้าวแรกของการเป็น "สะพาน" จริง — Node-RED ฝั่งหนึ่งคุยกับ MES อีกฝั่งโชว์ให้คนดู

## น้องจะได้ฝึกอะไร

- ใช้ node **`http request`** ไปเรียก API ของระบบอื่น
- แกะข้อมูลที่ได้กลับมา (JSON) เอาเฉพาะส่วนที่ต้องการ
- ป้อนเข้า dashboard เหมือน Phase ก่อน

---

## endpoint ที่จะดึง

```
GET  http://<ที่อยู่ MES>:5100/api/mes/stations/monitor
```

> ❓ "ที่อยู่ MES" คืออะไร? ถ้าน้องรัน MES backend ในเครื่องตัวเองก็ `http://localhost:5100`
> ถ้ายังรันไม่ได้ / ไม่แน่ใจ → **ทักพี่** พี่จะบอก URL ที่ถูกหรือเปิด backend ให้ (เรื่อง server เป็นงานพี่ ไม่ใช่น้อง)

## ขั้นที่ 1 — ยิง API ดูก่อนว่าได้อะไรกลับมา

ทำ flow: `inject → http request → debug`

1. `http request` node → ตั้ง method = **GET**, URL = endpoint ข้างบน, ตั้ง "Return" = **a parsed JSON object**
2. ต่อ inject → http request → debug → Deploy → กด inject
3. ดูแท็บ Debug ว่าข้อมูลหน้าตาเป็นยังไง (มี station อะไรบ้าง field ชื่ออะไร)

👉 เหมือน FE-2 เลยนะ — **ดูของจริงก่อนเสมอ** ก่อนจะเอาไปทำอะไรต่อ

## ขั้นที่ 2 — ดึงค่ามาเป็นจังหวะ

- เปลี่ยน inject ให้ยิงซ้ำทุก ~10 วินาที (polling) → dashboard จะอัปเดตเองเรื่อยๆ
- 👉 ลองคิด: ยิงถี่ไป (ทุก 1 วิ) ดีไหม? อาจหนัก server เกินจำเป็น — 5–10 วิกำลังดีสำหรับ monitor

## ขั้นที่ 3 — แกะข้อมูล + โชว์ dashboard

- ใช้ `function` หรือ `change` node ดึงเฉพาะ field ที่อยากโชว์ออกจากก้อน JSON
  ```js
  // ตัวอย่าง: สมมติ payload เป็น array ของ station
  // อยากนับว่ามีกี่เครื่องที่ RUNNING
  const running = msg.payload.filter(s => s.status === "RUNNING").length;
  msg.payload = running;
  return msg;
  ```
- เอาไปเข้า gauge / text / chart เหมือน NR-1
- 👉 ต่อยอด: ทำ table/template แสดง station ทุกตัวพร้อม badge สีก็ได้ (dashboard มี node `template` เขียน HTML ได้ — ตรงกับสกิล frontend ของน้องเลย)

## ถ้าต่อ MES ไม่ติด (อ่านให้จบก่อนเครียด)

อาการที่เจอบ่อยและ**ไม่ใช่ความผิดน้อง**:
- **CORS / connection refused** → backend ปิดอยู่ หรือ URL ผิด → ทักพี่
- **401 / ต้อง token** → endpoint ต้อง login ก่อน → ทักพี่ขอวิธีใส่ auth header
- ระหว่างรอ backend พร้อม น้อง**ทำต่อด้วยข้อมูลจำลองจาก NR-1 ไปก่อนได้** แล้วค่อยสลับ http request เข้ามาแทน (หลักการ mock-first เหมือนเดิม)

## เช็คตัวเองว่าใช่รึยัง

- [ ] flow ยิง GET /api/mes/stations/monitor แล้วเห็น JSON จริงใน debug (หรือถ้า backend ยังไม่พร้อม ใช้ mock + ระบุใน PR)
- [ ] dashboard อัปเดตค่าเองทุก ~10 วิ
- [ ] โชว์อย่างน้อย 1 ค่าที่แกะมาจากข้อมูล MES (เช่น จำนวนเครื่องที่ RUNNING)
- [ ] export flow → `node-red-flows/nr-2-read-mes.json` + PR `feat/nr-2-read-mes` พร้อม screenshot

ตอนนี้ Node-RED น้องคุยกับ MES ได้แล้ว (ทางอ่าน) — Phase หน้าเราจะหัด **ส่งข้อมูลกลับเข้า MES** ซึ่งคือคุณค่าตัวจริงของ gateway 🚀
