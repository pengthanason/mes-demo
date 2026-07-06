# FE-16 — Unit Tests (ทดสอบ Component ด้วย Vitest) 🧪

**ระดับ:** กลาง | **น่าจะใช้เวลา:** 4–5 วัน  
**ต้องทำหลัง:** FE-14 และ FE-15 fix เสร็จก่อน

---

## ทำไมต้องทำงานนี้

โค้ดที่ไม่มี test = เวลาแก้อะไรไม่รู้ว่าพังอะไร ใน production จริงๆ ทุก component สำคัญต้องมี test ก่อน merge เพื่อไม่ให้ feature ใหม่ไปทำลาย feature เก่า

## น้องจะได้ฝึกอะไร

- **Vitest + Testing Library** — เขียน test สำหรับ React component
- **Test UX behavior** ไม่ใช่แค่ render — กด button → ตรวจ state เปลี่ยน
- **Mock API calls** — ให้ test ไม่ depend on network จริง

## Setup (ถ้ายังไม่มี)

```bash
cd frontend
npm install --save-dev vitest @testing-library/react @testing-library/user-event jsdom
```

เพิ่มใน `vite.config.js`:
```js
test: {
  environment: 'jsdom',
  globals: true,
  setupFiles: './src/test-setup.ts',
}
```

สร้าง `src/test-setup.ts`:
```ts
import '@testing-library/jest-dom'
```

## ทำทีละขั้น

**ขั้น 1 — Test AdminPanelPage (FE-13)**
ไฟล์: `src/pages/__tests__/AdminPanelPage.test.tsx`

Test ที่ต้องเขียน:
- [ ] render แล้วเห็น user list
- [ ] กดปุ่ม "เพิ่มผู้ใช้" → form โผล่
- [ ] กรอก email ผิดรูปแบบ → แสดง error
- [ ] กรอกครบ → submit → เห็น user ใหม่ใน list (mock API)
- [ ] กดลบ → เห็น confirmation dialog

**ขั้น 2 — Test JigTestPage (FE-15)**
ไฟล์: `src/pages/__tests__/JigTestPage.test.tsx`

Test ที่ต้องเขียน:
- [ ] render แล้วเห็น project list
- [ ] pass rate bar แสดงสัดส่วนถูกต้อง (passed/total × 100)
- [ ] ถ้า API return error → แสดง error state ไม่ crash

**ขั้น 3 — Test component เล็กๆ**
ไฟล์: `src/components/__tests__/StatusStepper.test.tsx`

- [ ] step active highlight ถูก step
- [ ] step ที่ complete → แสดง checkmark
- [ ] step ที่ error → แสดง error state

**ขั้น 4 — เพิ่ม script ใน package.json**
```json
"test": "vitest",
"test:ui": "vitest --ui",
"coverage": "vitest run --coverage"
```

---

## เช็คตัวเองว่าใช่รึยัง

- [ ] `npm test` รันผ่านทั้งหมด 0 fail
- [ ] test ครอบ AdminPanelPage ≥ 5 test cases
- [ ] test ครอบ JigTestPage ≥ 3 test cases
- [ ] test ครอบ StatusStepper ≥ 3 test cases
- [ ] ไม่มี test ที่ test แค่ว่า "render ไม่ crash" อย่างเดียว — ต้อง test behavior จริง
- [ ] PR + รูป screenshot ผล `npm test`

ทำเสร็จ = team member คนอื่น merge โค้ดได้อย่างมั่นใจว่าไม่พังสิ่งที่น้องสร้าง 🧪