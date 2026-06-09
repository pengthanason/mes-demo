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

const TEST_SCHEMA = `mes_e2e_pmscm_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
const TEST_PORT = Number(process.env.MES_TEST_PORT || (5800 + Math.floor(Math.random() * 200)));
const E2E_USER_PASSWORD = 'Syntech#123';
const E2E_PASSWORD_HASH = '$2a$10$GlK3N/1oJJmLFdYDwmkRqe7iEKz1SdyNH2TnCYg38gOoXkaSmV3HO';

process.env.DB_SCHEMA = TEST_SCHEMA;
process.env.APP_HOST = '127.0.0.1';
process.env.APP_PORT = String(TEST_PORT);
process.env.MES_AUTH_MODE = 'hybrid';
process.env.MES_JWT_SECRET = 'syntech_mes_jwt_secret_for_e2e_testing_1234567890';

const { startServer } = require('../server');
const { pool, withTransaction } = require('../db');

const schemaSql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
const schemaIdent = `"${TEST_SCHEMA.replace(/"/g, '""')}"`;
const baseUrl = `http://127.0.0.1:${TEST_PORT}`;

const adminPool = new Pool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || '15432'),
    database: process.env.DB_NAME || 'mes_dev',
    user: process.env.DB_USER || 'syntech_mes',
    password: process.env.DB_PASSWORD || 'syntech_mes_pw',
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

function assertSuccess(resp, expectedStatus, context) {
    assert.equal(
        resp.status,
        expectedStatus,
        `${context} expected HTTP ${expectedStatus} but got ${resp.status}: ${JSON.stringify(resp.body)}`
    );
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
         ('pm_e2e_m11', $1, 'PM'),
         ('store_e2e_m11', $1, 'STORE'),
         ('qa_e2e_m11', $1, 'QA'),
         ('pd_e2e_m11', $1, 'PD'),
         ('tech_e2e_m11', $1, 'TECH'),
         ('qc_e2e_m11', $1, 'QC')
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

test('PM Module Flow (Module 11) Happy Path', { concurrency: false }, async () => {
    const pmLeadId = `PROJECT-TEST-${Date.now()}`;

    // 1. Create Lead
    const createLead = await apiRequest('POST', '/api/pm/leads', 'PM', users.pm, {
        project_id: pmLeadId,
        customer: 'Test Customer',
        req_qty: 1000,
        due_date: new Date().toISOString(),
        scope_boundary: 'Initial PCB build'
    });
    assertSuccess(createLead, 201, 'create pm lead');
    assert.equal(createLead.body.lead.status, 'LEAD_RECEIVED');

    // 2. Pass G1
    const gateG1 = await apiRequest('PUT', `/api/pm/leads/${pmLeadId}/gate-g1`, 'PM', users.pm, {
        is_approved: true, reason: 'Specs provided'
    });
    assertSuccess(gateG1, 200, 'pass gate g1');
    assert.equal(gateG1.body.lead.status, 'FEASIBILITY');

    // 3. Pass G2
    const gateG2 = await apiRequest('PUT', `/api/pm/leads/${pmLeadId}/gate-g2`, 'PM', users.pm, {
        is_feasible: true, lead_time_days: 14, feasibility_notes: 'Looks good'
    });
    assertSuccess(gateG2, 200, 'pass gate g2');
    assert.equal(gateG2.body.lead.status, 'QUOTE_PACKAGE_BUILD');

    // 4. Log CR
    const crLog = await apiRequest('POST', '/api/pm/cr', 'PM', users.pm, {
        project_id: pmLeadId,
        description: 'Adding heat sink',
        impact_cost: 50.00,
        impact_time_days: 2
    });
    assertSuccess(crLog, 201, 'log cr');
    assert.equal(crLog.body.cr.project_id, pmLeadId);

    // 5. Trigger Hook H1
    const hookH1 = await apiRequest('POST', `/api/pm/leads/${pmLeadId}/hook-h1`, 'PM', users.pm, {
        bom_rev: 'v1',
        part_no: '1E2ASRES0001'
    });
    assertSuccess(hookH1, 200, 'trigger hook h1');
    assert.equal(hookH1.body.part_no, '1E2ASRES0001');

    const bomCheck = await pool.query(
        `SELECT bom_code, part_no, status
         FROM master_bom_header
         WHERE bom_code = $1`,
        [hookH1.body.bom_code]
    );
    assert.equal(bomCheck.rows.length, 1);
    assert.equal(String(bomCheck.rows[0].part_no || '').trim(), '1E2ASRES0001');
    assert.equal(bomCheck.rows[0].status, 'DRAFT');

    // 6. Pass G3
    const gateG3 = await apiRequest('PUT', `/api/pm/leads/${pmLeadId}/gate-g3`, 'PM', users.pm, {
        outcome: 'YES'
    });
    assertSuccess(gateG3, 200, 'pass gate g3');
    assert.equal(gateG3.body.lead.status, 'WON_YES_PO');
});

test('SCM QA Cases Flow (Module 12) Happy Path', { concurrency: false }, async () => {
    const scmCaseId = `CASE-TEST-${Date.now()}`;

    // 1. Open Case
    const openCase = await apiRequest('POST', '/api/scm/cases', 'QA', users.qa, {
        case_id: scmCaseId,
        case_type: 'DOC_PENDING',
        ref_po: 'PO-123',
        ref_inv: 'INV-456',
        part_no: 'TEST-RAW-001',
        due_date: new Date().toISOString()
    });
    assertSuccess(openCase, 201, 'open scm case');
    assert.equal(openCase.body.case.status, 'OPEN');

    // 2. Sub-action Disposition
    const disp = await apiRequest('POST', '/api/scm/dispositions', 'QA', users.qa, {
        case_id: scmCaseId,
        action: 'RTV',
        rma_no: 'RMA-999',
        return_qty: 500
    });
    assertSuccess(disp, 201, 'log disposition');
    assert.equal(disp.body.disposition.action, 'RTV');

    // 3. Resolve Case
    const resolveCase = await apiRequest('PUT', `/api/scm/cases/${scmCaseId}/resolve`, 'QA', users.qa, {
        resolution_note: 'Supplier sent invoice'
    });
    assertSuccess(resolveCase, 200, 'resolve scm case');
    assert.equal(resolveCase.body.case.status, 'CLOSED');
});

test('SCM Lots Split SOP (Module 12) Happy Path', { concurrency: false }, async () => {
    const originalUid = 'UID-010126-1111';
    const okUid = 'UID-010126-2222';
    const ngUid = 'UID-010126-3333';

    // Seed inventory for split
    await pool.query(
        `INSERT INTO inventory_uids (uid, part_no, qty_on_hand, status)
         VALUES ($1, 'TEST-RAW-002', 1000, 'PENDING')
         ON CONFLICT DO NOTHING`,
        [originalUid]
    );

    const split = await apiRequest('POST', '/api/scm/lots/split', 'QA', users.qa, {
        original_uid: originalUid,
        ok_uid: okUid,
        ng_uid: ngUid,
        ok_qty: 800,
        ng_qty: 200,
        reason: '200 units found defective during QA'
    });
    assertSuccess(split, 201, 'split lot sop');
    assert.equal(split.body.split.original_uid, originalUid);
    assert.equal(split.body.split.ok_uid, okUid);
    assert.equal(split.body.split.ng_uid, ngUid);
    assert.equal(Number(split.body.split.ok_qty), 800);
    assert.equal(Number(split.body.split.ng_qty), 200);

    // Verify DB states after split
    const origCheck = await pool.query('SELECT status, qty_on_hand FROM inventory_uids WHERE uid = $1', [originalUid]);
    assert.equal(origCheck.rows[0].status, 'SPLIT');
    assert.equal(Number(origCheck.rows[0].qty_on_hand), 0);

    const okCheck = await pool.query('SELECT status, qty_on_hand FROM inventory_uids WHERE uid = $1', [okUid]);
    assert.equal(okCheck.rows[0].status, 'APPROVED');
    assert.equal(Number(okCheck.rows[0].qty_on_hand), 800);

    const ngCheck = await pool.query('SELECT status, qty_on_hand FROM inventory_uids WHERE uid = $1', [ngUid]);
    assert.equal(ngCheck.rows[0].status, 'REJECTED');
    assert.equal(Number(ngCheck.rows[0].qty_on_hand), 200);

    const splitAgain = await apiRequest('POST', '/api/scm/lots/split', 'QA', users.qa, {
        original_uid: originalUid,
        ok_uid: 'UID-010126-4444',
        ng_uid: 'UID-010126-5555',
        ok_qty: 700,
        ng_qty: 300,
        reason: 'Should be blocked after first split'
    });
    assert.equal(splitAgain.status, 409);
    assert.equal(splitAgain.body.error, 'Original UID already split');
});
