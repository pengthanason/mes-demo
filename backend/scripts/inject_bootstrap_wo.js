/**
 * inject_bootstrap_wo.js
 * Inject 2 bootstrap WOs + 3 production_units each for Day-1 UAT.
 * Idempotent — safe to run multiple times (ON CONFLICT DO NOTHING).
 *
 * Usage: node scripts/inject_bootstrap_wo.js [--dry-run]
 * Cleanup: DELETE FROM mes_core.work_orders WHERE mrp_mo_no LIKE 'BOOTSTRAP-MO-%';
 */
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

const DRY_RUN = process.argv.includes('--dry-run');

const BOOTSTRAP_MOS = [
  { mrp_mo_no: 'BOOTSTRAP-MO-001', demand_plan_ref: 'BOOTSTRAP-001', units: ['SN-BOOT-001', 'SN-BOOT-002', 'SN-BOOT-003'] },
  { mrp_mo_no: 'BOOTSTRAP-MO-002', demand_plan_ref: 'BOOTSTRAP-002', units: ['SN-BOOT-004', 'SN-BOOT-005', 'SN-BOOT-006'] },
];

async function main() {
  const pool = new Pool({
    host:     process.env.DB_HOST     || 'host.docker.internal',
    port:     Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME     || 'productiondb',
    user:     process.env.DB_USER     || 'syntechdb',
    password: process.env.DB_PASSWORD || 'change_me',
    ssl:      (process.env.DB_SSLMODE || 'prefer') === 'require' ? { rejectUnauthorized: false } : false,
  });

  const schema = process.env.DB_SCHEMA || process.env.MES_DB_SCHEMA || 'mes_core';
  const client = await pool.connect();

  try {
    await client.query(`SET search_path TO ${schema}`);

    // Check if already injected
    const existing = await client.query(
      `SELECT COUNT(*) FROM work_orders WHERE mrp_mo_no LIKE 'BOOTSTRAP-MO-%'`
    );
    if (Number(existing.rows[0].count) > 0) {
      console.log('Bootstrap WOs already exist — skipping (idempotent).');
      console.log('To re-inject: DELETE FROM mes_core.work_orders WHERE mrp_mo_no LIKE \'BOOTSTRAP-MO-%\';');
      return;
    }

    // Find first APPROVED BOM
    const bomRes = await client.query(
      `SELECT id, bom_code, part_no FROM master_bom_header WHERE status='APPROVED' ORDER BY id LIMIT 1`
    );
    if (!bomRes.rows.length) {
      console.error('ERROR: No APPROVED BOM found — run BOM approval first');
      process.exit(1);
    }
    const bom = bomRes.rows[0];
    console.log(`Using BOM: id=${bom.id} code=${bom.bom_code} part=${bom.part_no}`);

    // Find system user (PM or ADMIN) for created_by FK
    const userRes = await client.query(
      `SELECT id FROM users WHERE role IN ('ADMIN','PM') ORDER BY id LIMIT 1`
    );
    const createdBy = userRes.rows.length ? Number(userRes.rows[0].id) : 1;

    if (DRY_RUN) {
      console.log('[dry-run] Would inject:');
      BOOTSTRAP_MOS.forEach(m => console.log(`  WO mrp_mo_no=${m.mrp_mo_no} units=${m.units.join(',')}`));
      return;
    }

    await client.query('BEGIN');

    for (const mo of BOOTSTRAP_MOS) {
      // Insert WO
      const woRes = await client.query(`
        INSERT INTO work_orders
          (part_no, qty_target, status, bom_header_id, created_by, mrp_demand_ref, mrp_mo_no)
        SELECT $1, 3, 'OPEN', $2, $3, $4, $5
        WHERE NOT EXISTS (SELECT 1 FROM work_orders WHERE mrp_mo_no=$5)
        RETURNING id, wo_number
      `, [bom.part_no, bom.id, createdBy, mo.demand_plan_ref, mo.mrp_mo_no]);

      if (!woRes.rows.length) {
        console.log(`  WO ${mo.mrp_mo_no} already exists — skipped`);
        continue;
      }

      const woId = woRes.rows[0].id;
      const woNum = woRes.rows[0].wo_number;
      console.log(`  WO created: id=${woId} wo_number=${woNum} mrp_mo_no=${mo.mrp_mo_no}`);

      // Insert production units (PK = sn)
      for (const sn of mo.units) {
        await client.query(`
          INSERT INTO production_units (sn, wo_id, status)
          VALUES ($1, $2, 'NEW')
          ON CONFLICT (sn) DO NOTHING
        `, [sn, woId]);
        console.log(`    unit: ${sn} ✓`);
      }
    }

    await client.query('COMMIT');
    console.log('\nBootstrap inject complete ✓');
    console.log('Operator can now login MES → Production → scan SN-BOOT-001..006');

  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('ERROR:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
