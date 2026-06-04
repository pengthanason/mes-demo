# MES API Reference

Base URL: `https://172.16.10.87/mes-api` (production) | `http://localhost:5100` (dev)

ทุก request ที่ไม่ใช่ login ต้องมี header:
```
Authorization: Bearer <jwt_token>
```

---

## Auth (M00)

| Method | Path | Role | คำอธิบาย |
|--------|------|------|---------|
| POST | `/api/mes/auth/login` | - | Login ด้วย username + pin |
| POST | `/api/mes/auth/refresh` | - | Refresh JWT token |
| GET | `/api/mes/auth/me` | ALL | ดู user info ตัวเอง |
| POST | `/api/mes/auth/logout` | ALL | Logout |

**Login body:**
```json
{ "username": "string", "pin": "string" }
```

---

## Planning & BOM (M01)

| Method | Path | Role | คำอธิบาย |
|--------|------|------|---------|
| POST | `/api/planning/pre-wo` | PM | สร้าง Pre-WO |
| GET | `/api/bom/headers` | ALL | ดูรายการ BOM ทั้งหมด |
| GET | `/api/bom/:bomId/review` | ALL | ดูรายละเอียด BOM |
| POST | `/api/bom` | PM | สร้าง BOM ใหม่ |

---

## Incoming / GR (M02)

| Method | Path | Role | คำอธิบาย |
|--------|------|------|---------|
| POST | `/api/store/receive` | STORE | รับของเข้า (GR) |
| POST | `/api/qa/approve` | QA | QA approve UID |
| GET | `/api/store/uids` | ALL | ดู UIDs ทั้งหมด |

---

## WO Release (M03)

| Method | Path | Role | คำอธิบาย |
|--------|------|------|---------|
| GET | `/api/wo/list` | ALL | ดูรายการ WO ทั้งหมด |
| GET | `/api/wo/:woId` | ALL | ดูรายละเอียด WO |
| POST | `/api/wo/convert` | PM | แปลง Pre-WO เป็น WO |
| GET | `/api/wo/boms` | PM | ดู BOM จาก MRP |

---

## Kitting / GI (M04)

| Method | Path | Role | คำอธิบาย |
|--------|------|------|---------|
| POST | `/api/store/issue` | STORE | จ่ายวัตถุดิบออก (GI → WMS) |
| POST | `/api/kitting/transfer` | STORE | Transfer material |
| POST | `/api/kitting/bypass` | PM | Bypass kitting approval |

---

## Production (M06)

| Method | Path | Role | คำอธิบาย |
|--------|------|------|---------|
| POST | `/api/production/start-unit` | TECH,PD | เริ่ม scan serial ผลิต |
| POST | `/api/routing/scan-in` | TECH,PD,QC | Scan เข้า routing station |
| POST | `/api/routing/scan-out` | TECH,PD,QC | Scan ออก routing station |
| GET | `/api/wo/:woId/kanban` | ALL | ดู Kanban board WO |
| POST | `/api/routing/jig/push` | TECH,PD,QC | ส่ง SN เข้า Jig-API (ICT) |
| GET | `/api/routing/jig/result/:unitSn` | ALL | ดูผล ICT/FCT |
| GET | `/api/routing/jig/health` | ALL | เช็ค Jig-API health |

---

## QC / Rework (M07)

| Method | Path | Role | คำอธิบาย |
|--------|------|------|---------|
| POST | `/api/qc/result` | QC | บันทึกผล QC (PASS/FAIL) |
| POST | `/api/rework/repair` | TECH,PD,QC | บันทึก rework |

**QC result body:**
```json
{
  "unit_sn": "SN-001",
  "wo_id": 123,
  "result": "PASS",
  "note": "optional"
}
```

---

## WO Close (M09)

| Method | Path | Role | คำอธิบาย |
|--------|------|------|---------|
| POST | `/api/wo/close` | PM,PD | ปิด WO (GR → WMS) |
| GET | `/api/wo/:woId/close-approvals` | ALL | ดูสถานะ approvals |

---

## Sync Log & Monitoring

| Method | Path | Role | คำอธิบาย |
|--------|------|------|---------|
| GET | `/api/mes/health` | - | Health check |
| GET | `/inbox/recent` | ALL | ดู event inbox ล่าสุด |

**mes_sync_log table columns:**
```
id, direction (MES→WMS/MES→MRP), event_type (WO_CREATE/KITTING_GI/WO_CLOSE_GR),
wo_id, status (OK/ERROR), payload (JSON), error_msg, created_at, attempts, max_attempts
```

**jig_test_results table columns:**
```
id, unit_sn, wo_id, test_type (ICT/FCT), result_status (PASS/FAIL/PENDING),
lot_no, tested_at, synced_at, raw_data (JSON)
```

---

## Error Response Format

ปัจจุบัน response format ยังไม่ consistent (เป็นส่วนหนึ่งของ Task B)
ตัวอย่าง format ที่พบ:
```json
{ "status": "error", "code": "NOT_FOUND", "message": "...", "request_id": "..." }
{ "error": "...", "detail": "..." }
{ "ok": false, "message": "..." }
```