const router = require('express').Router();
const db     = require('../db');

const COLS = `id, status, wk, date_record, product_pn, model, customer, qty, syn_requestor, pm,
  work_order, matl_coming, chk_man, chk_mac, chk_med, chk_mat,
  pd_pcba, pd_bbas, pd_test, pd_rma, pd_prep, pd_start_date, pd_finish_date,
  qa_test_rate, qa_finish_date, store_received, expected_date, revised_date, done,
  pd_pic, team_member, ok_per_day, total_ng, total_ok, remark, created_at, updated_at`;

// field ที่ยอมให้เขียน (กันยิงมั่ว)
const WRITABLE = [
  'status', 'wk', 'date_record', 'product_pn', 'model', 'customer', 'qty', 'syn_requestor', 'pm',
  'work_order', 'matl_coming', 'chk_man', 'chk_mac', 'chk_med', 'chk_mat',
  'pd_pcba', 'pd_bbas', 'pd_test', 'pd_rma', 'pd_prep', 'pd_start_date', 'pd_finish_date',
  'qa_test_rate', 'qa_finish_date', 'store_received', 'expected_date', 'revised_date', 'done',
  'pd_pic', 'team_member', 'ok_per_day', 'total_ng', 'total_ok', 'remark',
];
const DATE_FIELDS = ['date_record', 'pd_start_date', 'pd_finish_date', 'qa_finish_date', 'store_received', 'expected_date', 'revised_date'];

function clean(body) {
  const out = {};
  for (const k of WRITABLE) {
    if (!(k in body)) continue;
    let v = body[k];
    if (DATE_FIELDS.includes(k)) v = (v === '' || v == null) ? null : v;
    out[k] = v;
  }
  return out;
}

// GET /api/pp/projects?status=&customer=&product_pn=&model=&date_from=&date_to=
router.get('/projects', async (req, res) => {
  try {
    const { status, customer, product_pn, model, date_from, date_to } = req.query;
    const conds = [];
    const vals  = [];
    if (status)     { vals.push(status);            conds.push(`status = $${vals.length}`); }
    if (customer)   { vals.push(`%${customer}%`);   conds.push(`customer ILIKE $${vals.length}`); }
    if (product_pn) { vals.push(`%${product_pn}%`); conds.push(`product_pn ILIKE $${vals.length}`); }
    if (model)      { vals.push(`%${model}%`);      conds.push(`model ILIKE $${vals.length}`); }
    if (date_from)  { vals.push(date_from);         conds.push(`date_record >= $${vals.length}`); }
    if (date_to)    { vals.push(date_to);           conds.push(`date_record <= $${vals.length}`); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const { rows } = await db.query(`SELECT ${COLS} FROM pp_projects ${where} ORDER BY date_record DESC NULLS LAST, id DESC`, vals);
    res.json({ status: 'success', data: rows });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.post('/projects', async (req, res) => {
  const data = clean(req.body);
  if (!data.product_pn && !data.model) {
    return res.status(400).json({ status: 'error', message: 'ต้องมี Product P/N หรือ Model อย่างน้อย 1' });
  }
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
    res.status(500).json({ status: 'error', message: e.message });
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
    const { rows, rowCount } = await db.query(
      `UPDATE pp_projects SET ${sets}, updated_at = NOW() WHERE id = $${vals.length} RETURNING ${COLS}`,
      vals
    );
    if (!rowCount) return res.status(404).json({ status: 'error', message: 'not found' });
    res.json({ status: 'success', data: rows[0] });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.delete('/projects/:id', async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM pp_projects WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ status: 'error', message: 'not found' });
    res.json({ status: 'success' });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

module.exports = router;
