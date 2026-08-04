// ── client เล็กๆ สำหรับคุย WMS (อ่านล้วน) ─────────────────────────────────────
// ทำไมอยู่ที่ my-api ไม่ใช่ backbone: หน้าเว็บถือ token ของ my-api (คนละ realm กับ backbone
// ที่ยังไม่มี SSO ร่วมกัน) → ถ้าเอา endpoint ไปไว้ที่ backbone หน้าเว็บจะได้ 401 ทันที
//
// ทำไมยิงผ่าน host.docker.internal: my-api เกาะแค่ network ของ MES เอง (ตั้งใจ ห้ามเพิ่ม
// network — 2026-08-03 พิสูจน์แล้วว่าการ connect network เพิ่มไปแย่ง default route จนต่อ DB
// ไม่ได้) · WMS API เปิดพอร์ต 8000 บน host อยู่แล้ว + my-api มี extra_hosts host-gateway
// → เรียกทาง host ได้เลย ไม่ต้องแตะ network ของ container
//
// สิทธิ์: ใช้ service account เดิม (mes_service) ซึ่งเป็น role member ที่มี permission
// `inventory` อยู่แล้ว → พอสำหรับ /ots/reports/qty-drift (read-only) · ไม่ต้องยกเป็น admin
const WMS_URL  = String(process.env.WMS_API_URL || '').replace(/\/+$/, '');
const WMS_USER = String(process.env.WMS_SERVICE_USER || '');
const WMS_PIN  = String(process.env.WMS_SERVICE_PIN || '');

let _token = null;
let _tokenExp = 0;

function isConfigured() { return !!(WMS_URL && WMS_USER && WMS_PIN); }

async function _fetchJson(path, { method = 'GET', body, headers = {}, timeoutMs = 15000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(WMS_URL + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    let json = null;
    try { json = await res.json(); } catch { /* ไม่ใช่ JSON */ }
    return { status: res.status, body: json };
  } finally {
    clearTimeout(timer);
  }
}

// login + cache 7 ชม. (token WMS อายุ 8 ชม.) · forceRefresh ใช้เมื่อเจอ 401
async function _getToken(forceRefresh = false) {
  if (!forceRefresh && _token && Date.now() < _tokenExp) return _token;
  const r = await _fetchJson('/auth/token', { method: 'POST', body: { actor_id: WMS_USER, pin: WMS_PIN } });
  if (r.status === 200 && r.body && r.body.access_token) {
    _token = r.body.access_token;
    _tokenExp = Date.now() + 7 * 3600 * 1000;
    return _token;
  }
  _token = null; _tokenExp = 0;
  throw new Error(`WMS login failed (${r.status})`);   // ⚠️ ห้ามใส่ body ลง error — กัน PIN/token หลุดลง log
}

/**
 * ดึงรายงาน drift WMS↔Odoo (read-only)
 * live=true = อ่าน Odoo สดแบบ authoritative (กติกาทีม: drift ต้องวัดสด)
 *   ถ้า Odoo ล่ม WMS จะถอยไป snapshot แต่ไม่เงียบ — บอกผ่าน source/live_unavailable
 * คืน { ok, data } | { ok:false, status, error } — ไม่ throw ให้ route จัดการต่อได้
 */
async function getQtyDrift({ limit = 200, live = true } = {}) {
  if (!isConfigured()) return { ok: false, status: 0, error: 'ยังไม่ได้ตั้งค่าเชื่อมต่อ WMS (WMS_API_URL/WMS_SERVICE_USER/WMS_SERVICE_PIN)' };
  const path = `/ots/reports/qty-drift?limit=${encodeURIComponent(limit)}&live=${live ? 'true' : 'false'}`;
  const timeoutMs = live ? 45000 : 15000;   // live read คุย Odoo จริง ให้เวลามากกว่า
  try {
    let token = await _getToken();
    let r = await _fetchJson(path, { headers: { Authorization: `Bearer ${token}` }, timeoutMs });
    if (r.status === 401) {                   // token หมดอายุก่อนเวลา → re-login หนึ่งครั้ง
      token = await _getToken(true);
      r = await _fetchJson(path, { headers: { Authorization: `Bearer ${token}` }, timeoutMs });
    }
    if (r.status !== 200) {
      const detail = (r.body && (r.body.detail || r.body.message)) || `WMS ตอบ ${r.status}`;
      return { ok: false, status: r.status, error: String(detail) };
    }
    return { ok: true, data: r.body };
  } catch (e) {
    return { ok: false, status: 0, error: e.name === 'AbortError' ? 'WMS ไม่ตอบในเวลาที่กำหนด' : e.message };
  }
}

module.exports = { isConfigured, getQtyDrift };
