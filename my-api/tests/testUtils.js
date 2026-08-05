// Helper เล็กๆ สำหรับเทสต์ route handler โดยไม่ต่อ Postgres จริง — ใช้เทคนิค require.cache แทน
// mock.module ของ node:test (ยังเป็น experimental ต้องใส่ flag ถึงจะใช้ได้ ไม่เสถียรพอสำหรับ suite นี้)
// ต้องเรียก fakeDb() ก่อน require route file ที่จะเทสต์เสมอ (ก่อนใครจะ require('../db') ครั้งแรกในโปรเซสนี้)
function fakeDb(queryImpl) {
  const dbPath = require.resolve('../db.js');
  const fakeExports = {
    query: queryImpl || (async () => ({ rows: [] })),
    connect: async () => ({ query: queryImpl || (async () => ({ rows: [] })), release: () => {} }),
    DB_SCHEMA: 'mes_app',
    ensureSchema: async () => {},
  };
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeExports };
  return fakeExports;
}

// ดึง handler function ตรงๆ จาก Express Router โดยไม่ต้องเปิด HTTP server จริง
function getHandler(router, method, routePath) {
  const layer = router.stack.find(l => l.route && l.route.path === routePath && l.route.methods[method]);
  if (!layer) throw new Error(`route not found: ${method.toUpperCase()} ${routePath}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function makeReq(body) {
  return { body: body || {}, params: {}, query: {}, user: { username: 'test' } };
}

function makeRes() {
  const res = { statusCode: 200, body: undefined };
  res.status = function (code) { this.statusCode = code; return this; };
  res.json = function (payload) { this.body = payload; return this; };
  return res;
}

module.exports = { fakeDb, getHandler, makeReq, makeRes };
