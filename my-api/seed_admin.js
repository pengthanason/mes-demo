#!/usr/bin/env node
/**
 * seed_admin.js — สร้างบัญชี admin คนแรกบนฐานข้อมูลเปล่า
 * ============================================================================
 * แทนที่ seed_admin.sql เดิมที่ฝัง bcrypt('admin') ไว้ในไฟล์ที่ commit ลง git
 * (ใครก็อ่านรีโปแล้วรู้รหัส — และของแบบนั้นไม่มีใครเปลี่ยนหลัง deploy จริง)
 *
 * ใช้เมื่อไร
 *   deploy บน DB เปล่าด้วย SEED_DEMO=false → จะไม่มีบัญชีใครเลย ล็อกอินไม่ได้ ต้องรันไฟล์นี้ 1 ครั้ง
 *
 * วิธีรัน — รหัสมาจาก env ไม่ใช่จากไฟล์
 *   ADMIN_PASSWORD='<รหัสที่ตั้งเอง>' node my-api/seed_admin.js
 *   ADMIN_PASSWORD="$(openssl rand -base64 18)" node my-api/seed_admin.js    # สุ่มให้ แล้วจดไว้
 *
 * ถ้าไม่ตั้ง ADMIN_PASSWORD → สคริปต์จะสุ่มให้แล้วพิมพ์ออกมา 1 ครั้ง (จดทันที ไม่มีที่อื่นเก็บ)
 *
 * idempotent: ถ้ามี username 'admin' อยู่แล้วจะไม่ทำอะไร (รันซ้ำได้)
 * ============================================================================
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');

const MIN_LEN = 12;

async function main() {
  let password = process.env.ADMIN_PASSWORD;
  let generated = false;

  if (!password) {
    // สุ่มให้ ดีกว่าปล่อยให้ตั้ง 'admin' — base64url ตัดอักขระที่พิมพ์ผิดง่ายออก
    password = crypto.randomBytes(18).toString('base64url');
    generated = true;
  } else if (password.length < MIN_LEN) {
    console.error(`[seed_admin] ADMIN_PASSWORD สั้นเกินไป (${password.length} ตัว) — ต้องอย่างน้อย ${MIN_LEN} ตัว`);
    process.exit(1);
  }

  const username = process.env.ADMIN_USERNAME || 'admin';
  const hash = bcrypt.hashSync(password, 10);

  const { rows } = await db.query(
    `INSERT INTO users (username, full_name, role, is_active, password_hash, permissions)
     VALUES ($1, $2, 'ADMIN', true, $3, '[]'::jsonb)
     ON CONFLICT (username) DO NOTHING
     RETURNING id, username, role`,
    [username, process.env.ADMIN_FULL_NAME || 'ผู้ดูแลระบบ', hash]
  );

  if (!rows.length) {
    console.log(`[seed_admin] มีบัญชี '${username}' อยู่แล้ว — ไม่ได้เปลี่ยนอะไร`);
    console.log(`[seed_admin] ต้องการรีเซ็ตรหัส ให้ทำผ่านหน้า Admin Panel หรือ UPDATE ด้วยมือ`);
    await db.end();
    return;
  }

  console.log(`[seed_admin] ✅ สร้างบัญชี ADMIN แล้ว: ${rows[0].username} (id=${rows[0].id})`);
  if (generated) {
    console.log('');
    console.log('  ┌──────────────────────────────────────────────────────────┐');
    console.log('  │  รหัสผ่านที่สุ่มให้ — แสดงครั้งเดียว ไม่มีที่อื่นเก็บไว้        │');
    console.log('  └──────────────────────────────────────────────────────────┘');
    console.log(`     ${password}`);
    console.log('');
    console.log('  จดใส่ที่เก็บรหัสผ่านของทีมทันที แล้วเปลี่ยนหลังล็อกอินครั้งแรก');
  } else {
    console.log('[seed_admin] ใช้รหัสจาก ADMIN_PASSWORD — เปลี่ยนหลังล็อกอินครั้งแรกด้วย');
  }
  await db.end();
}

main().catch((e) => {
  console.error('[seed_admin] ล้มเหลว:', e.message);
  process.exit(1);
});
