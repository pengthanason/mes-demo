const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env'), override: false });

const express = require('express');
const { query } = require('./db');
const {
  reqId,
  attachRequestContext,
  requireRoles,
} = require('./common/http');
const {
  attachAuthContext,
  AUTH_MODE_JWT,
  getAuthConfigSnapshot,
} = require('./common/auth');

const authRoutes = require('./modules/00_auth/auth.routes');
const planningRoutes = require('./modules/01_planning/planning.routes');
const incomingRoutes = require('./modules/02_incoming/incoming.routes');
const woReleaseRoutes = require('./modules/03_wo_release/wo_release.routes');
const { startMRPPolling, stopMRPPolling } = require('./modules/03_wo_release/wo_polling');
const kittingRoutes = require('./modules/04_kitting/kitting.routes');
const faiMachineRoutes = require('./modules/05_fai_machine/fai_machine.routes');
const productionRoutes = require('./modules/06_production/production.routes');
const routingRoutes = require('./modules/06_production/routing.routes');
const routeAdminRoutes = require('./modules/06_production/route_admin.routes');
const qcReworkRoutes = require('./modules/07_qc_rework/qc_rework.routes');
const qaObaRoutes = require('./modules/08_qa_oba/qa_oba.routes');
const closeRoutes = require('./modules/09_close/close.routes');
const notificationRoutes = require('./modules/10_notifications/notifications.routes');
const pmRoutes = require('./modules/11_pm_flow/pm.routes');
const scmRoutes = require('./modules/12_scm_cases/scm.routes');
const recallRoutes = require('./modules/12_scm_cases/recall.routes');
const jumboRoutes = require('./modules/13_jumbo/jumbo.routes');
const outboxWorker = require('./common/outbox_worker');

const APP_HOST = process.env.APP_HOST || '0.0.0.0';
const APP_PORT = Number(process.env.APP_PORT || '5100');
const APP_VERSION = process.env.APP_VERSION || '0.1.0-station2';
const MES_CORS_ORIGINS = String(process.env.MES_CORS_ORIGINS || '').trim();
const MES_ENV = String(process.env.MES_ENV || 'dev').trim().toLowerCase();
const MES_READY_STRICT = String(process.env.MES_READY_STRICT || '').trim().toLowerCase();
const MES_PROD_DB_HOST = String(process.env.MES_PROD_DB_HOST || '').trim();
const MES_PROD_DB_NAME = String(process.env.MES_PROD_DB_NAME || '').trim();
const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = Number(process.env.DB_PORT || '5432');
const DB_NAME = process.env.DB_NAME || 'productiondb';
const DB_SCHEMA = process.env.DB_SCHEMA || '';
const DB_SSLMODE = String(process.env.DB_SSLMODE || 'prefer').trim().toLowerCase();
const MES_RATE_LIMIT_ENABLED = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.MES_RATE_LIMIT_ENABLED || 'true').trim().toLowerCase()
);
const MES_RATE_LIMIT_WINDOW_MS = parsePositiveInt(process.env.MES_RATE_LIMIT_WINDOW_MS, 60000, 1000);
const MES_RATE_LIMIT_MAX_REQUESTS = parsePositiveInt(process.env.MES_RATE_LIMIT_MAX_REQUESTS, 100, 1);
const MES_RATE_LIMIT_EXEMPT_PATHS = new Set(['/api/mes/health', '/api/mes/ready', '/api/mes/metrics']);

const VALID_MES_ENVS = new Set(['dev', 'test', 'prod']);
const MONITOR_ALLOWED_ROLES = ['PM', 'STORE', 'QC', 'QA', 'TECH', 'PD', 'ADMIN'];
const OPS_METRICS = {
  started_at_epoch: Math.floor(Date.now() / 1000),
  requests_total: 0,
  requests_2xx: 0,
  requests_4xx: 0,
  requests_5xx: 0,
};
const RATE_LIMIT_BUCKETS = new Map();
const AUTH_RATE_LIMIT_BUCKETS = new Map();
const AUTH_RATE_LIMIT_WINDOW_MS = 60000;
const AUTH_RATE_LIMIT_MAX = 10;
const AUTH_RATE_LIMIT_PATHS = new Set(['/api/auth/login', '/api/auth/refresh']);

function parseCorsPolicy(rawOrigins) {
  const normalized = String(rawOrigins || '')
    .split(',')
    .map((entry) => String(entry || '').trim().replace(/\/+$/g, ''))
    .filter(Boolean);
  const hasWildcard = normalized.includes('*');
  if (!normalized.length) {
    return { allowAll: false, allowed: new Set(), hasWildcard: false, empty: true };
  }
  if (hasWildcard) {
    return { allowAll: true, allowed: new Set(), hasWildcard: true, empty: false };
  }
  return { allowAll: false, allowed: new Set(normalized), hasWildcard: false, empty: false };
}

function enforceCorsPolicy(policy, envName) {
  const isProd = envName === 'prod';
  if (policy.hasWildcard) {
    const msg = "[cors] MES_CORS_ORIGINS='*' is forbidden — set explicit origins (comma-separated)";
    if (isProd) {
      throw new Error(msg + ' [FATAL in prod]');
    }
    // eslint-disable-next-line no-console
    console.warn('\x1b[33m%s\x1b[0m', msg + ' [dev: falling back to deny-by-default]');
    return { allowAll: false, allowed: new Set(), hasWildcard: false, empty: true };
  }
  if (policy.empty) {
    const msg = '[cors] MES_CORS_ORIGINS is unset/empty — no cross-origin requests will be accepted. '
              + "Set explicit list e.g. 'http://localhost:3000,http://172.16.10.87'";
    if (isProd) {
      // eslint-disable-next-line no-console
      console.warn('\x1b[33m%s\x1b[0m', msg);
    } else {
      // eslint-disable-next-line no-console
      console.warn('\x1b[33m%s\x1b[0m', msg);
    }
  } else {
    // eslint-disable-next-line no-console
    console.log(`[cors] allowlist active (${policy.allowed.size} origins): ${Array.from(policy.allowed).join(', ')}`);
  }
  return policy;
}

const corsPolicy = enforceCorsPolicy(parseCorsPolicy(MES_CORS_ORIGINS), MES_ENV);

function parsePositiveInt(rawValue, fallbackValue, minimumValue) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return fallbackValue;
  }
  return Math.max(minimumValue, Math.floor(parsed));
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').trim();
  if (forwarded) {
    const [ip] = forwarded.split(',');
    const normalized = String(ip || '').trim();
    if (normalized) return normalized;
  }
  return String(req.ip || req.socket?.remoteAddress || 'unknown').trim() || 'unknown';
}

function evaluateEnvironmentSeparation() {
  if (MES_ENV === 'prod') {
    return { ok: true, issues: [] };
  }

  const issues = [];
  if (MES_PROD_DB_HOST && normalizeKey(DB_HOST) === normalizeKey(MES_PROD_DB_HOST)) {
    issues.push('non-prod MES_ENV cannot use MES_PROD_DB_HOST');
  }
  if (MES_PROD_DB_NAME && normalizeKey(DB_NAME) === normalizeKey(MES_PROD_DB_NAME)) {
    issues.push('non-prod MES_ENV cannot use MES_PROD_DB_NAME');
  }

  return { ok: issues.length === 0, issues };
}

function evaluateAuthModeGuard(authMode) {
  if (MES_ENV !== 'prod') {
    return { ok: true, issues: [] };
  }
  if (String(authMode || '').trim().toLowerCase() === 'jwt') {
    return { ok: true, issues: [] };
  }
  return {
    ok: false,
    issues: ['MES_ENV=prod requires MES_AUTH_MODE=jwt'],
  };
}

function evaluateSecurityBaseline(authConfig) {
  const strictMode = MES_ENV === 'prod' || ['1', 'true', 'yes', 'on'].includes(MES_READY_STRICT);
  if (!strictMode) {
    return { ok: true, strict_mode: false, issues: [] };
  }

  const issues = [];
  if (corsPolicy.hasWildcard) {
    issues.push("MES_CORS_ORIGINS must not be '*' when strict readiness is enabled");
  }
  if (corsPolicy.empty) {
    issues.push('MES_CORS_ORIGINS must be set to explicit allowlist when strict readiness is enabled');
  }
  if (DB_SSLMODE !== 'require') {
    issues.push('DB_SSLMODE=require is required when strict readiness is enabled');
  }
  if (String(authConfig.auth_mode || '').trim().toLowerCase() !== AUTH_MODE_JWT) {
    issues.push('MES_AUTH_MODE=jwt is required when strict readiness is enabled');
  }
  if (!authConfig.jwt.secret_ready) {
    issues.push('MES_JWT_SECRET must be set with at least 32 characters');
  }
  return { ok: issues.length === 0, strict_mode: true, issues };
}

function parseLookbackHours(rawValue) {
  if (rawValue == null || rawValue === '') {
    return { value: 24, error: null };
  }
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 168) {
    return { value: 24, error: 'lookback_hours must be an integer between 1 and 168' };
  }
  return { value: parsed, error: null };
}

function parseRouteCodeFilter(rawValue) {
  const normalized = String(rawValue || '').trim();
  if (!normalized) {
    return { value: '', error: null };
  }
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(normalized)) {
    return { value: '', error: 'route_code must match [A-Za-z0-9_-] and be 1..80 chars' };
  }
  return { value: normalized, error: null };
}

function createApp() {
  const app = express();
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    const originRaw = req.headers.origin;
    const origin = originRaw ? String(originRaw).replace(/\/+$/g, '') : '';
    const isAllowed = Boolean(origin) && corsPolicy.allowed.has(origin);

    if (isAllowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-Role, X-User-Id, X-Request-Id');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Max-Age', '86400');
    }

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    return next();
  });

  app.use(express.json({ limit: '8mb' }));

  const ADMIN_DIR = path.join(__dirname, 'public/admin');
  app.use('/admin', express.static(ADMIN_DIR, { etag: true, lastModified: true }));

  app.use('/jumbo', express.static(path.join(__dirname, 'projects/jumbo'), {
    etag: true,
    lastModified: true,
    setHeaders(res) {
      res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    },
  }));

  const UI_DIR = path.join(__dirname, 'public/ui');
  app.use('/ui', express.static(UI_DIR, {
    etag: true,
    lastModified: true,
    index: false,
    setHeaders(res, filePath) {
      if (filePath.endsWith('/index.html') || filePath.endsWith('\\index.html')) {
        res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }
    },
  }));
  app.use(/^\/ui(?:\/.*)?$/, (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.sendFile(path.join(UI_DIR, 'index.html'), (err) => {
      if (err) next(err);
    });
  });

  const httpProxyMod = require('http');
  const NEXT_WEB_HOST = String(process.env.NEXT_WEB_HOST || '127.0.0.1').trim();
  const NEXT_WEB_PORT = Number(process.env.NEXT_WEB_PORT || 3005);
  function proxyToNextWeb(req, res) {
    const suffix = req.url === '/' ? '' : req.url;
    const targetPath = '/mes-api/web' + suffix;
    const options = {
      host: NEXT_WEB_HOST,
      port: NEXT_WEB_PORT,
      path: targetPath || '/',
      method: req.method,
      headers: {
        ...req.headers,
        host: `${NEXT_WEB_HOST}:${NEXT_WEB_PORT}`,
        'x-forwarded-host': req.headers.host || '',
        'x-forwarded-proto': (req.headers['x-forwarded-proto'] || 'https'),
      },
    };
    const pReq = httpProxyMod.request(options, (pRes) => {
      res.writeHead(pRes.statusCode || 502, pRes.headers);
      pRes.pipe(res);
    });
    pReq.on('error', (err) => {
      if (!res.headersSent) {
        res.status(502).json({ status: 'error', code: 'WEB_PROXY_UNAVAILABLE', message: err.message });
      } else {
        try { res.end(); } catch (_) { /* noop */ }
      }
    });
    req.pipe(pReq);
  }
  app.use('/web', proxyToNextWeb);

  app.use(attachRequestContext);
  app.use((req, res, next) => {
    if (!MES_RATE_LIMIT_ENABLED) return next();
    if (req.method === 'OPTIONS') return next();
    if (!String(req.path || '').startsWith('/api/')) return next();
    if (MES_RATE_LIMIT_EXEMPT_PATHS.has(req.path)) return next();

    const nowMs = Date.now();
    const windowStartMs = nowMs - MES_RATE_LIMIT_WINDOW_MS;
    const clientIp = getClientIp(req);
    const existingBucket = RATE_LIMIT_BUCKETS.get(clientIp) || [];
    const bucket = existingBucket.filter((timestampMs) => timestampMs > windowStartMs);

    if (bucket.length >= MES_RATE_LIMIT_MAX_REQUESTS) {
      const oldestInWindowMs = bucket[0] || nowMs;
      const retryAfterSec = Math.max(1, Math.ceil((oldestInWindowMs + MES_RATE_LIMIT_WINDOW_MS - nowMs) / 1000));
      RATE_LIMIT_BUCKETS.set(clientIp, bucket);
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        status: 'error',
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'too many requests',
        limit: {
          max_requests: MES_RATE_LIMIT_MAX_REQUESTS,
          window_ms: MES_RATE_LIMIT_WINDOW_MS,
          retry_after_sec: retryAfterSec,
        },
        request_id: reqId(res),
      });
    }

    bucket.push(nowMs);
    RATE_LIMIT_BUCKETS.set(clientIp, bucket);
    return next();
  });
  app.use(attachAuthContext);
  app.use((req, res, next) => {
    res.on('finish', () => {
      if (!req.path.startsWith('/api/')) return;
      OPS_METRICS.requests_total += 1;
      if (res.statusCode >= 200 && res.statusCode < 300) {
        OPS_METRICS.requests_2xx += 1;
      } else if (res.statusCode >= 400 && res.statusCode < 500) {
        OPS_METRICS.requests_4xx += 1;
      } else if (res.statusCode >= 500) {
        OPS_METRICS.requests_5xx += 1;
      }
    });
    return next();
  });

  app.get('/api/mes/outbox/status', async (_req, res) => {
    try {
      const result = await query(
        `SELECT status, COUNT(*)::int AS count FROM mes_sync_log GROUP BY status`
      );
      const counts = { PENDING: 0, OK: 0, FAILED: 0 };
      for (const row of result.rows) counts[row.status] = row.count;
      return res.json({ status: 'ok', outbox: counts, request_id: reqId(res) });
    } catch (error) {
      return res.status(500).json({ status: 'error', message: error.message, request_id: reqId(res) });
    }
  });

  app.get('/api/mes/outbox/logs', async (req, res) => {
    const limit  = Math.min(Number(req.query.limit)  || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0,  0);
    const status = req.query.status || null;
    try {
      const params = [limit, offset];
      const where  = status ? "WHERE status=$3" : "";
      if (status) params.push(status);
      const result = await query(
        "SELECT id, direction, event_type, wo_id, status, attempts, error_msg, created_at, completed_at " +
        "FROM mes_sync_log " + where + " " +
        "ORDER BY created_at DESC LIMIT $1 OFFSET $2",
        params
      );
      const total = await query(
        "SELECT COUNT(*)::int AS c FROM mes_sync_log" + (status ? " WHERE status=$1" : ""),
        status ? [status] : []
      );
      return res.json({ status: 'ok', total: total.rows[0].c, rows: result.rows, request_id: reqId(res) });
    } catch (error) {
      return res.status(500).json({ status: 'error', message: error.message, request_id: reqId(res) });
    }
  });

  app.get('/api/mes/health', async (_req, res) => {
    try {
      await query('SELECT 1 AS ok');
      return res.json({
        status: 'ok',
        version: APP_VERSION,
        database: 'reachable',
        request_id: reqId(res),
      });
    } catch (error) {
      return res.status(500).json({
        status: 'error',
        code: 'HEALTH_FAILED',
        message: error.message,
        request_id: reqId(res),
      });
    }
  });

  app.get('/api/mes/ready', async (_req, res) => {
    let dbReady = false;
    let dbError = '';

    try {
      await query('SELECT 1 AS ok');
      dbReady = true;
    } catch (error) {
      dbError = error.message;
    }

    const envValid = VALID_MES_ENVS.has(MES_ENV);
    const envSeparation = evaluateEnvironmentSeparation();
    const authConfig = getAuthConfigSnapshot();
    const authModeGuard = evaluateAuthModeGuard(authConfig.auth_mode);
    const securityBaseline = evaluateSecurityBaseline(authConfig);
    const ready = dbReady && envValid && envSeparation.ok && authConfig.ready && authModeGuard.ok && securityBaseline.ok;

    return res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not_ready',
      environment: {
        mes_env: MES_ENV,
        strict_readiness: securityBaseline.strict_mode,
        db_host: DB_HOST,
        db_port: DB_PORT,
        db_name: DB_NAME,
        db_schema: DB_SCHEMA || null,
      },
      checks: {
        database: { ready: dbReady, error: dbError || null },
        mes_env: { ready: envValid, allowed: Array.from(VALID_MES_ENVS) },
        separation_guard: {
          ready: envSeparation.ok,
          issues: envSeparation.issues,
          prod_markers: {
            db_host: MES_PROD_DB_HOST || null,
            db_name: MES_PROD_DB_NAME || null,
          },
        },
        auth: {
          ready: authConfig.ready,
          mode: authConfig.auth_mode,
          jwt: authConfig.jwt,
          session_policy: authConfig.session,
          mode_guard: {
            ready: authModeGuard.ok,
            issues: authModeGuard.issues,
          },
        },
        security: {
          ready: securityBaseline.ok,
          issues: securityBaseline.issues,
          cors_origins: MES_CORS_ORIGINS,
          db_sslmode: DB_SSLMODE,
        },
      },
      request_id: reqId(res),
    });
  });

  app.get('/api/mes/metrics', (_req, res) => {
    const nowSec = Math.floor(Date.now() / 1000);
    const uptimeSec = Math.max(0, nowSec - OPS_METRICS.started_at_epoch);

    return res.json({
      status: 'ok',
      metrics: {
        uptime_sec: uptimeSec,
        requests_total: OPS_METRICS.requests_total,
        requests_2xx: OPS_METRICS.requests_2xx,
        requests_4xx: OPS_METRICS.requests_4xx,
        requests_5xx: OPS_METRICS.requests_5xx,
        auth_mode: getAuthConfigSnapshot().auth_mode,
        session_policy: getAuthConfigSnapshot().session,
      },
      request_id: reqId(res),
    });
  });

  app.get('/api/mes/routes/catalog', requireRoles(MONITOR_ALLOWED_ROLES), async (req, res) => {
    const routeCodeFilter = parseRouteCodeFilter(req.query.route_code);
    if (routeCodeFilter.error) {
      return res.status(400).json({
        status: 'error',
        code: 'VALIDATION_ERROR',
        message: routeCodeFilter.error,
        request_id: reqId(res),
      });
    }

    try {
      const result = await query(
        `SELECT
           pr.id AS route_id,
           pr.route_code,
           pr.route_name,
           pr.is_active,
           pr.is_default,
           pr.enforce_sequence,
           rs.step_order,
           rs.station_name,
           rs.station_type,
           rs.requires_fai,
           rs.is_required,
           rs.allow_rework
         FROM process_routes pr
         LEFT JOIN route_steps rs ON rs.route_id = pr.id
         WHERE pr.is_active = TRUE
           AND ($1::text = '' OR UPPER(pr.route_code) = UPPER($1::text))
         ORDER BY pr.is_default DESC, pr.route_code ASC, rs.step_order ASC`,
        [routeCodeFilter.value]
      );

      const routes = [];
      const routeMap = new Map();

      for (const row of result.rows) {
        const routeId = Number(row.route_id);
        let route = routeMap.get(routeId);
        if (!route) {
          route = {
            route_id: routeId,
            route_code: row.route_code,
            route_name: row.route_name,
            is_active: Boolean(row.is_active),
            is_default: Boolean(row.is_default),
            enforce_sequence: Boolean(row.enforce_sequence),
            steps: [],
          };
          routeMap.set(routeId, route);
          routes.push(route);
        }

        if (row.step_order != null) {
          route.steps.push({
            step_order: Number(row.step_order),
            station_name: row.station_name,
            normalized_station_name: String(row.station_name || '').trim().toUpperCase().replace(/\s+/g, '_'),
            station_type: row.station_type,
            requires_fai: Boolean(row.requires_fai),
            is_required: Boolean(row.is_required),
            allow_rework: Boolean(row.allow_rework),
          });
        }
      }

      const defaultRoute = routes.find((item) => item.is_default) || null;

      return res.json({
        status: 'ok',
        filter: {
          route_code: routeCodeFilter.value || null,
        },
        default_route_code: defaultRoute?.route_code || null,
        routes,
        request_id: reqId(res),
      });
    } catch (error) {
      return res.status(500).json({
        status: 'error',
        code: 'ROUTE_CATALOG_FAILED',
        message: error.message,
        request_id: reqId(res),
      });
    }
  });

  app.get('/api/mes/stations/monitor', requireRoles(MONITOR_ALLOWED_ROLES), async (req, res) => {
    const lookback = parseLookbackHours(req.query.lookback_hours);
    if (lookback.error) {
      return res.status(400).json({
        status: 'error',
        code: 'VALIDATION_ERROR',
        message: lookback.error,
        request_id: reqId(res),
      });
    }

    const routeCodeFilter = parseRouteCodeFilter(req.query.route_code);
    if (routeCodeFilter.error) {
      return res.status(400).json({
        status: 'error',
        code: 'VALIDATION_ERROR',
        message: routeCodeFilter.error,
        request_id: reqId(res),
      });
    }

    try {
      const monitorRows = await query(
        `WITH station_cfg AS (
            SELECT
              pr.id AS route_id,
              pr.route_code,
              pr.enforce_sequence,
              rs.step_order,
              rs.station_name,
              UPPER(REGEXP_REPLACE(rs.station_name, '\\s+', '_', 'g')) AS station_key
            FROM process_routes pr
            JOIN route_steps rs ON rs.route_id = pr.id
            WHERE pr.is_active = TRUE
              AND ($1::text = '' OR UPPER(pr.route_code) = UPPER($1::text))
          ),
          wip_by_step AS (
            SELECT
              wt.route_id,
              wt.current_step_order AS step_order,
              COUNT(*) FILTER (WHERE wt.state = 'IN_STATION')::int AS units_in_station,
              COUNT(*) FILTER (WHERE wt.state = 'READY_NEXT')::int AS units_ready_next,
              COUNT(*) FILTER (WHERE wt.state = 'COMPLETED')::int AS units_completed
            FROM wip_tracking wt
            GROUP BY wt.route_id, wt.current_step_order
          ),
          rework_by_station AS (
            SELECT
              wt.route_id,
              UPPER(REGEXP_REPLACE(wt.last_fail_station, '\\s+', '_', 'g')) AS station_key,
              COUNT(*)::int AS units_rework_required
            FROM wip_tracking wt
            WHERE wt.state = 'REWORK_REQUIRED'
              AND COALESCE(BTRIM(wt.last_fail_station), '') <> ''
            GROUP BY wt.route_id, UPPER(REGEXP_REPLACE(wt.last_fail_station, '\\s+', '_', 'g'))
          ),
          event_window AS (
            SELECT
              we.route_id,
              we.step_order,
              COUNT(*) FILTER (WHERE we.action = 'SCAN_IN')::int AS scan_in_count,
              COUNT(*) FILTER (WHERE we.action = 'SCAN_OUT' AND we.status = 'PASS')::int AS scan_out_pass_count,
              COUNT(*) FILTER (WHERE we.action = 'SCAN_OUT' AND we.status = 'FAIL')::int AS scan_out_fail_count,
              MAX(we.scanned_at) AS last_scan_at
            FROM wip_tracking_events we
            JOIN process_routes pr ON pr.id = we.route_id
            WHERE pr.is_active = TRUE
              AND ($1::text = '' OR UPPER(pr.route_code) = UPPER($1::text))
              AND we.scanned_at >= NOW() - make_interval(hours => $2::int)
            GROUP BY we.route_id, we.step_order
          ),
          route_summary AS (
            SELECT
              wt.route_id,
              COUNT(*)::int AS units_tracked,
              COUNT(*) FILTER (WHERE wt.state = 'IN_STATION')::int AS units_in_station,
              COUNT(*) FILTER (WHERE wt.state = 'READY_NEXT')::int AS units_ready_next,
              COUNT(*) FILTER (WHERE wt.state = 'REWORK_REQUIRED')::int AS units_rework_required,
              COUNT(*) FILTER (WHERE wt.state = 'COMPLETED')::int AS units_completed
            FROM wip_tracking wt
            JOIN process_routes pr ON pr.id = wt.route_id
            WHERE pr.is_active = TRUE
              AND ($1::text = '' OR UPPER(pr.route_code) = UPPER($1::text))
            GROUP BY wt.route_id
          )
          SELECT
            sc.route_id,
            sc.route_code,
            sc.enforce_sequence,
            sc.step_order,
            sc.station_name,
            COALESCE(wbs.units_in_station, 0) AS units_in_station,
            COALESCE(wbs.units_ready_next, 0) AS units_ready_next,
            COALESCE(rws.units_rework_required, 0) AS units_rework_required,
            COALESCE(wbs.units_completed, 0) AS units_completed,
            COALESCE(ew.scan_in_count, 0) AS scan_in_count,
            COALESCE(ew.scan_out_pass_count, 0) AS scan_out_pass_count,
            COALESCE(ew.scan_out_fail_count, 0) AS scan_out_fail_count,
            ew.last_scan_at,
            COALESCE(rs.units_tracked, 0) AS route_units_tracked,
            COALESCE(rs.units_in_station, 0) AS route_units_in_station,
            COALESCE(rs.units_ready_next, 0) AS route_units_ready_next,
            COALESCE(rs.units_rework_required, 0) AS route_units_rework_required,
            COALESCE(rs.units_completed, 0) AS route_units_completed
          FROM station_cfg sc
          LEFT JOIN wip_by_step wbs
            ON wbs.route_id = sc.route_id
           AND wbs.step_order = sc.step_order
          LEFT JOIN rework_by_station rws
            ON rws.route_id = sc.route_id
           AND rws.station_key = sc.station_key
          LEFT JOIN event_window ew
            ON ew.route_id = sc.route_id
           AND ew.step_order = sc.step_order
          LEFT JOIN route_summary rs
            ON rs.route_id = sc.route_id
          ORDER BY sc.route_code ASC, sc.step_order ASC`,
        [routeCodeFilter.value, lookback.value]
      );

      const nowSec = Math.floor(Date.now() / 1000);
      const routes = new Map();
      const stations = monitorRows.rows.map((row) => {
        const routeId = Number(row.route_id);
        const lastScanIso = row.last_scan_at ? new Date(row.last_scan_at).toISOString() : null;
        const lastScanSec = lastScanIso ? Math.floor(new Date(lastScanIso).getTime() / 1000) : null;
        if (!routes.has(routeId)) {
          routes.set(routeId, {
            route_id: routeId,
            route_code: row.route_code,
            enforce_sequence: Boolean(row.enforce_sequence),
            units_tracked: Number(row.route_units_tracked || 0),
            units_in_station: Number(row.route_units_in_station || 0),
            units_ready_next: Number(row.route_units_ready_next || 0),
            units_rework_required: Number(row.route_units_rework_required || 0),
            units_completed: Number(row.route_units_completed || 0),
          });
        }

        return {
          route_id: routeId,
          route_code: row.route_code,
          enforce_sequence: Boolean(row.enforce_sequence),
          step_order: Number(row.step_order),
          station_name: row.station_name,
          units_in_station: Number(row.units_in_station || 0),
          units_ready_next: Number(row.units_ready_next || 0),
          units_rework_required: Number(row.units_rework_required || 0),
          units_completed: Number(row.units_completed || 0),
          scan_in_count: Number(row.scan_in_count || 0),
          scan_out_pass_count: Number(row.scan_out_pass_count || 0),
          scan_out_fail_count: Number(row.scan_out_fail_count || 0),
          last_scan_at: lastScanIso,
          last_activity_age_sec: lastScanSec == null ? null : Math.max(0, nowSec - lastScanSec),
        };
      });

      const routeSummaries = Array.from(routes.values());
      const summary = {
        routes_total: routeSummaries.length,
        stations_total: stations.length,
        units_tracked: routeSummaries.reduce((acc, item) => acc + Number(item.units_tracked || 0), 0),
        units_in_station: routeSummaries.reduce((acc, item) => acc + Number(item.units_in_station || 0), 0),
        units_ready_next: routeSummaries.reduce((acc, item) => acc + Number(item.units_ready_next || 0), 0),
        units_rework_required: routeSummaries.reduce((acc, item) => acc + Number(item.units_rework_required || 0), 0),
        units_completed: routeSummaries.reduce((acc, item) => acc + Number(item.units_completed || 0), 0),
        scan_in_count_window: stations.reduce((acc, item) => acc + Number(item.scan_in_count || 0), 0),
        scan_out_pass_count_window: stations.reduce((acc, item) => acc + Number(item.scan_out_pass_count || 0), 0),
        scan_out_fail_count_window: stations.reduce((acc, item) => acc + Number(item.scan_out_fail_count || 0), 0),
        stations_with_rework: stations.filter((item) => item.units_rework_required > 0).length,
        stations_with_fail_window: stations.filter((item) => item.scan_out_fail_count > 0).length,
      };

      return res.json({
        status: 'ok',
        as_of: new Date().toISOString(),
        lookback_hours: lookback.value,
        filter: {
          route_code: routeCodeFilter.value || null,
        },
        summary,
        routes: routeSummaries,
        stations,
        request_id: reqId(res),
      });
    } catch (error) {
      return res.status(500).json({
        status: 'error',
        code: 'STATION_MONITOR_FAILED',
        message: error.message,
        request_id: reqId(res),
      });
    }
  });

  app.use((req, res, next) => {
    if (!MES_RATE_LIMIT_ENABLED) return next();
    if (!AUTH_RATE_LIMIT_PATHS.has(req.path)) return next();

    const nowMs = Date.now();
    const windowStartMs = nowMs - AUTH_RATE_LIMIT_WINDOW_MS;
    const clientIp = getClientIp(req);
    const existing = AUTH_RATE_LIMIT_BUCKETS.get(clientIp) || [];
    const bucket = existing.filter((ts) => ts > windowStartMs);

    if (bucket.length >= AUTH_RATE_LIMIT_MAX) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket[0] + AUTH_RATE_LIMIT_WINDOW_MS - nowMs) / 1000));
      AUTH_RATE_LIMIT_BUCKETS.set(clientIp, bucket);
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        status: 'error',
        code: 'AUTH_RATE_LIMIT_EXCEEDED',
        message: 'too many auth requests',
        limit: { max_requests: AUTH_RATE_LIMIT_MAX, window_ms: AUTH_RATE_LIMIT_WINDOW_MS, retry_after_sec: retryAfterSec },
        request_id: reqId(res),
      });
    }

    bucket.push(nowMs);
    AUTH_RATE_LIMIT_BUCKETS.set(clientIp, bucket);
    return next();
  });

  app.get('/api/wo/list', (req, res) => {
    res.json({
      status: 'success',
      wos: [
        { id: 1, wo_number: 'WO-2026-001', part_no: 'PCB-ASSY-01', qty_target: 1500, status: 'RUNNING', opened_at: new Date().toISOString() },
        { id: 2, wo_number: 'WO-2026-002', part_no: 'SMT-ASSY-02', qty_target: 500, status: 'WAIT_FAI_QA', opened_at: new Date().toISOString() },
        { id: 3, wo_number: 'WO-2026-003', part_no: 'TEST-003', qty_target: 120, status: 'CLOSED', opened_at: new Date().toISOString() }
      ]
    });
  });

  app.get('/api/wo/:id', (req, res) => {
    res.json({
      status: 'success',
      wo: {
        id: 1,
        wo_number: req.params.id,
        part_no: 'PCB-ASSY-01',
        qty_target: 1500,
        qty_good: 750,
        status: 'RUNNING'
      }
    });
  });

  app.get('/api/routing/history', (req, res) => {
    res.json([
      { id: 1, ts: new Date().toISOString(), serial: 'SN-001', sequence: 'SMT(45s)', result: 'PASS', totalSec: 45 }
    ]);
  });

  app.use(authRoutes);
  app.use(planningRoutes);
  app.use(incomingRoutes);
  app.use(woReleaseRoutes);
  app.use(kittingRoutes);
  app.use(faiMachineRoutes);
  app.use(productionRoutes);
  app.use(routingRoutes);
  app.use(routeAdminRoutes);
  app.use(qcReworkRoutes);
  app.use(qaObaRoutes);
  app.use(notificationRoutes);
  app.use(closeRoutes);
  app.use('/api/pm', pmRoutes);
  app.use('/api/scm', scmRoutes);
  app.use(recallRoutes);
  app.use(jumboRoutes);

  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    // eslint-disable-next-line no-console
    console.error('Unhandled MES error:', err);
    return res.status(500).json({
      status: 'error',
      code: 'INTERNAL_SERVER_ERROR',
      message: 'internal server error',
      request_id: reqId(res),
    });
  });

  app.use((req, res) => {
    return res.status(404).json({
      status: 'error',
      code: 'NOT_FOUND',
      path: req.path,
      request_id: reqId(res),
    });
  });

  return app;
}

function startServer(host = APP_HOST, port = APP_PORT) {
  const app = createApp();
  const server = app.listen(port, host, () => {
    // eslint-disable-next-line no-console
    console.log(`SYNTECH MES Backbone listening on ${host}:${port} (version=${APP_VERSION})`);
    // outboxWorker.start(); // ปิดไว้ชั่วคราวเพื่อเทสแบบไม่มี DB
    // startMRPPolling(); // ปิดไว้ชั่วคราวเพื่อเทสแบบไม่มี DB
  });

  server.on('close', () => {
    // outboxWorker.stop();
    // stopMRPPolling();
  });

  return server;
}

if (require.main === module) {
  startServer(APP_HOST, APP_PORT);
}

module.exports = {
  createApp,
  startServer,
};
