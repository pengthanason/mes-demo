const router = require('express').Router();
const db     = require('../db');

const COLS = `id, pp_type, status, status_color, wk, date_record, product_pn, model, customer, qty, produce, syn_requestor,
  work_order, wo_name, matl_coming, chk_man, chk_mac, chk_med, chk_mat, chk_env,
  pd_pcba, pd_bbas, pd_test, pd_modified, pd_rma, pd_prep, pd_start_date, pd_finish_date, target_per_day,
  qa_test_rate, qa_finish_date, qa_status, store_received, expected_date, revised_date, bom_rec_date, done,
  delivery_date, delivery_remark,
  pd_pic, pic_responsible, team_member, ok_per_day, total_ng, total_ok, special_request, remark,
  pc_prpo, pc_wait, pc_incoming, pc_smt, pc_thr, pc_test, pc_bbas, pc_packing, process_log,
  st_pr_po, st_wait_mat, st_incoming, st_create_bo, st_test, st_rework, st_smt, st_thr, st_bbas,
  created_at, updated_at`;

// field ที่ยอมให้เขียน (กันยิงมั่ว)
const WRITABLE = [
  'pp_type', 'status', 'status_color', 'wk', 'date_record', 'product_pn', 'model', 'customer', 'qty', 'produce', 'syn_requestor',
  'work_order', 'wo_name', 'matl_coming', 'chk_man', 'chk_mac', 'chk_med', 'chk_mat', 'chk_env',
  'pd_pcba', 'pd_bbas', 'pd_test', 'pd_modified', 'pd_rma', 'pd_prep', 'pd_start_date', 'pd_finish_date', 'target_per_day',
  'qa_test_rate', 'qa_finish_date', 'qa_status', 'store_received', 'expected_date', 'revised_date', 'bom_rec_date', 'done',
  'delivery_date', 'delivery_remark',
  'pd_pic', 'pic_responsible', 'team_member', 'ok_per_day', 'total_ng', 'total_ok', 'special_request', 'remark',
  'pc_prpo', 'pc_wait', 'pc_incoming', 'pc_smt', 'pc_thr', 'pc_test', 'pc_bbas', 'pc_packing', 'process_log',
  'st_pr_po', 'st_wait_mat', 'st_incoming', 'st_create_bo', 'st_test', 'st_rework', 'st_smt', 'st_thr', 'st_bbas',
];
const DATE_FIELDS = ['date_record', 'pd_start_date', 'pd_finish_date', 'qa_finish_date', 'store_received', 'expected_date', 'revised_date', 'bom_rec_date', 'delivery_date'];

// ── ป้ายชื่อ field (อ่านง่าย) สำหรับ audit diff · field ที่ไม่เอาเข้า diff (ใหญ่/ซ้ำ) อยู่ใน DIFF_SKIP ──
const FIELD_LABELS = {
  pp_type: 'Type', status: 'Status', status_color: 'Status color', product_pn: 'Product P/N', model: 'Model', customer: 'Customer',
  qty: 'Quantity', produce: 'Produced', syn_requestor: 'Owner', work_order: 'WO', date_record: 'Date record', wk: 'WW',
  pd_start_date: 'PD Start', pd_finish_date: 'PD Done', expected_date: 'Expected date', revised_date: 'Revised date',
  bom_rec_date: 'Bom Rec', target_per_day: 'CAP/day', qa_test_rate: 'Sampling%', qa_finish_date: 'QA Finish', qa_status: 'QA Status',
  store_received: 'Store received', pd_pic: 'PIC Name', pic_responsible: 'Responsible', total_ng: 'Total NG', total_ok: 'Total FG',
  special_request: 'Special request', remark: 'Remark', delivery_date: 'Delivery date', delivery_remark: 'Delivery remark',
  pc_prpo: 'PR/PO', pc_wait: "Wait Mat'l", pc_incoming: 'In Coming', pc_smt: 'SMT', pc_thr: 'THR', pc_test: 'TEST', pc_bbas: 'BBAS', pc_packing: 'Packing',
};
const DIFF_SKIP = new Set(['process_log', 'updated_at', 'created_at']);
const norm = (k, v) => {
  if (v === null || v === undefined || v === '') return '—';
  if (DATE_FIELDS.includes(k)) return String(v instanceof Date ? v.toISOString() : v).slice(0, 10);
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  return String(v);
};
// username จาก req.user ที่ authz.js ตั้งไว้ (verify JWT + อ่านจาก DB แล้ว) — ปลอมไม่ได้
function actorFromReq(req) {
  return (req.user && req.user.username) || 'system';
}

function clean(body) {
  const out = {};
  for (const k of WRITABLE) {
    if (!(k in body)) continue;
    let v = body[k];
    if (DATE_FIELDS.includes(k)) v = (v === '' || v == null) ? null : v;
    // process_log ต้องเป็น array เท่านั้น — ของเดิมสมมติว่า "string = JSON อยู่แล้ว" ซึ่งไม่จริง:
    //   "ยังไม่เริ่ม" → ส่งดิบเข้า JSONB → 500 · 5 → stringify ได้ '5' (valid JSON) → เก็บเป็น scalar → หน้า Gantt crash
    if (k === 'process_log' && v != null) {
      let arr = v;
      if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch { arr = undefined; } }
      if (!Array.isArray(arr)) { out.__bad_process_log = true; continue; }
      v = JSON.stringify(arr);
    }
    out[k] = v;
  }
  return out;
}

// ตรวจความถูกต้องฝั่ง server (กันยิงตรง/inline ที่ข้าม validate() ฝั่ง frontend) — คืน error string ถ้าผิด, null ถ้าผ่าน
// คอลัมน์ INTEGER ทั้งหมดของ pp_projects — เดิมตก wk/ok_per_day ทำให้ {"wk":99999999999} → 500 out of range
const NUM_FIELDS = ['qty', 'produce', 'total_ng', 'total_ok', 'team_member', 'target_per_day', 'wk', 'ok_per_day'];
// คอลัมน์ BOOLEAN — ถ้าไม่เช็ก {"done":"maybe"} → invalid input syntax for type boolean → 500
const BOOL_FIELDS = ['chk_man', 'chk_mac', 'chk_med', 'chk_mat', 'chk_env',
  'pd_pcba', 'pd_bbas', 'pd_test', 'pd_modified', 'pd_rma', 'pd_prep', 'done',
  'st_pr_po', 'st_wait_mat', 'st_incoming', 'st_create_bo', 'st_test', 'st_rework', 'st_smt', 'st_thr', 'st_bbas'];
const INT4_MAX = 2147483647;   // กันค่าเกิน int4 → 500 overflow
function validateData(data, changed = data) {   // data = ค่ารวม (before+body) · changed = เฉพาะ field ที่แก้รอบนี้ (body)
  for (const k of NUM_FIELDS) {
    if (data[k] == null || data[k] === '') continue;
    const n = Number(data[k]);
    if (!Number.isFinite(n)) return `${k} must be a number`;
    if (n < 0) return `${k} cannot be negative`;
    if (n > INT4_MAX) return `${k} is too large`;
  }
  for (const k of BOOL_FIELDS) {
    if (k in changed && changed[k] != null && typeof changed[k] !== 'boolean') return `${k} ต้องเป็น true/false`;
  }
  // วันที่: ต้อง parse ได้จริง — ของเดิม '31/02/2026' ได้ Invalid Date แล้วเทียบ < ได้ false ทุกครั้ง → ผ่าน validate → DB reject → 500
  for (const k of DATE_FIELDS) {
    if (k in changed && changed[k] != null && changed[k] !== '' && isNaN(Date.parse(changed[k]))) {
      return `${k} ไม่ใช่วันที่ที่ถูกต้อง (YYYY-MM-DD)`;
    }
  }
  if (data.produce != null && data.qty != null && data.produce !== '' && data.qty !== '' && Number(data.produce) > Number(data.qty)) {
    return 'produce cannot exceed qty';
  }
  // FG/NG ห้ามเกิน Produced และ Qty (เช็คเมื่อมี field ที่เทียบได้ในบอดี้ · inline clamp ฝั่ง client อีกชั้น)
  const num = (k) => (data[k] != null && data[k] !== '' ? Number(data[k]) : null);
  const prod = num('produce'), q = num('qty'), ok = num('total_ok'), ng = num('total_ng');
  if (prod != null && ok != null && ok > prod) return 'Total FG cannot exceed Produced';
  if (prod != null && ng != null && ng > prod) return 'Total NG cannot exceed Produced';
  if (q != null && ok != null && ok > q) return 'Total FG cannot exceed Quantity';
  if (q != null && ng != null && ng > q) return 'Total NG cannot exceed Quantity';
  // ปิดงานได้ต่อเมื่อผลิตครบ — เช็คเฉพาะตอน "กำลังเปลี่ยนเป็น done รอบนี้" (body ส่ง pd_finish/status มา) ไม่บล็อกการแก้แถวที่ done อยู่แล้ว
  const settingDone = (changed.pd_finish_date != null && changed.pd_finish_date !== '') || changed.status === 'DONE';
  if (settingDone && prod != null && q != null && prod < q) {
    return 'Produced must be complete (= Quantity) before marking Done';
  }
  // เช็ควันที่เฉพาะเมื่อรอบนี้แก้ field วันที่ (แก้ตัวเลข/สถานะไม่ควรโดนบล็อกด้วยวันเดิมที่มีอยู่แล้ว)
  const touchesDate = ['pd_start_date', 'pd_finish_date', 'expected_date'].some(k => k in changed);
  if (touchesDate) {
    // ลำดับวันที่: ต้องไม่เสร็จ/คาดว่าเสร็จ ก่อนเริ่มผลิต (PD Done หลัง Expected ได้ = ดีเลย์ ระบบรองรับ)
    const d = (k) => (data[k] ? new Date(data[k]) : null);
    const [s, f, e] = [d('pd_start_date'), d('pd_finish_date'), d('expected_date')];
    if (s && f && f < s) return 'PD Done cannot be before PD Start';
    if (s && e && e < s) return 'Expected date cannot be before PD Start';
  }
  // PD Done ห้ามอนาคต — เฉพาะตอนตั้ง pd_finish รอบนี้ (ไม่บล็อกการแก้แถวที่มี pd_finish เดิมอยู่)
  if (changed.pd_finish_date != null && changed.pd_finish_date !== '') {
    const todayStr = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
    if (String(changed.pd_finish_date).slice(0, 10) > todayStr) return 'PD Done cannot be a future date';
  }
  return null;
}

// GET /api/pp/projects?status=&customer=&product_pn=&model=&date_from=&date_to=
router.get('/projects', async (req, res) => {
  try {
    const { status, customer, product_pn, work_order, model, date_from, date_to } = req.query;
    const conds = [];
    const vals  = [];
    if (status)     { vals.push(status);            conds.push(`status = $${vals.length}`); }
    if (customer)   { vals.push(`%${customer}%`);   conds.push(`customer ILIKE $${vals.length}`); }
    if (product_pn) { vals.push(`%${product_pn}%`); conds.push(`product_pn ILIKE $${vals.length}`); }
    if (work_order) { vals.push(`%${work_order}%`); conds.push(`work_order ILIKE $${vals.length}`); }
    if (model)      { vals.push(`%${model}%`);      conds.push(`model ILIKE $${vals.length}`); }
    if (date_from)  { vals.push(date_from);         conds.push(`date_record >= $${vals.length}`); }
    if (date_to)    { vals.push(date_to);           conds.push(`date_record <= $${vals.length}`); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const { rows } = await db.query(`SELECT ${COLS} FROM pp_projects ${where} ORDER BY date_record DESC NULLS LAST, id DESC`, vals);
    res.json({ status: 'success', data: rows });
  } catch (e) {
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

router.post('/projects', async (req, res) => {
  const data = clean(req.body);
  if (data.__bad_process_log) return res.status(400).json({ status: 'error', message: 'process_log ต้องเป็น array' });
  if (!data.product_pn && !data.model) {
    return res.status(400).json({ status: 'error', message: 'ต้องมี Product P/N หรือ Model อย่างน้อย 1' });
  }
  const verr = validateData(data);
  if (verr) return res.status(400).json({ status: 'error', message: verr });
  const keys = Object.keys(data);
  if (!keys.length) return res.status(400).json({ status: 'error', message: 'no data' });
  const cols = keys.join(', ');
  const ph   = keys.map((_, i) => `$${i + 1}`).join(', ');
  try {
    const { rows } = await db.query(
      `INSERT INTO pp_projects (${cols}) VALUES (${ph}) RETURNING ${COLS}`,
      keys.map(k => data[k])
    );
    res.status(201).json({ status: 'success', data: rows[0] });
  } catch (e) {
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

router.put('/projects/:id', async (req, res) => {
  const data = clean(req.body);
  if (data.__bad_process_log) return res.status(400).json({ status: 'error', message: 'process_log ต้องเป็น array' });
  const keys = Object.keys(data);
  if (!keys.length) return res.status(400).json({ status: 'error', message: 'no data' });
  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const vals = keys.map(k => data[k]);
  vals.push(req.params.id);
  // ทำใน transaction + SELECT ... FOR UPDATE ล็อกแถวก่อน validate
  // เหตุผล: ของเดิมเป็น read → validate → write แบบไม่ล็อก (TOCTOU) → A ส่ง {produce:100} กับ B ส่ง {qty:50}
  //         พร้อมกัน ทั้งคู่อ่าน before ชุดเดียวกันจึงผ่าน validate ทั้งคู่ → ได้ qty=50 produce=100
  //         ซึ่งละเมิดกฎ 'produce cannot exceed qty' ที่ validateData มีไว้กันเรื่องนี้พอดี โดยไม่มี error ให้เห็น
  let client;
  try {
    client = await db.connect();
    await client.query('BEGIN');
    const before = (await client.query(`SELECT ${COLS} FROM pp_projects WHERE id = $1 FOR UPDATE`, [req.params.id])).rows[0] || null;
    if (!before) {
      await client.query('ROLLBACK');
      return res.status(404).json({ status: 'error', message: 'not found' });
    }
    // optimistic lock: ถ้า client ส่ง updated_at มาแล้วไม่ตรงกับใน DB = มีคนแก้ไปก่อน → 409 (กัน stale write ทับกัน)
    if (req.body && req.body.updated_at && before.updated_at) {
      const a = new Date(req.body.updated_at).getTime(), b = new Date(before.updated_at).getTime();
      if (!isNaN(a) && !isNaN(b) && a !== b) {
        await client.query('ROLLBACK');
        return res.status(409).json({ status: 'error', message: 'This record was changed by someone else — please reload and try again' });
      }
    }
    // ตรวจความถูกต้องกับค่าที่รวมแล้ว (before + data) เผื่อ update บางส่วน จะได้เช็ก cross-field ครบ
    const verr = validateData({ ...before, ...data }, data);
    if (verr) {
      await client.query('ROLLBACK');
      return res.status(400).json({ status: 'error', message: verr });
    }
    const { rows } = await client.query(
      `UPDATE pp_projects SET ${sets}, updated_at = NOW() WHERE id = $${vals.length} RETURNING ${COLS}`,
      vals
    );
    await client.query('COMMIT');
    const after = rows[0];
    // audit: บันทึกเฉพาะ field ที่ค่าเปลี่ยนจริง (จาก → เป็น) + หมายเหตุ (edit_note) ที่ผู้ใช้กรอกตอน Save
    const editNote = (req.body && typeof req.body.edit_note === 'string') ? req.body.edit_note.trim() : '';
    if (before) {
      const changes = [];
      for (const k of keys) {
        if (DIFF_SKIP.has(k)) continue;
        const oldV = norm(k, before[k]);
        const newV = norm(k, after[k]);
        if (oldV !== newV) changes.push(`${FIELD_LABELS[k] || k}: ${oldV} → ${newV}`);
      }
      if (changes.length || editNote) {
        const name = after.product_pn || after.model || `#${after.id}`;
        const detail = `${name}${changes.length ? ` — ${changes.join(', ')}` : ''}`;
        db.query(
          `INSERT INTO audit_logs (actor, action, target_type, target_id, detail, note) VALUES ($1,'UPDATE_PP','pp',$2,$3,$4)`,
          [actorFromReq(req), String(after.id), detail, editNote || null]
        ).catch(() => {});
      }
    }
    res.json({ status: 'success', data: after });
  } catch (e) {
    if (client) { try { await client.query('ROLLBACK'); } catch (e2) { console.error('[rollback failed]', e2?.message); } }
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  } finally {
    if (client) client.release();
  }
});

// GET /api/pp/projects/:id/history — ประวัติการแก้ไข record นั้น (join users เอาชื่อ+ตำแหน่ง)
router.get('/projects/:id/history', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT a.id, a.actor, a.action, a.detail, a.note, a.created_at,
              u.full_name AS actor_name, u.role AS actor_role
         FROM audit_logs a
         LEFT JOIN users u ON u.username = a.actor
        WHERE a.target_type = 'pp' AND a.target_id = $1
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT 200`,
      [String(req.params.id)]
    );
    res.json({ status: 'success', data: rows });
  } catch (e) {
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

router.delete('/projects/:id', async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM pp_projects WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ status: 'error', message: 'not found' });
    res.json({ status: 'success' });
  } catch (e) {
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

// ── รูปสินค้า — แยก endpoint (ไม่รวมใน /projects list กัน payload ใหญ่/dashboard อืด) ──
router.get('/projects/:id/image', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT product_image FROM pp_projects WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ status: 'error', message: 'not found' });
    res.json({ status: 'success', data: { image: rows[0].product_image || null } });
  } catch (e) {
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

router.put('/projects/:id/image', async (req, res) => {
  try {
    let img = req.body?.image;
    if (img != null) {
      if (typeof img !== 'string' || !/^data:image\/(png|jpe?g|webp|gif);base64,/.test(img)) {
        return res.status(400).json({ status: 'error', message: 'Invalid image' });
      }
      if (img.length > 8 * 1024 * 1024) return res.status(413).json({ status: 'error', message: 'Image too large' });
    } else {
      img = null;   // ลบรูป
    }
    const { rowCount } = await db.query('UPDATE pp_projects SET product_image = $1, updated_at = NOW() WHERE id = $2', [img, req.params.id]);
    if (!rowCount) return res.status(404).json({ status: 'error', message: 'not found' });
    res.json({ status: 'success' });
  } catch (e) {
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

module.exports = router;
