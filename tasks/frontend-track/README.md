# Frontend Track — เปลี่ยน prototype ของน้องให้เป็นของจริงใน MES 🎨

สวัสดีค่ะน้อง! 👋 พี่ได้เห็น **MES Routing Station Control Panel** ที่น้องทำไว้ (login.html + mes.html) แล้ว — **เก่งมากจริงๆ** 👏
น้องทำ routing template, sequence builder, drag-and-drop จัดลำดับ, defect select, history log ครบเลย ด้วย vanilla JS ล้วนๆ
แสดงว่าน้อง **เข้าใจงาน MES** และ **เขียน frontend เป็นจริง** — อันนี้พี่เห็นชัด

> **แล้วทำไม PR เดิมถึงยังไม่ถูก merge?** ไม่ใช่เพราะงานไม่ดีนะ แต่เพราะ project MES จริงเขาเขียนด้วย **React + Vite** (แยกเป็น component) ส่วนของน้องเป็นไฟล์ HTML เดี่ยวๆ มันเลยยังต่อกันไม่ได้
> **Track นี้คือสะพาน** ที่จะพาน้องเอา prototype ที่ตัวเองสร้าง **มาแปลงเป็น React component จริงใน MES** ทีละชิ้น — น้องจะได้เรียน React จากงานที่ตัวเองเข้าใจดีอยู่แล้ว ไม่ต้องเริ่มจากศูนย์ 🙂

## ภาพรวม — เราจะทำอะไรกัน

prototype ของน้องเก็บข้อมูลใน **localStorage** (ในเครื่อง) และจัดการ DOM เอง
ของจริงใน MES เราอยากให้มัน:
1. เป็น **React component** (โครงเดียวกับหน้าอื่นใน MES จะได้ต่อกันได้)
2. ต่อ **API จริงของ MES** (module 06 Routing: `/api/routing/scan-in`, `/api/mes/routes/catalog` ฯลฯ) แทน localStorage

เราจะไปถึงตรงนั้นทีละก้าว ไม่รีบ ✨

## prototype เดิมของน้องอยู่ไหน

พี่เก็บไว้ให้แล้วที่ **[`your-prototype/`](./your-prototype/)** (login.html, mes.html + css)
แต่ละงานข้างล่างจะอ้างถึงไฟล์นี้ — เปิดควบคู่กันไป น้องจะเห็นว่า "โค้ดเดิมที่เราเขียน กลายเป็น React ได้ยังไง"

## เครื่องมือใน MES (repo `syntech_mes_draft` → โฟลเดอร์ `frontend/`)

| เครื่องมือ | คืออะไร | เทียบกับที่น้องเคยใช้ |
|-----------|---------|----------------------|
| **React + Vite** | framework ทำ UI | แทน HTML เดี่ยว + `<script>` |
| **component (.tsx)** | กล่อง UI ที่ reuse ได้ | แทนการก๊อป HTML ซ้ำๆ |
| **useState** | เก็บ "สถานะ" ของหน้า | แทน `localStorage` + แก้ DOM เอง |
| **react-router-dom** | จัดการหน้า (ดู `#/` ใน url) | แทนการเปิดไฟล์ .html คนละไฟล์ |
| `src/lib/api.ts` | เรียก API: `api.get('/path')` | แทน `localStorage.getItem/setItem` ตอนต่อของจริง |

> 💡 ครูที่ดีที่สุดคือโค้ดที่มีอยู่: เปิด `frontend/src/pages/RouteAdminPage.tsx` ดู เป็น pattern จริงของทีม ลอกโครงมาดัดแปลงได้เลย

## เส้นทาง 4 ขั้น

| # | งาน | สิ่งที่จะแปลง | น้องจะได้ฝึก |
|---|-----|--------------|-------------|
| **FE-0** | [ตั้งเครื่องให้พร้อม](./FE-0-onboarding-warmup.md) | (อุ่นเครื่อง) | รัน MES frontend ให้ขึ้น |
| **FE-1** | [แปลง History Table → React](./FE-1-port-history-table.md) | ตาราง history ของน้อง | component, props, map (อ่านอย่างเดียวก่อน) |
| **FE-2** | [แปลง Sequence Builder → React state](./FE-2-port-sequence-builder.md) | ตัวเพิ่ม/ลบ step ของน้อง | `useState`, controlled input, จัดการ list |
| **FE-3** | [ต่อ API จริงของ MES](./FE-3-connect-mes-routing-api.md) | localStorage → API จริง | ดึง/ส่งข้อมูลกับ backend |
| **FE-4** | [Daily Production Report Table](./FE-4-daily-production-report-table.md) | รายงานพี่ Kotchapat (Outlook) → ตารางในระบบ | ตารางหลายคอลัมน์, filter, badge |

## 3 นิสัยที่อยากชวนน้องทำ

1. **Commit + push บ่อยๆ** — ทำเสร็จก้าวไหน push ก้าวนั้น แม้ยังไม่เสร็จดี พี่จะได้เปิดดูช่วยได้ทัน (ที่ผ่านมาน้องเก็บ code ไว้ในเครื่อง พี่เลยช่วยไม่ได้ ครั้งนี้เรา push กันบ่อยๆ นะ)
2. **ติดเกิน 2 ชม. ทักได้เลย** — ไม่ต้องเกรงใจ โดยเฉพาะถ้าเป็น error จาก backend/server อันนั้นพี่จัดให้
3. **1 งาน = 1 branch = 1 PR** — แล้วเราคุยเรื่อง code กันใน PR (`git checkout -b feat/fe-1-history-table`)

## รู้ได้ยังไงว่าเสร็จ

แต่ละไฟล์มี "เช็คตัวเองว่าใช่รึยัง" + อย่าลืม **screenshot** ใส่ PR นะ พี่อยากเห็นของน้องค่อยๆ กลายเป็น React 🙂
