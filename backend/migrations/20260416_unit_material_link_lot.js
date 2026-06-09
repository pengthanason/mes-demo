/**
 * P4-1: Add lot_no column to unit_material_links for supplier lot traceability.
 * Propagates lot_no from inventory_uids when material is scanned.
 */

exports.up = async function up(knex) {
  await knex.schema.raw(`
    ALTER TABLE unit_material_links
      ADD COLUMN IF NOT EXISTS lot_no TEXT;

    CREATE INDEX IF NOT EXISTS idx_uml_lot
      ON unit_material_links(lot_no)
      WHERE lot_no IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_uml_unit_sn
      ON unit_material_links(unit_sn);

    UPDATE unit_material_links uml
      SET lot_no = iu.lot_no
      FROM inventory_uids iu
      WHERE uml.material_uid = iu.uid
        AND iu.lot_no IS NOT NULL
        AND iu.lot_no <> ''
        AND uml.lot_no IS NULL;
  `);
};

exports.down = async function down(knex) {
  await knex.schema.raw(`
    DROP INDEX IF EXISTS idx_uml_lot;
    DROP INDEX IF EXISTS idx_uml_unit_sn;
    ALTER TABLE unit_material_links DROP COLUMN IF EXISTS lot_no;
  `);
};
