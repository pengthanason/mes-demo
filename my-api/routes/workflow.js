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
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
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
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM workflows WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ status: 'error', message: 'not found' });
    res.json({ status: 'success' });
  } catch (e) {
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
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
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

router.post('/results', async (req, res) => {
  const { serial, customer, model, sequence, result, total_sec, line, steps } = req.body;
  if (!serial || !String(serial).trim()) {
    return res.status(400).json({ status: 'error', message: 'ต้องมี Serial Number' });
  }
  const r = (result === 'FAIL') ? 'FAIL' : 'PASS';
  const ln = (line === 'external' || line === 'mix') ? line : 'internal';
  const sn = String(serial).trim();
  // จำกัดจำนวน step — body รับได้ถึง 8mb ถ้ายัดมาเป็นแสน step จะ INSERT ทีละตัวเป็นนาที ถือ connection ค้างทั้ง pool
  if (Array.isArray(steps) && steps.length > 200) {
    return res.status(400).json({ status: 'error', message: 'steps มากเกินไป (จำกัด 200 ขั้นตอน)' });
  }
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
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

router.delete('/results/:id', async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM workflow_results WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ status: 'error', message: 'not found' });
    res.json({ status: 'success' });
  } catch (e) {
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

module.exports = router;
