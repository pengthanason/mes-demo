const { withTransaction } = require('../db');
const jig = require('../common/jig_client');
const { normalizeCode } = require('../utils/validator');
const { normalizeText, reqId, sendValidationError } = require('../common/http');

const SCAN_OUT_STATUS = new Set(['PASS', 'FAIL']);
const WIP_STATE = {
  READY_NEXT: 'READY_NEXT',
  IN_STATION: 'IN_STATION',
  REWORK_REQUIRED: 'REWORK_REQUIRED',
  COMPLETED: 'COMPLETED',
};

function getUserFromRequest(req) {
  return req.user || { id: null, role: 'ANON' };
}

function normalizeStationName(value) {
  return normalizeCode(value).replace(/\s+/g, '_');
}

function normalizeRouteCode(value) {
  return normalizeCode(value);
}

function parseWoId(rawBody) {
  const candidate = rawBody?.woId ?? rawBody?.wo_id;
  return Number(candidate);
}

function parseRouteCode(rawBody) {
  const candidate = rawBody?.route_code ?? rawBody?.routeCode;
  return normalizeRouteCode(candidate);
}

async function loadUnitWithWoForUpdate(client, woId, unitSn) {
  const result = await client.query(
    `SELECT pu.sn,
            pu.wo_id,
            pu.status AS unit_status,
            pu.current_station AS unit_station,
            wo.status AS wo_status
     FROM production_units pu
     JOIN work_orders wo ON wo.id = pu.wo_id
     WHERE pu.sn = $1
       AND pu.wo_id = $2
     FOR UPDATE`,
    [unitSn, woId]
  );
  return result.rows[0] || null;
}

async function loadWipForUpdate(client, woId, unitSn) {
  const result = await client.query(
    `SELECT id,
            wo_id,
            unit_sn,
            route_id,
            current_step_order,
            current_station_name,
            state,
            last_action,
            last_status,
            last_fail_station
     FROM wip_tracking
     WHERE wo_id = $1
       AND unit_sn = $2
     FOR UPDATE`,
    [woId, unitSn]
  );
  return result.rows[0] || null;
}

async function loadRouteConfig(client, routeId) {
  const result = await client.query(
    `SELECT id, route_code, enforce_sequence
     FROM process_routes
     WHERE id = $1`,
    [routeId]
  );
  return result.rows[0] || null;
}

async function loadActiveRouteByCode(client, routeCodeNormalized) {
  const result = await client.query(
    `SELECT id, route_code, enforce_sequence
     FROM process_routes
     WHERE is_active = TRUE
       AND UPPER(route_code) = $1
     LIMIT 1`,
    [routeCodeNormalized]
  );
  return result.rows[0] || null;
}

async function loadStepByOrder(client, routeId, stepOrder) {
  const result = await client.query(
    `SELECT step_order, station_name, is_required
     FROM route_steps
     WHERE route_id = $1
       AND step_order = $2`,
    [routeId, stepOrder]
  );
  return result.rows[0] || null;
}

async function loadStepByStation(client, routeId, stationNameNormalized) {
  const result = await client.query(
    `SELECT step_order, station_name, is_required
     FROM route_steps
     WHERE route_id = $1
       AND UPPER(REGEXP_REPLACE(station_name, '\\s+', '_', 'g')) = $2`,
    [routeId, stationNameNormalized]
  );
  return result.rows[0] || null;
}

async function loadMaxStepOrder(client, routeId) {
  const result = await client.query(
    `SELECT COALESCE(MAX(step_order), 0) AS max_step_order
     FROM route_steps
     WHERE route_id = $1`,
    [routeId]
  );
  return Number(result.rows[0]?.max_step_order || 0);
}

async function resolveRouteForStation(client, stationNameNormalized) {
  const result = await client.query(
    `SELECT pr.id AS route_id,
            pr.route_code,
            pr.is_default,
            pr.enforce_sequence
     FROM process_routes pr
     JOIN route_steps rs ON rs.route_id = pr.id
     WHERE pr.is_active = TRUE
       AND UPPER(REGEXP_REPLACE(rs.station_name, '\\s+', '_', 'g')) = $1
     ORDER BY pr.is_default DESC, pr.id ASC
     LIMIT 2`,
    [stationNameNormalized]
  );

  if (!result.rows.length) {
    return {
      code: 'NO_ROUTE_FOR_STATION',
      message: `station ${stationNameNormalized} is not configured in any active route`,
    };
  }

  if (result.rows.length > 1 && !result.rows[0].is_default) {
    return {
      code: 'AMBIGUOUS_ROUTE',
      message: `multiple active routes contain station ${stationNameNormalized}; set one default route`,
    };
  }

  return {
    routeId: Number(result.rows[0].route_id),
    routeCode: result.rows[0].route_code,
    enforceSequence: Boolean(result.rows[0].enforce_sequence),
  };
}

async function hasPassEventForStep(client, routeId, woId, unitSn, stepOrder) {
  const result = await client.query(
    `SELECT 1
     FROM wip_tracking_events
     WHERE route_id = $1
       AND wo_id = $2
       AND unit_sn = $3
       AND step_order = $4
       AND action = 'SCAN_OUT'
       AND status = 'PASS'
     LIMIT 1`,
    [routeId, woId, unitSn, stepOrder]
  );
  return Boolean(result.rows.length);
}

async function loadRequiredPassCounts(client, routeId, woId, unitSn) {
  const result = await client.query(
    `SELECT
       (SELECT COUNT(*)::int
        FROM route_steps rs
        WHERE rs.route_id = $1
          AND rs.is_required = TRUE) AS required_total,
       (SELECT COUNT(*)::int
        FROM route_steps rs
        WHERE rs.route_id = $1
          AND rs.is_required = TRUE
          AND EXISTS (
            SELECT 1
            FROM wip_tracking_events we
            WHERE we.route_id = $1
              AND we.wo_id = $2
              AND we.unit_sn = $3
              AND we.step_order = rs.step_order
              AND we.action = 'SCAN_OUT'
              AND we.status = 'PASS'
          )) AS passed_total`,
    [routeId, woId, unitSn]
  );

  return {
    requiredTotal: Number(result.rows[0]?.required_total || 0),
    passedTotal: Number(result.rows[0]?.passed_total || 0),
  };
}

async function loadFirstIncompleteRequiredStep(client, routeId, woId, unitSn, excludedStepOrder = null) {
  const params = [routeId, woId, unitSn];
  let sql = `SELECT rs.step_order, rs.station_name
     FROM route_steps rs
     WHERE rs.route_id = $1
       AND rs.is_required = TRUE
       AND NOT EXISTS (
         SELECT 1
         FROM wip_tracking_events we
         WHERE we.route_id = $1
           AND we.wo_id = $2
           AND we.unit_sn = $3
           AND we.step_order = rs.step_order
           AND we.action = 'SCAN_OUT'
           AND we.status = 'PASS'
       )`;

  if (Number.isInteger(excludedStepOrder) && excludedStepOrder > 0) {
    sql += ' AND rs.step_order <> $4';
    params.push(excludedStepOrder);
  }

  sql += ' ORDER BY rs.step_order LIMIT 1';

  const result = await client.query(sql, params);
  return result.rows[0] || null;
}

async function writeWipEvent(client, payload) {
  await client.query(
    `INSERT INTO wip_tracking_events (
        wo_id,
        unit_sn,
        route_id,
        step_order,
        station_name,
        action,
        status,
        result_state,
        scanned_by,
        note
    )
    VALUES ($1, $2, $3, $4, $5, $6::routing_scan_action, $7, $8::wip_state, $9, $10)`,
    [
      payload.woId,
      payload.unitSn,
      payload.routeId,
      payload.stepOrder,
      payload.stationName,
      payload.action,
      payload.status || null,
      payload.resultState,
      payload.userId,
      payload.note || '',
    ]
  );
}

function sendRouteBlock(res, code, message, details = []) {
  return res.status(400).json({
    status: 'error',
    code,
    message,
    details,
    request_id: reqId(res),
  });
}

function routeModeLabel(routeConfig) {
  return routeConfig?.enforce_sequence || routeConfig?.enforceSequence ? 'SEQUENCE' : 'FLEX';
}

async function postRoutingScanIn(req, res) {
  const user = getUserFromRequest(req);
  const woId = parseWoId(req.body);
  const unitSn = normalizeText(req.body?.unit_sn);
  const stationName = normalizeStationName(req.body?.station_name);
  const requestedRouteCode = parseRouteCode(req.body);

  if (!Number.isInteger(woId) || woId <= 0) return sendValidationError(res, 'woId must be positive integer');
  if (!unitSn) return sendValidationError(res, 'unit_sn is required');
  if (!stationName) return sendValidationError(res, 'station_name is required');

  try {
    const payload = await withTransaction(async (client) => {
      const unit = await loadUnitWithWoForUpdate(client, woId, unitSn);
      if (!unit) return { notFound: true };
      if (unit.wo_status !== 'RUNNING') {
        return { conflict: `WO must be RUNNING for routing scan-in (current=${unit.wo_status})` };
      }

      const wip = await loadWipForUpdate(client, woId, unitSn);
      if (!wip) {
        let route = null;
        if (requestedRouteCode) {
          const explicitRoute = await loadActiveRouteByCode(client, requestedRouteCode);
          if (!explicitRoute) {
            return {
              code: 'ROUTE_NOT_FOUND',
              message: `route_code ${requestedRouteCode} is not configured as active`,
            };
          }
          route = {
            routeId: Number(explicitRoute.id),
            routeCode: explicitRoute.route_code,
            enforceSequence: Boolean(explicitRoute.enforce_sequence),
          };
        } else {
          route = await resolveRouteForStation(client, stationName);
          if (route.code) return route;
        }

        const step = await loadStepByStation(client, route.routeId, stationName);
        if (!step) {
          return {
            code: 'ROUTE_STATION_NOT_ALLOWED',
            message: `station ${stationName} is not allowed in resolved route ${route.routeCode}`,
          };
        }

        await client.query(
          `INSERT INTO wip_tracking (
              wo_id,
              unit_sn,
              route_id,
              current_step_order,
              current_station_name,
              state,
              last_action,
              scan_in_count,
              last_scan_in_at
          )
          VALUES ($1, $2, $3, $4, $5, 'IN_STATION', 'SCAN_IN', 1, NOW())`,
          [woId, unitSn, route.routeId, Number(step.step_order), stationName]
        );
        await client.query(
          `UPDATE production_units
           SET current_station = $2,
               status = 'IN_PROGRESS'
           WHERE sn = $1`,
          [unitSn, stationName]
        );
        await writeWipEvent(client, {
          woId,
          unitSn,
          routeId: route.routeId,
          stepOrder: Number(step.step_order),
          stationName,
          action: 'SCAN_IN',
          resultState: WIP_STATE.IN_STATION,
          userId: user.id,
          note: `initial station scan-in on route=${route.routeCode}`,
        });

        return {
          route_id: route.routeId,
          route_code: route.routeCode,
          current_step_order: Number(step.step_order),
          station_name: stationName,
          state: WIP_STATE.IN_STATION,
          route_mode: routeModeLabel(route),
        };
      }

      if (wip.state === WIP_STATE.COMPLETED) {
        return { conflict: 'unit has already completed route' };
      }
      if (wip.state === WIP_STATE.IN_STATION) {
        return { conflict: `unit is already scanned in at station ${wip.current_station_name}; scan-out is required first` };
      }

      const routeConfig = await loadRouteConfig(client, Number(wip.route_id));
      if (!routeConfig) {
        return { conflict: `route configuration not found (route_id=${wip.route_id})` };
      }
      if (requestedRouteCode && normalizeRouteCode(routeConfig.route_code) !== requestedRouteCode) {
        return {
          code: 'ROUTE_CODE_MISMATCH',
          message: `unit is already bound to route ${normalizeRouteCode(routeConfig.route_code)}; received ${requestedRouteCode}`,
        };
      }

      const step = await loadStepByStation(client, Number(wip.route_id), stationName);
      if (!step) {
        return {
          code: 'ROUTE_STATION_NOT_ALLOWED',
          message: `station ${stationName} is not in route ${routeConfig.route_code}`,
        };
      }

      if (wip.state === WIP_STATE.REWORK_REQUIRED) {
        const expectedStation = normalizeStationName(wip.last_fail_station || wip.current_station_name);
        if (stationName !== expectedStation) {
          return {
            code: 'ROUTE_STATION_SKIP_BLOCKED',
            message: `rework return must scan at failed station ${expectedStation}; received ${stationName}`,
          };
        }
        if (unit.unit_status !== 'REPAIRED') {
          return { conflict: `unit must be repaired before re-entry (current unit status=${unit.unit_status})` };
        }

        await client.query(
          `UPDATE wip_tracking
           SET current_step_order = $2,
               current_station_name = $3,
               state = 'IN_STATION',
               last_action = 'SCAN_IN',
               scan_in_count = scan_in_count + 1,
               last_scan_in_at = NOW()
           WHERE id = $1`,
          [wip.id, Number(step.step_order), stationName]
        );
        await client.query(
          `UPDATE production_units
           SET current_station = $2,
               status = 'REPAIRED'
           WHERE sn = $1`,
          [unitSn, stationName]
        );
        await writeWipEvent(client, {
          woId,
          unitSn,
          routeId: Number(wip.route_id),
          stepOrder: Number(step.step_order),
          stationName,
          action: 'SCAN_IN',
          resultState: WIP_STATE.IN_STATION,
          userId: user.id,
          note: 'rework return scan-in',
        });

        return {
          route_id: Number(wip.route_id),
          current_step_order: Number(step.step_order),
          station_name: stationName,
          state: WIP_STATE.IN_STATION,
          route_mode: routeModeLabel(routeConfig),
        };
      }

      // FCT gate (graceful): block PASS scan-out from FCT station only if jig recorded FAIL
      // WAITING / no-record -> allow (graceful degradation, matching ICT gate pattern in jumbo)
      if (stationName === 'FCT' && jig.isConfigured()) {
        try {
          const fctRow = await client.query(
            "SELECT result_status FROM jig_test_results WHERE unit_sn=$1 AND test_type='FCT' LIMIT 1",
            [unitSn]
          );
          const fctResult = fctRow.rows[0];
          if (fctResult && fctResult.result_status === 'FAIL') {
            return { conflict: 'FCT failed for unit ' + unitSn + '; resolve test failure before advancing' };
          }
        } catch (e) {
          console.warn('[routing] FCT gate query error - allowing scan-out:', e.message);
        }
      }

      if (routeConfig.enforce_sequence) {
        const expectedOrder = Number(wip.current_step_order) + 1;
        const nextStep = await loadStepByOrder(client, Number(wip.route_id), expectedOrder);
        if (!nextStep) {
          return { conflict: 'route has no next step; unit is already at final stage' };
        }
        const expectedStation = normalizeStationName(nextStep.station_name);
        if (stationName !== expectedStation) {
          return {
            code: 'ROUTE_STATION_SKIP_BLOCKED',
            message: `station skip blocked: expected ${expectedStation} but received ${stationName}`,
          };
        }
      }

      await client.query(
        `UPDATE wip_tracking
         SET current_step_order = $2,
             current_station_name = $3,
             state = 'IN_STATION',
             last_action = 'SCAN_IN',
             scan_in_count = scan_in_count + 1,
             last_scan_in_at = NOW()
         WHERE id = $1`,
        [wip.id, Number(step.step_order), stationName]
      );
      await client.query(
        `UPDATE production_units
         SET current_station = $2,
             status = 'IN_PROGRESS'
         WHERE sn = $1`,
        [unitSn, stationName]
      );
      await writeWipEvent(client, {
        woId,
        unitSn,
        routeId: Number(wip.route_id),
        stepOrder: Number(step.step_order),
        stationName,
        action: 'SCAN_IN',
        resultState: WIP_STATE.IN_STATION,
        userId: user.id,
        note: routeConfig.enforce_sequence ? 'next-route-step scan-in' : 'free-route-step scan-in',
      });

      return {
        route_id: Number(wip.route_id),
        route_code: routeConfig.route_code,
        current_step_order: Number(step.step_order),
        station_name: stationName,
        state: WIP_STATE.IN_STATION,
        route_mode: routeModeLabel(routeConfig),
      };
    });

    if (payload.notFound) {
      return res.status(404).json({ status: 'error', code: 'UNIT_NOT_FOUND', request_id: reqId(res) });
    }
    if (payload.code === 'NO_ROUTE_FOR_STATION') {
      return sendRouteBlock(res, 'ROUTE_CONFIGURATION_ERROR', payload.message);
    }
    if (payload.code === 'AMBIGUOUS_ROUTE') {
      return sendRouteBlock(res, 'ROUTE_CONFIGURATION_ERROR', payload.message);
    }
    if (payload.code === 'ROUTE_STATION_SKIP_BLOCKED') {
      return sendRouteBlock(res, payload.code, payload.message);
    }
    if (payload.code === 'ROUTE_CODE_MISMATCH') {
      return sendRouteBlock(res, payload.code, payload.message);
    }
    if (payload.code === 'ROUTE_STATION_NOT_ALLOWED') {
      return sendRouteBlock(res, payload.code, payload.message);
    }
    if (payload.code === 'ROUTE_NOT_FOUND') {
      return sendRouteBlock(res, payload.code, payload.message);
    }
    if (payload.conflict) {
      return res.status(409).json({ status: 'error', code: 'ROUTING_SCAN_IN_BLOCKED', message: payload.conflict, request_id: reqId(res) });
    }

    return res.json({
      status: 'success',
      wo_id: woId,
      unit_sn: unitSn,
      station_name: payload.station_name,
      route_id: payload.route_id,
      route_code: payload.route_code || null,
      route_mode: payload.route_mode,
      current_step_order: payload.current_step_order,
      state: payload.state,
      request_id: reqId(res),
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      code: 'ROUTING_SCAN_IN_FAILED',
      message: error.message,
      request_id: reqId(res),
    });
  }
}

async function postRoutingScanOut(req, res) {
  const user = getUserFromRequest(req);
  const woId = parseWoId(req.body);
  const unitSn = normalizeText(req.body?.unit_sn);
  const stationName = normalizeStationName(req.body?.station_name);
  const status = normalizeCode(req.body?.status);
  const requestedRouteCode = parseRouteCode(req.body);

  if (!Number.isInteger(woId) || woId <= 0) return sendValidationError(res, 'woId must be positive integer');
  if (!unitSn) return sendValidationError(res, 'unit_sn is required');
  if (!stationName) return sendValidationError(res, 'station_name is required');
  if (!SCAN_OUT_STATUS.has(status)) return sendValidationError(res, 'status must be PASS or FAIL');

  try {
    const payload = await withTransaction(async (client) => {
      const unit = await loadUnitWithWoForUpdate(client, woId, unitSn);
      if (!unit) return { notFound: true };
      if (unit.wo_status !== 'RUNNING') {
        return { conflict: `WO must be RUNNING for routing scan-out (current=${unit.wo_status})` };
      }

      const wip = await loadWipForUpdate(client, woId, unitSn);
      if (!wip) {
        return { conflict: 'scan-out requires scan-in record first' };
      }
      if (wip.state !== WIP_STATE.IN_STATION) {
        return { conflict: `scan-out requires IN_STATION state (current=${wip.state})` };
      }

      const routeConfig = await loadRouteConfig(client, Number(wip.route_id));
      if (!routeConfig) {
        return { conflict: `route configuration not found (route_id=${wip.route_id})` };
      }
      if (requestedRouteCode && normalizeRouteCode(routeConfig.route_code) !== requestedRouteCode) {
        return {
          code: 'ROUTE_CODE_MISMATCH',
          message: `unit is already bound to route ${normalizeRouteCode(routeConfig.route_code)}; received ${requestedRouteCode}`,
        };
      }

      const currentStation = normalizeStationName(wip.current_station_name);
      if (stationName !== currentStation) {
        return {
          code: 'ROUTE_STATION_MISMATCH',
          message: `scan-out station mismatch: current=${currentStation}, received=${stationName}`,
        };
      }

      const currentStep = Number(wip.current_step_order);
      const stepRow = await loadStepByOrder(client, Number(wip.route_id), currentStep);
      if (!stepRow) {
        return { conflict: `route step ${currentStep} is not defined for route ${wip.route_id}` };
      }

      const stepStation = normalizeStationName(stepRow.station_name);
      if (stepStation !== stationName) {
        return {
          code: 'ROUTE_STATION_MISMATCH',
          message: `route definition mismatch: step ${currentStep} expects ${stepStation}, received=${stationName}`,
        };
      }

      if (status === 'FAIL') {
        await client.query(
          `UPDATE wip_tracking
           SET state = 'REWORK_REQUIRED',
               last_action = 'SCAN_OUT',
               last_status = 'FAIL',
               last_fail_station = current_station_name,
               scan_out_count = scan_out_count + 1,
               last_scan_out_at = NOW()
           WHERE id = $1`,
          [wip.id]
        );
        await client.query(
          `UPDATE production_units
           SET status = 'NG',
               current_station = 'REWORK'
           WHERE sn = $1`,
          [unitSn]
        );
        await writeWipEvent(client, {
          woId,
          unitSn,
          routeId: Number(wip.route_id),
          stepOrder: currentStep,
          stationName,
          action: 'SCAN_OUT',
          status: 'FAIL',
          resultState: WIP_STATE.REWORK_REQUIRED,
          userId: user.id,
          note: 'scan-out fail, route locked for rework',
        });

        return {
          route_id: Number(wip.route_id),
          route_code: routeConfig.route_code,
          current_step_order: currentStep,
          station_name: stationName,
          state: WIP_STATE.REWORK_REQUIRED,
          status,
          next_station: normalizeStationName(wip.current_station_name),
          completed: false,
          route_mode: routeModeLabel(routeConfig),
        };
      }

      if (routeConfig.enforce_sequence) {
        const maxStepOrder = await loadMaxStepOrder(client, Number(wip.route_id));
        if (maxStepOrder <= 0) {
          return { conflict: `route ${wip.route_id} has no configured steps` };
        }

        if (currentStep >= maxStepOrder) {
          const woUpdate = await client.query(
            `UPDATE work_orders
             SET qty_good = qty_good + 1
             WHERE id = $1
               AND qty_good < qty_started
             RETURNING id`,
            [woId]
          );
          if (!woUpdate.rows.length) {
            return { conflict: 'cannot increase qty_good beyond qty_started; verify unit start scan' };
          }

          await client.query(
            `UPDATE wip_tracking
             SET state = 'COMPLETED',
                 last_action = 'SCAN_OUT',
                 last_status = 'PASS',
                 last_fail_station = '',
                 scan_out_count = scan_out_count + 1,
                 last_scan_out_at = NOW()
             WHERE id = $1`,
            [wip.id]
          );
          await client.query(
            `UPDATE production_units
             SET status = 'PASS',
                 current_station = $2
             WHERE sn = $1`,
            [unitSn, stationName]
          );
          await writeWipEvent(client, {
            woId,
            unitSn,
            routeId: Number(wip.route_id),
            stepOrder: currentStep,
            stationName,
            action: 'SCAN_OUT',
            status: 'PASS',
            resultState: WIP_STATE.COMPLETED,
            userId: user.id,
            note: 'final sequence step pass',
          });

          return {
            route_id: Number(wip.route_id),
            route_code: routeConfig.route_code,
            current_step_order: currentStep,
            station_name: stationName,
            state: WIP_STATE.COMPLETED,
            status,
            next_station: null,
            completed: true,
            route_mode: routeModeLabel(routeConfig),
          };
        }

        const nextStep = await loadStepByOrder(client, Number(wip.route_id), currentStep + 1);
        if (!nextStep) {
          return { conflict: `missing next route step ${currentStep + 1}` };
        }

        await client.query(
          `UPDATE wip_tracking
           SET state = 'READY_NEXT',
               last_action = 'SCAN_OUT',
               last_status = 'PASS',
               last_fail_station = '',
               scan_out_count = scan_out_count + 1,
               last_scan_out_at = NOW()
           WHERE id = $1`,
          [wip.id]
        );
        await client.query(
          `UPDATE production_units
           SET status = 'IN_PROGRESS'
           WHERE sn = $1`,
          [unitSn]
        );
        await writeWipEvent(client, {
          woId,
          unitSn,
          routeId: Number(wip.route_id),
          stepOrder: currentStep,
          stationName,
          action: 'SCAN_OUT',
          status: 'PASS',
          resultState: WIP_STATE.READY_NEXT,
          userId: user.id,
          note: `sequence step pass, next=${normalizeStationName(nextStep.station_name)}`,
        });

        return {
          route_id: Number(wip.route_id),
          route_code: routeConfig.route_code,
          current_step_order: currentStep,
          station_name: stationName,
          state: WIP_STATE.READY_NEXT,
          status,
          next_station: normalizeStationName(nextStep.station_name),
          completed: false,
          route_mode: routeModeLabel(routeConfig),
        };
      }

      const countStats = await loadRequiredPassCounts(client, Number(wip.route_id), woId, unitSn);
      const alreadyPassedStep = await hasPassEventForStep(client, Number(wip.route_id), woId, unitSn, currentStep);
      const currentRequired = Boolean(stepRow.is_required);
      const passedAfter = countStats.passedTotal + (!alreadyPassedStep && currentRequired ? 1 : 0);
      const allRequiredDone = countStats.requiredTotal === 0 || passedAfter >= countStats.requiredTotal;

      if (allRequiredDone) {
        const woUpdate = await client.query(
          `UPDATE work_orders
           SET qty_good = qty_good + 1
           WHERE id = $1
             AND qty_good < qty_started
           RETURNING id`,
          [woId]
        );
        if (!woUpdate.rows.length) {
          return { conflict: 'cannot increase qty_good beyond qty_started; verify unit start scan' };
        }

        await client.query(
          `UPDATE wip_tracking
           SET state = 'COMPLETED',
               last_action = 'SCAN_OUT',
               last_status = 'PASS',
               last_fail_station = '',
               scan_out_count = scan_out_count + 1,
               last_scan_out_at = NOW()
           WHERE id = $1`,
          [wip.id]
        );
        await client.query(
          `UPDATE production_units
           SET status = 'PASS',
               current_station = $2
           WHERE sn = $1`,
          [unitSn, stationName]
        );
        await writeWipEvent(client, {
          woId,
          unitSn,
          routeId: Number(wip.route_id),
          stepOrder: currentStep,
          stationName,
          action: 'SCAN_OUT',
          status: 'PASS',
          resultState: WIP_STATE.COMPLETED,
          userId: user.id,
          note: 'free-route required steps completed',
        });

        return {
          route_id: Number(wip.route_id),
          route_code: routeConfig.route_code,
          current_step_order: currentStep,
          station_name: stationName,
          state: WIP_STATE.COMPLETED,
          status,
          next_station: null,
          completed: true,
          route_mode: routeModeLabel(routeConfig),
        };
      }

      let nextRequired = await loadFirstIncompleteRequiredStep(client, Number(wip.route_id), woId, unitSn);
      if (currentRequired && !alreadyPassedStep && nextRequired && Number(nextRequired.step_order) === currentStep) {
        nextRequired = await loadFirstIncompleteRequiredStep(client, Number(wip.route_id), woId, unitSn, currentStep);
      }
      await client.query(
        `UPDATE wip_tracking
         SET state = 'READY_NEXT',
             last_action = 'SCAN_OUT',
             last_status = 'PASS',
             last_fail_station = '',
             scan_out_count = scan_out_count + 1,
             last_scan_out_at = NOW()
         WHERE id = $1`,
        [wip.id]
      );
      await client.query(
        `UPDATE production_units
         SET status = 'IN_PROGRESS'
         WHERE sn = $1`,
        [unitSn]
      );
      await writeWipEvent(client, {
        woId,
        unitSn,
        routeId: Number(wip.route_id),
        stepOrder: currentStep,
        stationName,
        action: 'SCAN_OUT',
        status: 'PASS',
        resultState: WIP_STATE.READY_NEXT,
        userId: user.id,
        note: `free-route pass, next_required=${nextRequired ? normalizeStationName(nextRequired.station_name) : 'NONE'}`,
      });

      return {
        route_id: Number(wip.route_id),
        route_code: routeConfig.route_code,
        current_step_order: currentStep,
        station_name: stationName,
        state: WIP_STATE.READY_NEXT,
        status,
        next_station: nextRequired ? normalizeStationName(nextRequired.station_name) : null,
        completed: false,
        route_mode: routeModeLabel(routeConfig),
      };
    });

    if (payload.notFound) {
      return res.status(404).json({ status: 'error', code: 'UNIT_NOT_FOUND', request_id: reqId(res) });
    }
    if (payload.code === 'ROUTE_STATION_MISMATCH') {
      return sendRouteBlock(res, payload.code, payload.message);
    }
    if (payload.code === 'ROUTE_CODE_MISMATCH') {
      return sendRouteBlock(res, payload.code, payload.message);
    }
    if (payload.conflict) {
      return res.status(409).json({ status: 'error', code: 'ROUTING_SCAN_OUT_BLOCKED', message: payload.conflict, request_id: reqId(res) });
    }

    return res.json({
      status: 'success',
      wo_id: woId,
      unit_sn: unitSn,
      station_name: payload.station_name,
      route_id: payload.route_id,
      route_code: payload.route_code || null,
      route_mode: payload.route_mode,
      current_step_order: payload.current_step_order,
      state: payload.state,
      result: payload.status,
      next_station: payload.next_station,
      completed: payload.completed,
      request_id: reqId(res),
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      code: 'ROUTING_SCAN_OUT_FAILED',
      message: error.message,
      request_id: reqId(res),
    });
  }
}

module.exports = {
  postRoutingScanIn,
  postRoutingScanOut,
};
