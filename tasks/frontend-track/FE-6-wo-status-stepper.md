# FE-6 — WO Status Stepper (เห็น lifecycle ของ Work Order เป็น timeline) 🪜

**ระดับ:** กลาง (เน้นทำ component ให้สวยและ reuse ได้) | **น่าจะใช้เวลา:** 3–5 วัน

---

## ทำไมต้องทำงานนี้

Work Order หนึ่งใบไม่ได้มีแค่ "เสร็จ / ไม่เสร็จ" — มันเดินผ่านหลายขั้น:

```
DRAFT → OPEN → READY → WAIT_FAI → RUNNING → CLOSED
(ร่าง)  (เปิด)  (พร้อม)  (รอตรวจชิ้นแรก) (กำลังผลิต) (ปิดงาน)
```

ตอนนี้ในหน้า WO เราเห็นสถานะเป็นแค่ "ข้อความเดียว" — มองไม่ออกว่ามันผ่านอะไรมาแล้ว และเหลืออีกกี่ขั้น
ระบบพี่น้องของเรา (AP Tracker) มี **Status Stepper** สวยๆ ที่แสดงเป็น timeline — เห็นปุ๊บรู้เลยว่าอยู่ตรงไหน

งานน้องคือทำ **component `StatusStepper`** แบบนั้นสำหรับ WO — แล้วเอาไปเสียบในหน้า WO detail (และเอากลับไปใช้ใน Dashboard FE-5 ได้ด้วย!)

> 🎯 งานนี้เป็นงาน **"craft component"** ล้วนๆ — ไม่ต้องต่อ API เลย รับข้อมูลผ่าน props อย่างเดียว เหมาะมากสำหรับฝึกทำ component ที่ดี

## น้องจะได้ฝึกอะไร

- ทำ component ที่ **render จาก config array** (ไม่ hardcode แต่ละขั้นเป็น JSX ซ้ำๆ)
- **conditional styling** — แต่ละขั้นหน้าตาต่างกันตามว่า "ผ่านแล้ว / กำลังทำ / ยังไม่ถึง"
- ทำ component ที่ **reuse ได้จริง** (รับ props ดีๆ ใช้ได้ทั้งหน้า detail และ dashboard)
- responsive — timeline แนวนอนบนจอใหญ่ / แนวตั้งบนมือถือ

---

## "พร้อมเสียบ" — component นี้ไม่แตะ API เลย

`StatusStepper` เป็น **pure component** รับทุกอย่างผ่าน props — ไม่ fetch เอง:
```ts
type StepState = 'done' | 'current' | 'upcoming';
type StepItem = { key: string; label: string; state: StepState };

// component รับแค่นี้
type StatusStepperProps = { steps: StepItem[] };
```
ส่วนหน้า WO detail ที่เอา stepper ไปใช้ ค่อยดึง WO ผ่าน function กลาง (`lib/dashboardApi.ts` ที่ทำใน FE-5) แล้วคำนวณว่าขั้นไหน done/current/upcoming

## config ของ lifecycle (เอาไปตั้งเป็นค่าคงที่)

```ts
// ลำดับขั้นทั้งหมดของ WO — แก้ที่เดียวจบ
export const WO_LIFECYCLE = [
  { key: 'DRAFT',    label: 'ร่าง' },
  { key: 'OPEN',     label: 'เปิดงาน' },
  { key: 'READY',    label: 'พร้อมผลิต' },
  { key: 'WAIT_FAI', label: 'รอตรวจชิ้นแรก' },
  { key: 'RUNNING',  label: 'กำลังผลิต' },
  { key: 'CLOSED',   label: 'ปิดงาน' },
];
```
> 💡 ถ้ารู้ลำดับ index ของ "ขั้นปัจจุบัน" → ขั้นก่อนหน้าทั้งหมด = `done`, ขั้นนี้ = `current`, ขั้นถัดไป = `upcoming` ลองเขียน function เล็กๆ แปลง `currentStep` เป็น array `StepItem[]`

---

## มาเริ่มกันทีละขั้น

**ก้าวที่ 1 — component เปล่า**
สร้าง `frontend/src/components/StatusStepper.tsx` รับ prop `steps: StepItem[]` แล้ว `.map()` ออกมาเป็นวงกลม + เส้นเชื่อม + label

**ก้าวที่ 2 — conditional styling**
แต่ละขั้นสีต่างกันตาม `state`:
- `done` = เขียว มีเครื่องหมายถูก ✓
- `current` = ฟ้าเข้ม ตัวหนา (เด่นสุด)
- `upcoming` = เทาจางๆ
> ใช้ helper เลือก class/style ตาม state — อย่าเขียน `if` ซ้อนยาวใน JSX

**ก้าวที่ 3 — function แปลง currentStep → steps**
เขียน `buildSteps(currentStep: string): StepItem[]` ที่เอา `WO_LIFECYCLE` มาเทียบ index แล้วใส่ state ให้ถูก

**ก้าวที่ 4 — เสียบในหน้า WO detail**
สร้าง/ต่อหน้า WO detail (`#/wo/:woId`) ดึง WO ผ่าน function กลาง → ส่ง `buildSteps(wo.currentStep)` เข้า `<StatusStepper>`

**ก้าวที่ 5 — responsive**
- จอใหญ่: timeline แนวนอน
- มือถือ 360px: เปลี่ยนเป็นแนวตั้ง (เส้นเชื่อมลงล่าง) — ใช้ CSS media query หรือ flex-direction
> ลองนึกถึง operator ที่เปิดดูบนมือถือหน้าไลน์ ต้องอ่านง่าย

**ก้าวที่ 6 (โบนัส) — เอากลับไปใช้ใน Dashboard**
ใน FE-5 แต่ละแถว WO ลองใส่ mini-stepper (เวอร์ชันเล็ก) — นี่คือพลังของ component ที่ reuse ได้ดี 💪

---

## อยากให้ลองคิดเอง

- ถ้า WO ถูก "reject" หรือ "hold" กลางทาง stepper ควรแสดงยังไง? (ยังไม่ต้องทำ แค่คิดเผื่อ)
- ขั้น `current` ควรเด่นแค่ไหนถึงจะเห็นปุ๊บรู้ทันทีว่างานอยู่ตรงนี้?
- ทำไมการ render จาก `WO_LIFECYCLE` array ดีกว่าเขียน 6 ขั้นเป็น JSX ตรงๆ? (ถ้าวันหลังเพิ่มขั้นจะเกิดอะไรขึ้น)

## ถ้าติด

- ขอพี่ดู AP `status-stepper.tsx` + `lib/timeline-steps.ts` เป็นตัวอย่างจริง — โครงคล้ายกันมาก
- เรื่องแปลง currentStep → state array ถ้างง ลองวาดบนกระดาษก่อนว่าแต่ละขั้นควรเป็นสีอะไร

## เช็คตัวเองว่าใช่รึยัง

- [ ] `StatusStepper.tsx` รับ `steps` prop แล้ว render timeline ได้
- [ ] 3 state (done/current/upcoming) หน้าตาต่างกันชัด
- [ ] `buildSteps(currentStep)` แปลงถูก (ลองหลายค่า: OPEN, WAIT_FAI, CLOSED)
- [ ] เสียบในหน้า WO detail เห็น timeline จริง
- [ ] มือถือ 360px เปลี่ยนเป็นแนวตั้งอ่านง่าย
- [ ] PR branch `feat/fe-6-status-stepper` + screenshot (จอใหญ่ + มือถือ)

ทำเสร็จงานนี้ = น้องได้ component แรกที่ reuse ได้หลายที่ + ทุกคนเห็น lifecycle ของ WO ในพริบตา 🎉