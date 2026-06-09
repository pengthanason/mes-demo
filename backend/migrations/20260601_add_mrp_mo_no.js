/**
 * Migration: ADD mrp_mo_no to work_orders
 * Idempotency key for MRP→MES auto-push polling job.
 * UNIQUE constraint prevents duplicate WO per MRP MO.
 */
exports.up = async function up(knex) {
  await knex.schema.raw(`
    ALTER TABLE work_orders
      ADD COLUMN IF NOT EXISTS mrp_mo_no TEXT;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_work_orders_mrp_mo_no
      ON work_orders (mrp_mo_no)
      WHERE mrp_mo_no IS NOT NULL;
  `);
};

exports.down = async function down(knex) {
  await knex.schema.raw(`
    DROP INDEX IF EXISTS uq_work_orders_mrp_mo_no;
    ALTER TABLE work_orders DROP COLUMN IF EXISTS mrp_mo_no;
  `);
};
