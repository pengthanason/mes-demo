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

// ── เทส SCM (Module 12) ถอดออก 2026-07-31 ────────────────────────────────
// โมดูล 12_scm_cases ถอดออกจากรีโปตั้งแต่ b2d6fa0 (2026-07-27) — routes /api/scm/*
// ไม่มีอยู่แล้ว และ backend/schema.sql ก็ไม่มีตาราง scm_cases / scm_split_lots
// เทสเดิม 2 ตัว ('SCM QA Cases Flow', 'SCM Lots Split SOP') จึงต้อง fail แน่นอน
// เหตุผลที่ถอดโมดูล + วิธีกู้กลับ: ดู STATUS.md หัวข้อ "SCM Cases ถูกถอดออก (2026-07-27)"
// ถ้ากู้โมดูลกลับ ให้ revert b2d6fa0 แล้วเอาเทสจาก git history กลับมาด้วย
// ไฟล์นี้ยังชื่อ e2e.pm_scm เพราะ package.json อ้างอยู่ (test:pm-scm, test:all)
