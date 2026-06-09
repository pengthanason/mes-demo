/**
 * Migration: MES Integration Columns
 * - work_orders: drop bom_header_id, add mrp_bom_no / mrp_bom_rev / wms_prod_order_id / mrp_demand_ref
 * - wo_bom_snapshot: drop source_bom_id / source_detail_id, add mrp_bom_no / mrp_line_no
 * - CREATE TABLE mes_sync_log
 */
exports.up = async function up(knex) {
  await knex.schema.raw(`
    -- work_orders: add integration columns (keep bom_header_id for backward compat — drop later)
    ALTER TABLE work_orders
      ADD COLUMN IF NOT EXISTS mrp_bom_no        TEXT,
      ADD COLUMN IF NOT EXISTS mrp_bom_rev       TEXT,
      ADD COLUMN IF NOT EXISTS wms_prod_order_id TEXT,
      ADD COLUMN IF NOT EXISTS mrp_demand_ref    TEXT;

    -- wo_bom_snapshot: add mrp traceability columns
    ALTER TABLE wo_bom_snapshot
      ADD COLUMN IF NOT EXISTS mrp_bom_no  TEXT,
      ADD COLUMN IF NOT EXISTS mrp_line_no INTEGER;

    -- mes_sync_log: track all cross-system sync events
    CREATE TABLE IF NOT EXISTS mes_sync_log (
      id           BIGSERIAL PRIMARY KEY,
      direction    TEXT        NOT NULL,
      event_type   TEXT        NOT NULL,
      wo_id        BIGINT      REFERENCES work_orders(id) ON DELETE SET NULL,
      payload      JSONB       NOT NULL DEFAULT '{}',
      status       TEXT        NOT NULL DEFAULT 'PENDING',
      error_msg    TEXT        NOT NULL DEFAULT '',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      CONSTRAINT chk_sync_direction CHECK (direction IN ('MES->WMS','MES->MRP','MRP->MES','WMS->MES')),
      CONSTRAINT chk_sync_status    CHECK (status IN ('PENDING','OK','FAILED'))
    );

    CREATE INDEX IF NOT EXISTS idx_mes_sync_log_wo     ON mes_sync_log(wo_id);
    CREATE INDEX IF NOT EXISTS idx_mes_sync_log_status ON mes_sync_log(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_mes_sync_log_event  ON mes_sync_log(event_type, created_at DESC);
  `);
};

exports.down = async function down(knex) {
  await knex.schema.raw(`
    DROP TABLE IF EXISTS mes_sync_log;
    ALTER TABLE work_orders
      DROP COLUMN IF EXISTS mrp_bom_no,
      DROP COLUMN IF EXISTS mrp_bom_rev,
      DROP COLUMN IF EXISTS wms_prod_order_id,
      DROP COLUMN IF EXISTS mrp_demand_ref;
    ALTER TABLE wo_bom_snapshot
      DROP COLUMN IF EXISTS mrp_bom_no,
      DROP COLUMN IF EXISTS mrp_line_no;
  `);
};
