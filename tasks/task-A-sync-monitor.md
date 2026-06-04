# Task A — MES Sync Monitor UI

**ระดับ:** Beginner–Intermediate | **เวลาที่คาดว่าใช้:** 1–2 สัปดาห์
**Stack:** React (Vite) + Node.js/Express
**Repo:** `Weradech/syntech_mes_draft`

---

## โจทย์

ตอนนี้เมื่อ MES ส่งข้อมูลไป WMS หรือ MRP (เช่น GI, GR, สร้าง WO) มีการบันทึกลงใน `mes_sync_log`
และเมื่อ unit ผ่านการทดสอบ ICT/FCT ที่ Jig-API จะบันทึกลงใน `jig_test_results`

**แต่ยังไม่มีหน้า UI ให้ PM/Admin ดู logs เหล่านี้เลย**

จงสร้างหน้า admin "Sync Monitor" ที่แสดงข้อมูลจากทั้ง 2 ตาราง

---

## Acceptance Criteria

### Backend (ต้องสร้าง API ใหม่)

```
GET /api/admin/sync-log
  query: ?direction=MES→WMS&status=ERROR&wo_id=123&from=2026-06-01&limit=50
  response: { data: [...], total: N }

GET /api/admin/jig-results
  query: ?test_type=ICT&result_status=FAIL&wo_id=123&from=2026-06-01&limit=50
  response: { data: [...], total: N }
```

**role ที่อนุญาต:** `PM`, `ADMIN`

### Frontend (หน้าใหม่ใน Vite UI)

- [ ] Route: `#/sync-monitor`
- [ ] Tab 1: Sync Log — แสดง direction, event_type, wo_id, status (badge สี), created_at, error_msg
- [ ] Tab 2: Jig Results — แสดง unit_sn, wo_id, test_type, result_status (badge สี), tested_at
- [ ] Filter bar: date range + status + direction/test_type
- [ ] Pagination หรือ infinite scroll (limit 50 ต่อหน้า)
- [ ] Auto-refresh ทุก 30 วินาที (หยุดได้)
- [ ] Read-only ทั้งหมด — ไม่มีปุ่มแก้ไข/ลบ

---

## ไฟล์ที่ต้องสร้าง/แก้

```
backend/
  modules/
    15_admin/              ← สร้างโฟลเดอร์ใหม่
      admin.routes.js      ← GET /api/admin/sync-log + jig-results
  server.js                ← require + register route ใหม่

frontend/src/
  pages/
    SyncMonitorPage.tsx    ← หน้าหลัก (2 tabs)
  components/
    SyncLogTable.tsx       ← component ตาราง sync log
    JigResultTable.tsx     ← component ตาราง jig results
  App.jsx                  ← เพิ่ม route #/sync-monitor
```

---

## Code Reference

**ดูตัวอย่าง route ที่มีอยู่แล้ว:**
```
backend/modules/10_notifications/notifications.routes.js
backend/modules/12_scm_cases/recall.routes.js
```

**ดูตัวอย่าง frontend component:**
```
frontend/src/  (ดู component ที่มีอยู่แล้วเป็น reference)
```

**Database query ที่จะใช้:**
```sql
-- Sync log
SELECT * FROM mes_core.mes_sync_log
WHERE ($1::text IS NULL OR direction = $1)
  AND ($2::text IS NULL OR status = $2)
ORDER BY created_at DESC
LIMIT $3 OFFSET $4;

-- Jig results
SELECT * FROM mes_core.jig_test_results
WHERE ($1::text IS NULL OR test_type = $1)
  AND ($2::text IS NULL OR result_status = $2)
ORDER BY tested_at DESC
LIMIT $3 OFFSET $4;
```

---

## Definition of Done

- [ ] API ตอบ 200 พร้อม data (test ด้วย curl)
- [ ] หน้า UI โหลดได้ ไม่มี console error
- [ ] filter ทำงานได้ (เปลี่ยน status แล้ว data เปลี่ยน)
- [ ] auto-refresh ทำงาน (กดหยุดได้)
- [ ] ส่ง PR พร้อม screenshot ของหน้า UI