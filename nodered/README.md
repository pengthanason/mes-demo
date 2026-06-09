# Syntech Intern Node-RED Project

> Node-RED v4.1.11 · MES Backend :5100 · Jig-API :3000

## ภาพรวม

Node-RED คือ visual programming tool ที่ใช้ "ต่อกล่อง" (node) แทนการเขียนโค้ดเต็มๆ
ในงานนี้น้องจะใช้มันเป็น **glue layer** ระหว่าง Jig/Machine → MES → Dashboard

```
[Jig / Machine]  →  [Node-RED :1880]  →  [MES API :5100]
                          ↓
                  [Dashboard HTML]
```

---

## Setup (ทำครั้งเดียว)

```bash
# 1. SSH เข้า server
ssh ball@172.16.10.87

# 2. เข้าโฟลเดอร์ project
cd /home/ball/intern-nodered

# 3. copy .env และตั้งค่า token
cp .env.example .env
nano .env   # แก้ MES_TOKEN (ดูวิธีด้านล่าง)

# 4. start Node-RED
npx node-red --userDir . --settings settings.js
```

**เปิด browser:** `http://172.16.10.87:1880/nr`

### วิธีหา MES_TOKEN

1. เปิด `http://172.16.10.87:5173` (MES frontend dev)
2. Login ด้วย user ที่มีสิทธิ์
3. เปิด DevTools (F12) → Application → Local Storage → `172.16.10.87`
4. หา key `syntech.mes.access_token` → copy ค่านั้น
5. วางใน `.env` บรรทัด `MES_TOKEN=<ค่าที่ copy มา>`

---

## ⬜ Easy — รู้จัก Node-RED (Tab: NR-0 Warmup)

**เป้าหมาย:** เข้าใจว่า node คืออะไร, flow คืออะไร, debug panel ใช้ยังไง

### Step 1: กด Inject แล้วดู Debug

1. เปิด Tab **"NR-0 Warmup"**
2. กด **Deploy** (ปุ่มแดงมุมบนขวา)
3. กด ปุ่ม **inject** (สี่เหลี่ยมซ้ายของ node "กด Start")
4. ดูผลใน **Debug panel** (icon แมลง ด้านขวา)

ผลที่ควรเห็น:
```json
{ "message": "สวัสดี Node-RED!", "timestamp": "...", "from": "Node-RED" }
```

### Step 2: ทดสอบ HTTP endpoint

```bash
# เปิด terminal อีกตัว แล้วรัน:
curl http://172.16.10.87:1880/nr/api/ping
```

ผลที่ควรเห็น:
```json
{ "status": "ok", "message": "pong", "t": 1234567890 }
```

### Step 3: แก้ Function node ด้วยตัวเอง

เปิด node **"แปลง payload"** แล้วแก้ให้เพิ่ม field `author: "ชื่อน้อง"` ใน output
กด Deploy → กด Inject อีกครั้ง → ดูว่า field ใหม่ขึ้นมาไหม

> **Checkpoint:** อธิบายได้ว่า node, wire, flow, Deploy, Debug คืออะไร

---

## 🟡 Medium — ต่อ MES API จริง (Tab: NR-2 Read MES)

**เป้าหมาย:** ดึงข้อมูล WO จาก MES และประมวลผลใน Node-RED

### Step 1: ตั้ง Token

ทำตามขั้นตอน "วิธีหา MES_TOKEN" ด้านบน แล้ว restart Node-RED

### Step 2: Deploy + ดูผล

1. เปิด Tab **"NR-2 Read MES"**
2. กด Deploy
3. Inject node จะทำงานอัตโนมัติทุก 30 วินาที
4. ดู **WO Summary** ใน Debug panel

ผลที่ควรเห็น:
```json
{
  "total": 12,
  "summary": { "OPEN": 3, "RUNNING": 5, "CLOSED": 4 },
  "running": [...],
  "fetchedAt": "2026-06-09T..."
}
```

### Step 3: ถ้าเห็น error 401

Token หมดอายุ — login ใหม่แล้วเอา token ใหม่ไปใส่ `.env` แล้ว restart

### Step 4: งาน (ทำด้วยตัวเอง)

เพิ่ม node ต่อจาก "WO Summary" เพื่อ:
- **filter** เฉพาะ WO ที่ `status === 'RUNNING'`
- **นับ** ว่ามีกี่ตัว
- **แสดง** ใน debug ว่า "มี X WO กำลังวิ่ง"

> **Hint:** ใช้ Function node เขียน JS ปกติ — `msg.payload.running.length` คือจำนวน RUNNING

> **Checkpoint:** ได้ข้อมูล WO จาก API จริง และ filter ข้อมูลได้

---

## 🔴 Advanced — รับ Jig Event (Tab: NR-3 Jig Events)

**เป้าหมาย:** Node-RED รับ POST จาก Jig แล้ว forward ไป MES

### Step 1: ทำความเข้าใจ Flow ที่มีอยู่

เปิด Tab **"NR-3 Jig Events"** — มี skeleton ให้แล้ว:
- **HTTP In** รับ POST ที่ `/jig-event`
- **Function** validate + map payload
- **HTTP Out** ตอบกลับ 200/400

ลองส่ง test request:
```bash
curl -X POST http://172.16.10.87:1880/nr/api/jig-event \
  -H "Content-Type: application/json" \
  -d '{"unit_sn":"SN-001","station":"SMT","result":"PASS","tested_at":"2026-06-09T10:00:00Z"}'
```

ดู Debug panel ว่า `mesPayload` มีข้อมูลถูกต้องไหม

### Step 2: Forward ไป MES (งานหลัก)

ต่อจาก node "Jig event received" เพิ่ม flow:

```
[debug: Jig event received]
        ↓
[function: เตรียม HTTP request ไป MES]
        ↓
[http request: POST /api/routing/jig/push]
        ↓
[switch: statusCode === 200 ?]
    ↓ yes            ↓ no
[debug: OK]    [debug: Error + alert]
```

**MES endpoint:** `POST /api/routing/jig/push`
```json
{
  "wo_id": 1,
  "unit_sn": "SN-001",
  "station_code": "SMT",
  "result": "PASS"
}
```

> **Hint:** ใช้ global context เพื่อดึง MES_API URL:
> ```js
> const MES_API = global.get('MES_API');
> ```

### Step 3: Error Handling

ถ้า MES ตอบ error ต้องทำอะไร? เพิ่ม node ที่:
- log error ลง debug
- ส่ง alert (อย่างน้อยทำ console.log ไว้ก่อน)

### Step 4: Load Test (bonus)

```bash
# ส่ง 10 requests พร้อมกัน
for i in $(seq 1 10); do
  curl -s -X POST http://172.16.10.87:1880/nr/api/jig-event \
    -H "Content-Type: application/json" \
    -d "{\"unit_sn\":\"SN-00$i\",\"station\":\"SMT\",\"result\":\"PASS\"}" &
done
wait
echo "done"
```

ดูใน Debug panel ว่า Node-RED จัดการ concurrent requests ได้ไหม

> **Checkpoint:** Node-RED รับ Jig event และ forward ไป MES API ได้ครบ

---

## Restart Node-RED

```bash
# หยุด (Ctrl+C ใน terminal ที่ run อยู่)
# หรือถ้า background:
pkill -f "node-red"

# start ใหม่
cd /home/ball/intern-nodered
npx node-red --userDir . --settings settings.js
```

---

## ไฟล์ในโปรเจกต์

| ไฟล์ | หน้าที่ |
|------|--------|
| `flows.json` | Flow ทั้งหมด — **version control ที่นี่** |
| `settings.js` | Config Node-RED (port, path, global vars) |
| `.env` | Token และ URL — **ห้าม commit** |
| `.env.example` | Template สำหรับ .env |

> ทุกครั้งที่แก้ flow แล้ว Deploy → `flows.json` จะอัปเดตอัตโนมัติ → git commit ได้เลย

---

*Guide สร้างโดย Iris — 2026-06-09*
