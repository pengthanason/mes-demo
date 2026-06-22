const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
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
app.use('/api/auth',          require('./routes/auth'));
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
app.use('/api/inventory',     require('./routes/inventory'));
app.use('/api/production',     require('./routes/production'));
app.use('/api/pp',             require('./routes/productionPlan'));
app.use('/api/workflow',       require('./routes/workflow'));
app.use('/api',               require('./routes/records'));

// ── Static frontend (single-service deploy: เสิร์ฟหน้าเว็บจาก /public) ─
// ตอน build ด้วย Dockerfile รวม จะก๊อป frontend/dist มาไว้ที่ ./public
const PUBLIC_DIR = path.join(__dirname, 'public');
if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR));
  // SPA fallback: ทุก GET ที่ไม่ใช่ /api → ส่ง index.html (รองรับ HashRouter)
  app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });
}

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
