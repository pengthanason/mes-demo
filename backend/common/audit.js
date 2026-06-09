/**
 * audit.js — Helper สำหรับเขียน audit_log
 *
 * Usage:
 *   const { logAudit } = require('./audit');
 *
 *   // Inside a transaction:
 *   await logAudit(trx, {
 *     entityType: 'WORK_ORDER',
 *     entityId:   String(woId),
 *     action:     'STATUS_CHANGE',
 *     oldValue:   { status: 'OPEN' },
 *     newValue:   { status: 'IN_PROGRESS' },
 *     actorId:    req.user?.id,
 *     actorRole:  req.user?.role,
 *     ipAddress:  req.ip,
 *   });
 *
 *   // Without transaction (pass pool query fn):
 *   await logAudit(pool, { ... });
 */

'use strict';

/**
 * Insert a row into audit_log.
 *
 * @param {object} clientOrQuery - A knex transaction, knex instance, or pg pool/client
 *   that exposes `.raw(sql, bindings)` (knex) or `.query(sql, params)` (pg).
 * @param {object} opts
 * @param {string} opts.entityType  - e.g. 'WORK_ORDER', 'INVENTORY', 'APPROVAL'
 * @param {string} opts.entityId    - the primary key or identifier of the entity
 * @param {string} opts.action      - e.g. 'STATUS_CHANGE', 'DEDUCTION', 'APPROVAL'
 * @param {object|null} [opts.oldValue]  - previous state (stored as JSONB)
 * @param {object|null} [opts.newValue]  - new state (stored as JSONB)
 * @param {number|null} [opts.actorId]   - user id who performed the action
 * @param {string|null} [opts.actorRole] - role of the actor
 * @param {string|null} [opts.ipAddress] - client IP address
 */
async function logAudit(clientOrQuery, {
  entityType,
  entityId,
  action,
  oldValue = null,
  newValue = null,
  actorId = null,
  actorRole = null,
  ipAddress = null,
}) {
  const sql = `
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, actor_id, actor_role, ip_address)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `;

  const params = [
    entityType,
    String(entityId),
    action,
    oldValue ? JSON.stringify(oldValue) : null,
    newValue ? JSON.stringify(newValue) : null,
    actorId ?? null,
    actorRole ?? null,
    ipAddress ?? null,
  ];

  // Support both knex (.raw) and pg pool/client (.query)
  if (typeof clientOrQuery.raw === 'function') {
    // knex — uses ? placeholders, so convert
    await clientOrQuery.raw(sql.replace(/\$\d+/g, '?'), params);
  } else if (typeof clientOrQuery.query === 'function') {
    // pg pool/client — uses $N placeholders natively
    await clientOrQuery.query(sql, params);
  } else {
    throw new Error('logAudit: first argument must be a knex instance/trx or pg pool/client');
  }
}

module.exports = { logAudit };
