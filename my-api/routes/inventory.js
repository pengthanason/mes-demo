const router = require('express').Router();
const db     = require('../db');

// ── Incoming: รับวัตถุดิบเข้า (ระดับล็อต — 1 ล็อต = 1 record) ──────────

router.get('/lots', async (req, res) => {
  try {
    const { status } = req.query;
    const { rows } = await db.query(
      `SELECT id, part_no, part_name, lot_no, qty_received, qty_available, status, note, received_at, reviewed_at
       FROM inventory_lots
       ${status ? 'WHERE status = $1' : ''}
       ORDER BY received_at DESC`,
      status ? [status] : []
    );
    res.json({ status: 'success', data: rows });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.post('/receive', async (req, res) => {
  const { part_no, part_name, lot_no, qty } = req.body;
  if (!part_no || !lot_no || !Number(qty) || Number(qty) <= 0) {
    return res.status(400).json({ status: 'error', message: 'part_no, lot_no, qty(>0) required' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO inventory_lots (part_no, part_name, lot_no, qty_received, qty_available, status)
       VALUES ($1,$2,$3,$4,$4,'PENDING')
       RETURNING id, part_no, part_name, lot_no, qty_received, qty_available, status, note, received_at, reviewed_at`,
      [part_no, part_name || '', lot_no, Number(qty)]
    );
    res.status(201).json({ status: 'success', data: rows[0] });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// QA ตรวจรับ → APPROVED / REJECTED (ทั้งล็อต)
router.post('/lots/:id/review', async (req, res) => {
  const { status, note } = req.body;
  if (!['APPROVED', 'REJECTED'].includes(status)) {
    return res.status(400).json({ status: 'error', message: 'status(APPROVED|REJECTED) required' });
  }
  try {
    // REJECTED → ของใช้ไม่ได้ → qty_available = 0
    const { rows } = await db.query(
      `UPDATE inventory_lots
       SET status = $1::text,
           note = COALESCE($2, note),
           qty_available = CASE WHEN $1::text = 'REJECTED' THEN 0 ELSE qty_available END,
           reviewed_at = NOW()
       WHERE id = $3 AND status = 'PENDING'
       RETURNING id, part_no, part_name, lot_no, qty_received, qty_available, status, note, received_at, reviewed_at`,
      [status, note ?? null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ status: 'error', message: 'ไม่พบล็อต PENDING นี้ (อาจถูกตรวจไปแล้ว)' });
    res.json({ status: 'success', data: rows[0] });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.delete('/lots/:id', async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM inventory_lots WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ status: 'error', message: 'ไม่พบล็อตนี้' });
    res.json({ status: 'success' });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// ── Kitting: เบิกวัตถุดิบออกไปผลิต (ตัด stock จากล็อตที่ APPROVED แบบ FIFO) ──

router.get('/issues', async (req, res) => {
  try {
    const { wo_id } = req.query;
    const { rows } = await db.query(
      `SELECT id, wo_id, part_no, qty, lot_no, issued_at
       FROM kitting_issues
       ${wo_id ? 'WHERE wo_id = $1' : ''}
       ORDER BY issued_at DESC`,
      wo_id ? [wo_id] : []
    );
    res.json({ status: 'success', data: rows });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// ยอดคงเหลือพร้อมเบิก (รวมต่อ part จากล็อต APPROVED)
router.get('/stock', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT part_no, MAX(part_name) AS part_name, SUM(qty_available)::int AS qty_available
       FROM inventory_lots
       WHERE status = 'APPROVED'
       GROUP BY part_no
       HAVING SUM(qty_available) > 0
       ORDER BY part_no`
    );
    res.json({ status: 'success', data: rows });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.post('/issue', async (req, res) => {
  const { wo_id, part_no, qty } = req.body;
  const need = Number(qty);
  if (!wo_id || !part_no || !need || need <= 0) {
    return res.status(400).json({ status: 'error', message: 'wo_id, part_no, qty(>0) required' });
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    // ดึงล็อต APPROVED ที่ยังมีของ เรียง FIFO (เก่าก่อน) + lock
    const { rows: lots } = await client.query(
      `SELECT id, lot_no, qty_available FROM inventory_lots
       WHERE part_no = $1 AND status = 'APPROVED' AND qty_available > 0
       ORDER BY received_at ASC
       FOR UPDATE`,
      [part_no]
    );
    const totalAvail = lots.reduce((s, l) => s + l.qty_available, 0);
    if (totalAvail < need) {
      await client.query('ROLLBACK');
      return res.status(409).json({ status: 'error', message: `stock ไม่พอ: ต้องการ ${need} มีพร้อมเบิก ${totalAvail}` });
    }
    let remaining = need;
    const issued = [];
    for (const lot of lots) {
      if (remaining <= 0) break;
      const take = Math.min(lot.qty_available, remaining);
      await client.query('UPDATE inventory_lots SET qty_available = qty_available - $1 WHERE id = $2', [take, lot.id]);
      const { rows: ins } = await client.query(
        `INSERT INTO kitting_issues (wo_id, part_no, qty, lot_no)
         VALUES ($1,$2,$3,$4)
         RETURNING id, wo_id, part_no, qty, lot_no, issued_at`,
        [wo_id, part_no, take, lot.lot_no]
      );
      issued.push(ins[0]);
      remaining -= take;
    }
    await client.query('COMMIT');
    res.status(201).json({ status: 'success', data: issued });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ status: 'error', message: e.message });
  } finally {
    client.release();
  }
});

module.exports = router;
