// รันด้วย: node tests/routeGuards.test.js   (mock ../db ด้วย require.cache — ไม่ต้องมี Postgres จริง)
// ล็อกพฤติกรรมของ route-level guard ที่เพิ่มไปรอบล่าสุด — เดิมมีแค่ dateGuard.test.js ที่เทสต์
// pure function (badYear/firstBadYearError) เฉยๆ ไม่เคยเทสต์ว่า route จริงเรียกใช้มันถูกไหม
const assert = require('node:assert');
const { fakeDb, getHandler, makeReq, makeRes } = require('./testUtils');

let pass = 0;
function ok(name) { pass++; console.log(`  ✓ ${name}`); }

async function run() {
  // ── wo.js: POST /board — due_date ปีมั่วต้องโดนบล็อก 400, วันที่ปกติต้องผ่านไปถึง INSERT ──
  {
    let inserted = false;
    fakeDb(async (sql) => {
      if (/SELECT TO_CHAR/.test(sql)) return { rows: [{ yymm: '202608', next: 1 }] };
      if (/INSERT INTO work_orders/.test(sql)) { inserted = true; return { rows: [{ id: 1, wo_no: 'WO-202608-001' }] }; }
      return { rows: [] };
    });
    const wo = require('../routes/wo.js');
    const handler = getHandler(wo, 'post', '/board');

    const resBad = makeRes();
    await handler(makeReq({ product_name: 'X', qty: 10, due_date: '0001-04-11' }), resBad);
    assert.strictEqual(resBad.statusCode, 400, 'wo.js: absurd year due_date should 400');
    assert.match(resBad.body.message, /year must be between/, 'wo.js: error message should mention year range');
    assert.strictEqual(inserted, false, 'wo.js: must not reach INSERT for a bad due_date');
    ok('wo.js /board rejects due_date with absurd year (0001-04-11)');

    const resGood = makeRes();
    await handler(makeReq({ product_name: 'X', qty: 10, due_date: '2026-12-01' }), resGood);
    assert.strictEqual(resGood.statusCode, 201, 'wo.js: sane due_date should succeed');
    assert.strictEqual(inserted, true, 'wo.js: must reach INSERT for a sane due_date');
    ok('wo.js /board accepts a normal due_date and reaches INSERT');
  }
  delete require.cache[require.resolve('../routes/wo.js')];

  // ── rework.js: POST /repair — due_date ปีมั่วต้องโดนบล็อก 400 ──
  {
    let inserted = false;
    fakeDb(async (sql) => {
      if (/SELECT id, wo_id FROM qc_results/.test(sql)) return { rows: [{ id: 1, wo_id: 'WO-1' }] };
      if (/INSERT INTO rework_tickets/.test(sql)) { inserted = true; return { rows: [{ id: 1 }] }; }
      return { rows: [] };
    });
    const rework = require('../routes/rework.js');
    const handler = getHandler(rework, 'post', '/repair');

    const resBad = makeRes();
    await handler(makeReq({ qc_result_id: 1, defect_type: 'bad solder', due_date: '9999-01-01' }), resBad);
    assert.strictEqual(resBad.statusCode, 400, 'rework.js: absurd year due_date should 400');
    assert.match(resBad.body.message, /year must be between/, 'rework.js: error message should mention year range');
    assert.strictEqual(inserted, false, 'rework.js: must not reach INSERT for a bad due_date');
    ok('rework.js /repair rejects due_date with absurd year (9999-01-01)');

    const resGood = makeRes();
    await handler(makeReq({ qc_result_id: 1, defect_type: 'bad solder', due_date: '2026-12-01' }), resGood);
    assert.strictEqual(resGood.statusCode, 201, 'rework.js: sane due_date should succeed');
    assert.strictEqual(inserted, true, 'rework.js: must reach INSERT for a sane due_date');
    ok('rework.js /repair accepts a normal due_date and reaches INSERT');
  }
  delete require.cache[require.resolve('../routes/rework.js')];

  // ── productionPlan.js: POST /projects — qty ทศนิยมต้องโดนบล็อก, process_log[].date ปีมั่วต้องโดนบล็อก ──
  {
    let inserted = false;
    fakeDb(async (sql) => {
      if (/INSERT INTO pp_projects/.test(sql)) { inserted = true; return { rows: [{ id: 1 }] }; }
      return { rows: [] };
    });
    const pp = require('../routes/productionPlan.js');
    const handler = getHandler(pp, 'post', '/projects');

    const resDecimal = makeRes();
    await handler(makeReq({ model: 'M1', qty: 5.5 }), resDecimal);
    assert.strictEqual(resDecimal.statusCode, 400, 'productionPlan.js: decimal qty should 400');
    assert.match(resDecimal.body.message, /whole number/, 'productionPlan.js: error should say whole number');
    assert.strictEqual(inserted, false, 'productionPlan.js: must not reach INSERT for decimal qty');
    ok('productionPlan.js /projects rejects a decimal qty (5.5)');

    const resBadLogDate = makeRes();
    await handler(makeReq({ model: 'M1', process_log: [{ step: 'SMT', status: 'DONE', date: '0001-01-01' }] }), resBadLogDate);
    assert.strictEqual(resBadLogDate.statusCode, 400, 'productionPlan.js: process_log absurd year should 400');
    assert.match(resBadLogDate.body.message, /process_log date/, 'productionPlan.js: error should mention process_log date');
    assert.strictEqual(inserted, false, 'productionPlan.js: must not reach INSERT for a bad process_log date');
    ok('productionPlan.js /projects rejects process_log[].date with absurd year (0001-01-01)');

    const resGood = makeRes();
    await handler(makeReq({ model: 'M1', qty: 100, process_log: [{ step: 'SMT', status: 'DONE', date: '2026-05-01' }] }), resGood);
    assert.strictEqual(resGood.statusCode, 201, 'productionPlan.js: sane input should succeed');
    assert.strictEqual(inserted, true, 'productionPlan.js: must reach INSERT for sane input');
    ok('productionPlan.js /projects accepts a normal integer qty + process_log date and reaches INSERT');
  }
  delete require.cache[require.resolve('../routes/productionPlan.js')];

  // ── inventory.js: POST /receive — ทศนิยม/scientific notation ต้องโดนบล็อก, จำนวนเต็มปกติต้องผ่าน ──
  {
    let inserted = false;
    fakeDb(async (sql) => {
      if (/INSERT INTO inventory_lots/.test(sql)) { inserted = true; return { rows: [{ id: 1 }] }; }
      return { rows: [] };
    });
    const inventory = require('../routes/inventory.js');
    const handler = getHandler(inventory, 'post', '/receive');

    const resDecimal = makeRes();
    await handler(makeReq({ part_no: 'P1', lot_no: 'L1', qty: 5.5 }), resDecimal);
    assert.strictEqual(resDecimal.statusCode, 400, 'inventory.js: decimal qty should 400');
    assert.strictEqual(inserted, false, 'inventory.js: must not reach INSERT for decimal qty');
    ok('inventory.js /receive rejects a decimal qty (5.5)');

    const resSci = makeRes();
    await handler(makeReq({ part_no: 'P1', lot_no: 'L1', qty: 1e10 }), resSci);
    assert.strictEqual(resSci.statusCode, 400, 'inventory.js: qty exceeding int4 should 400');
    assert.strictEqual(inserted, false, 'inventory.js: must not reach INSERT for an int4-overflowing qty');
    ok('inventory.js /receive rejects qty exceeding int4 bounds (1e10)');

    const resGood = makeRes();
    await handler(makeReq({ part_no: 'P1', lot_no: 'L1', qty: 100 }), resGood);
    assert.strictEqual(resGood.statusCode, 201, 'inventory.js: sane integer qty should succeed');
    assert.strictEqual(inserted, true, 'inventory.js: must reach INSERT for a sane integer qty');
    ok('inventory.js /receive accepts a normal integer qty and reaches INSERT');
  }
  delete require.cache[require.resolve('../routes/inventory.js')];

  console.log(`✅ routeGuards: ผ่าน ${pass} เคส (wo.js, rework.js, productionPlan.js, inventory.js — route-level, mock DB ไม่แตะ Postgres จริง)`);
}

run().catch((e) => { console.error(e); process.exit(1); });
