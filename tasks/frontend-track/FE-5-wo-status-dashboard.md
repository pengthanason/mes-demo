# FE-5 — WO Status Dashboard (ภาพรวมงานผลิตทั้งโรงงานในหน้าเดียว) 📊

**ระดับ:** กลาง (ต่อยอดจาก FE-1 + FE-4) | **น่าจะใช้เวลา:** 5–7 วัน

---

## ทำไมต้องทำงานนี้ (ตอนนี้ MES ยังไม่มี "หน้าสรุป" เลย)

ระบบพี่น้องของเรามี dashboard กันหมดแล้ว — MRP มีการ์ด KPI สรุปยอด, AP มีหน้ารวมงานค้าง แต่ **MES ยังไม่มีหน้าไหนที่เปิดมาแล้วเห็นภาพรวมว่า "ตอนนี้ทั้งโรงงานมีงานผลิต (Work Order) กี่ใบ ใบไหนอยู่ขั้นตอนไหน"** เลย

ทุกวันนี้ถ้าหัวหน้าไลน์อยากรู้ว่างานไหนค้างตรงไหน ต้องไล่เปิดทีละ WO — ช้าและมองไม่เห็นภาพรวม

งานน้องคือทำ **หน้า Dashboard** ที่เปิดมาแล้วเห็น:
- การ์ดสรุปด้านบน (KPI) — เช่น WO ทั้งหมดกี่ใบ, กำลังผลิตกี่ใบ, รอ FAI กี่ใบ, เสร็จวันนี้กี่ใบ
- ตารางรายการ WO ทุกใบ + ขั้นตอนปัจจุบันของแต่ละใบ

> 🎯 เริ่มด้วยข้อมูลตัวอย่าง (mock) ก่อนเหมือนทุกงาน แล้วทีมค่อยต่อข้อมูลจริงให้
> 📌 หน้านี้คือ "หน้าแรก" ที่ทุกคนจะเปิดดูทุกเช้า — ทำให้มันอ่านง่าย เห็นปัญหาได้ใน 3 วินาที

## น้องจะได้ฝึกอะไร

- ทำ **การ์ด KPI** (ตัวเลขสรุป + สีบอกสถานะ) — pattern ที่ใช้ในทุก dashboard
- ทำ **custom hook** ตัวแรกของน้อง (`useAutoRefresh`) — ให้หน้า refresh เองตอนกลับมาดู แต่ไม่ยิง API รัวๆ ทิ้ง
- คิดเรื่อง **layout มือถือ (360px)** — การ์ดต้องเรียงสวยทั้งจอใหญ่จอเล็ก
- แยก component ให้สะอาด (`KpiCard`, `WoRow`) เอาไป reuse ได้

---

## "พร้อมเสียบ" — ทำตาม contract (สำคัญ)

หน้านี้ยังไม่มี API จริง (ทีมกำลังทำ GET WO list-with-step ให้) — น้องทำฝั่ง UI ให้พร้อมก่อน ตามหลักใน [`docs/integration-contracts.md`](../../docs/integration-contracts.md):

สร้าง **จุดดึงข้อมูลที่เดียว** `frontend/src/lib/dashboardApi.ts`:
```ts
export type WoSummary = {
  woId: string;
  productCode: string;
  customer: string;
  qty: number;
  currentStep: string;      // เช่น 'RUNNING', 'WAIT_FAI'
  station: string;          // station ปัจจุบัน เช่น 'R8 Test FCT'
  updatedAt: string;
};

// mock ก่อน — ทีมจะมาเปลี่ยนข้างในให้เป็น API จริง น้องไม่ต้องแตะ
export async function fetchWoList(): Promise<WoSummary[]> {
  return SAMPLE_WO; // คืน mock ไปก่อน
}
```
> ⚠️ type `WoSummary` ด้านบนเป็น **ชุดตั้งต้น** — พี่ (ทีม backend) จะ confirm shape จริงให้ใน `integration-contracts.md` ก่อนต่อ API ระหว่างนี้ใช้ตัวนี้ทำ UI ไปได้เลย

## ข้อมูลตัวอย่าง (เอาไปใส่ใน dashboardApi.ts)

```ts
const SAMPLE_WO: WoSummary[] = [
  { woId: 'WO-26060012', productCode: 'E13A_STD',    customer: 'THS', qty: 270,  currentStep: 'RUNNING',  station: 'R8 Test FCT',   updatedAt: '2026-06-05 09:12' },
  { woId: 'WO-26060015', productCode: 'ZSZ003-081A', customer: 'TAD', qty: 1200, currentStep: 'WAIT_FAI', station: 'R5 Test ICT',   updatedAt: '2026-06-05 08:40' },
  { woId: 'WO-26060018', productCode: '01489E-081',  customer: 'TAD', qty: 90,   currentStep: 'OPEN',     station: 'R1 SMT Setup',  updatedAt: '2026-06-05 07:55' },
  { woId: 'WO-26060009', productCode: '5K45',        customer: 'THS', qty: 500,  currentStep: 'CLOSED',   station: 'R11 FQC Packing', updatedAt: '2026-06-05 06:30' },
];
```

---

## มาเริ่มกันทีละขั้น

**ก้าวที่ 1 — หน้า + route**
สร้าง `frontend/src/pages/WoDashboardPage.tsx` + route `#/wo-dashboard` + เมนู (ทำให้เป็นเมนูแรกๆ เลย มันคือหน้าหลัก)

**ก้าวที่ 2 — การ์ด KPI (mock ก่อน)**
ทำ component `KpiCard.tsx` รับ prop `{ label, value, tone }` (tone = 'neutral'|'busy'|'warn'|'done' → สีต่างกัน)
แล้ววางเรียง 4 ใบบนสุด: ทั้งหมด / กำลังผลิต / รอ FAI / เสร็จวันนี้
> 💡 ตัวเลขพวกนี้คำนวณจาก `SAMPLE_WO` ได้เลย เช่น `wo.filter(w => w.currentStep === 'RUNNING').length` — ไม่ต้องมี API แยก

**ก้าวที่ 3 — ตาราง WO + step badge**
เอา `fetchWoList()` มา `.map()` เป็นแถว (component `WoRow.tsx`)
`currentStep` ทำเป็น badge สี (RUNNING=ฟ้า, WAIT_FAI=ส้ม, OPEN=เทา, CLOSED=เขียว)
> ใช้ `key={wo.woId}` นะ (ไม่ใช่ index — จำเรื่องที่เราคุยกันใน FE ก่อนได้ไหม 😉)

**ก้าวที่ 4 — custom hook `useAutoRefresh` (ของใหม่!)**
สร้าง `frontend/src/hooks/useAutoRefresh.ts` — ให้หน้าเรียก `fetchWoList()` ใหม่เมื่อ:
- ผู้ใช้สลับ tab กลับมา (event `visibilitychange`)
- กลับมา online (event `online`)
- ทุกๆ N วินาที (แต่ **หยุดยิงถ้า tab ไม่ได้เปิดอยู่** — ไม่ยิง API ทิ้งเปล่าๆ)
> 💡 อันนี้คือ pattern จริงที่ WMS ใช้ (`use-auto-refresh.ts`) ขอพี่ดูตัวอย่างได้ เป็น hook ที่ดีมากควรเข้าใจ

**ก้าวที่ 5 — filter**
- dropdown กรองตาม customer
- ปุ่ม toggle "เฉพาะที่ยังไม่เสร็จ" (ซ่อน CLOSED)

**ก้าวที่ 6 — mobile 360px**
เปิดด้วยมือถือ (หรือ DevTools 360px) — การ์ด 4 ใบต้องไม่ล้น (ใช้ grid `repeat(auto-fit, minmax(...))`) ตารางเลื่อนแนวนอนได้

---

## อยากให้ลองคิดเอง

- ถ้ามี 80 WO ตารางยาวมาก — ควรเรียงยังไงให้ของสำคัญอยู่บน? (ใกล้ครบกำหนด? ค้างนาน?)
- การ์ด KPI ใบไหนที่หัวหน้าไลน์อยากเห็นที่สุดตอนเดินเข้าออฟฟิศตอนเช้า?
- "WAIT_FAI" (รอตรวจชิ้นแรก) ถ้าค้างนานคือปัญหา — ควรเตือนยังไงให้เห็นชัด?

## ถ้าติด

- โครงการ์ด/ตาราง = ต่อยอดจาก FE-1 และ FE-4 ได้เลย
- เรื่อง hook `useAutoRefresh` ครั้งแรกอาจงง — ทักพี่ พี่มี pattern จริงให้ดู
- ข้อมูลจริง WO list = ทีมต่อให้ น้องโฟกัส UI

## เช็คตัวเองว่าใช่รึยัง

- [ ] เปิด `#/wo-dashboard` เห็นการ์ด KPI 4 ใบ + ตาราง WO
- [ ] step badge มีสีตามสถานะ + ใช้ `key={wo.woId}`
- [ ] `useAutoRefresh` ทำงาน (สลับ tab กลับมาแล้ว refresh) + ไม่ยิงตอน tab ปิด
- [ ] filter customer + toggle ซ่อน CLOSED ทำงาน
- [ ] เปิดมือถือ 360px การ์ดไม่ล้น
- [ ] แยกข้อมูลไว้ที่ `lib/dashboardApi.ts` (ไม่ hardcode fetch ในหน้า)
- [ ] PR branch `feat/fe-5-wo-dashboard` + screenshot (จอใหญ่ + มือถือ)

ทำเสร็จงานนี้ = MES มีหน้าแรกที่ทุกคนเปิดดูภาพรวมได้ทุกเช้า + น้องได้ custom hook ตัวแรก 🎉