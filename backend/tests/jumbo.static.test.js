const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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

test('jumbo index uses local vendor assets instead of external CDNs', () => {
  const indexHtml = fs.readFileSync(
    path.join(__dirname, '..', 'projects', 'jumbo', 'index.html'),
    'utf8'
  );

  assert.match(indexHtml, /vendor\/sweetalert2\.all\.min\.js/);
  assert.match(indexHtml, /vendor\/qrcode\.min\.js/);
  assert.doesNotMatch(indexHtml, /cdn\.jsdelivr\.net/i);
  assert.doesNotMatch(indexHtml, /cdnjs\.cloudflare\.com/i);
  assert.doesNotMatch(indexHtml, /fonts\.googleapis\.com/i);
});

test('jumbo static assets are served with no-store cache headers', async () => {
  const app = createApp();
  const { server, url } = await listen(app);

  try {
    const response = await fetch(`${url}/jumbo/`);
    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get('cache-control'),
      'no-store, max-age=0, must-revalidate'
    );
    assert.equal(response.headers.get('pragma'), 'no-cache');
    assert.equal(response.headers.get('expires'), '0');
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
});
