const router = require('express').Router();
const db     = require('../db');

// ── ลำดับตาราง: พ่อก่อนลูก (สำคัญตอน restore ไม่ให้ FK พัง) ──────────────
// boms → bom_lines · jig_projects → jig_test_records
// qc_results → qc_records / rework_tickets / transfer_verifications · users → audit_logs / notifications
// ⚠️ pre_wo_requests ถูกถอดออกจากระบบแล้ว (ดู migrations.js) — เอาออกจากลิสต์ backup ด้วย
const TABLES = [
  'users', 'audit_logs', 'notifications',
  'bom_lines',                                   // หัว BOM (boms) ถูกถอดออก — BOM มาจากระบบภายนอก
  'work_orders',
  'work_centers', 'workflows', 'workflow_results',
  'jig_projects', 'jig_test_records',             // jig_retest_requests ถูกถอดออกแล้ว
  'inventory_lots', 'kitting_issues',
  'pp_projects', 'production_reports', 'production_scans', 'production_units', 'routing_records',
  'oba_records', 'qc_results', 'qc_records', 'rework_tickets', 'transfer_verifications',
  'change_requests',
];

// ตารางที่มีข้อมูลอ่อนไหว (รหัสผ่าน hash) — เฉพาะ ADMIN ที่ได้ไปด้วย
const SENSITIVE_TABLES = new Set(['users']);

const pad = (n) => String(n).padStart(2, '0');
// ชื่อไฟล์ใช้เวลาไทย (UTC+7) ให้ตรงกับที่ผู้ใช้เห็นบนหน้าจอ
function stampTH() {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return {
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    time: `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`,
  };
}

// ── แปลงค่า JS → literal ของ SQL (ต้อง escape เอง ไม่งั้นข้อความที่มี ' จะทำ SQL พัง) ──
function sqlLiteral(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;   // JSONB
  return `'${String(v).replace(/'/g, "''")}'`;
}

// ดึงข้อมูลทุกตารางที่ผู้ใช้คนนี้มีสิทธิ์เห็น
async function collect(includeSensitive) {
  const tables = TABLES.filter(t => includeSensitive || !SENSITIVE_TABLES.has(t));
  const out = {};
  const skipped = TABLES.filter(t => !tables.includes(t));
  for (const t of tables) {
    // ชื่อตารางมาจาก TABLES ที่ hardcode ไว้ (ไม่ใช่ input ผู้ใช้) จึงต่อสตริงได้ปลอดภัย
    const { rows } = await db.query(`SELECT * FROM ${t}`);
    out[t] = rows;
  }
  return { data: out, tables, skipped };
}

function summarize(data) {
  const counts = {};
  let total = 0;
  for (const [t, rows] of Object.entries(data)) { counts[t] = rows.length; total += rows.length; }
  return { counts, total };
}

// บันทึกลง audit ว่ามีการดาวน์โหลดข้อมูลทั้งระบบออกไป (การกระทำอ่อนไหว ต้องมีร่องรอย)
// activityLog กลางจับแค่ POST/PUT/PATCH/DELETE จึงต้องเขียนเองที่นี่
function logDownload(req, format, info) {
  const actor = (req.user && req.user.username) || 'system';
  const scope = info.skipped.length ? `excludes ${info.skipped.join(',')}` : 'all tables';
  db.query(
    `INSERT INTO audit_logs (actor, action, target_type, target_id, detail)
     VALUES ($1,'EXPORT_BACKUP','backup',NULL,$2)`,
    [actor, `Downloaded backup (${format}) — ${info.total} rows · ${scope}`]
  ).catch(() => {});
}

/**
 * GET /api/backup/export?format=json|sql
 * ADMIN  → ได้ทุกตาราง รวม users (มี password hash)
 * MEMBER → ได้ทุกตารางยกเว้น users
 * VIEWER → ถูกบล็อกที่ authz.js (perm 'backup' ไม่อยู่ในสิทธิ์ default)
 */
router.get('/export', async (req, res) => {
  const format = String(req.query.format || 'json').toLowerCase();
  if (!['json', 'sql'].includes(format)) {
    return res.status(400).json({ status: 'error', message: 'format must be json or sql' });
  }
  const isAdmin = req.user && req.user.role === 'ADMIN';
  try {
    const { data, tables, skipped } = await collect(isAdmin);
    const { counts, total } = summarize(data);
    const { date, time } = stampTH();
    const base = `mes-backup-${date}-${time}`;
    const info = { total, skipped };

    if (format === 'json') {
      const payload = {
        _meta: {
          app: 'Syntech MES',
          exported_at: new Date().toISOString(),
          exported_by: (req.user && req.user.username) || null,
          exported_by_role: (req.user && req.user.role) || null,
          schema_version: 'v2',
          tables_included: tables,
          tables_excluded: skipped,
          row_counts: counts,
          total_rows: total,
          note: skipped.length
            ? 'This file excludes the users/password table (MEMBER access) — a full system restore requires a file downloaded by ADMIN'
            : 'This file includes the users table and password hashes — keep it confidential, do not share',
        },
        data,
      };
      logDownload(req, 'json', info);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${base}.json"`);
      return res.send(JSON.stringify(payload, null, 2));
    }

    // ── format = sql ── กู้ด้วย: psql -d <db> -f ไฟล์นี้ (ไม่ต้องมีเว็บ)
    const L = [];
    L.push('-- ============================================================');
    L.push('-- Syntech MES — Data Backup (SQL)');
    L.push(`-- Created at: ${date} ${time.slice(0, 2)}:${time.slice(2)} (Thailand time)`);
    L.push(`-- By: ${(req.user && req.user.username) || '-'} (${(req.user && req.user.role) || '-'})`);
    L.push(`-- Total rows: ${total}`);
    if (skipped.length) L.push(`-- ⚠️ Excludes tables: ${skipped.join(', ')} (insufficient permission)`);
    else L.push('-- ⚠️ Includes users (with password hashes) — keep confidential');
    L.push('--');
    L.push('-- To restore: create tables with database_schema.sql first, then run this file');
    L.push('--   psql -U <user> -d <db> -f database_schema.sql');
    L.push('--   psql -U <user> -d <db> -f this-file.sql');
    L.push('-- ============================================================');
    L.push('');
    L.push('BEGIN;');
    L.push('SET session_replication_role = replica;   -- temporarily disable triggers/FK so rows can insert in any order');
    L.push('');
    // ล้างของเดิมก่อน (ย้อนลำดับ: ลูกก่อนพ่อ)
    for (const t of [...tables].reverse()) L.push(`DELETE FROM ${t};`);
    L.push('');
    for (const t of tables) {
      const rows = data[t];
      L.push(`-- ${t} (${rows.length} rows)`);
      if (rows.length) {
        const cols = Object.keys(rows[0]);
        for (const r of rows) {
          L.push(`INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(c => sqlLiteral(r[c])).join(', ')});`);
        }
      }
      L.push('');
    }
    L.push('SET session_replication_role = DEFAULT;');
    L.push('');
    L.push('-- Reset sequences to continue from the last id (skipping this causes new inserts to collide on id)');
    for (const t of tables) {
      if ((data[t][0] || {}).id === undefined) continue;
      L.push(`SELECT setval(pg_get_serial_sequence('${t}','id'), COALESCE((SELECT MAX(id) FROM ${t}), 1), true);`);
    }
    L.push('');
    L.push('COMMIT;');
    L.push('');

    logDownload(req, 'sql', info);
    res.setHeader('Content-Type', 'application/sql; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.sql"`);
    return res.send(L.join('\n'));
  } catch (e) {
    console.error('[backup]', e);
    res.status(500).json({ status: 'error', message: 'Failed to create backup file, please try again' });
  }
});

// GET /api/backup/summary — ให้หน้าเว็บโชว์ว่าจะได้อะไรบ้าง ก่อนกดดาวน์โหลด
router.get('/summary', async (req, res) => {
  const isAdmin = req.user && req.user.role === 'ADMIN';
  try {
    const { data, tables, skipped } = await collect(isAdmin);
    const { counts, total } = summarize(data);
    res.json({
      status: 'success',
      data: { tables, skipped, row_counts: counts, total_rows: total, includes_users: isAdmin },
    });
  } catch (e) {
    console.error('[backup summary]', e);
    res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

module.exports = router;
