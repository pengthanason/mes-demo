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
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
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
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

// POST /api/cr (เปิด CR ใหม่)
router.post('/', async (req, res) => {
  const { m_type, wo_ref, description, impact } = req.body;
  if (!['Man', 'Machine', 'Material', 'Method', 'Measurement', 'Environment'].includes(m_type)) {
    return res.status(400).json({ status: 'error', message: 'm_type must be one of 5M+1E: Man|Machine|Material|Method|Measurement|Environment' });
  }
  if (!String(description || '').trim()) {
    return res.status(400).json({ status: 'error', message: 'description required' });
  }
  try {
    const yymm = new Date().toISOString().slice(0, 7).replace('-', '');
    // running number จาก MAX(suffix)+1 (ไม่ใช่ COUNT — กันเลขวนซ้ำหลังลบ) + retry เมื่อชน UNIQUE (กัน race เปิดพร้อมกัน)
    let inserted = null;
    for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
      const { rows: seqRows } = await db.query(
        `SELECT COALESCE(MAX(CAST(split_part(cr_no,'-',3) AS INT)),0)+1 AS next
           FROM change_requests WHERE cr_no LIKE 'CR-' || $1 || '-%'`,
        [yymm]
      );
      const crNo = `CR-${yymm}-${String(seqRows[0].next).padStart(3, '0')}`;
      try {
        const { rows } = await db.query(
          `INSERT INTO change_requests (cr_no, m_type, wo_ref, description, impact)
           VALUES ($1,$2,$3,$4,$5) RETURNING ${FIELDS}`,
          [crNo, m_type, wo_ref || '', description, impact || '']
        );
        inserted = rows[0];
      } catch (err) {
        if (err && err.code === '23505') continue;   // UNIQUE ชน (มีคนแทรกเลขเดียวกันก่อน) → คำนวณใหม่
        throw err;
      }
    }
    if (!inserted) return res.status(409).json({ status: 'error', message: 'Could not allocate CR number, please retry' });
    res.status(201).json({ status: 'success', data: inserted });
  } catch (e) {
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
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
        message: `Cannot approve — CR must be in state ${gate.from} first (gates must pass in order)`,
      });
    }
    res.json({ status: 'success', data: rows[0] });
  } catch (e) {
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

module.exports = router;
