const express = require('express');
const cors    = require('cors');
const migrate = require('./migrations');

const app  = express();
const PORT = process.env.PORT || 5099;

app.use(cors());
app.use(express.json());

// ── Health ─────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', service: 'my-api' });
});

// ── Routes ─────────────────────────────────────────────────────────
app.use('/api/bom',           require('./routes/bom'));
app.use('/api/wo',            require('./routes/wo'));
app.use('/api/report',        require('./routes/report'));
app.use('/api/cr',            require('./routes/cr'));
app.use('/api/rework',        require('./routes/rework'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/scm',           require('./routes/scm'));
app.use('/api/admin',         require('./routes/admin'));
app.use('/api/jumbo',         require('./routes/trace'));
app.use('/api/jig',           require('./routes/jig'));
app.use('/api',               require('./routes/records'));

// ── 404 ────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ status: 'error', message: `No route: ${req.method} ${req.path}` });
});

// ── Start ──────────────────────────────────────────────────────────
async function start() {
  try {
    await migrate();
    app.listen(PORT, () => {
      console.log(`\n  my-api running at http://localhost:${PORT}`);
      console.log(`  Health: http://localhost:${PORT}/api/health\n`);
    });
  } catch (e) {
    console.error('[start] failed:', e.message);
    process.exit(1);
  }
}

start();
