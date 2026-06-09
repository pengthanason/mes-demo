# FE-7: Apply Your Components to Real MES

> **เป้าหมาย:** นำ component ที่สร้างใน FE-5 และ FE-6 ไป plug เข้ากับ `syntech_mes_draft` จริง
> เปลี่ยนจาก mock data → ข้อมูลจาก API จริงของระบบ

---

## บริบท

ตอนนี้น้องทำทุกอย่างใน repo นี้ (intern) แต่ MES จริงอยู่ที่ `syntech_mes_draft` บน server
สิ่งที่น้องสร้างมาทั้งหมดตรงกับ codebase จริงมากผิดปกติ เพราะใช้ prototype เดิมของ MES เป็นต้นแบบ

งาน FE-7 นี้คือการนำของที่ทำดีแล้วไปติดตั้งในบ้านจริง

---

## ขอบเขตงาน

| ส่วน | งาน |
|------|-----|
| A | Migrate `WoDashboardPage` เข้า `mes_draft` + เชื่อม `/api/wo/list` จริง |
| B | Fix `woLifecycle.ts` ให้ตรง status จริงของระบบ |
| C | Migrate `StatusStepper` + `WoDetailPage` เข้า `mes_draft` |
| D | เพิ่ม route ใน App.jsx และ nav link |

---

## ก่อนเริ่ม: ทำความเข้าใจ codebase ปลายทาง

```
/home/ball/syntech_mes_draft/
├── frontend/
│   ├── src/
│   │   ├── App.jsx              ← เพิ่ม route ที่นี่
│   │   ├── pages/               ← วาง page component ที่นี่
│   │   │   └── MesWorkspacePage.tsx (ดูเป็นตัวอย่าง)
│   │   ├── components/          ← วาง StatusStepper.tsx ที่นี่ (ยังไม่มี folder นี้ ให้สร้าง)
│   │   └── lib/
│   │       └── api.ts           ← ใช้อันนี้เลย เหมือน intern repo ทุกอย่าง
└── backend/
    └── modules/
        └── 03_wo_release/
            └── wo_release.routes.js  ← API ที่จะเรียก
```

**สิ่งสำคัญ:** `api.ts` ใน `mes_draft` คือไฟล์เดียวกับที่น้องใช้อยู่แล้ว — ไม่ต้องเปลี่ยนอะไร

---

## ก่อนเริ่ม Part A: Auth ใน Dev

API ทุกตัวใน MES ต้องมี Bearer token ถ้าไม่ส่งจะได้ 401 ทันที

**วิธีทำใน dev (ทำครั้งเดียว):**
1. เปิด `http://172.16.10.87:5173` → Login
2. เปิด DevTools (F12) → Application → Local Storage → `172.16.10.87`
3. ดู key `syntech.mes.access_token` → copy ค่า

**ไม่ต้องทำอะไรเพิ่ม** — `api.ts` ดึง token จาก localStorage และใส่ `Authorization: Bearer ...` header ให้อัตโนมัติ
ตราบใดที่ login ไว้ใน browser เดียวกัน การ call API จะผ่านได้เลย

```ts
// ดู lib/api.ts บรรทัด 42 — มันทำให้แล้ว:
const token = getAccessToken();  // อ่านจาก localStorage
if (token) headers.Authorization = `Bearer ${token}`;
```

---

## Part A: เชื่อม `/api/wo/list` จริง

### 1. ดู response จาก API จริงก่อน

API นี้มีอยู่แล้ว เปิด browser ไปที่ `http://172.16.10.87:5100/api/wo/list`
(ต้อง login ก่อน ดูหน้า `/mes-auth`)

Response จะหน้าตาแบบนี้:
```json
{
  "status": "success",
  "wos": [
    {
      "id": 1,
      "wo_number": "WO-2026-001",
      "part_no": "PCB-ASSY-01",
      "qty_target": 1500,
      "qty_started": 800,
      "qty_good": 750,
      "status": "RUNNING",
      "created_at": "2026-06-01T08:00:00Z",
      "opened_at": "2026-06-02T09:00:00Z",
      "closed_at": null
    }
  ]
}
```

Field ต่าง ๆ ต่างจาก mock ของน้องนิดหน่อย:
| intern mock | API จริง | หมายเหตุ |
|-------------|----------|---------|
| `woId` | `wo_number` | string เช่น "WO-2026-001" |
| `productCode` | `part_no` | |
| `customer` | *(ไม่มี)* | อาจต้องตัด column นี้ก่อน |
| `qty` | `qty_target` | |
| `currentStep` | `status` | ดู Part B |
| `station` | *(ไม่มี)* | ตัดออกก่อน |
| `updatedAt` | `opened_at` หรือ `closed_at` | |

### 2. แก้ `dashboardApi.ts`

เปิดไฟล์ `dashboardApi.ts` แล้วเปลี่ยน fetchWoList ให้เรียก API จริง:

```typescript
// เปลี่ยนจาก mock เป็นแบบนี้
import api from './api';

export async function fetchWoList(): Promise<WoSummary[]> {
  const { data } = await api.get<{ wos: any[] }>('/wo/list');
  return data.wos.map(wo => ({
    woId: wo.wo_number,
    productCode: wo.part_no,
    qty: wo.qty_target,
    currentStep: wo.status,
    station: '-',                          // ยังไม่มีใน API ใส่ '-' ไปก่อน
    customer: '-',                         // เช่นกัน
    updatedAt: wo.opened_at ?? wo.created_at,
  }));
}
```

---

## Part B: แก้ `woLifecycle.ts` ให้ตรงสถานะจริง

### สถานะจริงใน MES backend

น้องทำ `WAIT_FAI` ตัวเดียว แต่ระบบจริงมี **สองขั้น FAI**:

```
DRAFT → OPEN → READY → RUNNING → WAIT_FAI_QA → WAIT_FAI_MGR → RUNNING → CLOSED
```

| Status | ความหมาย | Module |
|--------|---------|--------|
| `DRAFT` | Pre-WO ยังไม่ convert | M01 Planning |
| `OPEN` | WO convert แล้ว รอ kitting | M03 WO Release |
| `READY` | Kitting ครบ รอเปิดสาย | M04 Kitting |
| `RUNNING` | สายการผลิตกำลังวิ่ง | M04→M06 |
| `WAIT_FAI_QA` | รอ QA อนุมัติ FAI | M05 FAI |
| `WAIT_FAI_MGR` | รอ Manager อนุมัติ FAI | M05 FAI |
| `CLOSED` | ปิด WO | M09 Close |

### งาน: อัปเดต `woLifecycle.ts`

```typescript
// woLifecycle.ts — แก้ให้ตรงของจริง
export const WO_STEPS = [
  { key: 'DRAFT',        label: 'Draft',       color: '#94a3b8' },
  { key: 'OPEN',         label: 'Released',    color: '#3b82f6' },
  { key: 'READY',        label: 'Kitted',      color: '#8b5cf6' },
  { key: 'RUNNING',      label: 'Running',     color: '#f59e0b' },
  { key: 'WAIT_FAI_QA',  label: 'FAI (QA)',    color: '#ef4444' },
  { key: 'WAIT_FAI_MGR', label: 'FAI (Mgr)',   color: '#dc2626' },
  { key: 'CLOSED',       label: 'Closed',      color: '#10b981' },
] as const;
```

> **ข้อสังเกต:** `RUNNING` ปรากฏได้สองครั้งใน lifecycle (ก่อนและหลัง FAI)
> แสดงผลใน Stepper ได้โดยใช้ index ของ step ปัจจุบัน ไม่ใช่ชื่อ status อย่างเดียว

---

## Part B-2: `RoutingHistoryPage` — endpoint ยังไม่มีในระบบ

`RoutingHistoryPage` เรียก `/api/routing/history` แต่ backend ยังไม่มี endpoint นี้
(มีแค่ `/api/routing/scan-in`, `/api/routing/scan-out`, `/api/routing/jig/result/:unitSn`)

**ให้ทำแบบนี้ก่อน:**
- **ข้าม** `RoutingHistoryPage` ออกไปก่อน (ไม่ต้อง migrate)
- ใส่ comment `// TODO: รอ backend เพิ่ม /api/routing/history` ไว้ในไฟล์

เมื่อ FE-7 ส่วนอื่นเสร็จแล้วค่อยแจ้ง Iris ว่า endpoint นี้ต้องการ — จะ coordinate กับ backend ให้

---

## Part B-3: แปลง `useQuery` → `useEffect` (ถ้าจำเป็น)

เช็คก่อนว่า mes_draft มี react-query หรือเปล่า:
```bash
cat /home/ball/syntech_mes_draft/frontend/package.json | grep react-query
```

**ถ้าไม่มี** → แปลง pattern นี้:

```tsx
// แบบเดิม (useQuery)
const { data = [], isLoading, isError } = useQuery({
  queryKey: ['routing-history'],
  queryFn: () => api.get('/routing/history').then(r => r.data)
});
```

```tsx
// แบบใหม่ (useEffect — ใช้ pattern เดียวกับ WoDashboardPage)
const [data, setData] = useState([]);
const [isLoading, setIsLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

useEffect(() => {
  api.get('/routing/history')
    .then(r => setData(r.data))
    .catch(e => setError(e.message))
    .finally(() => setIsLoading(false));
}, []);
```

---

## Part C: Migrate เข้า `mes_draft`

### สิ่งที่ต้อง copy

```
จาก intern repo                          → ปลายทางใน mes_draft/frontend/src/
─────────────────────────────────────────────────────────────────
pages/WoDashboardPage.tsx               → pages/WoDashboardPage.tsx
pages/WoDetailPage.tsx                  → pages/WoDetailPage.tsx
components/StatusStepper.tsx            → components/StatusStepper.tsx   (สร้าง folder ใหม่)
lib/woLifecycle.ts                      → lib/woLifecycle.ts
lib/useAutoRefresh.ts                   → lib/useAutoRefresh.ts
lib/dashboardApi.ts  (แก้แล้วใน Part A)  → lib/dashboardApi.ts
```

**ไม่ต้อง copy:**
- `localHistory.ts` — ใช้ LocalStorage, ปลายทางใช้ API จริง
- `api.ts` — mes_draft มีอยู่แล้ว

### เช็ค dependency ก่อน

`RoutingHistoryPage.tsx` ใช้ `@tanstack/react-query` (useQuery)  
ให้เช็คก่อนว่า mes_draft ติดตั้งไว้หรือยัง:

```bash
cat /home/ball/syntech_mes_draft/frontend/package.json | grep react-query
```

ถ้าไม่มี → แปลง useQuery → useEffect + useState แบบเดียวกับ `WoDashboardPage.tsx`

---

## Part D: เพิ่ม Route ใน App.jsx

เปิด `mes_draft/frontend/src/App.jsx` แล้วเพิ่ม:

```jsx
// import เพิ่ม
import { WoDashboardPage } from './pages/WoDashboardPage';
import { WoDetailPage } from './pages/WoDetailPage';

// เพิ่มใน <Routes>
<Route path="/wo-dashboard" element={<WoDashboardPage />} />
<Route path="/wo-dashboard/:woId" element={<WoDetailPage />} />

// เพิ่มใน <nav> ของ Shell component
<NavLink to="/wo-dashboard">WO Dashboard</NavLink>
```

---

## วิธี Dev + Test

```bash
# SSH เข้า server
ssh ball@172.16.10.87

# เข้าโฟลเดอร์
cd /home/ball/syntech_mes_draft/frontend

# run dev server (ถ้ายังไม่ run)
npm run dev

# ดูที่ http://172.16.10.87:5173
```

---

## Part E: ลบโครงชั่วคราวออก (Cleanup)

เมื่อ connect API จริงแล้ว ให้ลบของที่ไม่ใช้แล้วออกด้วย ไม่ใช่แค่ทับไว้

### ใน intern repo (ไว้ทำความสะอาดก่อน merge)

| ไฟล์/ส่วน | สิ่งที่ต้องลบ | เหตุผล |
|-----------|-------------|--------|
| `lib/dashboardApi.ts` | mock array ทั้งหมด | เปลี่ยนเป็น real fetch แล้ว |
| `lib/localHistory.ts` | ทั้งไฟล์ | LocalStorage fallback ไม่ใช้แล้ว |
| `pages/RoutingHistoryPage.tsx` | `import { getLocalHistory }` + catch fallback block | ใช้ API จริงอย่างเดียว |
| `pages/WoDetailPage.tsx` | `const mockWo = {...}` ทั้งก้อน | เปลี่ยนเป็น fetch `/api/wo/:id` |

### ใน `mes_draft` (ไม่ต้อง copy ของเก่าไป)

ห้าม copy ไฟล์เหล่านี้เข้า mes_draft:
- `localHistory.ts` — ไม่ต้องการ
- ส่วน mock data ใน `dashboardApi.ts` — ตัดออกก่อน copy

### วิธีตรวจว่า cleanup ครบ

```bash
# ไม่ควรเจอคำเหล่านี้ใน code ที่ merge แล้ว
grep -r "mockWo\|getLocalHistory\|generateMock\|faker\." src/
# ถ้าผลว่างเปล่า = clean ✅
```

---

## Acceptance Criteria

- [ ] `/wo-dashboard` เปิดได้ใน mes_draft และแสดงข้อมูลจาก API จริง (ไม่ใช่ mock)
- [ ] WO status badge แสดงถูกต้องตาม status จริง (`WAIT_FAI_QA` / `WAIT_FAI_MGR`)
- [ ] กด WO row แล้วไปหน้า `/wo-dashboard/:woId` ได้
- [ ] `StatusStepper` บน WoDetailPage แสดง step ที่ถูกต้อง
- [ ] ไม่มี TypeScript error (รัน `npm run build` ผ่าน)
- [ ] Nav link "WO Dashboard" ปรากฏใน header
- [ ] ไม่มี mock data / `localHistory` / `mockWo` เหลืออยู่ใน code (`grep` ผ่านสะอาด)

---

## ถ้าติดหรือมีข้อสงสัย

- ดู `MesWorkspacePage.tsx` เป็นตัวอย่าง pattern การเขียน page ใน mes_draft
- ดู `api.ts` ใน `/home/ball/syntech_mes_draft/frontend/src/lib/api.ts` สำหรับ auth header
- API endpoint ทั้งหมดดูได้จาก `wo_release.routes.js` บน server
- ถาม Iris ผ่าน daily report ได้ตลอด

---

*Task created by Iris — 2026-06-09*
