/**
 * Migration: Add partial indexes on integration columns
 * work_orders: wms_prod_order_id, mrp_bom_no, mrp_demand_ref
 * Partial indexes (WHERE ... IS NOT NULL) since many rows may have NULL values.
 */
exports.up = async function up(knex) {
  await knex.schema.raw(`
    CREATE INDEX IF NOT EXISTS idx_wo_wms_prod_order
      ON work_orders(wms_prod_order_id) WHERE wms_prod_order_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_wo_mrp_bom_no
      ON work_orders(mrp_bom_no) WHERE mrp_bom_no IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_wo_mrp_demand_ref
      ON work_orders(mrp_demand_ref) WHERE mrp_demand_ref IS NOT NULL;
  `);
};

exports.down = async function down(knex) {
  await knex.schema.raw(`
    DROP INDEX IF EXISTS idx_wo_wms_prod_order;
    DROP INDEX IF EXISTS idx_wo_mrp_bom_no;
    DROP INDEX IF EXISTS idx_wo_mrp_demand_ref;
  `);
};
