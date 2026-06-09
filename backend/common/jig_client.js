/**
 * jig_client.js — HTTP client สำหรับเรียก jig-api
 *
 * Env vars ที่ต้องตั้ง:
 *   JIG_API_URL  — base URL ของ jig-api  เช่น http://172.16.10.87:3000
 *   JIG_API_KEY  — device API key (ค่าเดียวกับ API_KEY ใน jig-api .env)
 *
 * Functions:
 *   healthz()               → ตรวจสถานะ jig-api
 *   createJob(productSn)    → ใส่ SN เข้าคิวทดสอบ
 *   getResult(productSn)    → ดึงผลทดสอบล่าสุดของ SN
 *   retestJob(productSn)    → reset SN กลับเป็น WAITING
 *   bulkStatus(sns)         → ดึงสถานะหลาย SN พร้อมกัน (ใช้ GET /api/records)
 */

'use strict';

const http  = require('http');
const https = require('https');
const { URL } = require('url');

const JIG_API_URL = String(process.env.JIG_API_URL || '').replace(/\/+$/, '');
const JIG_API_KEY = String(process.env.JIG_API_KEY || '');

const DEFAULT_TIMEOUT_MS = 8000;

function isConfigured() {
  return JIG_API_URL.length > 0 && JIG_API_KEY.length > 0;
}

/**
 * Internal: raw HTTP request สำหรับ jig-api
 */
function jigRequest(method, path, body, { timeout = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    if (!JIG_API_URL) {
      return reject(new Error('JIG_API_URL not configured'));
    }

    let parsed;
    try {
      parsed = new URL(JIG_API_URL + path);
    } catch (e) {
      return reject(new Error('Invalid JIG_API_URL: ' + JIG_API_URL));
    }

    const isHttps  = parsed.protocol === 'https:';
    const lib      = isHttps ? https : http;
    const bodyStr  = body ? JSON.stringify(body) : null;

    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (isHttps ? 443 : 80),
      path:     parsed.pathname + (parsed.search || ''),
      method,
      headers: {
        'Content-Type':  'application/json',
        'x-api-key':     JIG_API_KEY,
      },
      timeout,
    };

    if (bodyStr) {
      options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const req = lib.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        let json;
        try { json = JSON.parse(raw); } catch { json = { _raw: raw }; }
        resolve({ status: res.statusCode, body: json });
      });
    });

    req.on('timeout', () => { req.destroy(new Error('jig-api request timeout')); });
    req.on('error',   (err) => reject(err));

    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

/**
 * ตรวจสถานะ jig-api
 * @returns {{ ok: boolean, ts?: string, error?: string }}
 */
async function healthz() {
  if (!JIG_API_URL) return { ok: false, error: 'JIG_API_URL not set' };
  try {
    // ใช้ GET /api/records-summary เพราะ /healthz ไม่มีใน jig-api
    const res = await jigRequest('GET', '/api/records-summary', null, { timeout: 5000 });
    if (res.status === 200 && typeof res.body?.total === 'number') {
      return { ok: true, total: res.body.total, pass: res.body.pass, fail: res.body.fail };
    }
    return { ok: false, error: `unexpected response ${res.status}` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * ใส่ SN เข้าคิวทดสอบ
 * @param {string} productSn  — full SN format: <FG_PN>-<YEAR_LOT>-<SEQ_NO>
 * @returns {{ queued: boolean, product_sn: string, already_exists?: boolean, error?: string }}
 */
async function createJob(productSn) {
  if (!isConfigured()) return { queued: false, product_sn: productSn, error: 'jig-api not configured' };
  try {
    const res = await jigRequest('POST', '/api/create-job', { product_sn: productSn });
    if (res.status === 201 || res.status === 200) {
      return { queued: true, product_sn: productSn };
    }
    if (res.status === 409) {
      return { queued: false, product_sn: productSn, already_exists: true, error: 'SN already in queue' };
    }
    return { queued: false, product_sn: productSn, error: `jig-api ${res.status}: ${JSON.stringify(res.body)}` };
  } catch (err) {
    return { queued: false, product_sn: productSn, error: err.message };
  }
}

/**
 * ดึงผลทดสอบล่าสุดของ SN จาก jig-api
 * @param {string} productSn
 * @returns {object|null}  — record row จาก jig-api หรือ null ถ้าไม่พบ
 */
async function getResult(productSn) {
  if (!isConfigured()) return null;
  try {
    // jig-api ไม่มี endpoint ดึงต่อ SN โดยตรง → ใช้ GET /api/records?limit=3500 แล้ว find
    // แต่ถ้า SN เยอะมาก ให้ทำ workaround ดึงด้วย result_filter=ALL และ limit ที่พอ
    const res = await jigRequest('GET', `/api/records?limit=3500&result_filter=ALL`);
    if (res.status !== 200 || !Array.isArray(res.body?.records)) return null;
    const row = res.body.records.find(
      (r) => String(r.product_sn || '').trim().toUpperCase() === productSn.trim().toUpperCase()
    );
    return row || null;
  } catch {
    return null;
  }
}

/**
 * ดึงสถานะหลาย SN พร้อมกัน
 * @param {string[]} sns
 * @returns {Map<string, object>}  — Map<UPPER_SN, record>
 */
async function bulkStatus(sns) {
  const result = new Map();
  if (!isConfigured() || !sns.length) return result;
  try {
    const res = await jigRequest('GET', `/api/records?limit=3500&result_filter=ALL`);
    if (res.status !== 200 || !Array.isArray(res.body?.records)) return result;
    const snSet = new Set(sns.map((s) => s.trim().toUpperCase()));
    for (const row of res.body.records) {
      const key = String(row.product_sn || '').trim().toUpperCase();
      if (snSet.has(key)) result.set(key, row);
    }
  } catch { /* silent */ }
  return result;
}

/**
 * Reset SN กลับเป็น WAITING (Re-Test)
 * @param {string} productSn
 * @returns {{ ok: boolean, error?: string }}
 */
async function retestJob(productSn) {
  if (!isConfigured()) return { ok: false, error: 'jig-api not configured' };
  try {
    const res = await jigRequest('POST', '/api/retest-job', { product_sn: productSn });
    if (res.status === 200) return { ok: true };
    return { ok: false, error: `jig-api ${res.status}: ${JSON.stringify(res.body)}` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { healthz, createJob, getResult, bulkStatus, retestJob, isConfigured };
