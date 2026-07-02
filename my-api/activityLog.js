const db = require('./db');

// ผู้ทำ (actor) จาก Bearer token — token = base64(username:role:ts)
function actorFromReq(req) {
  try {
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
    if (!m) return 'system';
    return Buffer.from(m[1], 'base64').toString('utf8').split(':')[0] || 'system';
  } catch { return 'system'; }
}

const RES = [
  ['/api/pp', 'Production Plan', 'pp'],
  ['/api/workflow', 'Workflow', 'workflow'],
  ['/api/wo', 'Work Order', 'wo'],
  ['/api/bom', 'BOM', 'bom'],
  ['/api/cr', 'Change Request (4M)', 'cr'],
  ['/api/jig', 'Jig Test', 'jig'],
  ['/api/scm', 'SCM Case', 'scm'],
  ['/api/rework', 'Rework', 'rework'],
  ['/api/inventory', 'Kitting/Store', 'inventory'],
  ['/api/notifications', 'Notification', 'notifications'],
  ['/api/production', 'Production', 'production'],
];

function resourceOf(path) {
  const r = RES.find(([pre]) => path === pre || path.startsWith(pre + '/'));
  return r ? { label: r[1], type: r[2] } : { label: 'ข้อมูล', type: 'other' };
}

// ชื่อที่อ่านง่ายของ record ที่สร้าง/แก้ (จาก response body) — รองรับหลาย endpoint
function pickName(row) {
  if (!row || typeof row !== 'object') return '';
  return String(row.product_pn || row.model || row.name || row.wo_name || row.cr_no || row.crNo || row.title || row.serial || row.project_code || '');
}
// id ที่ใช้ทำลิงก์ไปรายการนั้น (ต่างกันตาม type)
function pickId(type, row, pathId) {
  const rid = row && row.id != null ? String(row.id) : null;
  if (type === 'wo') return (row && (row.wo_id || row.woId)) || pathId || rid;
  if (type === 'jig') return (row && row.project_code) || pathId || rid;
  return rid || pathId;
}

// บันทึกทุก mutation ที่สำเร็จลง audit_logs พร้อมชื่อ+id ของรายการ (ดึงจาก response body)
module.exports = function activityLog(req, res, next) {
  const method = req.method;
  const p = (req.originalUrl || req.url || '').split('?')[0];   // originalUrl กัน path เพี้ยนหลังผ่าน router
  const origJson = res.json.bind(res);
  res.json = (body) => { try { res.locals.__actBody = body; } catch { /* noop */ } return origJson(body); };
  res.on('finish', () => {
    try {
      if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return;
      if (res.statusCode < 200 || res.statusCode >= 300) return;
      if (!p.startsWith('/api') || p.startsWith('/api/auth')) return;
      if (p.startsWith('/api/admin/users')) return;   // handler บันทึกเองแล้ว
      if (p.includes('audit-log')) return;

      const { label, type } = resourceOf(p);
      const verb = method === 'POST' ? 'CREATE' : method === 'DELETE' ? 'DELETE' : 'UPDATE';
      const th = verb === 'CREATE' ? 'สร้าง' : verb === 'DELETE' ? 'ลบ' : 'แก้ไข';
      const segs = p.split('/').filter(Boolean);
      const lastSeg = segs[segs.length - 1];
      const pathId = (method !== 'POST' && lastSeg && !/^(projects|results|users|board|cases)$/.test(lastSeg)) ? lastSeg : null;
      const body = (res.locals && res.locals.__actBody) || null;
      const row = body && body.data ? body.data : null;
      const name = pickName(row);
      const id = pickId(type, row, pathId);
      const action = `${verb}_${type.toUpperCase()}`;
      const detail = `${th} ${label}${name ? `: ${name}` : (id ? ` #${id}` : '')}`;
      console.log(`[activity] ${method} ${p} -> ${action} ${name || id || ''} (${res.statusCode})`);
      db.query(
        `INSERT INTO audit_logs (actor, action, target_type, target_id, detail) VALUES ($1,$2,$3,$4,$5)`,
        [actorFromReq(req), action, type, id, detail]
      ).catch((e) => console.error('[activity] insert failed:', e.message));
    } catch (e) { console.error('[activity] handler error:', e && e.message); }
  });
  next();
};
