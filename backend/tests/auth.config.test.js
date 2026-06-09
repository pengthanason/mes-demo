const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../server');

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

for (const routePath of ['/api/auth/config', '/api/mes/auth/config']) {
  test(`auth config route is reachable at ${routePath}`, async () => {
    const app = createApp();
    const { server, url } = await listen(app);

    try {
      const response = await fetch(`${url}${routePath}`);
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.equal(payload.status, 'ok');
      assert.equal(typeof payload.auth_mode, 'string');
      assert.equal(typeof payload.ready, 'boolean');
      assert.equal(typeof payload.jwt?.secret_ready, 'boolean');
      assert.equal(typeof payload.session?.max_concurrent_sessions, 'number');
      assert.equal(typeof payload.request_id, 'string');
    } finally {
      await closeServer(server);
    }
  });
}
