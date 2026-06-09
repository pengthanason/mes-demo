const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '..', '.env'), override: false });

const { pool, withTransaction } = require('../db');

const ROUTE_CODE = 'DEFAULT_PD_CHAIN_R1R13';
const ROUTE_NAME = 'Default Production Flex Route';
const PRODUCTION_ONLY_STATION_TYPE = 'PD';
const LEGACY_ROUTE_CODES = ['DEFAULT_PD_CHAIN', 'DEFAULT_PD_CHAIN_R1R12'];
const PRODUCTION_FLEX_STEPS = [
  { step_order: 1, station_name: 'SMT_SMD', requires_fai: false, is_required: true, allow_rework: true },
  { step_order: 2, station_name: 'THU_INSERT', requires_fai: false, is_required: true, allow_rework: true },
  { step_order: 3, station_name: 'ICT', requires_fai: false, is_required: true, allow_rework: true },
  { step_order: 4, station_name: 'FCT_PCBA', requires_fai: false, is_required: true, allow_rework: true },
  { step_order: 5, station_name: 'BB_PREP', requires_fai: false, is_required: true, allow_rework: true },
  { step_order: 6, station_name: 'FCT_BBAS', requires_fai: false, is_required: true, allow_rework: true },
  { step_order: 7, station_name: 'FQC', requires_fai: false, is_required: true, allow_rework: true },
];

async function applyProductionFlexRoute() {
  return withTransaction(async (client) => {
    const routeResult = await client.query(
      `INSERT INTO process_routes (route_code, route_name, is_active, is_default, enforce_sequence)
       VALUES ($1, $2, TRUE, TRUE, FALSE)
       ON CONFLICT (route_code) DO UPDATE
       SET route_name = EXCLUDED.route_name,
           is_active = TRUE,
           is_default = TRUE,
           enforce_sequence = FALSE
       RETURNING id, route_code`,
      [ROUTE_CODE, ROUTE_NAME]
    );

    const routeId = Number(routeResult.rows[0].id);

    await client.query(
      `UPDATE process_routes
       SET is_default = CASE WHEN id = $1 THEN TRUE ELSE FALSE END
       WHERE is_active = TRUE`,
      [routeId]
    );

    for (const step of PRODUCTION_FLEX_STEPS) {
      await client.query(
        `INSERT INTO route_steps (
            route_id,
            step_order,
            station_name,
            station_type,
            requires_fai,
            is_required,
            allow_rework
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (route_id, step_order) DO UPDATE
        SET station_name = EXCLUDED.station_name,
            station_type = EXCLUDED.station_type,
            requires_fai = EXCLUDED.requires_fai,
            is_required = EXCLUDED.is_required,
            allow_rework = EXCLUDED.allow_rework`,
        [
          routeId,
          step.step_order,
          step.station_name,
          PRODUCTION_ONLY_STATION_TYPE,
          step.requires_fai,
          step.is_required,
          step.allow_rework,
        ]
      );
    }

    await client.query(
      `DELETE FROM route_steps
       WHERE route_id = $1
         AND step_order > $2`,
      [routeId, PRODUCTION_FLEX_STEPS.length]
    );

    const legacyRouteResult = await client.query(
      `UPDATE process_routes
       SET is_active = FALSE,
           is_default = FALSE
       WHERE route_code = ANY($1::text[])
       RETURNING route_code`,
      [LEGACY_ROUTE_CODES]
    );

    const summaryResult = await client.query(
      `SELECT
          pr.id AS route_id,
          pr.route_code,
          pr.route_name,
          pr.is_active,
          pr.is_default,
          pr.enforce_sequence,
          rs.step_order,
          rs.station_name,
          rs.station_type,
          rs.requires_fai,
          rs.is_required,
          rs.allow_rework
       FROM process_routes pr
       JOIN route_steps rs
         ON rs.route_id = pr.id
       WHERE pr.id = $1
       ORDER BY rs.step_order ASC`,
      [routeId]
    );

    return {
      route_id: routeId,
      route_code: ROUTE_CODE,
      route_name: ROUTE_NAME,
      step_count: summaryResult.rows.length,
      deactivated_route_codes: legacyRouteResult.rows.map((row) => row.route_code),
      steps: summaryResult.rows.map((row) => ({
        step_order: Number(row.step_order),
        station_name: row.station_name,
        station_type: row.station_type,
        requires_fai: Boolean(row.requires_fai),
        is_required: Boolean(row.is_required),
        allow_rework: Boolean(row.allow_rework),
      })),
    };
  });
}

async function main() {
  try {
    const summary = await applyProductionFlexRoute();
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ status: 'ok', route: summary }, null, 2));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify(
        {
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
