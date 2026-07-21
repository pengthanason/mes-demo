const router = require('express').Router();
const db     = require('../db');

const COLS = `id, pp_type, status, status_color, wk, date_record, product_pn, model, customer, qty, produce, syn_requestor,
  work_order, wo_name, matl_coming, chk_man, chk_mac, chk_med, chk_mat, chk_env,
  pd_pcba, pd_bbas, pd_test, pd_modified, pd_rma, pd_prep, pd_start_date, pd_finish_date, target_per_day,
  qa_test_rate, qa_finish_date, qa_status, store_received, expected_date, revised_date, bom_rec_date, done,
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
  'pd_pic', 'pic_responsible', 'team_member', 'ok_per_day', 'total_ng', 'total_ok', 'special_request', 'remark',
  'pc_prpo', 'pc_wait', 'pc_incoming', 'pc_smt', 'pc_thr', 'pc_test', 'pc_bbas', 'pc_packing', 'process_log',
  'st_pr_po', 'st_wait_mat', 'st_incoming', 'st_create_bo', 'st_test', 'st_rework', 'st_smt', 'st_thr', 'st_bbas',
];
const DATE_FIELDS = ['date_record', 'pd_start_date', 'pd_finish_date', 'qa_finish_date', 'store_received', 'expected_date', 'revised_date', 'bom_rec_date'];

// ── ป้ายชื่อ field (อ่านง่าย) สำหรับ audit diff · field ที่ไม่เอาเข้า diff (ใหญ่/ซ้ำ) อยู่ใน DIFF_SKIP ──
const FIELD_LABELS = {
  pp_type: 'Type', status: 'Status', status_color: 'Status color', product_pn: 'Product P/N', model: 'Model', customer: 'Customer',
  qty: 'Quantity', produce: 'Produced', syn_requestor: 'Owner', work_order: 'WO', date_record: 'Date record', wk: 'WW',
  pd_start_date: 'PD Start', pd_finish_date: 'PD Done', expected_date: 'Expected date', revised_date: 'Revised date',
  bom_rec_date: 'Bom Rec', target_per_day: 'CAP/day', qa_test_rate: 'Sampling%', qa_finish_date: 'QA Finish', qa_status: 'QA Status',
  store_received: 'Store received', pd_pic: 'PIC Name', pic_responsible: 'Responsible', total_ng: 'Total NG', total_ok: 'Total FG',
  special_request: 'Special request', remark: 'Remark',
  pc_prpo: 'PR/PO', pc_wait: "Wait Mat'l", pc_incoming: 'In Coming', pc_smt: 'SMT', pc_thr: 'THR', pc_test: 'TEST', pc_bbas: 'BBAS', pc_packing: 'Packing',
};
const DIFF_SKIP = new Set(['process_log', 'updated_at', 'created_at']);
const norm = (k, v) => {
  if (v === null || v === undefined || v === '') return '—';
  if (DATE_FIELDS.includes(k)) return String(v instanceof Date ? v.toISOString() : v).slice(0, 10);
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  return String(v);
};
// username จาก Bearer token (base64 username:role:ts) — เหมือน activityLog.js
function actorFromReq(req) {
  try {
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
    if (!m) return 'system';
    return Buffer.from(m[1], 'base64').toString('utf8').split(':')[0] || 'system';
  } catch { return 'system'; }
}

function clean(body) {
  const out = {};
  for (const k of WRITABLE) {
    if (!(k in body)) continue;
    let v = body[k];
    if (DATE_FIELDS.includes(k)) v = (v === '' || v == null) ? null : v;
    if (k === 'process_log' && v != null && typeof v !== 'string') v = JSON.stringify(v);   // JSONB ต้อง stringify ก่อน
    out[k] = v;
  }
  return out;
}

// ตรวจความถูกต้องฝั่ง server (กันยิงตรง/inline ที่ข้าม validate() ฝั่ง frontend) — คืน error string ถ้าผิด, null ถ้าผ่าน
const NUM_FIELDS = ['qty', 'produce', 'total_ng', 'total_ok', 'team_member', 'target_per_day'];
const INT4_MAX = 2147483647;   // กันค่าเกิน int4 → 500 overflow
function validateData(data) {
  for (const k of NUM_FIELDS) {
    if (data[k] == null || data[k] === '') continue;
    const n = Number(data[k]);
    if (!Number.isFinite(n)) return `${k} must be a number`;
    if (n < 0) return `${k} cannot be negative`;
    if (n > INT4_MAX) return `${k} is too large`;
  }
  if (data.produce != null && data.qty != null && data.produce !== '' && data.qty !== '' && Number(data.produce) > Number(data.qty)) {
    return 'produce cannot exceed qty';
  }
  // ลำดับวันที่: start ≤ finish/expected, finish ≤ expected (เช็กเมื่อมีค่าครบคู่)
  const d = (k) => (data[k] ? new Date(data[k]) : null);
  const [s, f, e] = [d('pd_start_date'), d('pd_finish_date'), d('expected_date')];
  if (s && f && f < s) return 'PD Done cannot be before PD Start';
  if (s && e && e < s) return 'Expected date cannot be before PD Start';
  if (f && e && e < f) return 'Expected date cannot be before PD Done';
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
  const keys = Object.keys(data);
  if (!keys.length) return res.status(400).json({ status: 'error', message: 'no data' });
  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const vals = keys.map(k => data[k]);
  vals.push(req.params.id);
  try {
    // ดึงค่าเก่าไว้เทียบก่อนอัปเดต (สำหรับ audit diff)
    const before = (await db.query(`SELECT ${COLS} FROM pp_projects WHERE id = $1`, [req.params.id])).rows[0] || null;
    // optimistic lock: ถ้า client ส่ง updated_at มาแล้วไม่ตรงกับใน DB = มีคนแก้ไปก่อน → 409 (กัน stale write ทับกัน)
    if (before && req.body && req.body.updated_at && before.updated_at) {
      const a = new Date(req.body.updated_at).getTime(), b = new Date(before.updated_at).getTime();
      if (!isNaN(a) && !isNaN(b) && a !== b) {
        return res.status(409).json({ status: 'error', message: 'This record was changed by someone else — please reload and try again' });
      }
    }
    // ตรวจความถูกต้องกับค่าที่รวมแล้ว (before + data) เผื่อ update บางส่วน จะได้เช็ก cross-field ครบ
    const verr = validateData({ ...before, ...data });
    if (verr) return res.status(400).json({ status: 'error', message: verr });
    const { rows, rowCount } = await db.query(
      `UPDATE pp_projects SET ${sets}, updated_at = NOW() WHERE id = $${vals.length} RETURNING ${COLS}`,
      vals
    );
    if (!rowCount) return res.status(404).json({ status: 'error', message: 'not found' });
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
    console.error(e); res.status(500).json({ status: 'error', message: 'Server error, please try again' });
  }
});

// GET /api/pp/projects/:id/history — ประวัติการแก้ไข record นั้น (join app_users เอาชื่อ+ตำแหน่ง)
router.get('/projects/:id/history', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT a.id, a.actor, a.action, a.detail, a.note, a.created_at,
              u.full_name AS actor_name, u.role AS actor_role
         FROM audit_logs a
         LEFT JOIN app_users u ON u.username = a.actor
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

module.exports = router;
