const express = require('express');
const { withTransaction, query } = require('../../db');
const { normalizeCode } = require('../../utils/validator');
const {
  normalizeText,
  reqId,
  requireRoles,
  sendValidationError,
} = require('../../common/http');

const router = express.Router();

const ROUTE_ADMIN_ROLES = ['ADMIN', 'PD', 'PM'];
const PRODUCTION_ONLY_STATION_TYPE = 'PD';
const VALID_BOOL_TRUE = new Set(['1', 'true', 'yes', 'on']);
const VALID_BOOL_FALSE = new Set(['0', 'false', 'no', 'off']);

function normalizeStationName(value) {
  return normalizeCode(value).replace(/\s+/g, '_');
}

function parseBooleanField(rawValue, fallbackValue = false) {
  if (typeof rawValue === 'boolean') return rawValue;
  if (rawValue == null || rawValue === '') return fallbackValue;
  const normalized = String(rawValue).trim().toLowerCase();
  if (VALID_BOOL_TRUE.has(normalized)) return true;
  if (VALID_BOOL_FALSE.has(normalized)) return false;
  throw new Error('invalid boolean');
}

function parseRouteId(rawValue) {
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) return 0;
  return parsed;
}

function validateConsecutiveStepOrders(stepOrders) {
  const sorted = [...stepOrders].sort((left, right) => left - right);
  for (let index = 0; index < sorted.length; index += 1) {
    if (sorted[index] !== index + 1) {
      return false;
    }
  }
  return true;
}

function parseRoutePayload(body) {
  const routeCode = normalizeCode(body?.route_code);
  const routeName = normalizeText(body?.route_name);
  const isActive = parseBooleanField(body?.is_active, true);
  const requestedDefault = parseBooleanField(body?.is_default, false);
  const enforceSequence = parseBooleanField(body?.enforce_sequence, false);
  const stepsInput = Array.isArray(body?.steps) ? body.steps : null;

  if (!routeCode) {
    return { error: 'route_code is required' };
  }
  if (!/^[A-Z0-9_]{3,80}$/.test(routeCode)) {
    return { error: 'route_code must match [A-Z0-9_] and be 3..80 chars' };
  }
  if (!routeName) {
    return { error: 'route_name is required' };
  }
  if (routeName.length > 160) {
    return { error: 'route_name must be 160 chars or less' };
  }
  if (!stepsInput || !stepsInput.length) {
    return { error: 'steps must contain at least 1 station' };
  }

  const steps = [];
  const seenOrders = new Set();
  const seenStations = new Set();

  for (const rawStep of stepsInput) {
    const stepOrder = Number(rawStep?.step_order);
    const stationName = normalizeStationName(rawStep?.station_name);

    if (!Number.isInteger(stepOrder) || stepOrder <= 0) {
      return { error: 'each step_order must be a positive integer' };
    }
    if (!stationName) {
      return { error: 'each station_name is required' };
    }
    if (seenOrders.has(stepOrder)) {
      return { error: `duplicate step_order ${stepOrder} is not allowed` };
    }
    if (seenStations.has(stationName)) {
      return { error: `duplicate station_name ${stationName} is not allowed within a route` };
    }

    seenOrders.add(stepOrder);
    seenStations.add(stationName);
    steps.push({
      step_order: stepOrder,
      station_name: stationName,
      station_type: PRODUCTION_ONLY_STATION_TYPE,
      requires_fai: parseBooleanField(rawStep?.requires_fai, false),
      is_required: parseBooleanField(rawStep?.is_required, true),
      allow_rework: parseBooleanField(rawStep?.allow_rework, true),
    });
  }

  if (!validateConsecutiveStepOrders(steps.map((item) => item.step_order))) {
    return { error: 'step_order values must be consecutive starting at 1' };
  }

  steps.sort((left, right) => left.step_order - right.step_order);

  return {
    value: {
      route_code: routeCode,
      route_name: routeName,
      is_active: isActive,
      is_default: isActive ? requestedDefault : false,
      enforce_sequence: enforceSequence,
      steps,
    },
  };
}

async function loadRouteSummary(client, routeId) {
  const routeResult = await client.query(
    `SELECT id, route_code, route_name, is_active, is_default, enforce_sequence
     FROM process_routes
     WHERE id = $1
     LIMIT 1`,
    [routeId]
  );
  const route = routeResult.rows[0];
  if (!route) return null;

  const stepResult = await client.query(
    `SELECT step_order, station_name, station_type, requires_fai, is_required, allow_rework
     FROM route_steps
     WHERE route_id = $1
     ORDER BY step_order ASC`,
    [routeId]
  );

  return {
    route_id: Number(route.id),
    route_code: route.route_code,
    route_name: route.route_name,
    is_active: Boolean(route.is_active),
    is_default: Boolean(route.is_default),
    enforce_sequence: Boolean(route.enforce_sequence),
    steps: stepResult.rows.map((row) => ({
      step_order: Number(row.step_order),
      station_name: row.station_name,
      normalized_station_name: normalizeStationName(row.station_name),
      station_type: PRODUCTION_ONLY_STATION_TYPE,
      requires_fai: Boolean(row.requires_fai),
      is_required: Boolean(row.is_required),
      allow_rework: Boolean(row.allow_rework),
    })),
  };
}

async function ensureActiveDefaultRoute(client, preferredRouteId = 0) {
  const activeRoutes = await client.query(
    `SELECT id, is_default
     FROM process_routes
     WHERE is_active = TRUE
     ORDER BY is_default DESC, id ASC`
  );

  if (!activeRoutes.rows.length) return;

  let targetRouteId = preferredRouteId;
  if (!targetRouteId) {
    const existingDefault = activeRoutes.rows.find((item) => item.is_default);
    targetRouteId = Number(existingDefault?.id || activeRoutes.rows[0].id);
  }

  await client.query(
    `UPDATE process_routes
     SET is_default = CASE WHEN id = $1 THEN TRUE ELSE FALSE END
     WHERE is_active = TRUE`,
    [targetRouteId]
  );
}

async function insertRouteSteps(client, routeId, steps) {
  for (const step of steps) {
    await client.query(
      `INSERT INTO route_steps (
          route_id,
          step_order,
          station_name,
          station_type,
          requires_fai,
          is_required,
          allow_rework
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        routeId,
        step.step_order,
        step.station_name,
        step.station_type,
        step.requires_fai,
        step.is_required,
        step.allow_rework,
      ]
    );
  }
}

router.post('/api/mes/routes', requireRoles(ROUTE_ADMIN_ROLES), async (req, res) => {
  let parsedPayload;
  try {
    parsedPayload = parseRoutePayload(req.body);
  } catch (_error) {
    return sendValidationError(res, 'invalid boolean value in route payload');
  }

  if (parsedPayload.error) {
    return sendValidationError(res, parsedPayload.error);
  }

  try {
    const saved = await withTransaction(async (client) => {
      const routeInsert = await client.query(
        `INSERT INTO process_routes (
            route_code,
            route_name,
            is_active,
            is_default,
            enforce_sequence,
            created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id`,
        [
          parsedPayload.value.route_code,
          parsedPayload.value.route_name,
          parsedPayload.value.is_active,
          false,
          parsedPayload.value.enforce_sequence,
          req.user?.id || null,
        ]
      );

      const routeId = Number(routeInsert.rows[0].id);
      await insertRouteSteps(client, routeId, parsedPayload.value.steps);

      if (parsedPayload.value.is_default) {
        await ensureActiveDefaultRoute(client, routeId);
      } else {
        await ensureActiveDefaultRoute(client);
      }

      return loadRouteSummary(client, routeId);
    });

    return res.status(201).json({
      status: 'success',
      route: saved,
      request_id: reqId(res),
    });
  } catch (error) {
    if (error?.code === '23505') {
      return res.status(409).json({
        status: 'error',
        code: 'ROUTE_CONFLICT',
        message: 'route_code must be unique',
        request_id: reqId(res),
      });
    }
    return res.status(500).json({
      status: 'error',
      code: 'ROUTE_SAVE_FAILED',
      message: error.message,
      request_id: reqId(res),
    });
  }
});

router.put('/api/mes/routes/:routeId', requireRoles(ROUTE_ADMIN_ROLES), async (req, res) => {
  const routeId = parseRouteId(req.params.routeId);
  if (!routeId) return sendValidationError(res, 'routeId must be a positive integer');

  let parsedPayload;
  try {
    parsedPayload = parseRoutePayload(req.body);
  } catch (_error) {
    return sendValidationError(res, 'invalid boolean value in route payload');
  }

  if (parsedPayload.error) {
    return sendValidationError(res, parsedPayload.error);
  }

  try {
    const saved = await withTransaction(async (client) => {
      const existing = await client.query(
        `SELECT id, is_default
         FROM process_routes
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [routeId]
      );
      if (!existing.rows.length) return null;

      await client.query(
        `UPDATE process_routes
         SET route_code = $2,
             route_name = $3,
             is_active = $4,
             is_default = FALSE,
             enforce_sequence = $5,
             updated_at = NOW()
         WHERE id = $1`,
        [
          routeId,
          parsedPayload.value.route_code,
          parsedPayload.value.route_name,
          parsedPayload.value.is_active,
          parsedPayload.value.enforce_sequence,
        ]
      );

      await client.query('DELETE FROM route_steps WHERE route_id = $1', [routeId]);
      await insertRouteSteps(client, routeId, parsedPayload.value.steps);

      if (parsedPayload.value.is_default) {
        await ensureActiveDefaultRoute(client, routeId);
      } else {
        await ensureActiveDefaultRoute(client);
      }

      return loadRouteSummary(client, routeId);
    });

    if (!saved) {
      return res.status(404).json({
        status: 'error',
        code: 'ROUTE_NOT_FOUND',
        request_id: reqId(res),
      });
    }

    return res.json({
      status: 'success',
      route: saved,
      request_id: reqId(res),
    });
  } catch (error) {
    if (error?.code === '23505') {
      return res.status(409).json({
        status: 'error',
        code: 'ROUTE_CONFLICT',
        message: 'route_code must be unique',
        request_id: reqId(res),
      });
    }
    return res.status(500).json({
      status: 'error',
      code: 'ROUTE_SAVE_FAILED',
      message: error.message,
      request_id: reqId(res),
    });
  }
});

router.delete('/api/mes/routes/:routeId', requireRoles(ROUTE_ADMIN_ROLES), async (req, res) => {
  const routeId = parseRouteId(req.params.routeId);
  if (!routeId) return sendValidationError(res, 'routeId must be a positive integer');

  try {
    const result = await withTransaction(async (client) => {
      const existing = await client.query(
        `SELECT id, route_code
         FROM process_routes
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [routeId]
      );
      if (!existing.rows.length) return { notFound: true };

      const usage = await client.query(
        `SELECT
           (SELECT COUNT(*)::int FROM wip_tracking WHERE route_id = $1) AS tracking_count,
           (SELECT COUNT(*)::int FROM wip_tracking_events WHERE route_id = $1) AS event_count`,
        [routeId]
      );
      const trackingCount = Number(usage.rows[0]?.tracking_count || 0);
      const eventCount = Number(usage.rows[0]?.event_count || 0);
      if (trackingCount > 0 || eventCount > 0) {
        return {
          blocked: true,
          route_code: existing.rows[0].route_code,
          tracking_count: trackingCount,
          event_count: eventCount,
        };
      }

      await client.query('DELETE FROM process_routes WHERE id = $1', [routeId]);
      await ensureActiveDefaultRoute(client);
      return { deleted: true, route_code: existing.rows[0].route_code };
    });

    if (result.notFound) {
      return res.status(404).json({
        status: 'error',
        code: 'ROUTE_NOT_FOUND',
        request_id: reqId(res),
      });
    }
    if (result.blocked) {
      return res.status(409).json({
        status: 'error',
        code: 'ROUTE_DELETE_BLOCKED',
        message: `route ${result.route_code} has existing WIP/event history; deactivate or update it instead of deleting`,
        usage: {
          tracking_count: result.tracking_count,
          event_count: result.event_count,
        },
        request_id: reqId(res),
      });
    }

    return res.json({
      status: 'success',
      deleted: true,
      route_code: result.route_code,
      request_id: reqId(res),
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      code: 'ROUTE_DELETE_FAILED',
      message: error.message,
      request_id: reqId(res),
    });
  }
});

module.exports = router;
