# FE-7 — เติมฟอร์ม Operator ที่ยังขาด (M09 Close · M08 OBA · M05 FAI) 🛠️

**ระดับ:** กลาง–สูง (มี dual-key pattern ให้ลองของใหม่) | **น่าจะใช้เวลา:** 6–8 วัน

---

## ทำไมต้องทำงานนี้ (operator ทำงานจริงไม่ได้ถ้าไม่มีฟอร์มนี้)

MES มี 15 module หลังบ้านครบแล้ว และหลาย station มี **API พร้อมใช้** — แต่ **หน้าจอ operator บางอันยังว่างหรือเป็นแค่ placeholder** ทำให้คนหน้าไลน์กดทำงานไม่ได้จริง

3 อันที่ "หลังบ้านมีแล้ว แต่หน้าจอยังไม่มี":

| Station | คืออะไร | สถานะหน้าจอตอนนี้ |
|---------|---------|-------------------|
| **M09 Close** | ปิด Work Order เมื่อผลิตครบ | เป็นแค่ placeholder ว่างๆ |
| **M08 OBA** (Out-of-Box Audit) | สุ่มเปิดกล่องตรวจก่อนส่งมอบ | ยังไม่มี |
| **M05 FAI** (First Article Inspection) | ตรวจ "ชิ้นแรก" ก่อนเดินไลน์เต็ม | ยังไม่มี + ต้อง **dual-key** (2 คนยืนยัน) |

งานน้องคือทำ **ฟอร์ม operator** ทั้ง 3 ให้กดใช้ได้จริง โดยต่อยอด pattern หน้า operator เดิมที่มีอยู่แล้ว (`/incoming`, `/kitting`, `/production`, `/qc` ใน `syntech_mes_web`)

> 🎯 เริ่มจาก M09 (ง่ายสุด) → M08 → M05 (ยากสุดเพราะมี dual-key) ไล่จากง่ายไปยาก

## น้องจะได้ฝึกอะไร

- ทำ **ฟอร์ม + validation** (ต่อยอด controlled input จาก FE-2)
- **dual-key confirm pattern** — งานสำคัญต้องมี 2 คนยืนยัน (ของใหม่ที่จะได้เจอในงานโรงงานจริง)
- ต่อ **function กลางส่งข้อมูล** (POST) ตาม contract — backend มีจริงแล้ว
- ออกแบบ flow ให้ operator หน้าไลน์กดง่าย ไม่งง (mobile-first)

---

## "พร้อมเสียบ" — API 3 ตัวนี้มีจริงแล้ว (ดู contract)

ต่างจาก FE-5/6 — งานนี้ backend **มีจริงแล้ว** (ดู [`docs/integration-contracts.md`](../../docs/integration-contracts.md) ตาราง ✅) น้องแค่ทำฟอร์ม + ต่อผ่าน function กลาง:

```ts
// frontend/src/lib/operatorApi.ts — รวมจุดส่งข้อมูลไว้ที่เดียว
export async function closeWo(woId: string, payload: CloseWoPayload): Promise<void> { /* POST /api/wo/close */ }
export async function submitOba(payload: ObaPayload): Promise<void> { /* POST /api/qa/oba-result */ }
export async function submitFai(payload: FaiPayload): Promise<void> { /* POST /api/fai/* */ }
```
> ⚠️ auth ใช้ JWT (`requireRoles`) ฝั่ง backend — **น้องไม่ต้องทำ guard เอง / ห้ามแตะ x-user-role** ส่ง token ที่ระบบ login ให้มาก็พอ (พี่ช่วยส่วนนี้)
> 📌 shape payload (`CloseWoPayload` ฯลฯ) — พี่จะ confirm field เป๊ะๆ ใน contract ระหว่างนี้ใส่ field เท่าที่เห็นในฟอร์มไปก่อนได้

---

## มาเริ่มกันทีละขั้น

**ก้าวที่ 1 — M09 Close (ง่ายสุด เริ่มที่นี่)**
หน้า `#/wo/:woId/close` — แสดงข้อมูล WO + ช่องกรอก "จำนวนที่ผลิตได้จริง" + ปุ่มยืนยันปิดงาน
- validate: จำนวนต้องไม่เกิน qty ของ WO
- กดแล้วเรียก `closeWo()` → ขึ้นผลสำเร็จ
> ต่อยอด pattern ปุ่ม submit + loading state จากหน้า operator เดิม

**ก้าวที่ 2 — M08 OBA (Out-of-Box Audit)**
หน้า `#/oba` — ฟอร์มบันทึกผลสุ่มเปิดกล่องตรวจ: เลือก WO/lot, จำนวนที่สุ่ม, ผล PASS/FAIL, หมายเหตุ defect
- ถ้า FAIL → บังคับใส่หมายเหตุ
- กดแล้วเรียก `submitOba()`

**ก้าวที่ 3 — M05 FAI + dual-key (ยากสุด ของใหม่!)**
หน้า `#/fai/:woId` — ตรวจชิ้นแรกก่อนเดินไลน์เต็ม ผล PASS/FAIL ต่อรายการตรวจ
**dual-key** = งานสำคัญแบบนี้ต้อง **2 คนยืนยัน** (operator ตรวจ + หัวหน้าไลน์รับรอง):
- ช่องยืนยันคนที่ 1 (ผู้ตรวจ) — ใส่ ID/PIN
- ช่องยืนยันคนที่ 2 (ผู้รับรอง) — ใส่ ID/PIN (ต้องไม่ใช่คนเดียวกัน)
- ครบ 2 คน → ปุ่ม submit ถึงกดได้ → เรียก `submitFai()`
> 💡 ลองคิด state ของฟอร์ม: เก็บ key1, key2 แยกกัน + disable ปุ่มจนกว่าจะครบ + เช็คว่าไม่ใช่ ID เดียวกัน

**ก้าวที่ 4 — mobile-first ทั้ง 3 หน้า**
operator ใช้บนมือถือ/แท็บเล็ตหน้าไลน์ — ปุ่มใหญ่กดง่าย, ฟอร์มไม่ยาวเกิน, ผลสำเร็จ/ error เห็นชัด (360px)

**ก้าวที่ 5 — error handling**
ถ้า submit ไม่ผ่าน (เช่น network) ต้องบอก operator ชัดว่าเกิดอะไร + ให้ลองใหม่ได้ (ไม่ใช่หน้าค้างเฉยๆ)

---

## อยากให้ลองคิดเอง

- dual-key ทำไมต้อง 2 คน? (นึกถึงความรับผิดชอบ — ถ้าชิ้นแรกผ่านผิด ทั้ง lot เสีย)
- operator กดผิดแล้วอยากแก้ ควรให้แก้ได้แค่ไหน? (ก่อน submit / หลัง submit)
- ฟอร์ม FAI ถ้ามีรายการตรวจ 20 ข้อ จะจัดให้กดบนมือถือง่ายยังไง?

## ถ้าติด

- pattern ฟอร์ม + submit + loading = ลอกจากหน้า operator เดิม (`/production`, `/qc`) ใน `syntech_mes_web`
- dual-key เป็นเรื่องใหม่ — ถ้างงเรื่อง state ทักพี่ เราคุยกันได้
- shape payload / error จาก backend = พี่ช่วย น้องโฟกัสฟอร์ม + UX

## เช็คตัวเองว่าใช่รึยัง

- [ ] M09 Close: กรอกจำนวน + validate ไม่เกิน qty + ปิดงานได้
- [ ] M08 OBA: บันทึกผล PASS/FAIL + บังคับหมายเหตุตอน FAIL
- [ ] M05 FAI: dual-key ครบ 2 คน (คนละ ID) ถึง submit ได้
- [ ] ทั้ง 3 หน้าใช้ function กลางใน `lib/operatorApi.ts` (ไม่ hardcode fetch)
- [ ] mobile 360px ปุ่มใหญ่กดง่าย + error/success เห็นชัด
- [ ] PR branch `feat/fe-7-operator-forms` + screenshot ทั้ง 3 หน้า

ทำเสร็จงานนี้ = operator หน้าไลน์กดปิดงาน/ตรวจ FAI/OBA ได้จริง + น้องได้เรียน dual-key pattern ที่ใช้ในงานโรงงานจริง 🎉