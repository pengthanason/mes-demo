-- ============================================================================
-- seed_admin.sql — สร้างบัญชี admin คนแรกบนฐานข้อมูลเปล่า
-- ============================================================================
-- ใช้เมื่อไร
--   deploy prod ด้วย SEED_DEMO=false บน DB เปล่า แล้วให้ migrations.js สร้างตาราง
--   → จะ "ไม่มีบัญชีใครเลย" ล็อกอินไม่ได้ ต้องรันไฟล์นี้ 1 ครั้ง
--   (ถ้า init DB จาก database_schema.sql อยู่แล้ว ไม่ต้องรัน — ไฟล์นั้นมี INSERT ตัวเดียวกันอยู่ท้ายไฟล์)
--
-- วิธีรัน
--   docker exec -i mes-postgres psql -U syntechdb -d productiondb < my-api/seed_admin.sql
--   หรือ:  psql "$DATABASE_URL" -f my-api/seed_admin.sql
--
-- ⚠️ รหัสเริ่มต้นคือ 'admin' — **เปลี่ยนทันทีหลังล็อกอินครั้งแรก** ที่หน้า Admin Panel
--    ต้องการรหัสอื่นตั้งแต่แรก: สร้าง hash ใหม่แล้วแทนค่าในบรรทัด password_hash
--      node -e "console.log(require('bcryptjs').hashSync(process.argv[1],10))" 'รหัสที่ต้องการ'
--
-- idempotent: ถ้ามี username 'admin' อยู่แล้วจะไม่ทำอะไร (รันซ้ำได้)
-- ============================================================================

INSERT INTO app_users (username, full_name, role, is_active, password_hash, permissions)
VALUES (
  'admin',
  'ผู้ดูแลระบบ',
  'ADMIN',
  true,
  '$2b$10$aymCG/JWida5PwWDyFA9g.yLq6sCE7lNKqXHhu5IMsSGNXH7ieH4S',  -- bcrypt('admin')
  '[]'::jsonb
)
ON CONFLICT (username) DO NOTHING;

-- ตรวจผล
SELECT username, role, is_active FROM app_users WHERE username = 'admin';
