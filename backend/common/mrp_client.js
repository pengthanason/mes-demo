/**
 * mrp_client.js — HTTP client สำหรับเรียก MRP API (syntech_mini_mrp)
 *
 * Env vars:
 *   MRP_API_URL        — base URL ของ MRP เช่น http://172.16.10.87:8001
 *   MRP_SERVICE_TOKEN  — long-lived service JWT (preferred · ใช้ Bearer ตรง · skip /auth/login)
 *   MRP_API_USER       — fallback MRP admin username (used เฉพาะถ้าไม่มี MRP_SERVICE_TOKEN)
 *   MRP_API_PASSWORD   — fallback MRP admin password (used เฉพาะถ้าไม่มี MRP_SERVICE_TOKEN)
 *
 * Auth precedence:
 *   1. MRP_SERVICE_TOKEN (preferred, 2026-05-04 onwards) — bearer ตรง, ไม่มี /auth/login round-trip
 *   2. /auth/login fallback (legacy) — auto-login + cache 7h, ใช้เมื่อ SERVICE_TOKEN ว่าง
 *
 * Functions: isConfigured, healthz, listBoms, getBom, updateActualQty
 *
 * MRP API prefix: /api/v1/mrp/
 * BOM:    GET /api/v1/mrp/bom?status=ACTIVE   → { data: [...], meta: {...} }
 *         GET /api/v1/mrp/bom/{bom_no}        → { data: { bom_no, product_code, revision, status, lines: [...] } }
 * Demand: GET /api/v1/mrp/demand/{plan_no}                → read-only demand plan
 *         PATCH /api/v1/mrp/demand/{plan_no}/actual       → increment actual_qty (body: {actual_qty})
 */
"use strict";
const http = require("http"), https = require("https"), { URL } = require("url");

const MRP_URL           = String(process.env.MRP_API_URL       || "").replace(/\/+$/, "");
const MRP_SERVICE_TOKEN = String(process.env.MRP_SERVICE_TOKEN || "").trim();
const MRP_USER          = String(process.env.MRP_API_USER      || "admin");
const MRP_PASS          = String(process.env.MRP_API_PASSWORD  || "mrp@syntech");

// JWT token cache (used by /auth/login fallback only)
let _jwtToken  = null;
let _jwtExpiry = 0;

function isConfigured() { return MRP_URL.length > 0; }

function _rawReq(method, path, body, headers, timeout = 10000) {
  return new Promise((resolve, reject) => {
    if (!MRP_URL) return reject(new Error("MRP_API_URL not configured"));
    let p; try { p = new URL(MRP_URL + path); } catch { return reject(new Error("Invalid MRP_API_URL")); }
    const lib = p.protocol === "https:" ? https : http;
    const bs  = body ? JSON.stringify(body) : null;
    const opt = {
      hostname: p.hostname, port: p.port || (p.protocol === "https:" ? 443 : 80),
      path: p.pathname + (p.search || ""), method,
      headers: { "Content-Type": "application/json", ...headers },
      timeout,
    };
    if (bs) opt.headers["Content-Length"] = Buffer.byteLength(bs);
    const r = lib.request(opt, (res) => {
      let raw = "";
      res.on("data", c => raw += c);
      res.on("end",  () => { let j; try { j = JSON.parse(raw); } catch { j = { _raw: raw }; } resolve({ status: res.statusCode, body: j }); });
    });
    r.on("timeout", () => r.destroy(new Error("MRP timeout")));
    r.on("error",   e => reject(e));
    if (bs) r.write(bs);
    r.end();
  });
}

// forceRefresh=true → ข้าม cache เพื่อบังคับ re-login (ใช้เมื่อเจอ 401)
// Preferred: MRP_SERVICE_TOKEN env (long-lived JWT, no /auth/login round-trip)
// Fallback:  /auth/login with MRP_API_USER + MRP_API_PASSWORD (legacy)
async function _getJwt(forceRefresh = false) {
  if (MRP_SERVICE_TOKEN) return MRP_SERVICE_TOKEN;
  if (!forceRefresh && _jwtToken && Date.now() < _jwtExpiry) return _jwtToken;
  const r = await _rawReq("POST", "/auth/login",
    { username: MRP_USER, password: MRP_PASS }, {});
  if (r.status === 200 && r.body?.access_token) {
    _jwtToken  = r.body.access_token;
    _jwtExpiry = Date.now() + 7 * 60 * 60 * 1000; // 7h
    return _jwtToken;
  }
  _jwtToken = null;
  _jwtExpiry = 0;
  throw new Error(`MRP login failed: ${r.status} — ${JSON.stringify(r.body).slice(0,100)}`);
}

// 401 handling:
// - MRP_SERVICE_TOKEN mode: 401 = stale/revoked token → propagate (rotation needed, ไม่มี re-login)
// - /auth/login fallback: clear cached token + one re-login + retry once
async function req(method, path, body, timeout = 10000) {
  let jwt = await _getJwt();
  let response = await _rawReq(method, path, body, { Authorization: `Bearer ${jwt}` }, timeout);
  if (response.status === 401) {
    if (MRP_SERVICE_TOKEN) {
      console.error('[mrp_client] MRP_SERVICE_TOKEN rejected (401) — token may be expired/revoked. Rotate required.');
      return response;
    }
    _jwtToken = null;
    _jwtExpiry = 0;
    console.warn('[mrp_client] Token rejected (401) — clearing cache, attempting one re-login + retry');
    try {
      jwt = await _getJwt(true);
      response = await _rawReq(method, path, body, { Authorization: `Bearer ${jwt}` }, timeout);
      if (response.status === 401) {
        console.error('[mrp_client] Retry after re-login still 401 — propagating to caller');
      }
    } catch (reloginErr) {
      console.error('[mrp_client] Re-login after 401 failed:', reloginErr.message);
    }
  }
  return response;
}

async function healthz() {
  if (!isConfigured()) return { ok: false, error: "not configured" };
  try { const r = await _rawReq("GET", "/health", null, {}); return { ok: r.status === 200, detail: r.body }; }
  catch (e) { return { ok: false, error: e.message }; }
}

/**
 * ดึงรายการ BOM headers ที่ ACTIVE
 * @returns {Array<{bom_no, product_code, product_name, revision, status, bom_type, line_count}>}
 */
async function listBoms() {
  if (!isConfigured()) return [];
  try {
    const r = await req("GET", "/api/v1/mrp/bom?status=ACTIVE&limit=200");
    if (r.status !== 200) return [];
    return Array.isArray(r.body?.data) ? r.body.data : [];
  } catch { return []; }
}

/**
 * ดึง BOM header + lines สำหรับ mrp_bom_no
 * @param {string} mrpBomNo
 * @returns {{ bom_no, product_code, product_name, revision, status, lines: Array } | null}
 *
 * lines[]: { line_no, item_code, item_description, qty_per_assembly, uom, mfg_pn, ref_designator, ... }
 */
async function getBom(mrpBomNo) {
  if (!isConfigured() || !mrpBomNo) return null;
  try {
    const r = await req("GET", `/api/v1/mrp/bom/${encodeURIComponent(mrpBomNo)}`);
    if (r.status !== 200) return null;
    return r.body?.data || null;
  } catch { return null; }
}

/**
 * อัปเดต actual_qty ใน MRP demand plan หลัง WO Close
 * เรียก PATCH /api/v1/mrp/demand/{plan_no}/actual — increment (not set) actual_qty
 * MRP auto-closes demand plan เมื่อ actual_qty >= qty_required (ภายใน endpoint)
 * @param {string} planNo   — mrp_demand_ref (demand plan number)
 * @param {number} actualQty — จำนวนที่ผลิตได้ good-FG รอบนี้
 * @returns {object|null} MRP demand record on success; null on misconfigured/missing plan_no
 * @throws Error on HTTP error (non-200) — outbox_worker จะ retry ตาม max_attempts
 */
async function updateActualQty(planNo, actualQty) {
  if (!isConfigured() || !planNo) return null;
  const r = await req("PATCH", `/api/v1/mrp/demand/${encodeURIComponent(planNo)}/actual`,
    { actual_qty: actualQty });
  if (r.status === 200) return r.body?.data || { ok: true };
  const detail = r.body?.detail || r.body?._raw || JSON.stringify(r.body).slice(0, 200);
  throw new Error(`MRP updateActualQty ${r.status}: ${detail}`);
}

/**
 * List MOs with status=CONFIRMED updated after sinceISO (ISO 8601 string).
 * Used by polling job to find new MOs to auto-create WOs in MES.
 * @param {string|null} sinceISO — e.g. "2026-06-01T10:00:00Z" · null = all CONFIRMED
 * @returns {Array<{mo_no, product_code, bom_no, qty_required, updated_at}>}
 */
async function listConfirmedMOs(sinceISO) {
  if (!isConfigured()) return [];
  try {
    let path = '/api/v1/mrp/mo?status=CONFIRMED&limit=200';
    if (sinceISO) path += `&updated_after=${encodeURIComponent(sinceISO)}`;
    const r = await req('GET', path);
    if (r.status !== 200) {
      console.warn(`[mrp_client] listConfirmedMOs ${r.status}`);
      return [];
    }
    const items = Array.isArray(r.body?.data) ? r.body.data : [];
    return items.map(m => ({
      mo_no:        m.mo_no,
      product_code: m.product_code,
      bom_no:       m.bom_no || null,
      qty_required: Number(m.qty_planned || m.qty_required || 0),
      updated_at:   m.updated_at,
    }));
  } catch (e) {
    console.error('[mrp_client] listConfirmedMOs error:', e.message);
    return [];
  }
}

module.exports = { isConfigured, healthz, listBoms, getBom, updateActualQty, listConfirmedMOs };
