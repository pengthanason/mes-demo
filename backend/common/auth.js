const crypto = require('crypto');
const { query } = require('../db');
const { normalizeCode } = require('../utils/validator');
const { normalizeText, reqId } = require('./http');

const AUTH_MODE_HEADER = 'header';
const AUTH_MODE_JWT = 'jwt';
const AUTH_MODE_HYBRID = 'hybrid';
const VALID_AUTH_MODES = new Set([AUTH_MODE_HEADER, AUTH_MODE_JWT, AUTH_MODE_HYBRID]);

const TOKEN_TYPE_ACCESS = 'access';
const TOKEN_TYPE_REFRESH = 'refresh';
const HMAC_ALGO = 'sha256';

const JWT_ISSUER = normalizeText(process.env.MES_JWT_ISSUER) || 'syntech-mes-backbone';
const JWT_SECRET = normalizeText(process.env.MES_JWT_SECRET);
const ACCESS_TTL_SEC = Math.max(60, Number(process.env.MES_JWT_ACCESS_TTL_SEC || 900) || 900);
const REFRESH_TTL_SEC = Math.max(300, Number(process.env.MES_JWT_REFRESH_TTL_SEC || 604800) || 604800);
const MAX_CONCURRENT_SESSIONS = Math.max(1, Number(process.env.MES_MAX_CONCURRENT_SESSIONS || 3) || 3);
const SESSION_INACTIVITY_SEC = Math.max(60, Number(process.env.MES_SESSION_INACTIVITY_SEC || 1800) || 1800);

function resolveAuthMode(rawMode) {
  const normalized = normalizeText(rawMode).toLowerCase();
  if (!VALID_AUTH_MODES.has(normalized)) return AUTH_MODE_HYBRID;
  return normalized;
}

const AUTH_MODE = resolveAuthMode(process.env.MES_AUTH_MODE || AUTH_MODE_HYBRID);

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(input) {
  const normalized = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function signHmac(content) {
  return base64UrlEncode(crypto.createHmac(HMAC_ALGO, JWT_SECRET).update(content).digest());
}

function constantTimeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function encodeJwt(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signHmac(`${encodedHeader}.${encodedPayload}`);
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function decodeJwt(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('invalid token format');
  const [encodedHeader, encodedPayload, signature] = parts;
  const expectedSig = signHmac(`${encodedHeader}.${encodedPayload}`);
  if (!constantTimeEqual(signature, expectedSig)) throw new Error('invalid token signature');

  let header = {};
  let payload = {};
  try {
    header = JSON.parse(base64UrlDecode(encodedHeader));
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch (_err) {
    throw new Error('invalid token payload');
  }

  if (header.alg !== 'HS256' || header.typ !== 'JWT') throw new Error('unsupported token header');
  return payload;
}

function ensureJwtSecretReady() {
  return JWT_SECRET.length >= 32;
}

function epochNowSec() {
  return Math.floor(Date.now() / 1000);
}

function tokenTimestamps(ttlSec) {
  const now = epochNowSec();
  return {
    iat: now,
    exp: now + Math.max(1, Number(ttlSec || 0)),
  };
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function createToken(user, sessionId, tokenType) {
  const ttl = tokenType === TOKEN_TYPE_ACCESS ? ACCESS_TTL_SEC : REFRESH_TTL_SEC;
  const { iat, exp } = tokenTimestamps(ttl);
  const jti = crypto.randomUUID();
  const payload = {
    iss: JWT_ISSUER,
    sub: String(user.id),
    role: normalizeCode(user.role),
    username: normalizeText(user.username),
    sid: Number(sessionId),
    typ: tokenType,
    jti,
    iat,
    exp,
  };
  return {
    token: encodeJwt(payload),
    jti,
    exp,
  };
}

function issueSessionTokens(user, sessionId) {
  const access = createToken(user, sessionId, TOKEN_TYPE_ACCESS);
  const refresh = createToken(user, sessionId, TOKEN_TYPE_REFRESH);
  return {
    access_token: access.token,
    access_token_expires_at: access.exp,
    access_token_expires_in: Math.max(0, access.exp - epochNowSec()),
    access_jti: access.jti,
    refresh_token: refresh.token,
    refresh_token_expires_at: refresh.exp,
    refresh_token_expires_in: Math.max(0, refresh.exp - epochNowSec()),
    refresh_jti: refresh.jti,
  };
}

function verifyToken(token, expectedType) {
  if (!ensureJwtSecretReady()) {
    throw new Error('jwt secret is not configured');
  }
  const payload = decodeJwt(token);
  const now = epochNowSec();

  if (normalizeText(payload.iss) !== JWT_ISSUER) throw new Error('invalid token issuer');
  if (normalizeText(payload.typ) !== expectedType) throw new Error('invalid token type');
  if (!payload.sub || !Number.isInteger(Number(payload.sub))) throw new Error('invalid token subject');
  if (!Number.isInteger(Number(payload.sid)) || Number(payload.sid) <= 0) throw new Error('invalid token session');
  if (normalizeCode(payload.role) === '') throw new Error('invalid token role');
  if (!Number.isInteger(Number(payload.iat)) || !Number.isInteger(Number(payload.exp))) {
    throw new Error('invalid token timestamps');
  }
  if (Number(payload.exp) <= now) throw new Error('token expired');

  return {
    userId: Number(payload.sub),
    role: normalizeCode(payload.role),
    username: normalizeText(payload.username),
    sessionId: Number(payload.sid),
    jti: normalizeText(payload.jti),
    issuedAt: Number(payload.iat),
    expiresAt: Number(payload.exp),
    tokenType: normalizeText(payload.typ),
  };
}

function extractBearerToken(req) {
  const raw = normalizeText(req.headers.authorization);
  if (!raw) return '';
  const [scheme, token] = raw.split(/\s+/, 2);
  if (normalizeText(scheme).toLowerCase() !== 'bearer') return '';
  return normalizeText(token);
}

function parseHeaderIdentity(req) {
  const userIdRaw = normalizeText(req.headers['x-user-id']);
  const roleRaw = normalizeCode(req.headers['x-user-role']);
  const userId = userIdRaw ? Number(userIdRaw) : null;

  if (!roleRaw) return null;

  return {
    id: Number.isInteger(userId) && userId > 0 ? userId : null,
    role: roleRaw,
    username: normalizeText(req.headers['x-user-name']) || '',
  };
}

async function resolveJwtIdentity(token) {
  const parsed = verifyToken(token, TOKEN_TYPE_ACCESS);
  const sessionResult = await query(
    `SELECT s.id, s.user_id, s.status, s.expires_at, s.last_seen_at, s.refreshed_at, s.created_at, u.username, u.role
     FROM mes_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = $1`,
    [parsed.sessionId]
  );

  if (!sessionResult.rows.length) throw new Error('session not found');

  const session = sessionResult.rows[0];
  if (Number(session.user_id) !== parsed.userId) throw new Error('session user mismatch');
  if (normalizeText(session.status) !== 'ACTIVE') throw new Error('session is not active');

  const nowSec = epochNowSec();
  const sessionExpiresAt = Math.floor(new Date(session.expires_at).getTime() / 1000);
  if (!Number.isFinite(sessionExpiresAt) || sessionExpiresAt <= nowSec) throw new Error('session expired');

  const lastSeenCandidate = session.last_seen_at || session.refreshed_at || session.created_at;
  const lastSeenAtSec = Math.floor(new Date(lastSeenCandidate).getTime() / 1000);
  const isInactive = Number.isFinite(lastSeenAtSec) && nowSec - lastSeenAtSec > SESSION_INACTIVITY_SEC;
  if (isInactive) {
    await query(
      `UPDATE mes_sessions
       SET status='EXPIRED',
           revoked_at=NOW(),
           revoked_reason='inactivity_timeout'
       WHERE id=$1
         AND status='ACTIVE'`,
      [parsed.sessionId]
    ).catch(() => {});
    throw new Error('session inactive timeout');
  }

  await query('UPDATE mes_sessions SET last_seen_at = NOW(), access_jti = $2 WHERE id = $1', [parsed.sessionId, parsed.jti]).catch(() => {});

  return {
    id: parsed.userId,
    role: normalizeCode(session.role || parsed.role),
    username: normalizeText(session.username || parsed.username),
    session_id: parsed.sessionId,
    token_jti: parsed.jti,
    source: 'bearer',
  };
}

async function attachAuthContext(req, res, next) {
  try {
    req.user = null;
    req.auth = { mode: AUTH_MODE, source: 'anonymous', session_id: null };

    const bearerToken = extractBearerToken(req);
    if (bearerToken) {
      const jwtUser = await resolveJwtIdentity(bearerToken);
      req.user = {
        id: jwtUser.id,
        role: jwtUser.role,
        username: jwtUser.username,
      };
      req.auth = {
        mode: AUTH_MODE,
        source: jwtUser.source,
        session_id: jwtUser.session_id,
        token_jti: jwtUser.token_jti,
      };
      return next();
    }

    if (AUTH_MODE === AUTH_MODE_JWT) {
      return next();
    }

    const headerUser = parseHeaderIdentity(req);
    if (headerUser) {
      req.user = {
        id: headerUser.id,
        role: headerUser.role,
        username: headerUser.username,
      };
      req.auth = { mode: AUTH_MODE, source: 'header', session_id: null };
    }
    return next();
  } catch (_error) {
    const attemptedBearer = extractBearerToken(req);
    req.user = null;
    req.auth = { mode: AUTH_MODE, source: 'invalid_token', session_id: null };
    if (attemptedBearer) {
      return res.status(401).json({
        status: 'error',
        code: 'AUTH_REQUIRED',
        message: 'invalid or expired access token',
        request_id: reqId(res),
      });
    }
    return next();
  }
}

function getAuthMode() {
  return AUTH_MODE;
}

function getAuthConfigSnapshot() {
  const secretReady = ensureJwtSecretReady();
  const ready = AUTH_MODE === AUTH_MODE_JWT ? secretReady : true;
  return {
    auth_mode: AUTH_MODE,
    jwt: {
      issuer: JWT_ISSUER,
      secret_ready: secretReady,
      secret_min_length: 32,
      access_ttl_sec: ACCESS_TTL_SEC,
      refresh_ttl_sec: REFRESH_TTL_SEC,
    },
    session: {
      max_concurrent_sessions: MAX_CONCURRENT_SESSIONS,
      inactivity_sec: SESSION_INACTIVITY_SEC,
    },
    ready,
  };
}

function getAuthPolicySnapshot() {
  return {
    max_concurrent_sessions: MAX_CONCURRENT_SESSIONS,
    inactivity_sec: SESSION_INACTIVITY_SEC,
  };
}

module.exports = {
  AUTH_MODE_HEADER,
  AUTH_MODE_JWT,
  AUTH_MODE_HYBRID,
  TOKEN_TYPE_ACCESS,
  TOKEN_TYPE_REFRESH,
  getAuthMode,
  getAuthConfigSnapshot,
  getAuthPolicySnapshot,
  hashToken,
  issueSessionTokens,
  verifyToken,
  attachAuthContext,
  extractBearerToken,
};
