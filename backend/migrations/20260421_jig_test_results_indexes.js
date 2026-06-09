/**
 * Migration: Additional indexes on jig_test_results for bulkStatus / result lookups
 *
 * Context (Session 69, 2026-04-21 — Team 1 P0 fix):
 *   Table jig_test_results (migration 20260408_add_jig_test_tracking) ให้ index
 *     - uq_jig_test_results_sn_type  (unit_sn, test_type)    [UNIQUE]
 *     - idx_jig_test_results_wo      (wo_id)
 *     - idx_jig_test_results_status  (job_status, result_status)
 *   แต่ query pattern จริงของ jumbo/routing ใช้:
 *     - filter by unit_sn เดี่ยว (IN list ของ component SNs ใน bulkStatus)
 *     - filter by result_status = 'FAIL' / 'PASS'
 *   index (unit_sn, test_type) ช่วย point-lookup ได้ แต่เมื่อ IN list ใหญ่ + scan result_status
 *   PG อาจเลือก seq scan ถ้า stats ไม่เอื้อ → เพิ่ม index เดี่ยวเพื่อช่วย planner
 *
 * NOTE: column จริงใน table คือ `unit_sn` ไม่ใช่ `sn` และไม่มี schema prefix mes_core.
 *       ดังนั้น index ที่เพิ่มจึงใช้ชื่อ column ตรงกับ migration 20260408
 */

exports.up = async function up(knex) {
  await knex.schema.raw(`
    -- point lookup by unit_sn เดี่ยว (bulkStatus IN ใหญ่)
    CREATE INDEX IF NOT EXISTS idx_jig_test_results_unit_sn
      ON jig_test_results(unit_sn);

    -- filter by result_status (PASS/FAIL) เท่านั้น partial เพื่อลดขนาด
    CREATE INDEX IF NOT EXISTS idx_jig_test_results_result_status
      ON jig_test_results(result_status)
      WHERE result_status IS NOT NULL;

    -- composite รองรับ bulkStatus pattern: unit_sn + result_status
    CREATE INDEX IF NOT EXISTS idx_jig_test_results_sn_result
      ON jig_test_results(unit_sn, result_status);
  `);
};

exports.down = async function down(knex) {
  await knex.schema.raw(`
    DROP INDEX IF EXISTS idx_jig_test_results_unit_sn;
    DROP INDEX IF EXISTS idx_jig_test_results_result_status;
    DROP INDEX IF EXISTS idx_jig_test_results_sn_result;
  `);
};
