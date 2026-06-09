const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '..', '.env'), override: false });

function parseConnectTimeoutMillis(rawValue) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 5000;
  }
  if (parsed < 1000) {
    return Math.round(parsed * 1000);
  }
  return Math.round(parsed);
}

const TEST_SCHEMA = `mes_e2e_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
const TEST_PORT = Number(process.env.MES_TEST_PORT || (5600 + Math.floor(Math.random() * 200)));
const E2E_USER_PASSWORD = 'Syntech#123';
const E2E_PASSWORD_HASH = '$2a$10$GlK3N/1oJJmLFdYDwmkRqe7iEKz1SdyNH2TnCYg38gOoXkaSmV3HO';

process.env.DB_SCHEMA = TEST_SCHEMA;
process.env.APP_HOST = '127.0.0.1';
process.env.APP_PORT = String(TEST_PORT);
process.env.MES_AUTH_MODE = 'hybrid';
process.env.MES_JWT_SECRET = 'syntech_mes_jwt_secret_for_e2e_testing_1234567890';

const { startServer } = require('../server');
const { pool } = require('../db');

const schemaSql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
const schemaIdent = `"${TEST_SCHEMA.replace(/"/g, '""')}"`;
const baseUrl = `http://127.0.0.1:${TEST_PORT}`;

const adminPool = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'productiondb',
  user: process.env.DB_USER || 'syntechdb',
  password: process.env.DB_PASSWORD || '',
  ssl: (process.env.DB_SSLMODE || 'prefer') === 'require' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: parseConnectTimeoutMillis(process.env.DB_CONNECT_TIMEOUT || '5000'),
});

const users = {
  pm: null,
  store: null,
  qa: null,
  pd: null,
  tech: null,
  qc: null,
};

const ROUTE_STATIONS_R1_R13 = [
  'SMT_SMD',
  'THU_INSERT',
  'ICT',
  'FCT_PCBA',
  'BB_PREP',
  'FCT_BBAS',
  'FQC',
];

let server;

async function apiRequest(method, urlPath, role, userId, payload) {
  const headers = { 'X-User-Role': role };
  if (payload != null) {
    headers['Content-Type'] = 'application/json';
  }
  if (userId != null) {
    headers['X-User-Id'] = String(userId);
  }

  const response = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers,
    body: payload == null ? undefined : JSON.stringify(payload),
  });

  const text = await response.text();
  let json = {};
  if (text) {
    try {
      json = JSON.parse(text);
    } catch (_err) {
      json = { raw: text };
    }
  }

  return {
    status: response.status,
    body: json,
  };
}

async function apiRequestWithHeaders(method, urlPath, headers, payload) {
  const requestHeaders = { ...(headers || {}) };
  if (payload != null && !requestHeaders['Content-Type']) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: requestHeaders,
    body: payload == null ? undefined : JSON.stringify(payload),
  });

  const text = await response.text();
  let json = {};
  if (text) {
    try {
      json = JSON.parse(text);
    } catch (_err) {
      json = { raw: text };
    }
  }

  return {
    status: response.status,
    body: json,
  };
}

function encodeBase64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function signTestJwt(payload, secret = String(process.env.MES_JWT_SECRET || '')) {
  const header = encodeBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = encodeBase64Url(JSON.stringify(payload));
  const signature = encodeBase64Url(crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest());
  return `${header}.${body}.${signature}`;
}

function assertSuccess(resp, expectedStatus, context) {
  assert.equal(
    resp.status,
    expectedStatus,
    `${context} expected HTTP ${expectedStatus} but got ${resp.status}: ${JSON.stringify(resp.body)}`
  );
}

async function createApprovedBom() {
  const bomCode = `BOM-E2E-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
  const upload = await apiRequest('POST', '/api/bom/upload', 'ADMIN', null, {
    bom_code: bomCode,
    part_no: '1E2ASRES0001',
    customer: 'SYNTECH',
    model: 'M1',
    revision: 'A',
    csv_text: 'line_no,part_no,qty_per,uom,description\n1,301ASMOS0001,1,EA,Main MOS',
  });
  assertSuccess(upload, 201, 'upload BOM');

  const bomId = Number(upload.body.bom_header_id);
  const approve = await apiRequest('PUT', `/api/bom/${bomId}/approve`, 'PM', users.pm, {});
  assertSuccess(approve, 200, 'approve BOM');

  return bomId;
}

async function createDraftBom() {
  const bomCode = `BOM-E2E-DRAFT-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
  const upload = await apiRequest('POST', '/api/bom/upload', 'ADMIN', null, {
    bom_code: bomCode,
    part_no: '1E2ASRES0001',
    customer: 'SYNTECH',
    model: 'M1',
    revision: 'A',
    csv_text: 'line_no,part_no,qty_per,uom,description\n1,301ASMOS0001,1,EA,Main MOS',
  });
  assertSuccess(upload, 201, 'upload draft BOM');
  return Number(upload.body.bom_header_id);
}

async function approveIncomingChecklistForWo(woId) {
  const storeCheck = await apiRequest('POST', '/api/incoming/pre-wo/store-check', 'STORE', users.store, {
    wo_id: woId,
    line_no: 1,
  });
  assertSuccess(storeCheck, 200, 'incoming store check line 1');

  const storeValidate = await apiRequest('POST', '/api/incoming/pre-wo/validate-store', 'STORE', users.store, {
    wo_id: woId,
  });
  assertSuccess(storeValidate, 200, 'incoming store validate');

  const qaCheck = await apiRequest('POST', '/api/incoming/pre-wo/qa-check', 'QA', users.qa, {
    wo_id: woId,
    line_no: 1,
  });
  assertSuccess(qaCheck, 200, 'incoming qa check line 1');

  const qaApproveChecklist = await apiRequest('POST', '/api/incoming/pre-wo/approve-qa', 'QA', users.qa, {
    wo_id: woId,
  });
  assertSuccess(qaApproveChecklist, 200, 'incoming qa approve checklist');
}

async function createReadyWoFromBom(bomId, uidLabel) {
  const preWo = await apiRequest('POST', '/api/planning/pre-wo', 'PM', users.pm, {
    part_no: '1E2ASRES0001',
    qty_target: 1,
    bom_header_id: bomId,
    demand_plan_ref: 'DP-TEST-001',
  });
  assertSuccess(preWo, 201, 'create pre-wo');

  const woId = Number(preWo.body.pre_wo.id);

  const receive = await apiRequest('POST', '/api/store/receive', 'STORE', users.store, {
    part_no: '301ASMOS0001',
    qty_on_hand: 5,
    lot_no: uidLabel,
  });
  assertSuccess(receive, 201, 'store receive');

  const uid = receive.body.receipt.uid;
  const qaApprove = await apiRequest('POST', '/api/qa/approve', 'QA', users.qa, { uid, status: 'APPROVED' });
  assertSuccess(qaApprove, 200, 'qa approve uid');

  await approveIncomingChecklistForWo(woId);

  const convert = await apiRequest('POST', '/api/wo/convert', 'PM', users.pm, { wo_id: woId });
  assertSuccess(convert, 200, 'convert wo');

  const issue = await apiRequest('POST', '/api/store/issue', 'STORE', users.store, { wo_id: woId, uid });
  assertSuccess(issue, 200, 'store issue');
  assert.equal(issue.body.wo_status, 'READY');

  return { woId, uid };
}

async function createApprovedUid(partNo, lotNo, qtyOnHand = 5) {
  const receive = await apiRequest('POST', '/api/store/receive', 'STORE', users.store, {
    part_no: partNo,
    qty_on_hand: qtyOnHand,
    lot_no: lotNo,
  });
  assertSuccess(receive, 201, `store receive (${lotNo})`);

  const uid = receive.body.receipt.uid;
  const qaApprove = await apiRequest('POST', '/api/qa/approve', 'QA', users.qa, { uid, status: 'APPROVED' });
  assertSuccess(qaApprove, 200, `qa approve uid (${lotNo})`);

  return uid;
}

async function promoteWoToRunning(woId) {
  const faiRequest = await apiRequest('POST', '/api/fai/request', 'TECH', users.tech, { wo_id: woId });
  assertSuccess(faiRequest, 200, 'fai request');

  const faiQa = await apiRequest('POST', '/api/fai/approve-qa', 'QA', users.qa, { wo_id: woId });
  assertSuccess(faiQa, 200, 'fai approve qa');

  const faiMgr = await apiRequest('POST', '/api/fai/approve-mgr', 'PD', users.pd, { wo_id: woId });
  assertSuccess(faiMgr, 200, 'fai approve mgr');
}

async function runRoutingPassAll(woId, unitSn) {
  let lastOut = null;
  for (const stationName of ROUTE_STATIONS_R1_R13) {
    const scanIn = await apiRequest('POST', '/api/routing/scan-in', 'TECH', users.tech, {
      woId,
      unit_sn: unitSn,
      station_name: stationName,
    });
    assertSuccess(scanIn, 200, `scan-in ${stationName}`);

    lastOut = await apiRequest('POST', '/api/routing/scan-out', 'TECH', users.tech, {
      woId,
      unit_sn: unitSn,
      station_name: stationName,
      status: 'PASS',
    });
    assertSuccess(lastOut, 200, `scan-out ${stationName} PASS`);
  }

  return lastOut;
}

before(async () => {
  const client = await adminPool.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS ${schemaIdent} CASCADE`);
    await client.query(`CREATE SCHEMA ${schemaIdent}`);
    await client.query(`SET search_path TO ${schemaIdent}`);
    await client.query(schemaSql);

    const seeded = await client.query(
      `INSERT INTO users (username, password_hash, role)
       VALUES
         ('pm_e2e', $1, 'PM'),
         ('store_e2e', $1, 'STORE'),
         ('qa_e2e', $1, 'QA'),
         ('pd_e2e', $1, 'PD'),
         ('tech_e2e', $1, 'TECH'),
         ('qc_e2e', $1, 'QC')
       RETURNING id, username, role`,
      [E2E_PASSWORD_HASH]
    );

    for (const row of seeded.rows) {
      const key = String(row.role || '').toLowerCase();
      users[key] = Number(row.id);
    }
  } finally {
    client.release();
  }

  server = startServer('127.0.0.1', TEST_PORT);
  await new Promise((resolve) => {
    server.on('listening', resolve);
  });
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) return reject(error);
        return resolve();
      });
    });
  }

  await pool.end();

  await adminPool.query(`DROP SCHEMA IF EXISTS ${schemaIdent} CASCADE`);
  await adminPool.end();
});

test('e2e happy path: wo lifecycle + production traceability + close yield', { concurrency: false }, async () => {
  const bomId = await createApprovedBom();
  const { woId, uid } = await createReadyWoFromBom(bomId, 'LOT-A');

  const faiRequest = await apiRequest('POST', '/api/fai/request', 'TECH', users.tech, { wo_id: woId });
  assertSuccess(faiRequest, 200, 'fai request');

  const faiQa = await apiRequest('POST', '/api/fai/approve-qa', 'QA', users.qa, { wo_id: woId });
  assertSuccess(faiQa, 200, 'fai approve qa');

  const faiMgr = await apiRequest('POST', '/api/fai/approve-mgr', 'PD', users.pd, { wo_id: woId });
  assertSuccess(faiMgr, 200, 'fai approve mgr');

  const runStart = await apiRequest('POST', '/api/machine/event', 'TECH', users.tech, {
    wo_id: woId,
    event_type: 'RUN_START',
  });
  assertSuccess(runStart, 200, 'machine run_start');

  const startUnit = await apiRequest('POST', '/api/production/start-unit', 'TECH', users.tech, {
    wo_id: woId,
    sn: 'SN-E2E-0001',
  });
  assertSuccess(startUnit, 200, 'start unit');

  const scanMaterial = await apiRequest('POST', '/api/production/scan-material', 'TECH', users.tech, {
    unit_sn: 'SN-E2E-0001',
    material_uid: uid,
    used_qty: 1,
    station_id: 'PD_INCOMING',
  });
  assertSuccess(scanMaterial, 200, 'scan material');

  const qcFail = await apiRequest('POST', '/api/qc/result', 'QC', users.qc, {
    unit_sn: 'SN-E2E-0001',
    result: 'FAIL',
  });
  assertSuccess(qcFail, 200, 'qc fail');

  const repair = await apiRequest('POST', '/api/rework/repair', 'QC', users.qc, {
    unit_sn: 'SN-E2E-0001',
  });
  assertSuccess(repair, 200, 'rework repair');

  const qcPass = await apiRequest('POST', '/api/qc/result', 'QC', users.qc, {
    unit_sn: 'SN-E2E-0001',
    result: 'PASS',
  });
  assertSuccess(qcPass, 200, 'qc pass');

  const obaPass = await apiRequest('POST', '/api/qa/oba', 'QA', users.qa, {
    unit_sn: 'SN-E2E-0001',
    result: 'PASS',
  });
  assertSuccess(obaPass, 200, 'qa oba pass');

  const closePm = await apiRequest('POST', '/api/wo/close', 'PM', users.pm, {
    wo_id: woId,
  });
  assertSuccess(closePm, 200, 'close wo by pm');
  assert.equal(closePm.body.close_pending, true);
  assert.equal(closePm.body.close_completed, false);

  const closePd = await apiRequest('POST', '/api/wo/close', 'PD', users.pd, {
    wo_id: woId,
  });
  assertSuccess(closePd, 200, 'close wo by pd');
  assert.equal(closePd.body.close_pending, false);
  assert.equal(closePd.body.close_completed, true);

  const woQuery = await apiRequest('GET', `/api/wo/${woId}`, 'PM', users.pm);
  assertSuccess(woQuery, 200, 'query wo');
  assert.equal(woQuery.body.wo.status, 'CLOSED');
  assert.equal(Number(woQuery.body.wo.qty_started), 1);
  assert.equal(Number(woQuery.body.wo.qty_good), 1);
  assert.equal(Number(woQuery.body.wo.yield_pct), 100);

  const unitResult = await pool.query(
    `SELECT status, current_station
     FROM production_units
     WHERE sn=$1`,
    ['SN-E2E-0001']
  );
  assert.equal(unitResult.rows.length, 1);
  assert.equal(unitResult.rows[0].status, 'PACKED');
  assert.equal(unitResult.rows[0].current_station, 'QA_OBA_PASS');

  const traceResult = await pool.query(
    `SELECT COUNT(*)::int AS links
     FROM unit_material_links
     WHERE unit_sn=$1
       AND material_uid=$2`,
    ['SN-E2E-0001', uid]
  );
  assert.equal(traceResult.rows[0].links, 1);
});

test('e2e gate: dual-key FAI blocks qa_id == mgr_id', { concurrency: false }, async () => {
  const bomId = await createApprovedBom();
  const { woId } = await createReadyWoFromBom(bomId, 'LOT-B');

  const faiRequest = await apiRequest('POST', '/api/fai/request', 'TECH', users.tech, { wo_id: woId });
  assertSuccess(faiRequest, 200, 'fai request 2');

  const faiQa = await apiRequest('POST', '/api/fai/approve-qa', 'QA', users.qa, { wo_id: woId });
  assertSuccess(faiQa, 200, 'fai qa approve 2');

  const faiMgrSameUser = await apiRequest('POST', '/api/fai/approve-mgr', 'PD', users.qa, { wo_id: woId });
  assert.equal(faiMgrSameUser.status, 409);
  assert.equal(faiMgrSameUser.body.code, 'FAI_MANAGER_APPROVAL_BLOCKED');
});

test('module01 gate: pre-wo blocks invalid part number', { concurrency: false }, async () => {
  const invalidPreWo = await apiRequest('POST', '/api/planning/pre-wo', 'PM', users.pm, {
    part_no: '1E2A0001',
    qty_target: 10,
  });

  assert.equal(invalidPreWo.status, 400);
  assert.equal(invalidPreWo.body.code, 'VALIDATION_ERROR');
});

test('module01 gate: bom upload blocks invalid detail lines', { concurrency: false }, async () => {
  const bomCode = `BOM-E2E-BAD-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
  const invalidUpload = await apiRequest('POST', '/api/bom/upload', 'ADMIN', null, {
    bom_code: bomCode,
    part_no: '1E2ASRES0001',
    customer: 'SYNTECH',
    model: 'M1',
    revision: 'A',
    csv_text: 'line_no,part_no,qty_per,uom,description\n1,301ASZZZ0001,1,EA,Bad whitelist',
  });

  assert.equal(invalidUpload.status, 400);
  assert.equal(invalidUpload.body.code, 'VALIDATION_ERROR');
});

test('module02 gate: qa approve blocks invalid uid format', { concurrency: false }, async () => {
  const invalidApprove = await apiRequest('POST', '/api/qa/approve', 'QA', users.qa, {
    uid: 'BAD-UID',
    status: 'APPROVED',
  });

  assert.equal(invalidApprove.status, 400);
  assert.equal(invalidApprove.body.code, 'VALIDATION_ERROR');
});

test('module02 gate: qa approve returns not found for unknown uid', { concurrency: false }, async () => {
  const notFoundApprove = await apiRequest('POST', '/api/qa/approve', 'QA', users.qa, {
    uid: 'UID-260101-9999',
    status: 'APPROVED',
  });

  assert.equal(notFoundApprove.status, 404);
  assert.equal(notFoundApprove.body.code, 'UID_NOT_FOUND');
});

test('module02 gate: approved uid locks part_no by trigger', { concurrency: false }, async () => {
  const receive = await apiRequest('POST', '/api/store/receive', 'STORE', users.store, {
    part_no: '301ASMOS0001',
    qty_on_hand: 1,
    lot_no: 'LOT-LOCK',
  });
  assertSuccess(receive, 201, 'store receive for trigger lock');

  const uid = receive.body.receipt.uid;
  const approve = await apiRequest('POST', '/api/qa/approve', 'QA', users.qa, {
    uid,
    status: 'APPROVED',
  });
  assertSuccess(approve, 200, 'qa approve for trigger lock');

  let blocked = false;
  try {
    await pool.query(
      `UPDATE inventory_uids
       SET part_no=$2
       WHERE uid=$1`,
      [uid, '301ASCAP0001']
    );
  } catch (error) {
    blocked = error?.code === '23514';
  }

  assert.equal(blocked, true, 'trigger should block part_no update after APPROVED');
});

test('module03 gate: convert blocks non-draft work order', { concurrency: false }, async () => {
  const bomId = await createApprovedBom();
  const preWo = await apiRequest('POST', '/api/planning/pre-wo', 'PM', users.pm, {
    part_no: '1E2ASRES0001',
    qty_target: 1,
    bom_header_id: bomId,
    demand_plan_ref: 'DP-TEST-CONVERT',
  });
  assertSuccess(preWo, 201, 'create pre-wo for convert gate');

  const woId = Number(preWo.body.pre_wo.id);
  await createApprovedUid('301ASMOS0001', 'LOT-CONVERT-GATE');
  await approveIncomingChecklistForWo(woId);
  const convert1 = await apiRequest('POST', '/api/wo/convert', 'PM', users.pm, { wo_id: woId });
  assertSuccess(convert1, 200, 'first convert');

  const convert2 = await apiRequest('POST', '/api/wo/convert', 'PM', users.pm, { wo_id: woId });
  assert.equal(convert2.status, 409);
  assert.equal(convert2.body.code, 'WO_CONVERT_BLOCKED');
});

test('module03 gate: convert blocks when bom is not approved', { concurrency: false }, async () => {
  const draftBomId = await createDraftBom();
  const preWo = await apiRequest('POST', '/api/planning/pre-wo', 'PM', users.pm, {
    part_no: '1E2ASRES0001',
    qty_target: 1,
    bom_header_id: draftBomId,
    demand_plan_ref: 'DP-TEST-DRAFT-BOM',
  });
  assertSuccess(preWo, 201, 'create pre-wo with draft bom');

  const woId = Number(preWo.body.pre_wo.id);
  const convert = await apiRequest('POST', '/api/wo/convert', 'PM', users.pm, { wo_id: woId });
  assert.equal(convert.status, 409);
  assert.equal(convert.body.code, 'WO_CONVERT_BLOCKED');
});

test('module03 gate: convert blocks when incoming checklist is not QA approved', { concurrency: false }, async () => {
  const bomId = await createApprovedBom();
  const preWo = await apiRequest('POST', '/api/planning/pre-wo', 'PM', users.pm, {
    part_no: '1E2ASRES0001',
    qty_target: 1,
    bom_header_id: bomId,
    demand_plan_ref: 'DP-TEST-INCOMING',
  });
  assertSuccess(preWo, 201, 'create pre-wo for incoming gate');

  const woId = Number(preWo.body.pre_wo.id);
  const convert = await apiRequest('POST', '/api/wo/convert', 'PM', users.pm, { wo_id: woId });
  assert.equal(convert.status, 409);
  assert.equal(convert.body.code, 'WO_CONVERT_BLOCKED');
});

test('module03 endpoint: wo list route remains reachable (no param shadow)', { concurrency: false }, async () => {
  const list = await apiRequest('GET', '/api/wo/list', 'PM', users.pm);
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.body.wos));
});

test('module04 gate: store issue blocks part mismatch against wo_bom_snapshot', { concurrency: false }, async () => {
  const bomId = await createApprovedBom();
  const preWo = await apiRequest('POST', '/api/planning/pre-wo', 'PM', users.pm, {
    part_no: '1E2ASRES0001',
    qty_target: 1,
    bom_header_id: bomId,
    demand_plan_ref: 'DP-TEST-MOD04',
  });
  assertSuccess(preWo, 201, 'create pre-wo for module04 mismatch');

  const woId = Number(preWo.body.pre_wo.id);
  await createApprovedUid('301ASMOS0001', 'LOT-MOD04-CHECKLIST');
  await approveIncomingChecklistForWo(woId);
  const convert = await apiRequest('POST', '/api/wo/convert', 'PM', users.pm, { wo_id: woId });
  assertSuccess(convert, 200, 'convert wo for module04 mismatch');
  assert.equal(convert.body.wo.status, 'OPEN');

  const wrongUid = await createApprovedUid('301ASCAP0001', 'LOT-MISMATCH');
  const issue = await apiRequest('POST', '/api/store/issue', 'STORE', users.store, {
    wo_id: woId,
    uid: wrongUid,
  });

  assert.equal(issue.status, 409);
  assert.equal(issue.body.code, 'STORE_ISSUE_BLOCKED');
});

test('module04 gate: store issue blocks WO status outside OPEN/READY', { concurrency: false }, async () => {
  const bomId = await createApprovedBom();
  const preWo = await apiRequest('POST', '/api/planning/pre-wo', 'PM', users.pm, {
    part_no: '1E2ASRES0001',
    qty_target: 1,
    bom_header_id: bomId,
    demand_plan_ref: 'DP-TEST-MOD04-STATUS',
  });
  assertSuccess(preWo, 201, 'create draft pre-wo for module04 status gate');
  assert.equal(preWo.body.pre_wo.status, 'DRAFT');

  const woId = Number(preWo.body.pre_wo.id);
  const uid = await createApprovedUid('301ASMOS0001', 'LOT-STATUS-BLOCK');
  const issue = await apiRequest('POST', '/api/store/issue', 'STORE', users.store, {
    wo_id: woId,
    uid,
  });

  assert.equal(issue.status, 409);
  assert.equal(issue.body.code, 'STORE_ISSUE_BLOCKED');
});

test('module06 gate: start-unit blocks same SN across different WO', { concurrency: false }, async () => {
  const bomId = await createApprovedBom();

  const wo1 = await createReadyWoFromBom(bomId, 'LOT-SN-WO1');
  const wo2 = await createReadyWoFromBom(bomId, 'LOT-SN-WO2');
  await promoteWoToRunning(wo1.woId);
  await promoteWoToRunning(wo2.woId);

  const firstStart = await apiRequest('POST', '/api/production/start-unit', 'TECH', users.tech, {
    wo_id: wo1.woId,
    sn: 'SN-CROSS-WO-0001',
  });
  assertSuccess(firstStart, 200, 'first start-unit on WO1');
  assert.equal(firstStart.body.created, true);

  const secondStart = await apiRequest('POST', '/api/production/start-unit', 'TECH', users.tech, {
    wo_id: wo2.woId,
    sn: 'SN-CROSS-WO-0001',
  });
  assert.equal(secondStart.status, 409);
  assert.equal(secondStart.body.code, 'UNIT_START_BLOCKED');
});

test('module06 gate: duplicate material scan is blocked and stock decrements once', { concurrency: false }, async () => {
  const bomId = await createApprovedBom();
  const { woId, uid } = await createReadyWoFromBom(bomId, 'LOT-DUP-SCAN');
  await promoteWoToRunning(woId);

  const startUnit = await apiRequest('POST', '/api/production/start-unit', 'TECH', users.tech, {
    wo_id: woId,
    sn: 'SN-DUP-SCAN-0001',
  });
  assertSuccess(startUnit, 200, 'start unit for duplicate material scan');

  const scan1 = await apiRequest('POST', '/api/production/scan-material', 'TECH', users.tech, {
    unit_sn: 'SN-DUP-SCAN-0001',
    material_uid: uid,
    used_qty: 2,
    station_id: 'PD_INCOMING',
  });
  assertSuccess(scan1, 200, 'first material scan');
  assert.equal(Number(scan1.body.qty_on_hand_after), 3);

  const scan2 = await apiRequest('POST', '/api/production/scan-material', 'TECH', users.tech, {
    unit_sn: 'SN-DUP-SCAN-0001',
    material_uid: uid,
    used_qty: 1,
    station_id: 'PD_INCOMING',
  });
  assert.equal(scan2.status, 409);
  assert.equal(scan2.body.code, 'DUPLICATE_UNIT_MATERIAL_LINK');

  const qtyResult = await pool.query(
    `SELECT qty_on_hand
     FROM inventory_uids
     WHERE uid=$1`,
    [uid]
  );
  assert.equal(qtyResult.rows.length, 1);
  assert.equal(Number(qtyResult.rows[0].qty_on_hand), 3);
});

test('module06 gate: material scan blocks unit status outside IN_PROGRESS/REPAIRED', { concurrency: false }, async () => {
  const bomId = await createApprovedBom();
  const { woId, uid } = await createReadyWoFromBom(bomId, 'LOT-NG-BLOCK');
  await promoteWoToRunning(woId);

  const startUnit = await apiRequest('POST', '/api/production/start-unit', 'TECH', users.tech, {
    wo_id: woId,
    sn: 'SN-NG-BLOCK-0001',
  });
  assertSuccess(startUnit, 200, 'start unit for NG scan block');

  const qcFail = await apiRequest('POST', '/api/qc/result', 'QC', users.qc, {
    unit_sn: 'SN-NG-BLOCK-0001',
    result: 'FAIL',
  });
  assertSuccess(qcFail, 200, 'set unit to NG before material re-scan');

  const blockedScan = await apiRequest('POST', '/api/production/scan-material', 'TECH', users.tech, {
    unit_sn: 'SN-NG-BLOCK-0001',
    material_uid: uid,
    used_qty: 1,
    station_id: 'REWORK',
  });
  assert.equal(blockedScan.status, 409);
  assert.equal(blockedScan.body.code, 'SCAN_MATERIAL_BLOCKED');
});

test('module07 gate: qc result blocks unit status outside IN_PROGRESS/REPAIRED', { concurrency: false }, async () => {
  const bomId = await createApprovedBom();
  const { woId } = await createReadyWoFromBom(bomId, 'LOT-QC-GATE');
  await promoteWoToRunning(woId);

  const startUnit = await apiRequest('POST', '/api/production/start-unit', 'TECH', users.tech, {
    wo_id: woId,
    sn: 'SN-QC-GATE-0001',
  });
  assertSuccess(startUnit, 200, 'start unit for qc gate');

  const qcPass = await apiRequest('POST', '/api/qc/result', 'QC', users.qc, {
    unit_sn: 'SN-QC-GATE-0001',
    result: 'PASS',
  });
  assertSuccess(qcPass, 200, 'first qc pass');

  const qcSecond = await apiRequest('POST', '/api/qc/result', 'QC', users.qc, {
    unit_sn: 'SN-QC-GATE-0001',
    result: 'PASS',
  });
  assert.equal(qcSecond.status, 409);
  assert.equal(qcSecond.body.code, 'QC_RESULT_BLOCKED');
});

test('module08 QA-OBA gate: FAIL moves unit to REWORK and decrements qty_good atomically', { concurrency: false }, async () => {
  const bomId = await createApprovedBom();
  const { woId, uid } = await createReadyWoFromBom(bomId, 'LOT-OBA-FAIL');
  await promoteWoToRunning(woId);

  const unitSn = 'SN-OBA-FAIL-0001';
  const startUnit = await apiRequest('POST', '/api/production/start-unit', 'TECH', users.tech, {
    wo_id: woId,
    sn: unitSn,
  });
  assertSuccess(startUnit, 200, 'start unit for OBA fail');

  const scanMaterial = await apiRequest('POST', '/api/production/scan-material', 'TECH', users.tech, {
    unit_sn: unitSn,
    material_uid: uid,
    used_qty: 1,
    station_id: 'PD_INCOMING',
  });
  assertSuccess(scanMaterial, 200, 'scan material for OBA fail');

  const lastOut = await runRoutingPassAll(woId, unitSn);
  assert.equal(lastOut.body.state, 'COMPLETED');

  const obaFail = await apiRequest('POST', '/api/qa/oba', 'QA', users.qa, {
    unit_sn: unitSn,
    result: 'FAIL',
  });
  assertSuccess(obaFail, 200, 'qa oba fail');
  assert.equal(obaFail.body.oba_result, 'FAIL');
  assert.equal(obaFail.body.unit_status, 'NG');
  assert.equal(obaFail.body.current_station, 'REWORK');
  assert.equal(Number(obaFail.body.qty_good_after), 0);

  const woResult = await pool.query(
    `SELECT qty_good
     FROM work_orders
     WHERE id=$1`,
    [woId]
  );
  assert.equal(woResult.rows.length, 1);
  assert.equal(Number(woResult.rows[0].qty_good), 0);
});

test('module06 routing gate: scan-in allows free station selection within route', { concurrency: false }, async () => {
  const bomId = await createApprovedBom();
  const { woId } = await createReadyWoFromBom(bomId, 'LOT-ROUTE-SKIP');
  await promoteWoToRunning(woId);

  const startUnit = await apiRequest('POST', '/api/production/start-unit', 'TECH', users.tech, {
    wo_id: woId,
    sn: 'SN-ROUTE-SKIP-0001',
  });
  assertSuccess(startUnit, 200, 'start unit for routing skip gate');

  const smtIn = await apiRequest('POST', '/api/routing/scan-in', 'TECH', users.tech, {
    woId,
    unit_sn: 'SN-ROUTE-SKIP-0001',
    station_name: ROUTE_STATIONS_R1_R13[0],
  });
  assertSuccess(smtIn, 200, 'scan-in SMT_SMD');

  const smtOut = await apiRequest('POST', '/api/routing/scan-out', 'TECH', users.tech, {
    woId,
    unit_sn: 'SN-ROUTE-SKIP-0001',
    station_name: ROUTE_STATIONS_R1_R13[0],
    status: 'PASS',
  });
  assertSuccess(smtOut, 200, 'scan-out SMT_SMD PASS');
  assert.equal(smtOut.body.state, 'READY_NEXT');
  assert.equal(smtOut.body.next_station, ROUTE_STATIONS_R1_R13[1]);

  const jumpToBbPrepIn = await apiRequest('POST', '/api/routing/scan-in', 'TECH', users.tech, {
    woId,
    unit_sn: 'SN-ROUTE-SKIP-0001',
    station_name: ROUTE_STATIONS_R1_R13[4],
  });
  assertSuccess(jumpToBbPrepIn, 200, 'scan-in BB_PREP without fixed sequence');

  const jumpToBbPrepOut = await apiRequest('POST', '/api/routing/scan-out', 'TECH', users.tech, {
    woId,
    unit_sn: 'SN-ROUTE-SKIP-0001',
    station_name: ROUTE_STATIONS_R1_R13[4],
    status: 'PASS',
  });
  assertSuccess(jumpToBbPrepOut, 200, 'scan-out BB_PREP PASS');
  assert.equal(jumpToBbPrepOut.body.state, 'READY_NEXT');
  assert.equal(jumpToBbPrepOut.body.next_station, ROUTE_STATIONS_R1_R13[1]);
});

test('module06 routing gate: initial scan-in accepts explicit route_code and echoes route metadata', { concurrency: false }, async () => {
  const bomId = await createApprovedBom();
  const { woId } = await createReadyWoFromBom(bomId, 'LOT-ROUTE-CODE');
  await promoteWoToRunning(woId);

  const startUnit = await apiRequest('POST', '/api/production/start-unit', 'TECH', users.tech, {
    wo_id: woId,
    sn: 'SN-ROUTE-CODE-0001',
  });
  assertSuccess(startUnit, 200, 'start unit for explicit route_code');

  const scanIn = await apiRequest('POST', '/api/routing/scan-in', 'TECH', users.tech, {
    woId,
    unit_sn: 'SN-ROUTE-CODE-0001',
    route_code: 'DEFAULT_PD_CHAIN_R1R13',
    station_name: ROUTE_STATIONS_R1_R13[0],
  });
  assertSuccess(scanIn, 200, 'scan-in with explicit route_code');
  assert.equal(scanIn.body.route_code, 'DEFAULT_PD_CHAIN_R1R13');
  assert.equal(scanIn.body.route_mode, 'FLEX');
  assert.equal(scanIn.body.current_step_order, 1);

  const scanOut = await apiRequest('POST', '/api/routing/scan-out', 'TECH', users.tech, {
    woId,
    unit_sn: 'SN-ROUTE-CODE-0001',
    route_code: 'DEFAULT_PD_CHAIN_R1R13',
    station_name: ROUTE_STATIONS_R1_R13[0],
    status: 'PASS',
  });
  assertSuccess(scanOut, 200, 'scan-out with explicit route_code');
  assert.equal(scanOut.body.route_code, 'DEFAULT_PD_CHAIN_R1R13');
  assert.equal(scanOut.body.next_station, ROUTE_STATIONS_R1_R13[1]);
});

test('module06 route admin flow: create, update, catalog, and delete unused route', { concurrency: false }, async () => {
  const suffix = `${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`.toUpperCase();
  const routeCode = `TEST_ROUTE_${suffix}`;

  const createRoute = await apiRequest('POST', '/api/mes/routes', 'PM', users.pm, {
    route_code: routeCode,
    route_name: `Test Route ${suffix}`,
    is_active: true,
    is_default: false,
    enforce_sequence: true,
    steps: [
      { step_order: 1, station_name: `T1_PREP_${suffix}`, station_type: 'PD', requires_fai: false, is_required: true, allow_rework: true },
      { step_order: 2, station_name: `T2_TEST_${suffix}`, station_type: 'QC', requires_fai: true, is_required: true, allow_rework: true },
    ],
  });
  assertSuccess(createRoute, 201, 'create route admin route');
  assert.equal(createRoute.body.route.route_code, routeCode);
  assert.equal(createRoute.body.route.enforce_sequence, true);
  assert.equal(createRoute.body.route.steps.length, 2);
  assert.equal(createRoute.body.route.steps[1].station_type, 'PD');

  const routeId = Number(createRoute.body.route.route_id);
  const catalog = await apiRequest('GET', `/api/mes/routes/catalog?route_code=${routeCode}`, 'PM', users.pm);
  assertSuccess(catalog, 200, 'catalog filtered by route_code');
  assert.equal(catalog.body.routes.length, 1);
  assert.equal(catalog.body.routes[0].route_code, routeCode);
  assert.equal(catalog.body.routes[0].steps[1].station_type, 'PD');

  const updateRoute = await apiRequest('PUT', `/api/mes/routes/${routeId}`, 'PM', users.pm, {
    route_code: routeCode,
    route_name: `Updated Route ${suffix}`,
    is_active: true,
    is_default: false,
    enforce_sequence: false,
    steps: [
      { step_order: 1, station_name: `T1_PREP_${suffix}`, station_type: 'PD', requires_fai: false, is_required: true, allow_rework: true },
      { step_order: 2, station_name: `T2_TEST_${suffix}`, station_type: 'QC', requires_fai: false, is_required: false, allow_rework: false },
      { step_order: 3, station_name: `T3_PACK_${suffix}`, station_type: 'PD', requires_fai: false, is_required: true, allow_rework: true },
    ],
  });
  assertSuccess(updateRoute, 200, 'update route admin route');
  assert.equal(updateRoute.body.route.route_name, `Updated Route ${suffix}`);
  assert.equal(updateRoute.body.route.enforce_sequence, false);
  assert.equal(updateRoute.body.route.steps.length, 3);
  assert.equal(updateRoute.body.route.steps[1].station_type, 'PD');
  assert.equal(updateRoute.body.route.steps[1].is_required, false);

  const deleteRoute = await apiRequest('DELETE', `/api/mes/routes/${routeId}`, 'PM', users.pm);
  assertSuccess(deleteRoute, 200, 'delete unused route');
  assert.equal(deleteRoute.body.deleted, true);
  assert.equal(deleteRoute.body.route_code, routeCode);
});

test('module06 route admin gate: delete is blocked once route has WIP history', { concurrency: false }, async () => {
  const suffix = `${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`.toUpperCase();
  const routeCode = `TRACE_ROUTE_${suffix}`;
  const stationOne = `TRACE_PREP_${suffix}`;
  const stationTwo = `TRACE_TEST_${suffix}`;

  const createRoute = await apiRequest('POST', '/api/mes/routes', 'PM', users.pm, {
    route_code: routeCode,
    route_name: `Trace Route ${suffix}`,
    is_active: true,
    is_default: false,
    enforce_sequence: true,
    steps: [
      { step_order: 1, station_name: stationOne, station_type: 'PD', requires_fai: false, is_required: true, allow_rework: true },
      { step_order: 2, station_name: stationTwo, station_type: 'QC', requires_fai: false, is_required: true, allow_rework: true },
    ],
  });
  assertSuccess(createRoute, 201, 'create trace route');
  const routeId = Number(createRoute.body.route.route_id);

  const bomId = await createApprovedBom();
  const { woId } = await createReadyWoFromBom(bomId, `LOT-${suffix}`);
  await promoteWoToRunning(woId);

  const unitSn = `SN-TRACE-${suffix}`;
  const startUnit = await apiRequest('POST', '/api/production/start-unit', 'TECH', users.tech, {
    wo_id: woId,
    sn: unitSn,
  });
  assertSuccess(startUnit, 200, 'start unit for trace route');

  const scanIn = await apiRequest('POST', '/api/routing/scan-in', 'TECH', users.tech, {
    woId,
    unit_sn: unitSn,
    route_code: routeCode,
    station_name: stationOne,
  });
  assertSuccess(scanIn, 200, 'scan-in trace route');

  const scanOut = await apiRequest('POST', '/api/routing/scan-out', 'TECH', users.tech, {
    woId,
    unit_sn: unitSn,
    route_code: routeCode,
    station_name: stationOne,
    status: 'PASS',
  });
  assertSuccess(scanOut, 200, 'scan-out trace route');

  const blockedDelete = await apiRequest('DELETE', `/api/mes/routes/${routeId}`, 'PM', users.pm);
  assert.equal(blockedDelete.status, 409);
  assert.equal(blockedDelete.body.code, 'ROUTE_DELETE_BLOCKED');
  assert.ok(Number(blockedDelete.body.usage.tracking_count) >= 1);
  assert.ok(Number(blockedDelete.body.usage.event_count) >= 1);

  const deactivateRoute = await apiRequest('PUT', `/api/mes/routes/${routeId}`, 'PM', users.pm, {
    route_code: routeCode,
    route_name: `Trace Route ${suffix}`,
    is_active: false,
    is_default: false,
    enforce_sequence: true,
    steps: [
      { step_order: 1, station_name: stationOne, station_type: 'PD', requires_fai: false, is_required: true, allow_rework: true },
      { step_order: 2, station_name: stationTwo, station_type: 'QC', requires_fai: false, is_required: true, allow_rework: true },
    ],
  });
  assertSuccess(deactivateRoute, 200, 'deactivate route with trace history');
  assert.equal(deactivateRoute.body.route.is_active, false);
});

test('module06 routing flow: FAIL enforces rework, then final PASS increments qty_good once', { concurrency: false }, async () => {
  const bomId = await createApprovedBom();
  const { woId } = await createReadyWoFromBom(bomId, 'LOT-ROUTE-REWORK');
  await promoteWoToRunning(woId);

  const startUnit = await apiRequest('POST', '/api/production/start-unit', 'TECH', users.tech, {
    wo_id: woId,
    sn: 'SN-ROUTE-REWORK-0001',
  });
  assertSuccess(startUnit, 200, 'start unit for routing rework flow');

  const smtIn = await apiRequest('POST', '/api/routing/scan-in', 'TECH', users.tech, {
    woId,
    unit_sn: 'SN-ROUTE-REWORK-0001',
    station_name: ROUTE_STATIONS_R1_R13[0],
  });
  assertSuccess(smtIn, 200, 'scan-in R1 (rework flow)');

  const smtOut = await apiRequest('POST', '/api/routing/scan-out', 'TECH', users.tech, {
    woId,
    unit_sn: 'SN-ROUTE-REWORK-0001',
    station_name: ROUTE_STATIONS_R1_R13[0],
    status: 'PASS',
  });
  assertSuccess(smtOut, 200, 'scan-out R1 PASS (rework flow)');

  const thuIn = await apiRequest('POST', '/api/routing/scan-in', 'TECH', users.tech, {
    woId,
    unit_sn: 'SN-ROUTE-REWORK-0001',
    station_name: ROUTE_STATIONS_R1_R13[1],
  });
  assertSuccess(thuIn, 200, 'scan-in THU_INSERT');

  const thuFail = await apiRequest('POST', '/api/routing/scan-out', 'TECH', users.tech, {
    woId,
    unit_sn: 'SN-ROUTE-REWORK-0001',
    station_name: ROUTE_STATIONS_R1_R13[1],
    status: 'FAIL',
  });
  assertSuccess(thuFail, 200, 'scan-out THU_INSERT FAIL');
  assert.equal(thuFail.body.state, 'REWORK_REQUIRED');

  const blockedNoRepair = await apiRequest('POST', '/api/routing/scan-in', 'TECH', users.tech, {
    woId,
    unit_sn: 'SN-ROUTE-REWORK-0001',
    station_name: ROUTE_STATIONS_R1_R13[1],
  });
  assert.equal(blockedNoRepair.status, 409);
  assert.equal(blockedNoRepair.body.code, 'ROUTING_SCAN_IN_BLOCKED');

  const repair = await apiRequest('POST', '/api/rework/repair', 'QC', users.qc, {
    unit_sn: 'SN-ROUTE-REWORK-0001',
  });
  assertSuccess(repair, 200, 'rework repair for routing flow');

  const thuInRepaired = await apiRequest('POST', '/api/routing/scan-in', 'TECH', users.tech, {
    woId,
    unit_sn: 'SN-ROUTE-REWORK-0001',
    station_name: ROUTE_STATIONS_R1_R13[1],
  });
  assertSuccess(thuInRepaired, 200, 'scan-in THU_INSERT after repair');

  const thuOutPass = await apiRequest('POST', '/api/routing/scan-out', 'TECH', users.tech, {
    woId,
    unit_sn: 'SN-ROUTE-REWORK-0001',
    station_name: ROUTE_STATIONS_R1_R13[1],
    status: 'PASS',
  });
  assertSuccess(thuOutPass, 200, 'scan-out THU_INSERT PASS after repair');

  let lastOut = thuOutPass;
  for (let idx = 2; idx < ROUTE_STATIONS_R1_R13.length; idx += 1) {
    const stationName = ROUTE_STATIONS_R1_R13[idx];
    const inResp = await apiRequest('POST', '/api/routing/scan-in', 'TECH', users.tech, {
      woId,
      unit_sn: 'SN-ROUTE-REWORK-0001',
      station_name: stationName,
    });
    assertSuccess(inResp, 200, `scan-in ${stationName}`);

    lastOut = await apiRequest('POST', '/api/routing/scan-out', 'TECH', users.tech, {
      woId,
      unit_sn: 'SN-ROUTE-REWORK-0001',
      station_name: stationName,
      status: 'PASS',
    });
    assertSuccess(lastOut, 200, `scan-out ${stationName} PASS`);
  }

  assert.equal(lastOut.body.state, 'COMPLETED');
  assert.equal(lastOut.body.completed, true);
  assert.equal(lastOut.body.next_station, null);

  const woResult = await pool.query(
    `SELECT qty_started, qty_good
     FROM work_orders
     WHERE id = $1`,
    [woId]
  );
  assert.equal(woResult.rows.length, 1);
  assert.equal(Number(woResult.rows[0].qty_started), 1);
  assert.equal(Number(woResult.rows[0].qty_good), 1);
});

test('module05 gate: RUN_START is blocked until WO is RUNNING', { concurrency: false }, async () => {
  const bomId = await createApprovedBom();
  const { woId } = await createReadyWoFromBom(bomId, 'LOT-MOD05-RUNSTART');

  const runStartBlocked = await apiRequest('POST', '/api/machine/event', 'TECH', users.tech, {
    wo_id: woId,
    event_type: 'RUN_START',
  });
  assert.equal(runStartBlocked.status, 409);
  assert.equal(runStartBlocked.body.code, 'MACHINE_EVENT_BLOCKED');

  const setupStart = await apiRequest('POST', '/api/machine/event', 'TECH', users.tech, {
    wo_id: woId,
    event_type: 'SETUP_START',
  });
  assertSuccess(setupStart, 200, 'machine setup_start on READY WO');

  const setupEnd = await apiRequest('POST', '/api/machine/event', 'TECH', users.tech, {
    wo_id: woId,
    event_type: 'SETUP_END',
  });
  assertSuccess(setupEnd, 200, 'machine setup_end on READY WO');

  const pauseBlocked = await apiRequest('POST', '/api/machine/event', 'TECH', users.tech, {
    wo_id: woId,
    event_type: 'PAUSE',
  });
  assert.equal(pauseBlocked.status, 409);
  assert.equal(pauseBlocked.body.code, 'MACHINE_EVENT_BLOCKED');
});

test('module05 machine events: all event types are logged once on RUNNING WO', { concurrency: false }, async () => {
  const bomId = await createApprovedBom();
  const { woId } = await createReadyWoFromBom(bomId, 'LOT-MOD05-EVENTS');
  await promoteWoToRunning(woId);

  const allEventTypes = ['SETUP_START', 'SETUP_END', 'RUN_START', 'PAUSE', 'RESUME', 'STOP'];
  for (const eventType of allEventTypes) {
    const response = await apiRequest('POST', '/api/machine/event', 'TECH', users.tech, {
      wo_id: woId,
      event_type: eventType,
    });
    assertSuccess(response, 200, `machine event ${eventType}`);
  }

  const eventResult = await pool.query(
    `SELECT event_type, COUNT(*)::int AS total
     FROM machine_events
     WHERE wo_id=$1
     GROUP BY event_type`,
    [woId]
  );
  const eventCountByType = Object.fromEntries(eventResult.rows.map((row) => [row.event_type, Number(row.total)]));
  for (const eventType of allEventTypes) {
    assert.equal(eventCountByType[eventType], 1, `${eventType} should be logged exactly once`);
  }
});

test('module09 gate: close endpoint is idempotent on repeated calls', { concurrency: false }, async () => {
  const bomId = await createApprovedBom();
  const { woId } = await createReadyWoFromBom(bomId, 'LOT-MOD09-IDEMPOTENT');

  const firstClose = await apiRequest('POST', '/api/wo/close', 'PM', users.pm, {
    wo_id: woId,
  });
  assertSuccess(firstClose, 200, 'first close request by pm');
  assert.equal(firstClose.body.already_closed, false);
  assert.equal(firstClose.body.close_pending, true);
  assert.equal(firstClose.body.close_completed, false);

  const secondClose = await apiRequest('POST', '/api/wo/close', 'PM', users.pm, {
    wo_id: woId,
  });
  assertSuccess(secondClose, 200, 'second close request by pm');
  assert.equal(secondClose.body.already_closed, false);
  assert.equal(secondClose.body.close_pending, true);
  assert.equal(secondClose.body.close_completed, false);
  assert.equal(secondClose.body.already_approved_by_role, true);

  const closeByPd = await apiRequest('POST', '/api/wo/close', 'PD', users.pd, {
    wo_id: woId,
  });
  assertSuccess(closeByPd, 200, 'close request by pd');
  assert.equal(closeByPd.body.close_completed, true);
  assert.equal(closeByPd.body.already_closed, false);
  assert.equal(closeByPd.body.wo.status, 'CLOSED');
  const closedAtFirst = new Date(closeByPd.body.wo.closed_at).toISOString();
  const yieldFirst = Number(closeByPd.body.wo.yield_pct);

  const closeByPdAgain = await apiRequest('POST', '/api/wo/close', 'PD', users.pd, {
    wo_id: woId,
  });
  assertSuccess(closeByPdAgain, 200, 'close request by pd again');
  assert.equal(closeByPdAgain.body.already_closed, true);
  assert.equal(closeByPdAgain.body.close_completed, false);
  assert.equal(closeByPdAgain.body.close_pending, false);
  assert.equal(closeByPdAgain.body.wo.status, 'CLOSED');
  assert.equal(new Date(closeByPdAgain.body.wo.closed_at).toISOString(), closedAtFirst);
  assert.equal(Number(closeByPdAgain.body.wo.yield_pct), yieldFirst);

  const secondCloseFinal = await apiRequest('POST', '/api/wo/close', 'PM', users.pm, {
    wo_id: woId,
  });
  assertSuccess(secondCloseFinal, 200, 'pm close after closed');
  assert.equal(secondCloseFinal.body.already_closed, true);
  assert.equal(secondCloseFinal.body.wo.status, 'CLOSED');
  assert.equal(new Date(secondCloseFinal.body.wo.closed_at).toISOString(), closedAtFirst);
  assert.equal(Number(secondCloseFinal.body.wo.yield_pct), yieldFirst);

  const woResult = await pool.query(
    `SELECT status, closed_at, yield_pct
     FROM work_orders
     WHERE id=$1`,
    [woId]
  );
  assert.equal(woResult.rows.length, 1);
  assert.equal(woResult.rows[0].status, 'CLOSED');
  assert.equal(new Date(woResult.rows[0].closed_at).toISOString(), closedAtFirst);
  assert.equal(Number(woResult.rows[0].yield_pct), yieldFirst);
});

test('module09 flow: store delivery prepare and dispatch after WO close', { concurrency: false }, async () => {
  const bomId = await createApprovedBom();
  const { woId } = await createReadyWoFromBom(bomId, 'LOT-MOD09-DELIVERY');

  const closePm = await apiRequest('POST', '/api/wo/close', 'PM', users.pm, { wo_id: woId });
  assertSuccess(closePm, 200, 'delivery flow close by pm');
  assert.equal(closePm.body.close_pending, true);

  const closePd = await apiRequest('POST', '/api/wo/close', 'PD', users.pd, { wo_id: woId });
  assertSuccess(closePd, 200, 'delivery flow close by pd');
  assert.equal(closePd.body.close_completed, true);
  assert.equal(closePd.body.wo.status, 'CLOSED');

  const prepare = await apiRequest('POST', '/api/store/delivery/prepare', 'STORE', users.store, {
    wo_id: woId,
    note: 'prepare delivery e2e',
  });
  assertSuccess(prepare, 200, 'delivery prepare');
  assert.equal(prepare.body.delivery.status, 'PREPARED');

  const deliveryStatusPrepared = await apiRequest('GET', `/api/store/delivery/${woId}`, 'STORE', users.store);
  assertSuccess(deliveryStatusPrepared, 200, 'delivery status prepared');
  assert.equal(deliveryStatusPrepared.body.delivery.status, 'PREPARED');

  const dispatch = await apiRequest('POST', '/api/store/delivery/dispatch', 'STORE', users.store, {
    wo_id: woId,
    note: 'dispatch delivery e2e',
  });
  assertSuccess(dispatch, 200, 'delivery dispatch');
  assert.equal(dispatch.body.already_dispatched, false);
  assert.equal(dispatch.body.delivery.status, 'DISPATCHED');

  const dispatchAgain = await apiRequest('POST', '/api/store/delivery/dispatch', 'STORE', users.store, {
    wo_id: woId,
  });
  assertSuccess(dispatchAgain, 200, 'delivery dispatch again');
  assert.equal(dispatchAgain.body.already_dispatched, true);
  assert.equal(dispatchAgain.body.delivery.status, 'DISPATCHED');
});

test('module10 notification flow: inbox + ack includes qa/store/account notices', { concurrency: false }, async () => {
  const bomId = await createApprovedBom();
  const { woId, uid } = await createReadyWoFromBom(bomId, 'LOT-NOTIFY-AUTO');

  const closePm = await apiRequest('POST', '/api/wo/close', 'PM', users.pm, {
    wo_id: woId,
  });
  assertSuccess(closePm, 200, 'close wo pm approval for notification flow');
  assert.equal(closePm.body.close_pending, true);

  const closePd = await apiRequest('POST', '/api/wo/close', 'PD', users.pd, {
    wo_id: woId,
  });
  assertSuccess(closePd, 200, 'close wo pd approval for notification flow');
  assert.equal(closePd.body.close_completed, true);
  assert.equal(closePd.body.wo.status, 'CLOSED');

  const storeInbox = await apiRequest('GET', '/api/notifications/inbox?status=NEW&limit=120', 'STORE', users.store);
  assertSuccess(storeInbox, 200, 'store notification inbox');
  assert.ok(Array.isArray(storeInbox.body.notices));
  const uidApprovedForStore = storeInbox.body.notices.find(
    (item) => item.notice_type === 'UID_QA_APPROVED' && item.uid === uid
  );
  assert.ok(uidApprovedForStore, 'store should receive UID_QA_APPROVED notice');

  const woClosedForStore = storeInbox.body.notices.find(
    (item) => item.notice_type === 'WO_CLOSED' && Number(item.wo_id) === woId
  );
  assert.ok(woClosedForStore, 'store should receive WO_CLOSED notice');

  const qcInbox = await apiRequest('GET', '/api/notifications/inbox?status=NEW&limit=120', 'QC', users.qc);
  assertSuccess(qcInbox, 200, 'qc notification inbox');
  const storeIssueForQc = qcInbox.body.notices.find(
    (item) => item.notice_type === 'STORE_ISSUE_COMPLETED' && Number(item.wo_id) === woId
  );
  assert.ok(storeIssueForQc, 'qc should receive STORE_ISSUE_COMPLETED notice');

  const pmAccountInbox = await apiRequest('GET', '/api/notifications/inbox?audience=ACCOUNT&status=NEW&limit=120', 'PM', users.pm);
  assertSuccess(pmAccountInbox, 200, 'pm account notification inbox');
  const woClosedForAccount = pmAccountInbox.body.notices.find(
    (item) => item.notice_type === 'WO_CLOSED' && Number(item.wo_id) === woId
  );
  assert.ok(woClosedForAccount, 'pm(account scope) should receive WO_CLOSED notice');

  const ackStore = await apiRequest('POST', `/api/notifications/${woClosedForStore.id}/ack`, 'STORE', users.store);
  assertSuccess(ackStore, 200, 'ack store wo_closed notice');
  assert.equal(ackStore.body.already_ack, false);
  assert.equal(ackStore.body.notice.status, 'ACK');

  const ackStoreAgain = await apiRequest('POST', `/api/notifications/${woClosedForStore.id}/ack`, 'STORE', users.store);
  assertSuccess(ackStoreAgain, 200, 'ack store wo_closed notice again');
  assert.equal(ackStoreAgain.body.already_ack, true);
  assert.equal(ackStoreAgain.body.notice.status, 'ACK');

  const qaAckStoreNotice = await apiRequest('POST', `/api/notifications/${woClosedForStore.id}/ack`, 'QA', users.qa);
  assert.equal(qaAckStoreNotice.status, 404);
  assert.equal(qaAckStoreNotice.body.code, 'NOTICE_NOT_FOUND');
});

test('module10 notification gate: publish endpoint validates audience scope and payload', { concurrency: false }, async () => {
  const manualTitle = `Manual STORE check ${Date.now()}`;
  const publish = await apiRequest('POST', '/api/notifications/publish', 'QA', users.qa, {
    audience_key: 'STORE',
    severity: 'WARN',
    notice_type: 'MANUAL_QA_ALERT',
    title: manualTitle,
    message: 'Run count + stock reconciliation before next shift.',
    metadata: { source: 'e2e', category: 'manual_notice' },
  });
  assertSuccess(publish, 201, 'publish manual notification');
  assert.equal(publish.body.notice.audience_key, 'STORE');
  assert.equal(publish.body.notice.notice_type, 'MANUAL_QA_ALERT');
  assert.equal(publish.body.notice.severity, 'WARN');

  const storeInbox = await apiRequest('GET', '/api/notifications/inbox?status=ALL&limit=120', 'STORE', users.store);
  assertSuccess(storeInbox, 200, 'store inbox after manual publish');
  const manualNotice = storeInbox.body.notices.find((item) => Number(item.id) === Number(publish.body.notice.id));
  assert.ok(manualNotice, 'store inbox should include published manual notification');
  assert.equal(manualNotice.title, manualTitle);

  const techForbiddenAccount = await apiRequest('GET', '/api/notifications/inbox?audience=ACCOUNT', 'TECH', users.tech);
  assert.equal(techForbiddenAccount.status, 403);
  assert.equal(techForbiddenAccount.body.code, 'FORBIDDEN_AUDIENCE');

  const invalidAudience = await apiRequest('POST', '/api/notifications/publish', 'QA', users.qa, {
    audience_key: 'UNKNOWN_ROLE',
    title: 'Bad audience',
  });
  assert.equal(invalidAudience.status, 400);
  assert.equal(invalidAudience.body.code, 'VALIDATION_ERROR');
});

test('ops gate: mes health/readiness/metrics endpoints are available', { concurrency: false }, async () => {
  const health = await apiRequest('GET', '/api/mes/health', 'PM', users.pm);
  assertSuccess(health, 200, 'mes health endpoint');
  assert.equal(health.body.status, 'ok');
  assert.equal(health.body.database, 'reachable');

  const ready = await apiRequest('GET', '/api/mes/ready', 'PM', users.pm);
  assertSuccess(ready, 200, 'mes ready endpoint');
  assert.equal(ready.body.status, 'ready');
  assert.equal(ready.body.checks.database.ready, true);
  assert.equal(ready.body.checks.mes_env.ready, true);
  assert.equal(ready.body.checks.separation_guard.ready, true);
  assert.equal(ready.body.checks.auth.ready, true);
  assert.equal(ready.body.checks.auth.mode, 'hybrid');
  assert.equal(ready.body.checks.auth.mode_guard.ready, true);
  assert.equal(typeof ready.body.checks.auth.session_policy.max_concurrent_sessions, 'number');
  assert.equal(typeof ready.body.checks.auth.session_policy.inactivity_sec, 'number');
  assert.ok(ready.body.checks.auth.session_policy.max_concurrent_sessions >= 1);
  assert.ok(ready.body.checks.auth.session_policy.inactivity_sec >= 60);

  const metrics = await apiRequest('GET', '/api/mes/metrics', 'PM', users.pm);
  assertSuccess(metrics, 200, 'mes metrics endpoint');
  assert.equal(metrics.body.status, 'ok');
  assert.equal(typeof metrics.body.metrics.uptime_sec, 'number');
  assert.equal(typeof metrics.body.metrics.requests_total, 'number');
  assert.equal(typeof metrics.body.metrics.requests_2xx, 'number');
  assert.equal(typeof metrics.body.metrics.requests_4xx, 'number');
  assert.equal(typeof metrics.body.metrics.requests_5xx, 'number');
  assert.equal(metrics.body.metrics.auth_mode, 'hybrid');
  assert.equal(typeof metrics.body.metrics.session_policy.max_concurrent_sessions, 'number');
  assert.equal(typeof metrics.body.metrics.session_policy.inactivity_sec, 'number');
  assert.equal(
    metrics.body.metrics.session_policy.max_concurrent_sessions,
    ready.body.checks.auth.session_policy.max_concurrent_sessions
  );
  assert.equal(
    metrics.body.metrics.session_policy.inactivity_sec,
    ready.body.checks.auth.session_policy.inactivity_sec
  );

  const monitor = await apiRequest('GET', '/api/mes/stations/monitor?lookback_hours=24', 'PM', users.pm);
  assertSuccess(monitor, 200, 'station monitor endpoint');
  assert.equal(monitor.body.status, 'ok');
  assert.equal(Number(monitor.body.lookback_hours), 24);
  assert.equal(Array.isArray(monitor.body.routes), true);
  assert.equal(Array.isArray(monitor.body.stations), true);
  assert.ok(monitor.body.routes.length >= 1);
  assert.ok(monitor.body.stations.length >= 7);
  assert.equal(typeof monitor.body.summary.routes_total, 'number');
  assert.equal(typeof monitor.body.summary.stations_total, 'number');
  assert.equal(typeof monitor.body.summary.scan_out_fail_count_window, 'number');
  assert.equal(typeof monitor.body.summary.units_rework_required, 'number');
  assert.equal(monitor.body.summary.stations_total, monitor.body.stations.length);
  assert.equal(typeof monitor.body.stations[0].route_code, 'string');
  assert.equal(typeof monitor.body.stations[0].step_order, 'number');
  assert.equal(typeof monitor.body.stations[0].units_in_station, 'number');
  assert.equal(typeof monitor.body.stations[0].scan_in_count, 'number');

  const routeCatalog = await apiRequest('GET', '/api/mes/routes/catalog', 'PM', users.pm);
  assertSuccess(routeCatalog, 200, 'route catalog endpoint');
  assert.equal(routeCatalog.body.status, 'ok');
  assert.equal(routeCatalog.body.default_route_code, 'DEFAULT_PD_CHAIN_R1R13');
  assert.equal(Array.isArray(routeCatalog.body.routes), true);
  assert.ok(routeCatalog.body.routes.length >= 1);
  assert.equal(routeCatalog.body.routes[0].route_code, 'DEFAULT_PD_CHAIN_R1R13');
  assert.equal(Array.isArray(routeCatalog.body.routes[0].steps), true);
  assert.ok(routeCatalog.body.routes[0].steps.length >= 7);
  assert.equal(routeCatalog.body.routes[0].steps[0].station_name, ROUTE_STATIONS_R1_R13[0]);
  assert.equal(typeof routeCatalog.body.routes[0].steps[0].normalized_station_name, 'string');
});

test('auth gate: jwt login/refresh/logout flow works in hybrid mode', { concurrency: false }, async () => {
  const login = await apiRequestWithHeaders('POST', '/api/mes/auth/login', {}, {
    username: 'pm_e2e',
    password: E2E_USER_PASSWORD,
  });
  assertSuccess(login, 201, 'auth login');
  assert.equal(login.body.status, 'success');
  assert.equal(login.body.user.username, 'pm_e2e');
  assert.equal(login.body.user.role, 'PM');
  assert.equal(typeof login.body.access_token, 'string');
  assert.equal(typeof login.body.refresh_token, 'string');
  assert.ok(login.body.access_token.length > 20);
  assert.ok(login.body.refresh_token.length > 20);

  const me = await apiRequestWithHeaders('GET', '/api/mes/auth/me', {
    Authorization: `Bearer ${login.body.access_token}`,
  });
  assertSuccess(me, 200, 'auth me with access token');
  assert.equal(me.body.user.username, 'pm_e2e');
  assert.equal(me.body.auth.mode, 'hybrid');
  assert.equal(me.body.auth.source, 'bearer');
  assert.equal(Number(me.body.auth.session_id), Number(login.body.session_id));

  const refreshed = await apiRequestWithHeaders('POST', '/api/mes/auth/refresh', {}, {
    refresh_token: login.body.refresh_token,
  });
  assertSuccess(refreshed, 200, 'auth refresh');
  assert.equal(refreshed.body.user.username, 'pm_e2e');
  assert.equal(Number(refreshed.body.session_id), Number(login.body.session_id));
  assert.notEqual(refreshed.body.access_token, login.body.access_token);
  assert.notEqual(refreshed.body.refresh_token, login.body.refresh_token);

  const logout = await apiRequestWithHeaders('POST', '/api/mes/auth/logout', {
    Authorization: `Bearer ${refreshed.body.access_token}`,
  });
  assertSuccess(logout, 200, 'auth logout');
  assert.equal(Number(logout.body.session_id), Number(login.body.session_id));
  assert.equal(logout.body.already_logged_out, false);

  const meAfterLogout = await apiRequestWithHeaders('GET', '/api/mes/auth/me', {
    Authorization: `Bearer ${refreshed.body.access_token}`,
  });
  assert.equal(meAfterLogout.status, 401);
  assert.equal(meAfterLogout.body.code, 'AUTH_REQUIRED');
});

test('auth gate: invalid bearer token is rejected even when header role is present', { concurrency: false }, async () => {
  const blocked = await apiRequestWithHeaders('POST', '/api/planning/pre-wo', {
    Authorization: 'Bearer invalid.token.payload',
    'X-User-Role': 'PM',
    'X-User-Id': String(users.pm),
  }, {
    part_no: '1E2ASRES0001',
    qty_target: 1,
  });
  assert.equal(blocked.status, 401);
  assert.equal(blocked.body.code, 'AUTH_REQUIRED');

  const fallbackHeader = await apiRequest('POST', '/api/planning/pre-wo', 'PM', users.pm, {
    part_no: '1E2ASRES0001',
    qty_target: 1,
    demand_plan_ref: 'DP-TEST-AUTH',
  });
  assertSuccess(fallbackHeader, 201, 'header fallback in hybrid mode');
});

test('auth gate: refresh replay is blocked and session gets revoked', { concurrency: false }, async () => {
  const login = await apiRequestWithHeaders('POST', '/api/mes/auth/login', {}, {
    username: 'pm_e2e',
    password: E2E_USER_PASSWORD,
  });
  assertSuccess(login, 201, 'auth login for refresh replay');

  const firstRefresh = await apiRequestWithHeaders('POST', '/api/mes/auth/refresh', {}, {
    refresh_token: login.body.refresh_token,
  });
  assertSuccess(firstRefresh, 200, 'first refresh');

  const replayOldRefresh = await apiRequestWithHeaders('POST', '/api/mes/auth/refresh', {}, {
    refresh_token: login.body.refresh_token,
  });
  assert.equal(replayOldRefresh.status, 401);
  assert.equal(replayOldRefresh.body.code, 'AUTH_REFRESH_FAILED');

  const refreshAfterRevoked = await apiRequestWithHeaders('POST', '/api/mes/auth/refresh', {}, {
    refresh_token: firstRefresh.body.refresh_token,
  });
  assert.equal(refreshAfterRevoked.status, 401);
  assert.equal(refreshAfterRevoked.body.code, 'AUTH_REFRESH_FAILED');

  const meWithRevokedSession = await apiRequestWithHeaders('GET', '/api/mes/auth/me', {
    Authorization: `Bearer ${firstRefresh.body.access_token}`,
  });
  assert.equal(meWithRevokedSession.status, 401);
  assert.equal(meWithRevokedSession.body.code, 'AUTH_REQUIRED');
});

test('auth policy gate: login enforces max concurrent sessions', { concurrency: false }, async () => {
  await pool.query(
    `UPDATE mes_sessions
     SET status='REVOKED',
         revoked_at=NOW(),
         revoked_reason='e2e_test_reset'
     WHERE user_id=$1
       AND status='ACTIVE'`,
    [users.pm]
  );

  const ready = await apiRequest('GET', '/api/mes/ready', 'PM', users.pm);
  assertSuccess(ready, 200, 'mes ready endpoint for session policy');
  const maxConcurrent = Number(ready.body.checks.auth.session_policy.max_concurrent_sessions || 1);
  assert.ok(Number.isInteger(maxConcurrent));
  assert.ok(maxConcurrent >= 1);

  const loginResults = [];
  for (let idx = 0; idx < maxConcurrent + 1; idx += 1) {
    const login = await apiRequestWithHeaders('POST', '/api/mes/auth/login', {}, {
      username: 'pm_e2e',
      password: E2E_USER_PASSWORD,
    });
    assertSuccess(login, 201, `auth login for max concurrent policy #${idx + 1}`);
    loginResults.push(login.body);
  }

  const sessionIds = loginResults.map((item) => Number(item.session_id));
  const sessionRows = await pool.query(
    `SELECT id, status, revoked_reason
     FROM mes_sessions
     WHERE user_id=$1
       AND id = ANY($2::bigint[])
     ORDER BY id ASC`,
    [users.pm, sessionIds]
  );
  assert.equal(sessionRows.rows.length, maxConcurrent + 1);

  const activeCount = sessionRows.rows.filter((row) => row.status === 'ACTIVE').length;
  const revokedByPolicy = sessionRows.rows.filter(
    (row) => row.status === 'REVOKED' && row.revoked_reason === 'max_concurrent_sessions'
  ).length;
  assert.equal(activeCount, maxConcurrent);
  assert.equal(revokedByPolicy, 1);

  const oldestSessionMe = await apiRequestWithHeaders('GET', '/api/mes/auth/me', {
    Authorization: `Bearer ${loginResults[0].access_token}`,
  });
  assert.equal(oldestSessionMe.status, 401);
  assert.equal(oldestSessionMe.body.code, 'AUTH_REQUIRED');

  const newestSessionMe = await apiRequestWithHeaders('GET', '/api/mes/auth/me', {
    Authorization: `Bearer ${loginResults[loginResults.length - 1].access_token}`,
  });
  assertSuccess(newestSessionMe, 200, 'auth me with latest active session');
  assert.equal(
    Number(newestSessionMe.body.auth.session_id),
    Number(loginResults[loginResults.length - 1].session_id)
  );
});

test('auth policy gate: inactive session is expired on access token usage', { concurrency: false }, async () => {
  const login = await apiRequestWithHeaders('POST', '/api/mes/auth/login', {}, {
    username: 'pm_e2e',
    password: E2E_USER_PASSWORD,
  });
  assertSuccess(login, 201, 'auth login for inactivity timeout policy');

  const ready = await apiRequest('GET', '/api/mes/ready', 'PM', users.pm);
  assertSuccess(ready, 200, 'mes ready endpoint for inactivity policy');
  const inactivitySec = Number(ready.body.checks.auth.session_policy.inactivity_sec || 1800);
  assert.ok(Number.isInteger(inactivitySec));
  assert.ok(inactivitySec >= 60);

  await pool.query(
    `UPDATE mes_sessions
     SET last_seen_at = NOW() - make_interval(secs => $2::int)
     WHERE id = $1`,
    [Number(login.body.session_id), inactivitySec + 120]
  );

  const me = await apiRequestWithHeaders('GET', '/api/mes/auth/me', {
    Authorization: `Bearer ${login.body.access_token}`,
  });
  assert.equal(me.status, 401);
  assert.equal(me.body.code, 'AUTH_REQUIRED');

  const sessionState = await pool.query(
    `SELECT status, revoked_reason
     FROM mes_sessions
     WHERE id=$1`,
    [Number(login.body.session_id)]
  );
  assert.equal(sessionState.rows.length, 1);
  assert.equal(sessionState.rows[0].status, 'EXPIRED');
  assert.equal(sessionState.rows[0].revoked_reason, 'inactivity_timeout');
});

test('auth gate: expired bearer token is rejected in hybrid mode (no header fallback)', { concurrency: false }, async () => {
  const now = Math.floor(Date.now() / 1000);
  const expiredAccessToken = signTestJwt({
    iss: String(process.env.MES_JWT_ISSUER || 'syntech-mes-backbone'),
    sub: String(users.pm),
    role: 'PM',
    username: 'pm_e2e',
    sid: 999999,
    typ: 'access',
    jti: `expired-${Date.now()}`,
    iat: now - 3600,
    exp: now - 30,
  });

  const blocked = await apiRequestWithHeaders('POST', '/api/planning/pre-wo', {
    Authorization: `Bearer ${expiredAccessToken}`,
    'X-User-Role': 'PM',
    'X-User-Id': String(users.pm),
  }, {
    part_no: '1E2ASRES0001',
    qty_target: 1,
  });
  assert.equal(blocked.status, 401);
  assert.equal(blocked.body.code, 'AUTH_REQUIRED');
});

test('auth mode gate: jwt mode rejects header-only access on protected endpoint', { concurrency: false }, async () => {
  const jwtPort = TEST_PORT + 301;
  const originalMode = process.env.MES_AUTH_MODE;
  const originalPort = process.env.APP_PORT;
  let jwtServer = null;

  const serverModulePath = require.resolve('../server');
  const authModulePath = require.resolve('../common/auth');

  try {
    process.env.MES_AUTH_MODE = 'jwt';
    process.env.APP_PORT = String(jwtPort);

    delete require.cache[serverModulePath];
    delete require.cache[authModulePath];

    const { startServer: startJwtModeServer } = require('../server');
    jwtServer = startJwtModeServer('127.0.0.1', jwtPort);
    await new Promise((resolve) => jwtServer.on('listening', resolve));

    const response = await fetch(`http://127.0.0.1:${jwtPort}/api/planning/pre-wo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Role': 'PM',
        'X-User-Id': String(users.pm),
      },
      body: JSON.stringify({
        part_no: '1E2ASRES0001',
        qty_target: 1,
      }),
    });

    const text = await response.text();
    const body = text ? JSON.parse(text) : {};
    assert.equal(response.status, 401);
    assert.equal(body.code, 'AUTH_REQUIRED');
  } finally {
    if (jwtServer) {
      await new Promise((resolve, reject) => {
        jwtServer.close((error) => {
          if (error) return reject(error);
          return resolve();
        });
      });
    }

    process.env.MES_AUTH_MODE = originalMode;
    process.env.APP_PORT = originalPort;

    delete require.cache[serverModulePath];
    delete require.cache[authModulePath];
    require('../server');
  }
});
