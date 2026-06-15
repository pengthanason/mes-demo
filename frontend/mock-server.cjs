/**
 * Local mock server for FE-8 Production Plan endpoints
 * Run: node mock-server.cjs
 * Serves on http://localhost:5099
 * No dependencies — pure Node.js built-in http
 */
const http = require('http');

// ── Mock data ──────────────────────────────────────────────────────

let woList = [
  { wo_id: 'WO-202606-001', product_name: 'PCB-A100', qty: 2000, status: 'IN_PROGRESS', created_at: '2026-06-01T08:00:00Z', due_date: '2026-06-20T00:00:00Z' },
  { wo_id: 'WO-202606-002', product_name: 'ASY-300',  qty: 1500, status: 'PENDING',     created_at: '2026-06-05T09:00:00Z', due_date: '2026-06-25T00:00:00Z' },
  { wo_id: 'WO-202606-003', product_name: 'MOT-4500', qty: 3000, status: 'DONE',        created_at: '2026-05-20T08:00:00Z', due_date: '2026-06-10T00:00:00Z' },
];

let bomList = [
  { bom_id: 'BOM-001', name: 'PCB-A100 BOM', version: '1.0', approved: true,  approved_at: '2026-05-15T10:00:00Z' },
  { bom_id: 'BOM-002', name: 'ASY-300 BOM',  version: '2.1', approved: false, approved_at: null },
  { bom_id: 'BOM-003', name: 'MOT-4500 BOM', version: '1.3', approved: true,  approved_at: '2026-06-01T08:00:00Z' },
];

const bomLines = {
  'BOM-001': [
    { line_id: 'L1', part_no: 'R-100K', part_name: 'Resistor 100K Ohm', qty_per: 10, unit: 'pcs' },
    { line_id: 'L2', part_no: 'C-10UF', part_name: 'Capacitor 10uF',    qty_per: 5,  unit: 'pcs' },
    { line_id: 'L3', part_no: 'IC-555', part_name: 'Timer IC 555',       qty_per: 2,  unit: 'pcs' },
  ],
  'BOM-002': [
    { line_id: 'L4', part_no: 'MTR-DC', part_name: 'DC Motor 12V',      qty_per: 1, unit: 'pcs' },
    { line_id: 'L5', part_no: 'GBX-01', part_name: 'Gearbox Assembly',  qty_per: 1, unit: 'pcs' },
  ],
  'BOM-003': [
    { line_id: 'L6', part_no: 'STL-ROD', part_name: 'Steel Rod 10mm',   qty_per: 4, unit: 'pcs' },
    { line_id: 'L7', part_no: 'BRG-6201', part_name: 'Bearing 6201',    qty_per: 2, unit: 'pcs' },
  ],
};

let preWoList = [
  { req_id: 'REQ-001', bom_id: 'BOM-002', bom_name: 'ASY-300 BOM', qty: 500, due_date: '2026-07-01T00:00:00Z', status: 'APPROVED',  created_at: '2026-06-10T08:00:00Z' },
  { req_id: 'REQ-002', bom_id: 'BOM-003', bom_name: 'MOT-4500 BOM', qty: 200, due_date: '2026-07-15T00:00:00Z', status: 'PENDING',  created_at: '2026-06-11T09:00:00Z' },
];

let woSeq = 10;

// ── Helpers ────────────────────────────────────────────────────────

function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { resolve({}); }
    });
  });
}

// ── Router ─────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = req.url || '/';
  const method = req.method || 'GET';

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    });
    res.end();
    return;
  }

  // Strip query string
  const path = url.split('?')[0];

  console.log(`${method} ${path}`);

  // ── Health ──────────────────────────────────────────────────────
  if (method === 'GET' && path === '/api/mes/health') {
    return json(res, 200, { status: 'ok', version: 'mock-1.0', database: 'mock' });
  }

  // ── WO List ─────────────────────────────────────────────────────
  if (method === 'GET' && path === '/api/wo/list') {
    return json(res, 200, { status: 'success', data: woList });
  }

  // ── WO Detail ───────────────────────────────────────────────────
  if (method === 'GET' && path.match(/^\/api\/wo\/[^/]+$/)) {
    const woId = path.split('/').pop();
    const wo = woList.find(w => w.wo_id === woId);
    if (!wo) return json(res, 404, { status: 'error', message: 'WO not found' });
    return json(res, 200, { status: 'success', data: wo });
  }

  // ── Pre-WO List ─────────────────────────────────────────────────
  if (method === 'GET' && path === '/api/wo/req/list') {
    return json(res, 200, { status: 'success', data: preWoList });
  }

  // ── Create Pre-WO ───────────────────────────────────────────────
  if (method === 'POST' && path === '/api/wo/req') {
    const body = await readBody(req);
    if (!body.bom_id || !body.qty || !body.due_date) {
      return json(res, 400, { status: 'error', message: 'bom_id, qty, due_date required' });
    }
    const bom = bomList.find(b => b.bom_id === body.bom_id);
    const newReq = {
      req_id: `REQ-${String(preWoList.length + 1).padStart(3, '0')}`,
      bom_id: body.bom_id,
      bom_name: bom?.name ?? body.bom_id,
      qty: Number(body.qty),
      due_date: body.due_date,
      status: 'PENDING',
      created_at: new Date().toISOString(),
    };
    preWoList.unshift(newReq);
    return json(res, 201, { status: 'success', data: newReq });
  }

  // ── Convert Pre-WO → WO ─────────────────────────────────────────
  if (method === 'POST' && path === '/api/wo/convert') {
    const body = await readBody(req);
    const req_idx = preWoList.findIndex(r => r.req_id === body.req_id);
    if (req_idx === -1) return json(res, 404, { status: 'error', message: 'Pre-WO not found' });
    const preWo = preWoList[req_idx];
    if (preWo.status !== 'APPROVED') {
      return json(res, 409, { status: 'error', message: 'Pre-WO ต้อง APPROVED ก่อน convert' });
    }
    woSeq++;
    const yymm = new Date().toISOString().slice(0, 7).replace('-', '');
    const bom = bomList.find(b => b.bom_id === preWo.bom_id);
    const newWo = {
      wo_id: `WO-${yymm}-${String(woSeq).padStart(3, '0')}`,
      product_name: bom?.name ?? preWo.bom_id,
      qty: preWo.qty,
      status: 'PENDING',
      created_at: new Date().toISOString(),
      due_date: preWo.due_date,
    };
    woList.unshift(newWo);
    preWoList[req_idx] = { ...preWo, status: 'CONVERTED' };
    return json(res, 200, { status: 'success', data: newWo });
  }

  // ── BOM Headers ─────────────────────────────────────────────────
  if (method === 'GET' && path === '/api/bom/headers') {
    return json(res, 200, { status: 'success', data: bomList });
  }

  // ── BOM Detail ──────────────────────────────────────────────────
  if (method === 'GET' && path.match(/^\/api\/bom\/[^/]+\/review$/)) {
    const bomId = path.split('/')[3];
    const bom = bomList.find(b => b.bom_id === bomId);
    if (!bom) return json(res, 404, { status: 'error', message: 'BOM not found' });
    return json(res, 200, { status: 'success', data: { ...bom, lines: bomLines[bomId] ?? [] } });
  }

  // ── Approve BOM ─────────────────────────────────────────────────
  if (method === 'PUT' && path.match(/^\/api\/bom\/[^/]+\/approve$/)) {
    const bomId = path.split('/')[3];
    const idx = bomList.findIndex(b => b.bom_id === bomId);
    if (idx === -1) return json(res, 404, { status: 'error', message: 'BOM not found' });
    bomList[idx] = { ...bomList[idx], approved: true, approved_at: new Date().toISOString() };
    return json(res, 200, { status: 'success', data: bomList[idx] });
  }

  // ── 404 ─────────────────────────────────────────────────────────
  return json(res, 404, { status: 'error', message: `No mock for ${method} ${path}` });
});

server.listen(5099, () => {
  console.log('');
  console.log('  Mock API server running at http://localhost:5099');
  console.log('  Endpoints:');
  console.log('    GET  /api/wo/list');
  console.log('    GET  /api/wo/:woId');
  console.log('    GET  /api/wo/req/list');
  console.log('    POST /api/wo/req');
  console.log('    POST /api/wo/convert');
  console.log('    GET  /api/bom/headers');
  console.log('    GET  /api/bom/:bomId/review');
  console.log('    PUT  /api/bom/:bomId/approve');
  console.log('');
});
