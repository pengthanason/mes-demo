const router = require('express').Router();
const db     = require('../db');

router.get('/unread-count', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT COUNT(*) FROM notifications WHERE is_read=false');
    res.json({ status: 'success', count: Number(rows[0].count) });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.get('/', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const unreadOnly = req.query.unread_only === 'true';
  try {
    const { rows } = await db.query(
      `SELECT id, type, title, message, link, is_read, created_at
       FROM notifications
       ${unreadOnly ? 'WHERE is_read=false' : ''}
       ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    res.json({ status: 'success', data: rows });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.post('/:id/read', async (req, res) => {
  try {
    const { rows, rowCount } = await db.query(
      'UPDATE notifications SET is_read=true WHERE id=$1 RETURNING id, is_read',
      [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ status: 'error', message: 'notification not found' });
    res.json({ status: 'success', data: rows[0] });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

router.post('/read-all', async (req, res) => {
  try {
    await db.query('UPDATE notifications SET is_read=true WHERE is_read=false');
    res.json({ status: 'success' });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

module.exports = router;
