# FE-3 — ต่อ API จริงของ MES (localStorage → backend) 🔌

**ระดับ:** กลาง (งานจริงเต็มรูป) | **น่าจะใช้เวลา:** 1–2 สัปดาห์

---

## ทำไมต้องทำงานนี้

ถึงตรงนี้น้องแปลง prototype เป็น React ได้แล้ว (FE-1 ตาราง, FE-2 sequence builder) แต่ข้อมูลยังอยู่ใน **localStorage** (เครื่องใครเครื่องมัน หายเมื่อล้าง cache)

ของจริงใน MES ข้อมูลต้องอยู่บน **server กลาง** ทุกคนเห็นตรงกัน คราวนี้เราจะเปลี่ยนจาก localStorage มาคุยกับ **API จริงของ MES** (module 06 Routing)

นี่คือก้าวสุดท้ายที่ทำให้งานน้อง "ใช้ได้จริง" ในระบบ — ไม่ใช่ prototype อีกต่อไป 🎉

## น้องจะได้ฝึกอะไร

- ดึง/ส่งข้อมูลกับ backend ผ่าน `src/lib/api.ts`
- จัดการ loading / error (เน็ตช้า/พังได้ ต้องเผื่อ)
- เข้าใจว่า frontend กับ backend "คุยกัน" ยังไง

---

## endpoint ที่เกี่ยวข้อง (module 06 Routing)

```
GET  /api/mes/routes/catalog     → รายการ routing/station ที่ตั้งไว้ (เอามาเป็นตัวเลือก station)
GET  /api/mes/stations/monitor   → สถานะ station ปัจจุบัน
POST /api/routing/scan-in        → บันทึก scan เข้า station
POST /api/routing/scan-out       → บันทึก scan ออก
```

> ❓ ไม่แน่ใจว่า payload แต่ละ endpoint รับ field อะไร / URL backend อยู่ไหน?
> **ทักพี่ขอ contract ก่อนเลย** อย่าเดา — รู้ของจริงแล้วค่อยลงมือ จะได้ไม่เสียเวลา

## มาเริ่มกันทีละขั้น

**ก้าวที่ 1 — ส่อง API ก่อน (สำคัญเสมอ)**
เปิด F12 → Network แล้วลองยิง `GET /api/mes/routes/catalog` ดูว่า response หน้าตายังไง มี station อะไรบ้าง

**ก้าวที่ 2 — เปลี่ยน dropdown station ให้มาจาก API จริง**
ใน FE-2 รายการ station ยัง hardcode ใช่ไหม คราวนี้ดึงจาก `/api/mes/routes/catalog` มาแทน
```tsx
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

const { data: routes, isLoading } = useQuery({
  queryKey: ['routes-catalog'],
  queryFn: async () => (await api.get('/mes/routes/catalog')).data,
});
```
👉 `@tanstack/react-query` (มีใน project แล้ว) ช่วยจัดการ loading/cache ให้ น้องแค่เอา `routes` ไปทำ dropdown

**ก้าวที่ 3 — โหลด history จาก server แทน localStorage**
ตาราง history (FE-1) เปลี่ยนจากอ่าน localStorage มาดึงจาก API (พี่จะบอก endpoint history ให้)

**ก้าวที่ 4 — ส่ง routing process เข้า server**
ตอนกด "Record" แทนที่จะเซฟ localStorage ให้ POST เข้า MES:
```tsx
async function submit() {
  try {
    await api.post('/routing/scan-in', { serial, steps /* ...ตาม contract */ });
    // สำเร็จ → refresh history, เคลียร์ฟอร์ม
  } catch (err) {
    // แสดง error ให้ผู้ใช้เห็น
  }
}
```

**ก้าวที่ 5 — loading & error ครบ**
- ตอนกำลังส่ง → ปุ่มขึ้น "กำลังบันทึก..." กันกดซ้ำ
- ส่งพลาด → โชว์ error ชัดๆ ไม่ใช่เงียบหาย
- ส่งสำเร็จ → history อัปเดต

## ค่อยๆ ทำ ไม่ต้องเปลี่ยนทั้งหมดทีเดียว

แนะนำให้ทำทีละ endpoint: เริ่มจาก dropdown (อ่านอย่างเดียว ปลอดภัยสุด) → history → ค่อยทำปุ่มส่ง (เขียนข้อมูล) ทำชิ้นไหนเสร็จ commit ชิ้นนั้น

## อยากให้ลองคิดเอง

- localStorage กับ API ต่างกันยังไงในแง่ "ใครเห็นข้อมูลบ้าง"? ทำไมระบบโรงงานต้องใช้ server กลาง
- ถ้า 2 คนกด Record serial เดียวกันพร้อมกันจะเกิดอะไร? (โจทย์จริงของระบบ multi-user — ลองคิด ไม่ต้องแก้ตอนนี้)

## ถ้าติด (อ่านให้จบก่อนเครียด)

อาการพวกนี้ **เป็นฝั่ง backend ไม่ใช่ความผิดน้อง** — ทักพี่ได้เลย:
- CORS / connection refused → backend ปิด หรือ URL ผิด
- 401 → ต้อง login/token ก่อน
- 400/422 → payload ไม่ตรง contract → เทียบ field กับที่พี่ให้
- ระหว่างรอ backend พร้อม ใช้ mock ไปก่อนได้ (เหมือนที่เราเริ่มทุกงานด้วย mock)

## เช็คตัวเองว่าใช่รึยัง

- [ ] dropdown station มาจาก `/api/mes/routes/catalog` จริง
- [ ] กด Record → ข้อมูลเข้า MES server (ไม่ใช่ localStorage)
- [ ] history โหลดจาก server
- [ ] ปิด backend → เห็น error ชัดเจน ไม่ใช่จอขาว
- [ ] PR branch `feat/fe-3-connect-mes-api` + screenshot + เล่าว่าต่อ endpoint ไหนบ้าง

ถ้าน้องทำงานนี้จบ = prototype ที่น้องเริ่มไว้ **กลายเป็นฟีเจอร์จริงใน MES** ที่ทีมใช้ได้ 🎉 จากไฟล์ HTML เดี่ยวๆ สู่ React ที่ต่อ backend — น้องมาไกลมาก เก่งจริงๆ
