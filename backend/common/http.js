const crypto = require('crypto');
const { normalizeCode } = require('../utils/validator');

const ALL_ROLES = new Set(['PM', 'STORE', 'QC', 'QA', 'TECH', 'PD', 'ADMIN']);
const IS_TEST_ENV = String(process.env.MES_ENV || '').trim().toLowerCase() === 'test';

function normalizeText(value) {
  if (value == null) return '';
  return String(value).trim();
}

function reqId(res) {
  return res.getHeader('X-Request-Id') || '';
}

function sendValidationError(res, message, details = []) {
  return res.status(400).json({
    status: 'error',
    code: 'VALIDATION_ERROR',
    message,
    details,
    request_id: reqId(res),
  });
}

function parseNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function attachRequestContext(req, res, next) {
  const requestId = normalizeText(req.headers['x-request-id']) || crypto.randomUUID().replace(/-/g, '');
  res.setHeader('X-Request-Id', requestId);

  return next();
}

function requireRoles(roles) {
  return (req, res, next) => {
    const userRole = normalizeCode(req.user?.role);
    if (!userRole || !ALL_ROLES.has(userRole)) {
      return res.status(401).json({
        status: 'error',
        code: 'AUTH_REQUIRED',
        message: 'authentication is required for this endpoint',
        request_id: reqId(res),
      });
    }
    if (!roles.includes(userRole)) {
      return res.status(403).json({
        status: 'error',
        code: 'FORBIDDEN_ROLE',
        required_roles: roles,
        request_id: reqId(res),
      });
    }
    return next();
  };
}

// ---------------------------------------------------------------------------
// Per-route in-memory rate limiter (complements the global limiter in server.js).
// Each call to perRouteRateLimit() returns a fresh middleware with its own bucket
// map, so different route groups can have independent limits.
//
// Usage:
//   const { perRouteRateLimit } = require('../../common/http');
//   const woCloseLimiter = perRouteRateLimit({ windowMs: 60000, max: 5 });
//   router.post('/api/wo/close', woCloseLimiter, ...);
// ---------------------------------------------------------------------------
function perRouteRateLimit({ windowMs = 60000, max = 60 } = {}) {
  const buckets = new Map();
  return (req, res, next) => {
    if (IS_TEST_ENV) {
      return next();
    }

    const nowMs = Date.now();
    const windowStartMs = nowMs - windowMs;
    // Key by authenticated user id when available, fall back to IP.
    const key = req.user?.id ? `user:${req.user.id}` : _getClientIp(req);
    const bucket = (buckets.get(key) || []).filter((ts) => ts > windowStartMs);

    if (bucket.length >= max) {
      const oldestInWindow = bucket[0] || nowMs;
      const retryAfterSec = Math.max(1, Math.ceil((oldestInWindow + windowMs - nowMs) / 1000));
      buckets.set(key, bucket);
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        status: 'error',
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'too many requests for this operation',
        limit: { max_requests: max, window_ms: windowMs, retry_after_sec: retryAfterSec },
        request_id: reqId(res),
      });
    }

    bucket.push(nowMs);
    buckets.set(key, bucket);
    return next();
  };
}

function _getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').trim();
  if (forwarded) {
    const [ip] = forwarded.split(',');
    const normalized = String(ip || '').trim();
    if (normalized) return normalized;
  }
  return String(req.ip || req.socket?.remoteAddress || 'unknown').trim() || 'unknown';
}

module.exports = {
  ALL_ROLES,
  normalizeText,
  reqId,
  sendValidationError,
  parseNumber,
  attachRequestContext,
  requireRoles,
  perRouteRateLimit,
};
