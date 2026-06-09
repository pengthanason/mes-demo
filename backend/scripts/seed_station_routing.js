/**
 * seed_station_routing.js
 * Upsert DEFAULT_PD_CHAIN_R1R13 process route + 7 steps into MES DB.
 * Idempotent — safe to run multiple times.
 *
 * Usage: node scripts/seed_station_routing.js [--dry-run]
 */
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

const DRY_RUN = process.argv.includes('--dry-run');

const ROUTE = {
  route_code: 'DEFAULT_PD_CHAIN_R1R13',
  route_name: 'PCB Assembly — Standard Chain (R1-R13)',
  is_default: true,
};

const STEPS = [
  { step_order: 1, station_name: 'SMT_SMD',   station_type: 'PD',      requires_fai: false },
  { step_order: 2, station_name: 'THU_INSERT', station_type: 'PD',      requires_fai: false },
  { step_order: 3, station_name: 'ICT',        station_type: 'JIGTEST', requires_fai: false },
  { step_order: 4, station_name: 'FCT_PCBA',   station_type: 'JIGTEST', requires_fai: false },
  { step_order: 5, station_name: 'BB_PREP',    station_type: 'PD',      requires_fai: false },
  { step_order: 6, station_name: 'FCT_BBAS',   station_type: 'JIGTEST', requires_fai: false },
  { step_order: 7, station_name: 'FQC',        station_type: 'PD',      requires_fai: false },
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

    if (DRY_RUN) {
      console.log('[dry-run] Would upsert route:', ROUTE.route_code);
      STEPS.forEach(s => console.log(`  step ${s.step_order}: ${s.station_name} (${s.station_type})`));
      return;
    }

    await client.query('BEGIN');

    // Upsert route
    const routeRes = await client.query(`
      INSERT INTO process_routes (route_code, route_name, is_default)
      VALUES ($1, $2, $3)
      ON CONFLICT (route_code) DO UPDATE
        SET route_name = EXCLUDED.route_name,
            is_default  = EXCLUDED.is_default
      RETURNING id, route_code
    `, [ROUTE.route_code, ROUTE.route_name, ROUTE.is_default]);

    const routeId = routeRes.rows[0].id;
    console.log(`Route upserted: id=${routeId} code=${ROUTE.route_code}`);

    // Upsert steps
    for (const s of STEPS) {
      await client.query(`
        INSERT INTO route_steps (route_id, step_order, station_name, station_type, requires_fai, is_required, allow_rework)
        VALUES ($1, $2, $3, $4, $5, true, true)
        ON CONFLICT (route_id, step_order) DO UPDATE
          SET station_name  = EXCLUDED.station_name,
              station_type  = EXCLUDED.station_type,
              requires_fai  = EXCLUDED.requires_fai,
              is_required   = EXCLUDED.is_required,
              allow_rework  = EXCLUDED.allow_rework
      `, [routeId, s.step_order, s.station_name, s.station_type, s.requires_fai]);
      console.log(`  step ${s.step_order}: ${s.station_name} (${s.station_type}) ✓`);
    }

    await client.query('COMMIT');
    console.log('\nStation routing seeded ✓');

    // Verify
    const verify = await client.query(
      `SELECT rs.step_order, rs.station_name, rs.station_type
       FROM route_steps rs JOIN process_routes pr ON pr.id=rs.route_id
       WHERE pr.route_code=$1 ORDER BY rs.step_order`,
      [ROUTE.route_code]
    );
    console.log('\nVerification:');
    verify.rows.forEach(r => console.log(`  ${r.step_order}. ${r.station_name} [${r.station_type}]`));

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
