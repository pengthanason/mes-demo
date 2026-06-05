# Getting Started

## 1. Setup Git

```bash
git config --global user.name "Your Name"
git config --global user.email "your@email.com"
```

## 2. Clone repo

```bash
git clone https://github.com/Weradech/syntech-intern-2026.git
cd syntech-intern-2026
```

## 3. ส่ง Daily Report ทุกวัน

```bash
# Copy template
cp daily-reports/_template.md daily-reports/2026-06-04.md

# แก้ไขให้ครบ แล้ว commit
git add daily-reports/2026-06-04.md
git commit -m "daily: 2026-06-04"
git push
```

## 4. สร้าง branch เมื่อมี task

```bash
git checkout -b feat/task-name
# ทำงาน...
git push origin feat/task-name
# เปิด Pull Request บน GitHub
```

---

## 5. งานของน้อง — เริ่มที่ Frontend Track 👈

น้องถนัด **Frontend** → เริ่มที่ **[`tasks/frontend-track/`](../tasks/frontend-track/README.md)** ค่ะ
ไล่ตามลำดับ: **FE-0 → FE-1 → FE-2 → FE-3** (ง่ายไปยาก ทุก task ไม่ต้องเขียน backend)

> task เดิม `task-A` ถึง `task-D` ในโฟลเดอร์ `tasks/` เป็นงาน backend หนัก — **ข้ามไปก่อน** ทำ Frontend Track ให้จบก่อนค่ะ

### ของแถม: Node-RED Track (หัดเล่น IoT ไปช่วยงาน MES)

มี **[`tasks/node-red-track/`](../tasks/node-red-track/README.md)** ให้น้องลองหัด Node-RED — เครื่องมือต่อ IoT แบบลากกล่อง สนุกและเริ่มง่าย
ทุก Phase ออกแบบให้**ช่วยงาน MES โดยตรง** (ทำ gateway เชื่อมเครื่องจักร↔MES + dashboard หน้าไลน์)

> ⚠️ **ลำดับความสำคัญ:** เอางานที่**ช่วย MES เป็นหลักก่อนเสมอ** Node-RED Track ทำแทรกตอนเปลี่ยนบรรยากาศ หรือตอนพี่ชวน

## 6. นิสัยดีๆ ที่อยากชวนน้องทำ 🙂

ไม่ใช่กฎเข้มงวดนะ แต่เป็นสิ่งที่จะทำให้น้องโตเร็วและทำงานกับทีมได้ราบรื่น:

1. **Commit + push บ่อยๆ** — ทำเสร็จส่วนไหน push ขึ้น branch เลย แม้ยังไม่เสร็จดี ไม่ต้องเก็บไว้ในเครื่องคนเดียว เพราะถ้าน้องติด พี่เลี้ยงจะเปิดดูแล้วช่วยได้ทันที
2. **ติดเกิน 2 ชั่วโมง ทักได้เลย ไม่ต้องเกรงใจ** — การถามคือทักษะ ไม่ใช่ความอ่อนแอ โดยเฉพาะถ้า error มาจาก backend/server อันนั้นไม่ใช่งานน้อง พี่จัดให้
3. **หนึ่งงาน = หนึ่ง branch = หนึ่ง PR** — แล้วเราจะคุยเรื่อง code กันใน PR เหมือนเรียนไปด้วยกัน (เผลอ push เข้า main ไปก็ไม่เป็นไร ครั้งหน้าค่อยใช้ branch)
4. **Daily report ลงวันที่ให้ตรง** (ปีนี้ 2026 นะ) — เล่าตรงๆ ได้เลยว่าติดอะไร พี่อยากรู้ว่าตรงไหนยากเพื่อจะช่วยได้ถูกจุด

## 7. dev server รันไม่ขึ้น? (frontend)

ดูตาราง troubleshooting ละเอียดใน **[FE-0 — Onboarding & Warm-up](../tasks/frontend-track/FE-0-onboarding-warmup.md)**
จุดที่มักเข้าใจผิด: **frontend รันได้ ไม่จำเป็นต้องมี backend** — ถ้าหน้าเว็บโหลดขึ้นเห็น layout = ผ่านแล้ว (data ว่าง/network error เป็นเรื่อง backend ข้ามไปก่อน)
