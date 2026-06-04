# Task B — Standardize Error Response Format

**ระดับ:** Intermediate | **เวลาที่คาดว่าใช้:** 1 สัปดาห์
**Stack:** Node.js / Express
**Repo:** `Weradech/syntech_mes_draft`

---

## โจทย์

ปัจจุบัน API ของ MES ส่ง error response format ไม่เหมือนกัน เช่น:

```json
// แบบที่ 1
{ "status": "error", "code": "NOT_FOUND", "message": "...", "request_id": "abc" }

// แบบที่ 2
{ "error": "WO not found", "detail": "..." }

// แบบที่ 3
{ "ok": false, "message": "..." }
```

ทำให้ frontend และ client อื่นๆ ต้องเช็ค format หลายแบบ

จงทำให้ทุก error response ใช้ format เดียวกัน

---

## Target Format

```json
{
  "success": false,
  "error": {
    "code": "WO_NOT_FOUND",
    "message": "Work order 123 not found",
    "detail": null
  },
  "request_id": "abc-123"
}
```

Success response:
```json
{
  "success": true,
  "data": { ... },
  "request_id": "abc-123"
}
```

---

## Acceptance Criteria

### 1. สร้าง error middleware กลาง

```
backend/common/errors.js   ← class definitions + helpers
backend/common/http.js     ← เพิ่ม sendError(), sendSuccess() helper
```

**Error classes:**
```js
class AppError extends Error {
  constructor(code, message, statusCode = 500, detail = null)
}
class NotFoundError extends AppError { constructor(resource) }
class ValidationError extends AppError { constructor(message, detail) }
class ConflictError extends AppError { constructor(message) }
class ForbiddenError extends AppError { constructor(message) }
```

### 2. Express error handler middleware

```js
// backend/server.js — ต่อท้ายสุดก่อน listen
app.use((err, req, res, next) => { /* handle AppError + unknown */ })
```

### 3. อัปเดต routes ที่ return error

เปลี่ยน `throw new Error(...)` หรือ `res.status(404).json({error:...})` ใน modules ที่กำหนด:
- `modules/03_wo_release/wo_release.routes.js`
- `modules/04_kitting/kitting.routes.js`
- `modules/07_qc_rework/qc_rework.routes.js`
- `modules/09_close/close.routes.js`

(ไม่ต้องแก้ทุก module — 4 ตัวนี้พอสำหรับ task นี้)

---

## ไฟล์ที่ต้องแก้

```
backend/common/
  errors.js    ← สร้างใหม่
  http.js      ← เพิ่ม helper (ของเดิมมีอยู่แล้ว อย่า overwrite ทั้งไฟล์)
backend/server.js           ← เพิ่ม error handler middleware
backend/modules/03_wo_release/wo_release.routes.js
backend/modules/04_kitting/kitting.routes.js
backend/modules/07_qc_rework/qc_rework.routes.js
backend/modules/09_close/close.routes.js
```

---

## Code Reference

**http.js ที่มีอยู่แล้ว:**
```
backend/common/http.js   ← ดู sendValidationError, reqId ที่ใช้อยู่
```

---

## Definition of Done

- [ ] `GET /api/wo/99999` → `{ success: false, error: { code: "WO_NOT_FOUND", ... } }`
- [ ] `POST /api/store/issue` body ผิด → `{ success: false, error: { code: "VALIDATION_ERROR", ... } }`
- [ ] ไม่มี route ไหนใน 4 modules ส่ง format เก่าอีก
- [ ] `node --check backend/common/errors.js` ผ่าน
- [ ] ส่ง PR พร้อม curl output ก่อน/หลัง