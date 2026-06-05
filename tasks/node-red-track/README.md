# Node-RED Track — หัด Node-RED ไปพร้อมกับช่วยงาน MES 🔴🟢

สวัสดีอีกครั้งค่ะน้อง! 👋 Track นี้เป็น **ของแถมสนุกๆ** ที่พี่อยากให้น้องได้ลอง คู่ขนานไปกับ Frontend Track

> **Node-RED คืออะไร?** เป็นเครื่องมือเขียนโปรแกรมแบบ "ลากต่อกล่อง" (flow-based) — แทนที่จะพิมพ์โค้ดยาวๆ เราลาก "node" มาต่อสายกัน ข้อมูลก็ไหลจากกล่องนึงไปอีกกล่อง เห็นภาพชัด เริ่มง่ายมาก เหมาะกับงาน **IoT / เชื่อมต่อเครื่องจักร** สุดๆ

## ทำไมพี่เลือก Node-RED ให้น้อง (และมันเกี่ยวกับ MES ยังไง)

Synergy ทำสาย **Smart IoT / AIoT** และระบบ **MES** ของเราต้องการสิ่งหนึ่งมากๆ คือ **"สะพาน"** ที่เชื่อมข้อมูลจาก **เครื่องจักรหน้าไลน์ผลิต → เข้าระบบ MES** (เช่น เครื่องเดินอยู่/หยุด, อุณหภูมิ, จำนวนชิ้นที่ผลิต)

Node-RED คือเครื่องมือยอดนิยมที่สุดตัวหนึ่งสำหรับทำสะพานนี้ — เราเรียกมันว่า **IIoT Gateway**

ดังนั้น Track นี้ **ไม่ใช่การเล่น Node-RED ลอยๆ** แต่ทุก Phase น้องจะค่อยๆ สร้าง gateway ที่**ช่วยงาน MES จริง**:
- อ่านสถานะ station จาก MES มาโชว์เป็น dashboard
- จำลองเครื่องจักรแล้วส่ง event เข้า MES (`/api/machine/event`)
- ทำหน้าจอ monitor หน้าไลน์ที่ทีมผลิตใช้ดูจริงได้

> 🎯 **ลำดับความสำคัญ:** ถ้าน้องต้องเลือกว่าจะทำ Frontend Track หรือ Node-RED Track ก่อน — **เอางานที่ช่วย MES เป็นหลักก่อนเสมอ** Track นี้ทำแทรกตอนอยากเปลี่ยนบรรยากาศ หรือพี่ชวนทำเป็นช่วงๆ ได้

## เครื่องมือ

- **Node-RED** (รันบนเครื่องน้องเอง ที่ `http://localhost:1880`)
- **node-red-dashboard** (ส่วนเสริมทำหน้าจอ — ลงเพิ่มใน Phase 1)
- ความรู้ MES นิดหน่อย: endpoint ที่เราจะเล่นด้วยคือ `/api/mes/stations/monitor` (อ่านสถานะ) และ `/api/machine/event` (ส่ง event เครื่องจักร)

## 5 Phase (ไล่จากง่ายไปช่วยงานจริง)

| Phase | งาน | ได้ฝึก | ช่วย MES ยังไง |
|-------|-----|--------|----------------|
| **NR-0** | [ติดตั้ง + flow แรก](./NR-0-setup-and-first-flow.md) | รู้จัก editor, inject→debug | (อุ่นเครื่อง) |
| **NR-1** | [จำลองเครื่องจักร + Dashboard](./NR-1-simulate-machine-dashboard.md) | message/payload, gauge, chart | ได้ต้นแบบหน้าจอ monitor หน้าไลน์ |
| **NR-2** | [ดึงข้อมูลจริงจาก MES มาโชว์](./NR-2-read-from-mes.md) | http request node, ต่อ API | dashboard อ่านสถานะ station จาก MES จริง |
| **NR-3** | [ส่ง event เครื่องจักรเข้า MES](./NR-3-machine-event-gateway.md) | http POST, แปลงข้อมูล, error handling | **gateway ส่ง machine event เข้า MES** (ของจริงที่ MES ต้องการ) |
| **NR-4** | [Capstone: Shop-Floor Live Monitor](./NR-4-capstone-shopfloor-monitor.md) | รวมทุกอย่าง + alert | หน้าจอ monitor + gateway ครบวงจร |

## นิสัยดีๆ (เหมือน Frontend Track)

- **Export flow แล้ว commit บ่อยๆ** — Node-RED ให้ export flow เป็นไฟล์ JSON ได้ (เมนู ☰ → Export) เก็บไฟล์นั้นเข้า git ใน `node-red-flows/` พี่จะได้เปิดดู flow น้องแล้วช่วยได้
- **ติดเกิน 2 ชม. ทักพี่** — โดยเฉพาะถ้าต่อ MES ไม่ติด (เรื่อง network/CORS/auth เป็นฝั่ง backend พี่ช่วยได้)
- **1 phase = 1 branch = 1 PR** แนบ screenshot flow + dashboard

## เช็คตัวเองว่าใช่รึยัง

แต่ละ phase มีหัวข้อ "เช็คตัวเองว่าใช่รึยัง" ให้ลองทดสอบ + อย่าลืม screenshot ทั้ง **flow (กล่องที่ต่อกัน)** และ **ผลลัพธ์ (dashboard/debug)** ใส่ PR นะคะ
