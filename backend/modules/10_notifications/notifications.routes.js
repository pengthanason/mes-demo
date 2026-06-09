const express = require('express');
const { query } = require('../../db');
const {
  sendValidationError,
  reqId,
  requireRoles,
  normalizeText,
} = require('../../common/http');
const { normalizeCode } = require('../../utils/validator');
const {
  VALID_NOTIFICATION_AUDIENCES,
  VALID_NOTIFICATION_STATUSES,
  normalizeAudienceKey,
  isValidAudienceKey,
  resolveViewerAudiences,
  createNotification,
} = require('../../common/notifications');

const router = express.Router();

const NOTIFICATION_ROUTE_ROLES = ['PM', 'STORE', 'QC', 'QA', 'TECH', 'PD', 'ADMIN'];

function parsePositiveInt(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseInboxLimit(rawValue) {
  if (rawValue == null || rawValue === '') return 50;
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 200) return NaN;
  return parsed;
}

function normalizeStatusFilter(rawValue) {
  const normalized = normalizeCode(rawValue || 'ALL');
  if (VALID_NOTIFICATION_STATUSES.includes(normalized)) return normalized;
  return '';
}

router.get('/api/notifications/inbox', requireRoles(NOTIFICATION_ROUTE_ROLES), async (req, res) => {
  const viewerRole = normalizeCode(req.user?.role);
  const viewerAudiences = resolveViewerAudiences(viewerRole);
  if (!viewerAudiences.length) {
    return res.status(403).json({
      status: 'error',
      code: 'FORBIDDEN_AUDIENCE',
      message: 'viewer role has no inbox audience scope',
      request_id: reqId(res),
    });
  }

  const statusFilter = normalizeStatusFilter(req.query.status);
  if (!statusFilter) {
    return sendValidationError(res, 'status must be NEW, ACK, or ALL');
  }

  const limit = parseInboxLimit(req.query.limit);
  if (!Number.isInteger(limit)) {
    return sendValidationError(res, 'limit must be an integer between 1 and 200');
  }

  const audienceFilter = normalizeAudienceKey(req.query.audience);
  if (audienceFilter && !isValidAudienceKey(audienceFilter)) {
    return sendValidationError(
      res,
      `audience must be one of: ${VALID_NOTIFICATION_AUDIENCES.join(', ')}`
    );
  }
  if (audienceFilter && !viewerAudiences.includes(audienceFilter)) {
    return res.status(403).json({
      status: 'error',
      code: 'FORBIDDEN_AUDIENCE',
      message: `viewer role ${viewerRole} cannot access audience=${audienceFilter}`,
      request_id: reqId(res),
    });
  }

  const audienceScope = audienceFilter ? [audienceFilter] : viewerAudiences;

  try {
    const [noticesResult, summaryResult] = await Promise.all([
      query(
        `SELECT
           id,
           notice_type,
           severity,
           audience_key,
           title,
           message,
           entity_type,
           entity_id,
           wo_id,
           unit_sn,
           uid,
           metadata,
           status,
           created_at,
           created_by,
           acknowledged_at,
           acknowledged_by
         FROM mes_notifications
         WHERE audience_key = ANY($1::text[])
           AND ($2::text = 'ALL' OR status = $2::text)
         ORDER BY created_at DESC, id DESC
         LIMIT $3`,
        [audienceScope, statusFilter, limit]
      ),
      query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 'NEW')::int AS unread
         FROM mes_notifications
         WHERE audience_key = ANY($1::text[])`,
        [audienceScope]
      ),
    ]);

    return res.json({
      status: 'success',
      filter: {
        status: statusFilter,
        limit,
        audiences: audienceScope,
      },
      summary: summaryResult.rows[0] || { total: 0, unread: 0 },
      notices: noticesResult.rows,
      request_id: reqId(res),
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      code: 'NOTIFICATION_INBOX_FAILED',
      message: error.message,
      request_id: reqId(res),
    });
  }
});

router.post('/api/notifications/:notificationId/ack', requireRoles(NOTIFICATION_ROUTE_ROLES), async (req, res) => {
  const notificationId = parsePositiveInt(req.params.notificationId, NaN);
  if (!Number.isInteger(notificationId)) {
    return sendValidationError(res, 'notificationId must be positive integer');
  }

  const viewerRole = normalizeCode(req.user?.role);
  const audienceScope = resolveViewerAudiences(viewerRole);
  if (!audienceScope.length) {
    return res.status(403).json({
      status: 'error',
      code: 'FORBIDDEN_AUDIENCE',
      message: 'viewer role has no inbox audience scope',
      request_id: reqId(res),
    });
  }

  try {
    const current = await query(
      `SELECT
         id,
         notice_type,
         severity,
         audience_key,
         title,
         message,
         status,
         created_at,
         acknowledged_at,
         acknowledged_by
       FROM mes_notifications
       WHERE id = $1
         AND audience_key = ANY($2::text[])`,
      [notificationId, audienceScope]
    );

    if (!current.rows.length) {
      return res.status(404).json({
        status: 'error',
        code: 'NOTICE_NOT_FOUND',
        request_id: reqId(res),
      });
    }

    const currentNotice = current.rows[0];
    if (currentNotice.status === 'ACK') {
      return res.json({
        status: 'success',
        already_ack: true,
        notice: currentNotice,
        request_id: reqId(res),
      });
    }

    const acked = await query(
      `UPDATE mes_notifications
       SET status = 'ACK',
           acknowledged_at = NOW(),
           acknowledged_by = COALESCE($2, acknowledged_by)
       WHERE id = $1
       RETURNING
         id,
         notice_type,
         severity,
         audience_key,
         title,
         message,
         status,
         created_at,
         acknowledged_at,
         acknowledged_by`,
      [notificationId, parsePositiveInt(req.user?.id, null)]
    );

    return res.json({
      status: 'success',
      already_ack: false,
      notice: acked.rows[0],
      request_id: reqId(res),
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      code: 'NOTIFICATION_ACK_FAILED',
      message: error.message,
      request_id: reqId(res),
    });
  }
});

router.post('/api/notifications/publish', requireRoles(NOTIFICATION_ROUTE_ROLES), async (req, res) => {
  const audienceKey = normalizeAudienceKey(req.body?.audience_key);
  const title = normalizeText(req.body?.title);
  const message = normalizeText(req.body?.message);
  const severity = normalizeCode(req.body?.severity || 'INFO');
  const noticeType = normalizeCode(req.body?.notice_type || 'MANUAL_NOTICE');
  const entityType = normalizeCode(req.body?.entity_type || '');
  const entityId = normalizeText(req.body?.entity_id || '');
  const woId = req.body?.wo_id;
  const unitSn = normalizeText(req.body?.unit_sn || '');
  const uid = normalizeCode(req.body?.uid || '');
  const metadata = req.body?.metadata;

  if (!isValidAudienceKey(audienceKey)) {
    return sendValidationError(
      res,
      `audience_key must be one of: ${VALID_NOTIFICATION_AUDIENCES.join(', ')}`
    );
  }
  if (!title) {
    return sendValidationError(res, 'title is required');
  }
  if (String(noticeType).length > 64 || !/^[A-Z0-9_]{2,64}$/.test(noticeType)) {
    return sendValidationError(res, 'notice_type must match [A-Z0-9_] and be 2..64 chars');
  }
  if (!['INFO', 'WARN', 'ERROR'].includes(severity)) {
    return sendValidationError(res, 'severity must be INFO, WARN, or ERROR');
  }
  if (entityType && !/^[A-Z0-9_]{2,64}$/.test(entityType)) {
    return sendValidationError(res, 'entity_type must match [A-Z0-9_] and be 2..64 chars');
  }
  if (woId != null && woId !== '') {
    const woIdNum = Number(woId);
    if (!Number.isInteger(woIdNum) || woIdNum <= 0) {
      return sendValidationError(res, 'wo_id must be a positive integer when provided');
    }
  }

  try {
    const created = await createNotification({
      audience_key: audienceKey,
      title,
      message,
      severity,
      notice_type: noticeType,
      entity_type: entityType,
      entity_id: entityId,
      wo_id: woId,
      unit_sn: unitSn,
      uid,
      metadata,
      created_by: req.user?.id,
    });

    return res.status(201).json({
      status: 'success',
      notice: created,
      request_id: reqId(res),
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      code: 'NOTIFICATION_PUBLISH_FAILED',
      message: error.message,
      request_id: reqId(res),
    });
  }
});

module.exports = router;
