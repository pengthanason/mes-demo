# FE-2 — แปลง "Sequence Builder" ของน้อง → React state 🧩

**ระดับ:** เริ่ม–กลาง (หัวใจของ React) | **น่าจะใช้เวลา:** 4–6 วัน

---

## ทำไมต้องทำงานนี้

ใน prototype น้องมีส่วนที่เจ๋งที่สุด คือ **Manufacturing Sequence** — ปุ่ม "+ Add Operation Step" ที่เพิ่มแถว, เลือก station, ใส่ cycle time, ลบได้, แถมลาก drag-and-drop จัดลำดับได้ด้วย!

ตอนน้องทำใน vanilla JS น้องต้อง:
- สร้าง element เอง (`addNewStep()`)
- จัดการ array `stationsConfig` + เซฟลง localStorage เอง
- reindex แถวเอง (`reindexSteps()`)
- อัปเดต DOM เองทุกครั้งที่มีการเปลี่ยน

**React จะทำให้เรื่องพวกนี้ง่ายขึ้นเยอะ** ด้วยแนวคิดเดียวคือ **state** — เราเก็บ "ข้อมูล" ไว้ แล้วบอก React ว่าหน้าตาควรเป็นยังไงตามข้อมูลนั้น เวลา ข้อมูลเปลี่ยน React วาดหน้าจอใหม่ให้เอง เราไม่ต้องแตะ DOM เลย

> 🎯 เป้าหมาย: เอา sequence builder ของน้องมาทำใหม่ด้วย `useState` — เพิ่ม step / ลบ step / แก้ค่าได้ โดย**ไม่ต้องแตะ DOM เอง**
> (drag-and-drop ค่อยทำทีหลังเป็นโบนัส — เริ่มจากเพิ่ม/ลบ/แก้ก่อน)

## น้องจะได้ฝึกอะไร

- **`useState`** — แนวคิดที่สำคัญที่สุดของ React
- **controlled input** — ช่อง input ที่ผูกกับ state
- จัดการ **list ใน state** (เพิ่ม/ลบ/แก้ item ใน array แบบ React)

---

## เปิดดูของเดิมก่อน

ใน `your-prototype/mes.html` ดู: `addNewStep()`, `reindexSteps()`, `stationsConfig`
👉 สังเกตว่าน้องต้องเขียนโค้ดเยอะมากเพื่อ sync ระหว่าง array กับหน้าจอ — React จะตัดงานส่วนนี้ออกไปเกือบหมด

## มาเริ่มกันทีละขั้น

**ก้าวที่ 1 — เก็บ step list ไว้ใน state**
```tsx
import { useState } from 'react';

type Step = { station: string; seconds: number };

function SequenceBuilder() {
  const [steps, setSteps] = useState<Step[]>([]);
  // ...
}
```
👉 `steps` คือข้อมูล, `setSteps` คือวิธีเปลี่ยนมัน — พอเรียก `setSteps` React จะวาดหน้าใหม่ให้เอง

**ก้าวที่ 2 — แสดง step ที่มี (map เหมือน FE-1)**
```tsx
{steps.map((s, i) => (
  <div key={i}>
    Step {i + 1}: {s.station} — {s.seconds}s
  </div>
))}
```

**ก้าวที่ 3 — ปุ่ม "เพิ่ม step"**
```tsx
function addStep() {
  setSteps([...steps, { station: '', seconds: 0 }]);  // เพิ่ม item ใหม่ต่อท้าย
}
```
👉 สังเกต `[...steps, newItem]` — เราสร้าง array ใหม่ ไม่แก้ของเดิม นี่คือ "กฎทอง" ของ React state (ลองค้น "react state immutable update")
เทียบกับ `addNewStep()` เดิมที่ต้องสร้าง DOM element เอง — อันนี้สั้นกว่ามาก!

**ก้าวที่ 4 — ปุ่ม "ลบ step"**
```tsx
function removeStep(index) {
  setSteps(steps.filter((_, i) => i !== index));
}
```
👉 ไม่ต้อง reindex เอง! React จัดลำดับใหม่ให้ตอน map รอบหน้า (จำ `reindexSteps()` ที่น้องต้องเขียนเองได้ไหม — หายไปเลย 🎉)

**ก้าวที่ 5 — แก้ค่าใน step (controlled input)**
ทำ dropdown เลือก station + ช่องใส่วินาที ที่ผูกกับ state:
```tsx
<input
  value={s.seconds}
  onChange={(e) => {
    const next = [...steps];
    next[i] = { ...next[i], seconds: Number(e.target.value) };
    setSteps(next);
  }}
/>
```

**ก้าวที่ 6 — โชว์ total cycle time**
รวมวินาทีจากทุก step (เหมือน `formatSecondsToMinutes()` เดิมของน้อง):
```tsx
const total = steps.reduce((sum, s) => sum + s.seconds, 0);
```

**ก้าวที่ 7 (โบนัส) — drag-and-drop จัดลำดับ**
ถ้าน้องอยากท้าทาย ลองทำ reorder แบบ React (มี library ชื่อ `@dnd-kit` หรือ HTML5 drag events) — แต่อันนี้ทำทีหลังได้ ไม่ต้องรีบ

---

## อยากให้ลองคิดเอง

- ทำไม React ถึงห้ามแก้ array เดิมตรงๆ (เช่น `steps.push(...)`) ต้องสร้างใหม่เสมอ? (เกี่ยวกับการที่ React รู้ว่า "ข้อมูลเปลี่ยนแล้ว" ลองค้นดู)
- ตอนนี้ station ที่เลือกได้ยัง hardcode อยู่ ถ้าอยากให้รายการ station มาจาก MES จริงล่ะ? (เก็บไว้ทำใน FE-3)

## ถ้าติด

- งง useState → อันนี้เป็นเรื่องที่ทุกคนงงตอนแรก ปกติมาก! ลองค้น "react usestate array example" หรือทักพี่ พี่อธิบายให้
- เทียบกับ prototype เดิมได้เสมอ น้องรู้ว่าผลควรเป็นยังไง

## เช็คตัวเองว่าใช่รึยัง

- [ ] กดเพิ่ม step → มีแถวใหม่โผล่
- [ ] กดลบ step → แถวนั้นหาย ลำดับอัปเดตเอง
- [ ] แก้ station/วินาที → ค่าเปลี่ยนตาม
- [ ] total cycle time คำนวณถูก
- [ ] ไม่มีการแตะ DOM เอง (ไม่มี `document.getElementById` / `innerHTML`) — ให้ React จัดการหมด
- [ ] PR branch `feat/fe-2-sequence-builder` + screenshot

ผ่านงานนี้ = น้องเข้าใจ React state แล้ว ซึ่งเป็น 80% ของงาน frontend จริง! FE-3 เราจะเอาของจริงสุด — **ต่อ API ของ MES** แทน localStorage 🔌
