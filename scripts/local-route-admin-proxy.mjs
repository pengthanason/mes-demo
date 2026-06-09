import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const staticRoot = path.join(repoRoot, 'backend', 'public', 'ui');
const backendOrigin = process.env.MES_PROXY_TARGET || 'http://127.0.0.1:5100';
const host = process.env.MES_PROXY_HOST || '127.0.0.1';
const port = Number(process.env.MES_PROXY_PORT || 5110);
const proxyRole = process.env.MES_PROXY_ROLE || 'PM';
const proxyUserName = process.env.MES_PROXY_USER_NAME || 'local_route_admin_proxy';

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function contentTypeFor(filePath) {
  return mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return chunks.length ? Buffer.concat(chunks) : null;
}

async function proxyApiRequest(req, res) {
  const targetUrl = new URL(req.url || '/', backendOrigin);
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      headers.set(key, value.join(', '));
    } else {
      headers.set(key, value);
    }
  }

  headers.set('x-user-role', proxyRole);
  headers.set('x-user-name', proxyUserName);
  headers.delete('host');

  const body = req.method === 'GET' || req.method === 'HEAD' ? null : await readRequestBody(req);
  const upstream = await fetch(targetUrl, {
    method: req.method,
    headers,
    body,
    redirect: 'manual',
  });

  const responseHeaders = {};
  upstream.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'transfer-encoding') return;
    responseHeaders[key] = value;
  });
  responseHeaders['Cache-Control'] = 'no-store';

  const responseBody = Buffer.from(await upstream.arrayBuffer());
  res.writeHead(upstream.status, responseHeaders);
  res.end(responseBody);
}

async function serveStatic(req, res) {
  const requestUrl = new URL(req.url || '/', `http://${host}:${port}`);
  const normalizedPath = decodeURIComponent(requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname);
  const requestedFile = path.resolve(staticRoot, `.${normalizedPath}`);
  const indexFile = path.join(staticRoot, 'index.html');

  if (!requestedFile.startsWith(staticRoot)) {
    sendJson(res, 403, { status: 'error', message: 'forbidden path' });
    return;
  }

  let filePath = requestedFile;
  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
  } catch {
    filePath = indexFile;
  }

  try {
    const content = await fs.readFile(filePath);
    res.writeHead(200, {
      'Content-Type': contentTypeFor(filePath),
      'Content-Length': content.length,
      'Cache-Control': filePath.endsWith('.html') ? 'no-store' : 'public, max-age=300',
    });
    res.end(content);
  } catch (error) {
    sendJson(res, 404, { status: 'error', message: error.message || 'file not found' });
  }
}

const server = createServer(async (req, res) => {
  try {
    if ((req.url || '').startsWith('/api/')) {
      await proxyApiRequest(req, res);
      return;
    }
    await serveStatic(req, res);
  } catch (error) {
    sendJson(res, 502, {
      status: 'error',
      message: error.message || 'proxy request failed',
    });
  }
});

server.listen(port, host, () => {
  console.log(`[local-route-admin-proxy] serving on http://${host}:${port}`);
  console.log(`[local-route-admin-proxy] proxy target ${backendOrigin} as role ${proxyRole}`);
});
