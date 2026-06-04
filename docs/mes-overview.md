# MES System Overview
> อ่านก่อนเริ่มงานทุกครั้ง — last updated 2026-06-04

## ภาพรวมระบบ
Syntech MES (Manufacturing Execution System) ควบคุม production flow ตั้งแต่รับวัตถุดิบจนถึงส่งสินค้า

```
MRP (BOM/stock check) ◀──▶ MES :5100 ──▶ WMS :8000 (stock master)
                                 │
                            Jig-API :3000 (ICT/FCT ← ESP32)
```

## Services และ Port

| Service | Port | หน้าที่ | Tech |
|---------|------|---------|------|
| MES Backbone | 5100 | API หลัก + Vite admin UI | Node.js / Express |
| MES Web | 3005 | Operator UI หน้างาน | Next.js 15 |
| Jig-API | 3000 | รับผล ICT/FCT จาก ESP32 | Node.js |
| WMS API | 8000 | Warehouse management | Python / FastAPI |
| MRP API | 8001 | Material requirements | Python / FastAPI |
| PostgreSQL | 5432 | DB หลัก (schema: mes_core) | PostgreSQL 15 |

## Access URLs (LAN เครือข่ายบริษัท)

| URL | ใช้สำหรับ |
|-----|---------|
| `https://172.16.10.87/mes-api/api/mes/health` | Health check |
| `https://172.16.10.87/mes-api/ui/` | Vite Admin UI |
| `http://172.16.10.87:3005/` | Operator UI หน้างาน |
| `https://172.16.10.87/jumbo/` | Jumbo ICT station |

## Production 9-Step Workflow

```
M01 Planning → M02 Incoming (GR/IQC) → M03 WO Release → M04 Kitting (GI)
→ M05 FAI → M06 Production → M07 QC/Rework → M08 QA OBA → M09 Close
```

## Repositories

| Repo | โค้ด |
|------|------|
| `Weradech/syntech_mes_draft` | Backend Express + Vite frontend (งานหลัก) |
| `Weradech/syntech_mes_web` | Next.js Operator UI |

## User Roles

`PM` `STORE` `QC` `QA` `TECH` `PD` `ADMIN`

## ข้อห้าม

- ห้าม modify Jig-API — hardware ESP32 ใช้งานจริงใน production
- ห้าม push ตรง main — ต้องเปิด Pull Request
- ห้าม hardcode credentials — ใช้ .env เท่านั้น