/**
 * wms_client.js — HTTP client สำหรับเรียก WMS API
 *
 * Env vars:
 *   WMS_API_URL      — base URL ของ WMS เช่น http://172.16.10.87:8000
 *   WMS_API_TOKEN    — SYNERGY_TOKEN สำหรับ /api/inventory, /api/v1/inventory endpoints
 *   WMS_SERVICE_USER — username ของ service account (default: mes_service)
 *   WMS_SERVICE_PIN  — PIN ของ service account (default: mes@syntech2026)
 *
 * Auth strategy:
 *   - /api/inventory, /api/v1/inventory/* → X-Synergy-Token header
 *   - /ots/*, /v2/*                        → JWT Bearer (auto-login + cache 7h)
 *
 * Functions: isConfigured, healthz, getStock, getAllStock,
 *            postGI, postGR, postADJ, createProdOrder, updateProdOrder
 */
"use strict";
const http = require("http"), https = require("https"), { URL } = require("url");

const WMS_URL          = String(process.env.WMS_API_URL      || "").replace(/\/+$/, "");
const WMS_TOKEN        = String(process.env.WMS_API_TOKEN    || "");
const WMS_SERVICE_USER = String(process.env.WMS_SERVICE_USER || "mes_service");
const WMS_SERVICE_PIN  = String(process.env.WMS_SERVICE_PIN  || "mes@syntech2026");

// JWT token cache
let _jwtToken   = null;
let _jwtExpiry  = 0; // epoch ms

function isConfigured() { return WMS_URL.length > 0; }

function _rawReq(method, path, body, headers, timeout = 10000) {
  return new Promise((resolve, reject) => {
    if (!WMS_URL) return reject(new Error("WMS_API_URL not configured"));
    let p; try { p = new URL(WMS_URL + path); } catch { return reject(new Error("Invalid WMS_API_URL")); }
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
    r.on("timeout", () => r.destroy(new Error("WMS timeout")));
    r.on("error",   e => reject(e));
    if (bs) r.write(bs);
    r.end();
  });
}

// auto-login และ cache JWT token 7 ชั่วโมง
// forceRefresh=true → ข้าม cache เพื่อบังคับ re-login (ใช้เมื่อเจอ 401)
async function _getJwt(forceRefresh = false) {
  if (!forceRefresh && _jwtToken && Date.now() < _jwtExpiry) return _jwtToken;
  const r = await _rawReq("POST", "/auth/token",
    { actor_id: WMS_SERVICE_USER, pin: WMS_SERVICE_PIN }, {});
  if (r.status === 200 && r.body?.access_token) {
    _jwtToken  = r.body.access_token;
    _jwtExpiry = Date.now() + 7 * 60 * 60 * 1000; // 7h
    return _jwtToken;
  }
  // เคลียร์ cache เมื่อ login ล้มเหลว เพื่อไม่ให้ stale token ค้างในหน่วยความจำ
  _jwtToken = null;
  _jwtExpiry = 0;
  throw new Error(`WMS login failed: ${r.status} — ${JSON.stringify(r.body).slice(0,100)}`);
}

// เลือก auth header ตาม path
// 401 handling: (a) clear cached token, (b) one re-login, (c) retry request once
// หากยัง 401 ซ้ำใน retry → propagate response ให้ caller ตัดสินใจต่อ
async function req(method, path, body, timeout = 10000) {
  const usesSynergy = path.startsWith("/api/inventory") || path.startsWith("/api/v1/inventory");
  if (usesSynergy && WMS_TOKEN) {
    return _rawReq(method, path, body, { "X-Synergy-Token": WMS_TOKEN }, timeout);
  }
  let jwt = await _getJwt();
  let response = await _rawReq(method, path, body, { Authorization: `Bearer ${jwt}` }, timeout);
  if (response.status === 401) {
    // (a) invalidate cached token
    _jwtToken = null;
    _jwtExpiry = 0;
    console.warn('[wms_client] Token rejected (401) — clearing cache, attempting one re-login + retry');
    try {
      // (b) force one re-login
      jwt = await _getJwt(true);
      // (c) retry original request once
      response = await _rawReq(method, path, body, { Authorization: `Bearer ${jwt}` }, timeout);
      if (response.status === 401) {
        console.error('[wms_client] Retry after re-login still 401 — propagating to caller');
      }
    } catch (reloginErr) {
      console.error('[wms_client] Re-login after 401 failed:', reloginErr.message);
      // คืน response 401 ตัวเดิมให้ caller แทนที่จะ throw — รักษา contract เดิม
    }
  }
  return response;
}

async function healthz() {
  if (!isConfigured()) return { ok: false, error: "not configured" };
  try { const r = await req("GET", "/health"); return { ok: r.status === 200 && r.body?.status === "ok", detail: r.body }; }
  catch (e) { return { ok: false, error: e.message }; }
}

async function getStock(partNo) {
  if (!isConfigured()) return null;
  try { const r = await req("GET", `/api/v1/inventory/${encodeURIComponent(partNo)}`); return r.status === 200 ? r.body : null; }
  catch { return null; }
}

async function getAllStock() {
  if (!isConfigured()) return [];
  try { const r = await req("GET", "/api/inventory"); return r.status === 200 ? (r.body?.items || []) : []; }
  catch { return []; }
}

async function _movement(woRef, items, type, actor, defaultLocation, defaultRemarks) {
  if (!isConfigured()) return { ok: false, lines: [], errors: [{ error: "WMS not configured" }] };
  const lines = [], errors = [];
  for (const item of items) {
    try {
      const body = { part_no: item.part_no, qty: type === "ADJ" ? -Math.abs(item.qty) : item.qty,
        type: type, location: item.location || defaultLocation,
        document_ref: woRef || undefined, actor_id: actor,
        unit_price: item.unit_price ? String(item.unit_price) : undefined,
        remarks: item.remarks || defaultRemarks };
      const r = await req("POST", "/ots/movements", body);
      if (r.status === 200 || r.status === 201) lines.push({ part_no: item.part_no, qty: item.qty, status: "ok", detail: r.body });
      else errors.push({ part_no: item.part_no, error: `WMS ${r.status}: ${JSON.stringify(r.body)}` });
    } catch (e) { errors.push({ part_no: item.part_no, error: e.message }); }
  }
  return { ok: errors.length === 0, lines, errors };
}

const postGI  = (woRef, items, actor = "mes") => _movement(woRef, items, "ISS", actor, null,       `MES GI: ${woRef}`);
const postGR  = (woRef, items, actor = "mes") => _movement(woRef, items, "REC", actor, "FG-Store", `MES GR (WO Close): ${woRef}`);
const postADJ = (items, actor = "mes")        => _movement(null,  items, "ADJ", actor, null,       "MES Scrap ADJ");

async function createProdOrder(data) {
  if (!isConfigured()) return null;
  try {
    const r = await req("POST", "/ots/production-orders",
      { product_sku: data.product_sku, target_qty: data.target_qty,
        demand_plan_ref: data.demand_plan_ref || null, document_ref: data.wo_number || null });
    if (r.status === 200 || r.status === 201) return r.body;
    console.error("[wms_client] createProdOrder failed:", r.status, r.body); return null;
  } catch (e) { console.error("[wms_client] createProdOrder error:", e.message); return null; }
}

async function updateProdOrder(wmsOrderId, patch) {
  if (!isConfigured() || !wmsOrderId) return null;
  try {
    const r = await req("PATCH", `/ots/production-orders/${encodeURIComponent(wmsOrderId)}`, patch);
    return r.status === 200 ? r.body : null;
  } catch (e) { console.error("[wms_client] updateProdOrder error:", e.message); return null; }
}

/**
 * Issue BOM components to WMS as PRODUCTION_CONSUMPTION when WO closes.
 * Fire-and-forget — errors are logged but do not affect WO close.
 *
 * @param {string} woRef       — wo_number or "ID-{id}"
 * @param {Array}  bomLines    — [{ part_no, qty_per, uom }] from wo_bom_snapshot
 * @param {number} qtyGood     — units produced (multiplier)
 * @returns {{ ok, lines, errors }}
 */
async function issueComponents(woRef, bomLines, qtyGood) {
  if (!isConfigured() || !Array.isArray(bomLines) || bomLines.length === 0 || qtyGood <= 0) {
    return { ok: true, lines: [], errors: [] };
  }
  const items = bomLines.map(l => ({
    part_no: l.part_no,
    qty: (Number(l.qty_per) || Number(l.qty_required) || 1) * qtyGood,
    remarks: `PRODUCTION_CONSUMPTION WO:${woRef}`,
  }));
  const result = await _movement(woRef, items, 'ISS', 'mes-system', null, `MES Production Consumption: ${woRef}`);
  if (!result.ok) console.error(`[wms_client] issueComponents WO=${woRef} errors:`, result.errors);
  else console.log(`[wms_client] issueComponents WO=${woRef} issued ${items.length} BOM lines qty_good=${qtyGood}`);
  return result;
}

module.exports = { isConfigured, healthz, getStock, getAllStock, postGI, postGR, postADJ, createProdOrder, updateProdOrder, issueComponents };
