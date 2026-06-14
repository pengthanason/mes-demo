const router = require('express').Router();
const db     = require('../db');

const FIELDS = `id, cr_no, m_type, wo_ref, description, impact, state,
  g1_note, g1_at, g2_note, g2_at, g3_note, g3_at, created_at, updated_at`;

// gate → state ที่ต้องเป็นอยู่ก่อนกด และ state ใหม่หลังอนุมัติ
const GATES = {
  g1: { from: 'DRAFT',       to: 'G1_REVIEW',   noteCol: 'g1_note', atCol: 'g1_at' },
  g2: { from: 'G1_REVIEW',   to: 'G2_APPROVED', noteCol: 'g2_note', atCol: 'g2_at' },
  g3: { from: 'G2_APPROVED', to: 'ACTIVE',      noteCol: 'g3_note', atCol: 'g3_at' },
};

// GET /api/cr/list
router.get('/list', async (req, res) => {
  try {
    const { state, m_type } = req.query;
    const conds = [], params = [];
    if (state)  { params.push(state);  conds.push(`state=$${params.length}`); }
    if (m_type) { params.push(m_type); conds.push(`m_type=$${params.length}`); }
    const where = conds.length ? ` WHERE ${conds.join(' AND ')}` : '';
    const { rows } = await db.query(
      `SELECT ${FIELDS} FROM change_requests${where} ORDER BY created_at DESC`, params
    );
    res.json({ status: 'success', data: rows });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// GET /api/cr/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT ${FIELDS} FROM change_requests WHERE id=$1`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ status: 'error', message: 'CR not found' });
    res.json({ status: 'success', data: rows[0] });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// POST /api/cr (เปิด CR ใหม่)
router.post('/', async (req, res) => {
  const { m_type, wo_ref, description, impact } = req.body;
  if (!['Man', 'Machine', 'Material', 'Method'].includes(m_type)) {
    return res.status(400).json({ status: 'error', message: 'm_type must be Man|Machine|Material|Method' });
  }
  if (!String(description || '').trim()) {
    return res.status(400).json({ status: 'error', message: 'description required' });
  }
  try {
    const yymm = new Date().toISOString().slice(0, 7).replace('-', '');
    const { rows: seqRows } = await db.query(
      `SELECT COUNT(*)+1 AS next FROM change_requests WHERE cr_no LIKE 'CR-' || $1 || '-%'`,
      [yymm]
    );
    const crNo = `CR-${yymm}-${String(seqRows[0].next).padStart(3, '0')}`;
    const { rows } = await db.query(
      `INSERT INTO change_requests (cr_no, m_type, wo_ref, description, impact)
       VALUES ($1,$2,$3,$4,$5) RETURNING ${FIELDS}`,
      [crNo, m_type, wo_ref || '', description, impact || '']
    );
    res.status(201).json({ status: 'success', data: rows[0] });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// PUT /api/cr/:id/gate-:gate (อนุมัติ gate — บังคับลำดับ)
router.put('/:id/gate-:gate', async (req, res) => {
  const gate = GATES[req.params.gate];
  if (!gate) return res.status(400).json({ status: 'error', message: 'gate must be g1|g2|g3' });
  const note = String(req.body?.note || '').trim();

  try {
    const { rows } = await db.query(
      `UPDATE change_requests
       SET state=$1, ${gate.noteCol}=$2, ${gate.atCol}=NOW(), updated_at=NOW()
       WHERE id=$3 AND state=$4
       RETURNING ${FIELDS}`,
      [gate.to, note || null, req.params.id, gate.from]
    );
    if (!rows.length) {
      return res.status(409).json({
        status: 'error',
        message: `อนุมัติไม่ได้ — CR ต้องอยู่ state ${gate.from} ก่อน (gate ต้องผ่านตามลำดับ)`,
      });
    }
    res.json({ status: 'success', data: rows[0] });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

module.exports = router;
