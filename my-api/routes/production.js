const router = require('express').Router();
const db     = require('../db');

// ── สแกนชิ้นงาน (1 ครั้ง = 1 ชิ้นที่ 1 สถานี) ─────────────────────────
router.post('/scan', async (req, res) => {
  const { wo_id, serial, station, result, operator, note } = req.body;
  if (!wo_id || !serial || !station || !['PASS', 'FAIL'].includes(result)) {
    return res.status(400).json({ status: 'error', message: 'wo_id, serial, station, result(PASS|FAIL) required' });
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO production_scans (wo_id, serial, station, result, operator, note)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [wo_id, serial, station, result, operator || '', note || null]
    );
    const { rows } = await client.query(
      `INSERT INTO production_units (wo_id, serial, last_station, last_result, scan_count, updated_at)
       VALUES ($1,$2,$3,$4,1,NOW())
       ON CONFLICT (wo_id, serial)
       DO UPDATE SET last_station = $3, last_result = $4,
                     scan_count = production_units.scan_count + 1, updated_at = NOW()
       RETURNING id, wo_id, serial, last_station, last_result, scan_count, updated_at`,
      [wo_id, serial, station, result]
    );
    await client.query('COMMIT');
    res.status(201).json({ status: 'success', data: rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ status: 'error', message: e.message });
  } finally {
    client.release();
  }
});

// รายชื่อชิ้นงาน (สถานะล่าสุดต่อชิ้น) ของ WO
router.get('/units', async (req, res) => {
  try {
    const { wo_id } = req.query;
    const { rows } = await db.query(
      `SELECT id, wo_id, serial, last_station, last_result, scan_count, updated_at
       FROM production_units
       ${wo_id ? 'WHERE wo_id = $1' : ''}
       ORDER BY updated_at DESC`,
      wo_id ? [wo_id] : []
    );
    res.json({ status: 'success', data: rows });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// ประวัติการสแกน (ล่าสุดก่อน)
router.get('/scans', async (req, res) => {
  try {
    const { wo_id, serial, limit } = req.query;
    const conds = [];
    const params = [];
    if (wo_id)  { params.push(wo_id);  conds.push(`wo_id = $${params.length}`); }
    if (serial) { params.push(serial); conds.push(`serial = $${params.length}`); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    params.push(Math.min(Number(limit) || 50, 200));
    const { rows } = await db.query(
      `SELECT id, wo_id, serial, station, result, operator, note, scanned_at
       FROM production_scans ${where}
       ORDER BY scanned_at DESC LIMIT $${params.length}`,
      params
    );
    res.json({ status: 'success', data: rows });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

module.exports = router;
