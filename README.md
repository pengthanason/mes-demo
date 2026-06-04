# Syntech Internship Project 2026

Welcome to Syntech's internship repository!

## Overview

This repo is the main workspace for the 2026 internship program at **Synergy Technology Co., Ltd.**

**หลักๆ ใช้สำหรับ:**
- ส่ง Daily Report ทุกวันที่ทำงาน
- เก็บ code งานที่ได้รับมอบหมาย

## Quick Start

```bash
git clone https://github.com/Weradech/syntech-intern-2026.git
cd syntech-intern-2026
```

อ่าน `docs/getting-started.md` ก่อนเริ่มงานวันแรกค่ะ

## Daily Report

ส่งทุกวัน ก่อนเลิกงาน:

```bash
cp daily-reports/_template.md daily-reports/YYYY-MM-DD.md
# กรอกให้ครบ แล้ว:
git add . && git commit -m "daily: YYYY-MM-DD" && git push
```

## Folder Structure

```
syntech-intern-2026/
├── daily-reports/      # Daily report ทุกวัน (ส่งที่นี่)
│   ├── _template.md    # Template — copy ก่อนใช้
│   └── YYYY-MM-DD.md
├── docs/               # คู่มือและ reference
├── backend/            # Backend code (ถ้ามี task)
├── frontend/           # Frontend code (ถ้ามี task)
└── scripts/            # Scripts อื่นๆ
```

## Git Workflow

| Step | Command |
|------|---------|
| สร้าง branch | `git checkout -b feat/<task-name>` |
| Commit | `git add . && git commit -m "feat: ..."` |
| Push | `git push origin feat/<task-name>` |
| PR | เปิด Pull Request บน GitHub → รอ review |

> ห้าม push ตรงเข้า `main` — ต้องผ่าน Pull Request เท่านั้น

## Contact

- **Supervisor:** Weradech K. (NPI & System Engineering Manager)

---
*Synergy Technology Co., Ltd. — Internal use only*
