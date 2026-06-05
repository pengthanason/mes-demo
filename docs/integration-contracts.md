# Integration Contracts — UI ↔ MES Backend

> เอกสารนี้ = **สัญญา (contract)** ระหว่าง frontend (น้องทำ) กับ backend (พี่/ทีมทำ)
> เป้าหมาย: น้องทำ UI ให้ **"พร้อมเสียบ"** ตาม shape ด้านล่าง แล้วทีมเอา API จริงมาต่อให้ — **น้องไม่ต้องเขียน backend / ไม่ต้องต่อ API เอง**
> เจ้าของไฟล์: Iris (software/backend) · อัปเดต 2026-06-05 · verify กับโค้ดจริงใน `syntech_mes_draft`

## หลักการ "พร้อมเสียบ" (น้องทำตามนี้)

1. **แยกจุดดึง/ส่งข้อมูลไว้ที่เดียว** ต่อ 1 หน้า เช่น `lib/routingApi.ts`:
   ```ts
   export async function fetchRoutingHistory(params): Promise<HistoryRow[]> { /* mock ก่อน */ }
   export async function saveSequence(payload): Promise<{id:string}> { /* mock ก่อน */ }
   ```
   ข้างในใส่ mock / `console.log` ไว้ก่อนได้ — **ทีมจะมาเปลี่ยนข้างในให้เป็น API จริง น้องไม่ต้องแตะ**
2. **กำหนด type ให้ตรง contract** ด้านล่าง (แบบที่ FE-1 ทำ — ดีแล้ว)
3. UI เรียกผ่าน function กลางพวกนี้เท่านั้น **ห้าม hardcode `fetch()` กระจายในหน้า**

---

## สถานะ endpoint จริง (ตรวจจาก syntech_mes_draft 2026-06-05)

### ✅ มีแล้ว — เสียบได้เลย (ทีม confirm shape ให้)
| ใช้กับ | Method | Path | Auth (requireRoles) |
|--------|--------|------|---------------------|
| FE-2 บันทึก sequence/route | POST | `/api/mes/routes` | ROUTE_ADMIN_ROLES |
| (แก้/ลบ route) | PUT/DELETE | `/api/mes/routes/:routeId` | ROUTE_ADMIN_ROLES |
| scan เข้า/ออก station | POST | `/api/routing/scan-in` `/scan-out` | TECH/PD/QC/ADMIN |
| ผล jig ของ unit | GET | `/api/routing/jig/result/:unitSn` | TECH/PD/QC/QA/ADMIN |
| kanban ต่อ WO | GET | `/api/wo/:woId/kanban` | TECH/PD/PM/QC/QA/ADMIN |

> ⚠️ auth จริงใช้ middleware `requireRoles([...])` (JWT) — **ไม่ใช่ header `x-user-role`** อย่าทำ guard เองฝั่ง frontend

### 🔧 ยังไม่มี = ทีม (Iris) จะสร้างให้
| ใช้กับ | Method | Path (วางแผน) | shape ที่จะคืน |
|--------|--------|----------------|----------------|
| dropdown station (FE-2) | GET | `/api/mes/routes` (list) | `{ data: Station[] }` |
| FE-1 routing history | GET | `/api/routing/history` | `{ data: HistoryRow[], total }` |
| FE-4 production report | GET | `/api/production/report?date=` | `{ data: ReportRow[] }` |

---

## Data shapes (น้อง define type ตามนี้)

```ts
// FE-1 RoutingHistory
type HistoryRow = { ts: string; serial: string; sequence: string; result: 'PASS'|'FAIL'; totalSec: number };

// FE-2 SequenceBuilder — payload ตอน save
type SequencePayload = { name: string; steps: { stationId: string; seconds: number }[] };
type Station = { id: string; name: string };

// FE-4 Production Report (แบบรายงาน Kotchapat)
type ReportRow = { code: string; customer: string; status: string; qty: number; delivery: string; stage: string };
```

---

## ⚠️ ที่อยู่ของโค้ด (สำคัญ)
โค้ด MES จริงอยู่ใน repo **`syntech_mes_draft`** ไม่ใช่ repo นี้ —
น้อง clone `syntech_mes_draft` → branch + PR ที่นั่น (repo `syntech-intern-2026` ใช้แค่ daily report + อ่านโจทย์)

## ลำดับงาน (ใครทำอะไร)
1. **น้อง**: ย้ายไป `syntech_mes_draft` → ทำ UI ให้พร้อมเสียบ (function กลาง + type + touch-friendly)
2. **ทีม (Iris)**: สร้าง GET catalog/history/report + confirm shape `/api/mes/routes` → แล้วสลับ mock เป็น API จริงใน function กลางให้
