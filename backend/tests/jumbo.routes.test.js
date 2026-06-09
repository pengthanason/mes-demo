const assert = require('node:assert/strict');
const { test } = require('node:test');

const dbModulePath = require.resolve('../db');
const httpModulePath = require.resolve('../common/http');
const jigModulePath = require.resolve('../common/jig_client');
const routerModulePath = require.resolve('../modules/13_jumbo/jumbo.routes');

function loadRouter({ clientQuery, directQuery }) {
  delete require.cache[routerModulePath];
  delete require.cache[dbModulePath];
  delete require.cache[httpModulePath];
  delete require.cache[jigModulePath];

  require.cache[dbModulePath] = {
    id: dbModulePath,
    filename: dbModulePath,
    loaded: true,
    exports: {
      withTransaction: async (callback) => callback({ query: clientQuery }),
      query: directQuery || (async () => ({ rows: [] })),
    },
  };

  require.cache[httpModulePath] = {
    id: httpModulePath,
    filename: httpModulePath,
    loaded: true,
    exports: {
      reqId: () => 'test-request-id',
      requireRoles: () => (_req, _res, next) => next(),
    },
  };

  require.cache[jigModulePath] = {
    id: jigModulePath,
    filename: jigModulePath,
    loaded: true,
    exports: {
      isConfigured: () => false,
      createJob: async () => ({ queued: false, error: 'not configured' }),
      bulkStatus: async () => new Map(),
    },
  };

  return require('../modules/13_jumbo/jumbo.routes');
}

function getRouteHandlers(router, method, routePath) {
  const normalizedMethod = String(method || '').toLowerCase();
  const layer = router.stack.find(
    (entry) => entry.route && entry.route.path === routePath && entry.route.methods?.[normalizedMethod]
  );
  if (!layer) {
    throw new Error(`Route not found: ${normalizedMethod.toUpperCase()} ${routePath}`);
  }
  return layer.route.stack.map((entry) => entry.handle);
}

async function runRoute(router, method, routePath, { body = {}, params = {}, query = {}, user = { id: 7, role: 'ADMIN' } } = {}) {
  const handlers = getRouteHandlers(router, method, routePath);
  const req = {
    body,
    params,
    query,
    user,
    method: String(method || '').toUpperCase(),
  };

  let statusCode = 200;
  let jsonBody;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      jsonBody = payload;
      return this;
    },
  };

  for (const handler of handlers) {
    if (jsonBody !== undefined) break;
    if (handler.length >= 3) {
      await new Promise((resolve, reject) => {
        try {
          handler(req, res, (error) => (error ? reject(error) : resolve()));
        } catch (error) {
          reject(error);
        }
      });
    } else {
      await handler(req, res);
    }
  }

  return { statusCode, jsonBody };
}

test('jumbo serial generation uses numeric user id for created_by', async () => {
  const calls = [];
  const router = loadRouter({
    clientQuery: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('INSERT INTO jumbo_serial_batches')) return { rows: [{ id: 101 }] };
      if (sql.includes('SELECT serial_string FROM jumbo_serials')) return { rows: [] };
      return { rows: [] };
    },
  });

  const response = await runRoute(router, 'post', '/api/jumbo/serials/generate', {
    body: { part_no: '1E4D25234000', start_serial: 1, qty: 1 },
    user: { id: 7, role: 'ADMIN' },
  });

  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.jsonBody.data.serials, ['1E4D25234000-001']);

  const insertBatch = calls.find((entry) => entry.sql.includes('INSERT INTO jumbo_serial_batches'));
  assert.ok(insertBatch, 'expected jumbo_serial_batches insert');
  assert.equal(insertBatch.params[3], 7);
});

test('jumbo assembly uses numeric user id for created_by', async () => {
  const calls = [];
  const router = loadRouter({
    clientQuery: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('SELECT id FROM jumbo_assemblies WHERE bbas_serial')) return { rows: [] };
      if (sql.includes('SELECT component_serial FROM jumbo_assembly_components')) return { rows: [] };
      if (sql.includes('INSERT INTO jumbo_assemblies')) return { rows: [{ id: 202 }] };
      return { rows: [] };
    },
    directQuery: async (sql) => {
      if (sql.includes('SELECT a.*,'))
        return {
          rows: [
            {
              id: 202,
              assembly_type: 'BBAS_RSU',
              bbas_serial: '1E6D25234001-001',
              status: 'ASSEMBLED',
              note: '',
              created_by: 7,
              components: [{ slot_label: 'PCBA RSU #1', part_no: '1E4D25234003', serial: '1E4D25234003-001' }],
            },
          ],
        };
      return { rows: [] };
    },
  });

  const response = await runRoute(router, 'post', '/api/jumbo/assembly', {
    body: {
      assembly_type: 'BBAS_RSU',
      bbas_serial: '1E6D25234001-001',
      components: [{ serial: '1E4D25234003-001' }],
    },
    user: { id: 7, role: 'ADMIN' },
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.jsonBody.data.created_by, 7);

  const insertAssembly = calls.find((entry) => entry.sql.includes('INSERT INTO jumbo_assemblies'));
  assert.ok(insertAssembly, 'expected jumbo_assemblies insert');
  assert.equal(insertAssembly.params[3], 7);
});

test('jumbo box creation uses numeric user id for created_by', async () => {
  const calls = [];
  const router = loadRouter({
    clientQuery: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('SELECT box_no FROM jumbo_packing_boxes')) return { rows: [] };
      if (sql.includes('INSERT INTO jumbo_packing_boxes'))
        return { rows: [{ id: 303, box_no: 'BOX-2026W15-001', status: 'OPEN', note: 'x', created_by: 7 }] };
      return { rows: [] };
    },
  });

  const response = await runRoute(router, 'post', '/api/jumbo/packing/boxes', {
    body: { note: 'x' },
    user: { id: 7, role: 'ADMIN' },
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.jsonBody.data.created_by, 7);

  const insertBox = calls.find((entry) => entry.sql.includes('INSERT INTO jumbo_packing_boxes'));
  assert.ok(insertBox, 'expected jumbo_packing_boxes insert');
  assert.equal(insertBox.params[2], 7);
});

test('jumbo box scan uses numeric user id for scanned_by', async () => {
  const calls = [];
  const router = loadRouter({
    clientQuery: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('SELECT id,status FROM jumbo_packing_boxes')) return { rows: [{ id: 1, status: 'OPEN' }] };
      if (sql.includes('SELECT id,status FROM jumbo_assemblies')) return { rows: [{ id: 2, status: 'ASSEMBLED' }] };
      if (sql.includes('SELECT box_id FROM jumbo_box_items')) return { rows: [] };
      return { rows: [] };
    },
  });

  const response = await runRoute(router, 'post', '/api/jumbo/packing/boxes/:boxId/scan', {
    params: { boxId: '1' },
    body: { bbas_serial: '1E6D25234000-001' },
    user: { id: 7, role: 'ADMIN' },
  });

  assert.equal(response.statusCode, 201);

  const insertBoxItem = calls.find((entry) => entry.sql.includes('INSERT INTO jumbo_box_items'));
  assert.ok(insertBoxItem, 'expected jumbo_box_items insert');
  assert.equal(insertBoxItem.params[2], 7);
});
