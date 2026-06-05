# NR-3 — IIoT Gateway: ส่ง event เครื่องจักรเข้า MES 🌉

**ระดับ:** กลาง | **น่าจะใช้เวลา:** 3–5 วัน

---

## ทำไมต้องทำงานนี้ (อันนี้คือของจริงที่ MES ต้องการ)

MES มี endpoint สำหรับรับ "เหตุการณ์จากเครื่องจักร" อยู่แล้ว:

```
POST /api/machine/event
```

แต่ตอนนี้ยัง**ไม่มีใครส่งข้อมูลเข้ามา** เพราะเครื่องจักรหน้าไลน์ยังไม่มี "สะพาน" เชื่อมเข้า MES

งานน้องคือสร้างสะพานนั้นด้วย Node-RED — จำลองเครื่องจักรส่งสัญญาณ แล้ว Node-RED แปลงเป็นรูปแบบที่ MES เข้าใจ แล้ว **POST เข้า MES** นี่แหละคือบทบาท **IIoT Gateway** ตัวจริง และเป็นชิ้นงานที่ช่วย MES โดยตรง 💪

## น้องจะได้ฝึกอะไร

- ใช้ `http request` แบบ **POST** (ส่งข้อมูลออก ไม่ใช่แค่ดึงเข้า)
- **แปลง/จัดรูปข้อมูล** (machine raw → payload ที่ MES ต้องการ) ด้วย function/change node
- **จัดการ error**: ถ้า MES ตอบ error ต้องรู้ ไม่ใช่ส่งหายไปเงียบๆ

---

## ขั้นที่ 1 — รู้ก่อนว่า MES อยากได้ payload หน้าตาไหน

ก่อนส่ง ต้องรู้ว่า `/api/machine/event` รับ field อะไรบ้าง
👉 อันนี้ **ทักพี่ขอ contract** (ตัวอย่าง field: `machine_id`, `event_type`, `value`, `timestamp` — แต่ของจริงพี่จะ confirm ให้)
อย่าเดาเอง เพราะถ้า field ไม่ตรง MES จะไม่รับ — รู้ contract ที่ถูกก่อนค่อยลงมือ

สมมติ contract เป็นแบบนี้ (รอพี่ยืนยัน):
```json
{ "machine_id": "R1", "event_type": "TEMP", "value": 78, "ts": "2026-06-05T09:12:00Z" }
```

## ขั้นที่ 2 — จำลองเครื่องส่งสัญญาณ

เอา flow จำลองอุณหภูมิจาก NR-1 มาต่อยอด: `inject (ทุก 5 วิ) → function (สุ่มค่า)`

## ขั้นที่ 3 — แปลงให้เป็น payload ของ MES

ใช้ `function` จัดรูปข้อมูลให้ตรง contract:
```js
msg.payload = {
  machine_id: "R1",
  event_type: "TEMP",
  value: msg.payload,          // ค่าที่สุ่มมาจาก node ก่อนหน้า
  ts: new Date().toISOString()
};
return msg;
```

## ขั้นที่ 4 — POST เข้า MES

- ลาก `http request` → method = **POST**, URL = `http://<MES>:5100/api/machine/event`
- ตั้ง header `Content-Type: application/json` (ปกติ http request node จัดการให้ถ้า payload เป็น object)
- ต่อ: inject → function(สุ่ม) → function(แปลง) → http request → debug
- Deploy แล้วดู debug ว่า MES ตอบอะไรกลับมา (200 = สำเร็จ)

## ขั้นที่ 5 — จัดการ error (อย่าให้พังเงียบ)

นี่คือสิ่งที่แยก gateway มือสมัครเล่นกับมืออาชีพ:
- ต่อ output ของ http request เข้า `switch` node เช็ค `msg.statusCode`
  - 200/201 → ทุกอย่างปกติ (อาจโชว์ไฟเขียวบน dashboard)
  - อื่นๆ → ส่งเข้า debug + โชว์เตือนบน dashboard ว่า "ส่งเข้า MES ไม่สำเร็จ"
- 👉 ลองคิด: ถ้า MES ล่มชั่วคราว เราควรลองส่งซ้ำไหม? หรือเก็บไว้ส่งทีหลัง? (ยังไม่ต้องทำตอนนี้ แค่คิดไว้ — นี่คือโจทย์จริงของ IIoT gateway)

## อยากให้ลองคิดเอง

- ทำไม gateway ต้อง "แปลงข้อมูล" ทำไมไม่ส่งดิบๆ? (คำตอบเกี่ยวกับ: เครื่องแต่ละยี่ห้อพูดภาษาต่างกัน MES อยากได้ภาษาเดียว)
- ถ้ามี 5 เครื่องส่งพร้อมกัน flow น้องรับไหวไหม? ต้องแก้อะไร?

## ถ้าติด

- POST แล้ว MES ตอบ 400/422 = payload ไม่ตรง contract → เทียบ field กับที่พี่ให้
- 401 = ต้อง auth → ทักพี่ขอวิธีใส่ token
- connection refused = backend ปิด → ทักพี่
- **ย้ำ: เรื่อง backend/network/auth ไม่ใช่งานน้อง ทักได้เลยไม่ต้องงมเอง**

## เช็คตัวเองว่าใช่รึยัง

- [ ] flow POST machine event เข้า MES แล้วได้ 200 (ดูใน debug)
- [ ] ถ้า MES error → flow จับได้ ไม่เงียบหาย
- [ ] (ตรวจร่วมกับพี่) เห็น event ที่ส่งโผล่ในฝั่ง MES จริง
- [ ] export flow → `node-red-flows/nr-3-event-gateway.json` + PR `feat/nr-3-event-gateway` พร้อม screenshot

น้องเพิ่งสร้าง IIoT Gateway ตัวแรกที่ feed ข้อมูลเข้า MES ได้! เหลือ Phase สุดท้าย — รวมทุกอย่างเป็นหน้าจอ monitor ครบวงจร 🎯
