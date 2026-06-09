const { query } = require('../db');
const { normalizeCode } = require('../utils/validator');
const { normalizeText } = require('./http');

const VALID_NOTIFICATION_AUDIENCES = ['PM', 'STORE', 'QC', 'QA', 'TECH', 'PD', 'ADMIN', 'ACCOUNT'];
const VALID_NOTIFICATION_SEVERITIES = ['INFO', 'WARN', 'ERROR'];
const VALID_NOTIFICATION_STATUSES = ['NEW', 'ACK', 'ALL'];

function normalizeAudienceKey(value) {
  return normalizeCode(value);
}

function isValidAudienceKey(value) {
  return VALID_NOTIFICATION_AUDIENCES.includes(normalizeAudienceKey(value));
}

function normalizeSeverity(value) {
  const normalized = normalizeCode(value || 'INFO');
  if (VALID_NOTIFICATION_SEVERITIES.includes(normalized)) return normalized;
  return 'INFO';
}

function normalizeNoticeType(value) {
  const normalized = normalizeCode(value || 'GENERAL_NOTICE');
  if (/^[A-Z0-9_]{2,64}$/.test(normalized)) return normalized;
  return 'GENERAL_NOTICE';
}

function normalizeEntityType(value) {
  const normalized = normalizeCode(value || '');
  if (!normalized) return '';
  if (/^[A-Z0-9_]{2,64}$/.test(normalized)) return normalized;
  return '';
}

function normalizeEntityId(value) {
  const normalized = normalizeText(value);
  if (!normalized) return '';
  return normalized.slice(0, 128);
}

function normalizeMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  try {
    JSON.stringify(value);
    return value;
  } catch (_error) {
    return {};
  }
}

function parsePositiveIntOrNull(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function resolveViewerAudiences(role) {
  const normalizedRole = normalizeCode(role);
  if (normalizedRole === 'ADMIN') {
    return [...VALID_NOTIFICATION_AUDIENCES];
  }

  const audiences = new Set();
  if (isValidAudienceKey(normalizedRole)) {
    audiences.add(normalizedRole);
  }

  // PM can track ACCOUNT operational notices during pilot.
  if (normalizedRole === 'PM') {
    audiences.add('ACCOUNT');
  }

  return Array.from(audiences);
}

async function createNotification(input, options = {}) {
  const audienceKey = normalizeAudienceKey(input.audience_key || input.audienceKey);
  if (!isValidAudienceKey(audienceKey)) {
    throw new Error(`invalid notification audience_key=${audienceKey || 'EMPTY'}`);
  }

  const title = normalizeText(input.title).slice(0, 240);
  if (!title) {
    throw new Error('notification title is required');
  }

  const severity = normalizeSeverity(input.severity);
  const noticeType = normalizeNoticeType(input.notice_type || input.noticeType);
  const message = normalizeText(input.message).slice(0, 2000);
  const entityType = normalizeEntityType(input.entity_type || input.entityType);
  const entityId = normalizeEntityId(input.entity_id || input.entityId);
  const woId = parsePositiveIntOrNull(input.wo_id || input.woId);
  const createdBy = parsePositiveIntOrNull(input.created_by || input.createdBy);
  const acknowledgedBy = parsePositiveIntOrNull(input.acknowledged_by || input.acknowledgedBy);
  const unitSn = normalizeText(input.unit_sn || input.unitSn).slice(0, 120);
  const uid = normalizeCode(input.uid).slice(0, 32);
  const metadata = normalizeMetadata(input.metadata);

  const execute = options.client ? options.client.query.bind(options.client) : query;
  const inserted = await execute(
    `INSERT INTO mes_notifications (
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
       created_by,
       acknowledged_by
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, NULLIF($9::text, ''), NULLIF($10::text, ''),
       $11::jsonb, 'NEW', $12, $13
     )
     RETURNING
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
       acknowledged_by`,
    [
      noticeType,
      severity,
      audienceKey,
      title,
      message,
      entityType,
      entityId,
      woId,
      unitSn,
      uid,
      JSON.stringify(metadata),
      createdBy,
      acknowledgedBy,
    ]
  );

  return inserted.rows[0];
}

async function createNotifications(items, options = {}) {
  const source = Array.isArray(items) ? items : [];
  const created = [];
  for (const item of source) {
    created.push(await createNotification(item, options));
  }
  return created;
}

async function safeCreateNotifications(items, options = {}) {
  try {
    return await createNotifications(items, options);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`[notifications] publish skipped: ${error.message}`);
    return [];
  }
}

module.exports = {
  VALID_NOTIFICATION_AUDIENCES,
  VALID_NOTIFICATION_SEVERITIES,
  VALID_NOTIFICATION_STATUSES,
  normalizeAudienceKey,
  isValidAudienceKey,
  normalizeSeverity,
  normalizeNoticeType,
  resolveViewerAudiences,
  createNotification,
  createNotifications,
  safeCreateNotifications,
};
