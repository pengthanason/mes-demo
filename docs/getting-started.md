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
