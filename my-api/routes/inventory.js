const router = require('express').Router();
const db     = require('../db');
const wms    = require('../wmsClient');

// ── Stock vs Odoo (drift) — ของจริงจาก WMS ไม่ใช่ mock ────────────────────────
// 2026-08-04 (หัวหน้าสั่ง "ต้องดึงจาก WMS หรือ Odoo"): เดิมหน้า /drift โชว์ mock 12 แถว
// อยู่ในไฟล์ frontend — ตัวเลขปลอมที่ดูเหมือนจริง (อันตรายกว่าไม่มีข้อมูล)
//
// ทำไมไม่คิด drift เองที่นี่: WMS มี logic กัน false-drift สะสมมาหลายรอบ
// (canonical location matching · mirror lag · live vs snapshot) การไปคิดใหม่ = ตัวเลขคนละชุด
// กับที่ WMS ใช้ตัดสินใจ และเสี่ยงโชว์ drift ปลอมซ้ำรอยเดิม → เราเป็นแค่ผู้บริโภครายงาน
//
// contract ที่หน้าเว็บรอ (lib/driftApi.ts): { item_code, item_name, location, our_qty, odoo_qty, diff }
// our_qty = WMS (คลังของเรา) · odoo_qty = Odoo · diff = our - odoo
// cache สั้นๆ ในหน่วยความจำ: live read คุย Odoo จริง วัดได้ ~12 วิ · เปิดหน้าซ้ำ/หลายคน
// ไม่ควรยิง Odoo ซ้ำทุกครั้ง (Odoo มีอาการ refuse เป็นคลื่นอยู่แล้ว) · TTL สั้นพอที่เลขไม่เก่าเกิน
// และ meta.fetched_at บอกเวลาที่ดึงมาจริง เพื่อไม่ให้เข้าใจผิดว่าเป็นเลข ณ วินาทีนี้
const DRIFT_CACHE_TTL_MS = 120000;
const _driftCache = new Map();   // key = `${live}:${limit}` → { at, payload }

router.get('/drift', async (req, res) => {
  const live = String(req.query.live ?? 'true') !== 'false';
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
  const cacheKey = `${live}:${limit}`;
  const hit = _driftCache.get(cacheKey);
  if (hit && Date.now() - hit.at < DRIFT_CACHE_TTL_MS) {
    return res.json({ ...hit.payload, meta: { ...hit.payload.meta, cached: true, fetched_at: new Date(hit.at).toISOString() } });
  }
  const r = await wms.getQtyDrift({ live, limit });

  if (!r.ok) {
    // ⚠️ ห้าม fallback เป็นข้อมูลปลอม/ว่างเปล่าเงียบๆ — บอกให้ชัดว่าอ่านไม่ได้เพราะอะไร
    // 404 = endpoint ฝั่ง WMS ยังไม่ได้ deploy · 403 = service account สิทธิ์ไม่พอ
    const hint = r.status === 404
      ? 'endpoint รายงาน drift ฝั่ง WMS ยังไม่ได้ deploy'
      : r.status === 403
        ? 'บัญชี service ของ MES ยังไม่มีสิทธิ์อ่านรายงาน WMS'
        : r.error;
    return res.status(503).json({ status: 'error', message: `อ่านข้อมูลเทียบสต็อกจาก WMS ไม่ได้ — ${hint}`, source: 'wms', wms_status: r.status || null });
  }

  const d = r.data || {};
  // ใช้ระดับ "item + location" เป็นหลักตาม contract (location เป็นคอลัมน์ในตาราง)
  // ถ้า WMS ไม่มี breakdown รายสถานที่ ให้ถอยไประดับ item แล้วบอกตรงๆ ว่า location = '(all)'
  const locRows = Array.isArray(d.location_drift_items) ? d.location_drift_items : [];
  const itemRows = Array.isArray(d.drift_items) ? d.drift_items : [];
  const src = locRows.length ? locRows : itemRows;
  const rows = src.map((x) => ({
    item_code: String(x.sku ?? x.item_id ?? ''),
    item_name: String(x.item_name ?? x.sku ?? ''),        // WMS ไม่ส่งชื่อสินค้ามาในรายงานนี้ → โชว์รหัสไปก่อน
    location: String(x.location ?? '(all)'),
    our_qty: Number(x.wms_qty ?? 0),
    odoo_qty: Number(x.odoo_qty ?? 0),
    diff: Number(x.diff ?? 0),
  }));

  const payload = {
    status: 'success',
    data: rows,
    // meta ต้องส่งไปให้หน้าเว็บโชว์ได้ว่าเลขนี้ "สด" หรือ "snapshot" — ห้ามให้เข้าใจผิดว่าสดทั้งที่ค้าง
    meta: {
      source: d.source || null,                    // 'live' | 'snapshot'
      live_unavailable: d.live_unavailable || null, // มีค่า = ขอสดแต่ Odoo ล่ม จึงถอยไป snapshot
      snapshot_date: d.snapshot_date || null,
      items_compared: d.items_compared ?? null,
      drift_count: d.drift_count ?? null,
      level: locRows.length ? 'item+location' : 'item',
      truncated: Boolean(locRows.length ? d.location_truncated : d.truncated),
      cached: false,
      fetched_at: new Date().toISOString(),
    },
  };
  _driftCache.set(cacheKey, { at: Date.now(), payload });
  res.json(payload);
});

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
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
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
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
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
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

router.delete('/lots/:id', async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM inventory_lots WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ status: 'error', message: 'ไม่พบล็อตนี้' });
    res.json({ status: 'success' });
  } catch (e) {
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
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
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
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
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

router.post('/issue', async (req, res) => {
  const { wo_id, part_no, qty } = req.body;
  const need = Number(qty);
  // ต้องเป็นจำนวนเต็ม > 0 และไม่เกิน int4 — qty_available เป็น INTEGER ถ้าส่ง 2.5 มาจะ 500 กลาง transaction
  if (!wo_id || !part_no || !Number.isInteger(need) || need <= 0 || need > 2147483647) {
    return res.status(400).json({ status: 'error', message: 'wo_id, part_no, qty (จำนวนเต็ม > 0) required' });
  }
  let client;
  try {
    client = await db.connect();
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
    // ROLLBACK ต้องห่อ try เอง — ถ้า connection หลุด มันจะ throw ซ้ำแล้วหลุดออกนอก catch (request ค้าง ไม่มี response)
    if (client) { try { await client.query('ROLLBACK'); } catch (e2) { console.error('[rollback failed]', e2?.message); } }
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
