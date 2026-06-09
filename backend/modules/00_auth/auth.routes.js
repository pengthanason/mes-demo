const express = require('express');
const bcrypt = require('bcryptjs');
const { withTransaction, query } = require('../../db');
const {
  normalizeText,
  reqId,
  sendValidationError,
  requireRoles,
} = require('../../common/http');
const {
  AUTH_MODE_HEADER,
  getAuthMode,
  getAuthConfigSnapshot,
  getAuthPolicySnapshot,
  hashToken,
  issueSessionTokens,
  verifyToken,
  TOKEN_TYPE_REFRESH,
  extractBearerToken,
} = require('../../common/auth');

const router = express.Router();

function parseClientIp(req) {
  const rawForwarded = normalizeText(req.headers['x-forwarded-for']);
  if (rawForwarded) {
    const first = rawForwarded.split(',')[0];
    return normalizeText(first);
  }
  return normalizeText(req.ip || req.socket?.remoteAddress);
}

function authSummary(user) {
  return {
    id: Number(user.id),
    username: normalizeText(user.username),
    role: normalizeText(user.role).toUpperCase(),
  };
}

async function writeAuditLog(client, payload) {
  const {
    username,
    userId,
    success,
    reason,
    ipAddress,
    userAgent,
    authMode,
  } = payload;

  await client.query(
    `INSERT INTO auth_login_audits (username, user_id, success, reason, ip_address, user_agent, auth_mode)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      normalizeText(username).toLowerCase(),
      userId == null ? null : Number(userId),
      Boolean(success),
      normalizeText(reason),
      normalizeText(ipAddress),
      normalizeText(userAgent),
      normalizeText(authMode),
    ]
  );
}

function parseRefreshTokenInput(req) {
  const bodyToken = normalizeText(req.body?.refresh_token);
  if (bodyToken) return bodyToken;

  const bearer = extractBearerToken(req);
  if (!bearer) return '';

  try {
    const parsed = verifyToken(bearer, TOKEN_TYPE_REFRESH);
    if (parsed?.tokenType === TOKEN_TYPE_REFRESH) return bearer;
  } catch (_err) {
    return '';
  }

  return '';
}

function sendAuthConfig(res) {
  const authConfig = getAuthConfigSnapshot();
  return res.json({
    status: 'ok',
    ...authConfig,
    policy: getAuthPolicySnapshot(),
    request_id: reqId(res),
  });
}

router.get(['/api/auth/config', '/api/mes/auth/config'], (_req, res) => {
  return sendAuthConfig(res);
});

router.post('/api/mes/auth/login', async (req, res) => {
  const username = normalizeText(req.body?.username).toLowerCase();
  const password = normalizeText(req.body?.password);
  const authMode = getAuthMode();
  const ipAddress = parseClientIp(req);
  const userAgent = normalizeText(req.headers['user-agent']);

  if (!username) return sendValidationError(res, 'username is required');
  if (!password) return sendValidationError(res, 'password is required');
  if (authMode === AUTH_MODE_HEADER) {
    return res.status(409).json({
      status: 'error',
      code: 'AUTH_MODE_HEADER_ONLY',
      message: 'MES_AUTH_MODE=header does not allow JWT login flow',
      request_id: reqId(res),
    });
  }
  const authConfig = getAuthConfigSnapshot();
  if (!authConfig.jwt.secret_ready) {
    return res.status(503).json({
      status: 'error',
      code: 'JWT_SECRET_NOT_READY',
      message: 'MES_JWT_SECRET must be set with at least 32 characters',
      request_id: reqId(res),
    });
  }

  try {
    const payload = await withTransaction(async (client) => {
      const found = await client.query(
        `SELECT id, username, password_hash, role
         FROM users
         WHERE LOWER(username) = LOWER($1)
         LIMIT 1`,
        [username]
      );

      if (!found.rows.length) {
        await writeAuditLog(client, {
          username,
          userId: null,
          success: false,
          reason: 'user_not_found',
          ipAddress,
          userAgent,
          authMode,
        });
        return { errorCode: 401, error: 'invalid username or password' };
      }

      const user = found.rows[0];
      const passOk = await bcrypt.compare(password, String(user.password_hash || ''));
      if (!passOk) {
        await writeAuditLog(client, {
          username,
          userId: user.id,
          success: false,
          reason: 'password_mismatch',
          ipAddress,
          userAgent,
          authMode,
        });
        return { errorCode: 401, error: 'invalid username or password' };
      }

      const sessionInsert = await client.query(
        `INSERT INTO mes_sessions (user_id, refresh_token_hash, status, expires_at, auth_mode)
         VALUES ($1, 'pending', 'ACTIVE', NOW(), $2)
         RETURNING id`,
        [user.id, authMode]
      );
      const sessionId = Number(sessionInsert.rows[0].id);
      const tokens = issueSessionTokens(user, sessionId);
      const refreshHash = hashToken(tokens.refresh_token);

      await client.query(
        `UPDATE mes_sessions
         SET refresh_token_hash=$2,
             access_jti=$3,
             refresh_jti=$4,
             expires_at=TO_TIMESTAMP($5),
             refreshed_at=NOW(),
             last_seen_at=NOW()
         WHERE id=$1`,
        [sessionId, refreshHash, tokens.access_jti, tokens.refresh_jti, tokens.refresh_token_expires_at]
      );

      const authPolicy = getAuthPolicySnapshot();
      await client.query(
        `UPDATE mes_sessions
         SET status='REVOKED',
             revoked_at=NOW(),
             revoked_reason='max_concurrent_sessions'
         WHERE id IN (
           SELECT id
           FROM mes_sessions
           WHERE user_id=$1
             AND status='ACTIVE'
           ORDER BY COALESCE(last_seen_at, refreshed_at, created_at) DESC, id DESC
           OFFSET $2
         )`,
        [user.id, authPolicy.max_concurrent_sessions]
      );

      await writeAuditLog(client, {
        username: user.username,
        userId: user.id,
        success: true,
        reason: 'login_success',
        ipAddress,
        userAgent,
        authMode,
      });

      return {
        user: authSummary(user),
        session_id: sessionId,
        ...tokens,
      };
    });

    if (payload.error) {
      return res.status(payload.errorCode).json({
        status: 'error',
        code: 'AUTH_LOGIN_FAILED',
        message: payload.error,
        request_id: reqId(res),
      });
    }

    return res.status(201).json({
      status: 'success',
      auth_mode: authMode,
      ...payload,
      request_id: reqId(res),
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      code: 'AUTH_LOGIN_FAILED',
      message: error.message,
      request_id: reqId(res),
    });
  }
});

router.post('/api/mes/auth/refresh', async (req, res) => {
  const authMode = getAuthMode();
  if (authMode === AUTH_MODE_HEADER) {
    return res.status(409).json({
      status: 'error',
      code: 'AUTH_MODE_HEADER_ONLY',
      message: 'MES_AUTH_MODE=header does not allow JWT refresh flow',
      request_id: reqId(res),
    });
  }
  const authConfig = getAuthConfigSnapshot();
  if (!authConfig.jwt.secret_ready) {
    return res.status(503).json({
      status: 'error',
      code: 'JWT_SECRET_NOT_READY',
      message: 'MES_JWT_SECRET must be set with at least 32 characters',
      request_id: reqId(res),
    });
  }

  const refreshToken = parseRefreshTokenInput(req);
  if (!refreshToken) return sendValidationError(res, 'refresh_token is required');

  try {
    const parsed = verifyToken(refreshToken, TOKEN_TYPE_REFRESH);
    const refreshHash = hashToken(refreshToken);

    const payload = await withTransaction(async (client) => {
      const found = await client.query(
        `SELECT s.id, s.user_id, s.status, s.expires_at, s.refresh_token_hash, s.refresh_jti, u.username, u.role
         FROM mes_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.id=$1
         LIMIT 1
         FOR UPDATE`,
        [parsed.sessionId]
      );

      if (!found.rows.length) {
        return { errorCode: 401, error: 'session not found' };
      }

      const session = found.rows[0];
      const sessionExp = Math.floor(new Date(session.expires_at).getTime() / 1000);
      const refreshJti = normalizeText(session.refresh_jti);

      if (
        normalizeText(session.status) !== 'ACTIVE' ||
        Number(session.user_id) !== parsed.userId ||
        !sessionExp ||
        sessionExp <= Math.floor(Date.now() / 1000) ||
        !refreshJti ||
        refreshJti !== parsed.jti ||
        !normalizeText(session.refresh_token_hash) ||
        normalizeText(session.refresh_token_hash) !== refreshHash
      ) {
        await client.query(
          `UPDATE mes_sessions
           SET status='REVOKED',
               revoked_at=NOW(),
               revoked_reason='refresh_validation_failed'
           WHERE id=$1 AND status='ACTIVE'`,
          [parsed.sessionId]
        );
        return { errorCode: 401, error: 'invalid refresh token' };
      }

      const user = {
        id: Number(session.user_id),
        username: normalizeText(session.username),
        role: normalizeText(session.role).toUpperCase(),
      };
      const tokens = issueSessionTokens(user, parsed.sessionId);
      await client.query(
        `UPDATE mes_sessions
         SET refresh_token_hash=$2,
             access_jti=$3,
             refresh_jti=$4,
             refreshed_at=NOW(),
             expires_at=TO_TIMESTAMP($5),
             last_seen_at=NOW()
         WHERE id=$1`,
        [parsed.sessionId, hashToken(tokens.refresh_token), tokens.access_jti, tokens.refresh_jti, tokens.refresh_token_expires_at]
      );

      return {
        user: authSummary(user),
        session_id: parsed.sessionId,
        ...tokens,
      };
    });

    if (payload.error) {
      return res.status(payload.errorCode).json({
        status: 'error',
        code: 'AUTH_REFRESH_FAILED',
        message: payload.error,
        request_id: reqId(res),
      });
    }

    return res.json({
      status: 'success',
      auth_mode: authMode,
      ...payload,
      request_id: reqId(res),
    });
  } catch (error) {
    return res.status(401).json({
      status: 'error',
      code: 'AUTH_REFRESH_FAILED',
      message: error.message || 'invalid refresh token',
      request_id: reqId(res),
    });
  }
});

router.post('/api/mes/auth/logout', async (req, res) => {
  let sessionId = Number(req.auth?.session_id || 0);

  if (!sessionId) {
    const refreshToken = normalizeText(req.body?.refresh_token);
    if (!refreshToken) return sendValidationError(res, 'refresh_token is required when bearer session is missing');
    try {
      const parsed = verifyToken(refreshToken, TOKEN_TYPE_REFRESH);
      sessionId = parsed.sessionId;
    } catch (error) {
      return res.status(401).json({
        status: 'error',
        code: 'AUTH_LOGOUT_FAILED',
        message: error.message || 'invalid refresh token',
        request_id: reqId(res),
      });
    }
  }

  try {
    const result = await query(
      `UPDATE mes_sessions
       SET status='REVOKED',
           revoked_at=NOW(),
           revoked_reason='logout'
       WHERE id=$1 AND status='ACTIVE'
       RETURNING id`,
      [sessionId]
    );

    return res.json({
      status: 'success',
      session_id: sessionId,
      already_logged_out: result.rows.length === 0,
      request_id: reqId(res),
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      code: 'AUTH_LOGOUT_FAILED',
      message: error.message,
      request_id: reqId(res),
    });
  }
});

router.get('/api/mes/auth/me', requireRoles(['PM', 'STORE', 'QC', 'QA', 'TECH', 'PD', 'ADMIN']), async (req, res) => {
  if (!Number.isInteger(Number(req.user?.id)) || Number(req.user.id) <= 0) {
    return res.status(400).json({
      status: 'error',
      code: 'AUTH_ME_REQUIRES_USER_ID',
      message: 'authenticated user id is required',
      request_id: reqId(res),
    });
  }

  try {
    const found = await query(
      `SELECT id, username, role
       FROM users
       WHERE id=$1
       LIMIT 1`,
      [req.user.id]
    );
    if (!found.rows.length) {
      return res.status(404).json({
        status: 'error',
        code: 'USER_NOT_FOUND',
        request_id: reqId(res),
      });
    }

    return res.json({
      status: 'success',
      user: authSummary(found.rows[0]),
      auth: {
        source: normalizeText(req.auth?.source),
        mode: normalizeText(req.auth?.mode),
        session_id: req.auth?.session_id || null,
      },
      request_id: reqId(res),
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      code: 'AUTH_ME_FAILED',
      message: error.message,
      request_id: reqId(res),
    });
  }
});

module.exports = router;
