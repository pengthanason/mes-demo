const router = require('express').Router();
const db     = require('../db');

/* ── Presets (ลำดับกระบวนการที่บันทึกไว้) ── */
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, name, customer, model, steps, created_at FROM workflows ORDER BY created_at DESC'
    );
    res.json({ status: 'success', data: rows });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.post('/', async (req, res) => {
  const { name, customer, model, steps } = req.body;
  if (!Array.isArray(steps) || steps.length === 0) {
    return res.status(400).json({ status: 'error', message: 'ต้องมีขั้นตอน (steps) อย่างน้อย 1' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO workflows (name, customer, model, steps) VALUES ($1,$2,$3,$4)
       RETURNING id, name, customer, model, steps, created_at`,
      [name || '', customer || '', model || '', JSON.stringify(steps)]
    );
    res.status(201).json({ status: 'success', data: rows[0] });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM workflows WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ status: 'error', message: 'not found' });
    res.json({ status: 'success' });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

/* ── Results (บันทึกผลเดินสายผลิต: Serial + PASS/FAIL + cycle time) ── */
router.get('/results', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, serial, customer, model, sequence, result, total_sec, line, created_at FROM workflow_results ORDER BY created_at DESC'
    );
    res.json({ status: 'success', data: rows });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.post('/results', async (req, res) => {
  const { serial, customer, model, sequence, result, total_sec, line, steps } = req.body;
  if (!serial || !String(serial).trim()) {
    return res.status(400).json({ status: 'error', message: 'ต้องมี Serial Number' });
  }
  const r = (result === 'FAIL') ? 'FAIL' : 'PASS';
  const ln = (line === 'external') ? 'external' : 'internal';
  const sn = String(serial).trim();
  try {
    const { rows } = await db.query(
      `INSERT INTO workflow_results (serial, customer, model, sequence, result, total_sec, line)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, serial, customer, model, sequence, result, total_sec, line, created_at`,
      [sn, customer || '', model || '', sequence || '', r, Number(total_sec) || 0, ln]
    );
    // ป้อนข้อมูลเข้า traceability: เขียน production_scans 1 แถวต่อ 1 กระบวนการ (ค้น serial ใน Traceability เจอ + กราฟรายวันมีข้อมูล)
    if (Array.isArray(steps) && steps.length) {
      const woTag = (model || customer || 'WORKFLOW');
      for (let i = 0; i < steps.length; i++) {
        const sObj = steps[i];
        const st = typeof sObj === 'string' ? sObj : (sObj && sObj.process) || '';
        if (!st) continue;
        // ผลรายขั้น: ถ้าส่งมาเป็น object ที่มี result ใช้ค่านั้น (เฟลเฉพาะขั้นที่เลือก) ไม่งั้นใช้ผลรวม
        const stepResult = (sObj && typeof sObj === 'object' && (sObj.result === 'FAIL' || sObj.result === 'PASS')) ? sObj.result : r;
        await db.query(
          `INSERT INTO production_scans (wo_id, serial, station, result, operator, note, scanned_at)
           VALUES ($1,$2,$3,$4,$5,$6, NOW() + make_interval(secs => $7))`,
          [woTag, sn, String(st), stepResult, '', stepResult === 'FAIL' ? 'จาก Workflow (FAIL)' : 'จาก Workflow', i]
        );
      }
    }
    res.status(201).json({ status: 'success', data: rows[0] });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.delete('/results/:id', async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM workflow_results WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ status: 'error', message: 'not found' });
    res.json({ status: 'success' });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

module.exports = router;
