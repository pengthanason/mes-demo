const express = require('express');
const { withTransaction, query } = require('../../db');
const { reqId, requireRoles } = require('../../common/http');

const router = express.Router();

const PART_CONFIG = {
  '1E4D25234000': { name: 'PCBA MAIN',  type: 'pcba', size: '5'  },
  '1E4D25234001': { name: 'PCBA IO',    type: 'pcba', size: '5'  },
  '1E4D25234002': { name: 'PCBA RS485', type: 'pcba', size: '5'  },
  '1E4D25234003': { name: 'PCBA RSU',   type: 'pcba', size: '5'  },
  '1E6D25234000': { name: 'BBAS MAIN',  type: 'bbas', size: '20' },
  '1E6D25234001': { name: 'BBAS RSU',   type: 'bbas', size: '20' },
};

const ASSEMBLY_RULES = {
  BBAS_MAIN: {
    bbas_part: '1E6D25234000',
    slots: [
      { slot_label: 'PCBA MAIN #1',  part_no: '1E4D25234000' },
      { slot_label: 'PCBA IO #1',    part_no: '1E4D25234001' },
      { slot_label: 'PCBA IO #2',    part_no: '1E4D25234001' },
      { slot_label: 'PCBA RS485 #1', part_no: '1E4D25234002' },
      { slot_label: 'PCBA RS485 #2', part_no: '1E4D25234002' },
      { slot_label: 'PCBA RS485 #3', part_no: '1E4D25234002' },
    ],
  },
  BBAS_RSU: {
    bbas_part: '1E6D25234001',
    slots: [
      { slot_label: 'PCBA RSU #1', part_no: '1E4D25234003' },
    ],
  },
};

function notFound(res, msg)    { return res.status(404).json({ status: 'error', code: 'NOT_FOUND',        message: msg, request_id: reqId(res) }); }
function badRequest(res, msg)  { return res.status(400).json({ status: 'error', code: 'VALIDATION_ERROR', message: msg, request_id: reqId(res) }); }
function conflict(res, msg)    { return res.status(409).json({ status: 'error', code: 'CONFLICT',         message: msg, request_id: reqId(res) }); }
function internalError(res, err) {
  console.error('[jumbo]', err);
  return res.status(500).json({ status: 'error', code: 'INTERNAL_ERROR', message: err.message, request_id: reqId(res) });
}

// GET /api/jumbo/parts
router.get('/api/jumbo/parts', (_req, res) => res.json({ status: 'ok', data: PART_CONFIG }));

// POST /api/jumbo/serials/generate
router.post('/api/jumbo/serials/generate',
  requireRoles(['ADMIN','PM','TECH','PD','STORE','QC','QA']),
  async (req, res) => {
    const part_no      = String(req.body?.part_no      || '').trim();
    const start_serial = parseInt(req.body?.start_serial, 10);
    const qty          = parseInt(req.body?.qty, 10);
    const userId       = req.user?.id || null;

    if (!PART_CONFIG[part_no])                               return badRequest(res, 'part_no ไม่ถูกต้อง: ' + part_no);
    if (!Number.isInteger(start_serial) || start_serial < 1) return badRequest(res, 'start_serial ต้องมากกว่า 0');
    if (!Number.isInteger(qty) || qty < 1 || qty > 999)      return badRequest(res, 'qty ต้องอยู่ระหว่าง 1-999');

    try {
      const result = await withTransaction(async (client) => {
        const batchRow = await client.query(
          `INSERT INTO jumbo_serial_batches (part_no, start_serial, qty, created_by) VALUES ($1,$2,$3,$4) RETURNING id`,
          [part_no, start_serial, qty, userId]
        );
        const batchId = batchRow.rows[0].id;
        const serials = [];
        for (let i = 0; i < qty; i++) {
          const sn = start_serial + i;
          serials.push([batchId, `${part_no}-${String(sn).padStart(3, '0')}`, part_no, sn]);
        }
        const existing = await client.query(
          `SELECT serial_string FROM jumbo_serials WHERE serial_string = ANY($1)`,
          [serials.map(s => s[1])]
        );
        if (existing.rows.length > 0) {
          const e = new Error('Serial ซ้ำ: ' + existing.rows.map(r => r.serial_string).join(', '));
          e.isDuplicate = true;
          throw e;
        }
        await client.query(
          `INSERT INTO jumbo_serials (batch_id, serial_string, part_no, serial_no)
           SELECT * FROM UNNEST($1::bigint[], $2::text[], $3::text[], $4::int[])`,
          [serials.map(s => s[0]), serials.map(s => s[1]), serials.map(s => s[2]), serials.map(s => s[3])]
        );
        return { batch_id: batchId, serials: serials.map(s => s[1]) };
      });

      // Auto-push PCBA serials into jig-api ICT queue (fire-and-forget)
      if (PART_CONFIG[part_no] && PART_CONFIG[part_no].type === 'pcba') {
        setImmediate(() => {
          const jig = require('../../common/jig_client');
          Promise.allSettled(result.serials.map((sn) => jig.createJob(sn))).then((outcomes) => {
            const failed = outcomes.filter((o) => o.status === 'rejected' || (o.value && !o.value.queued && !o.value.already_exists));
            if (failed.length) console.warn('[jumbo] auto-push ICT: %d/%d SN failed', failed.length, result.serials.length);
            else console.log('[jumbo] auto-push ICT: %d PCBA SN queued', result.serials.length);
          });
        });
      }

      return res.status(201).json({ status: 'ok', data: result, request_id: reqId(res) });
    } catch (err) {
      if (err.isDuplicate) return conflict(res, err.message);
      return internalError(res, err);
    }
  }
);

// GET /api/jumbo/serials
router.get('/api/jumbo/serials',
  requireRoles(['ADMIN','PM','TECH','PD','STORE','QC','QA']),
  async (req, res) => {
    const part_no = String(req.query.part_no || '').trim() || null;
    const status  = String(req.query.status  || '').trim().toUpperCase() || null;
    const limit   = Math.min(parseInt(req.query.limit  || '200', 10), 1000);
    const offset  = Math.max(parseInt(req.query.offset || '0',   10), 0);
    try {
      const rows  = await query(
        `SELECT s.id,s.serial_string,s.part_no,s.serial_no,s.status,s.batch_id,s.created_at
         FROM jumbo_serials s
         WHERE ($1::text IS NULL OR s.part_no = $1)
           AND ($2::text IS NULL OR s.status  = $2)
         ORDER BY s.id DESC
         LIMIT $3 OFFSET $4`,
        [part_no, status, limit, offset]
      );
      const total = await query(
        `SELECT COUNT(*) AS cnt FROM jumbo_serials s
         WHERE ($1::text IS NULL OR s.part_no = $1)
           AND ($2::text IS NULL OR s.status  = $2)`,
        [part_no, status]
      );
      return res.json({ status: 'ok', total: parseInt(total.rows[0].cnt, 10), data: rows.rows, request_id: reqId(res) });
    } catch (err) { return internalError(res, err); }
  }
);

// POST /api/jumbo/assembly
router.post('/api/jumbo/assembly',
  requireRoles(['ADMIN','TECH','PD','QC']),
  async (req, res) => {
    const assembly_type = String(req.body?.assembly_type || '').trim().toUpperCase();
    const bbas_serial   = String(req.body?.bbas_serial   || '').trim();
    const components    = req.body?.components;
    const note          = String(req.body?.note || '').trim();
    const userId        = req.user?.id || null;

    if (!ASSEMBLY_RULES[assembly_type])                    return badRequest(res, 'assembly_type ไม่ถูกต้อง: ' + assembly_type);
    if (!bbas_serial)                                      return badRequest(res, 'bbas_serial ต้องระบุ');
    if (!Array.isArray(components) || !components.length)  return badRequest(res, 'components ต้องไม่ว่าง');
    const rule = ASSEMBLY_RULES[assembly_type];
    if (!bbas_serial.startsWith(rule.bbas_part))           return badRequest(res, 'bbas_serial ต้องขึ้นต้นด้วย ' + rule.bbas_part);
    if (components.length !== rule.slots.length)           return badRequest(res, `ต้องการ ${rule.slots.length} ชิ้นส่วน แต่ได้รับ ${components.length}`);
    for (let i = 0; i < components.length; i++) {
      const slot = rule.slots[i];
      if (!components[i].serial || !String(components[i].serial).trim().startsWith(slot.part_no))
        return badRequest(res, `ชิ้นส่วนที่ ${i+1} (${slot.slot_label}) ต้องขึ้นต้นด้วย ${slot.part_no}`);
    }

    try {
      const asmId = await withTransaction(async (client) => {
        const dupBbas = await client.query(`SELECT id FROM jumbo_assemblies WHERE bbas_serial=$1`, [bbas_serial]);
        if (dupBbas.rows.length > 0) {
          const e = new Error(`BBAS Serial "${bbas_serial}" ถูกจับคู่ไปแล้ว`);
          e.isDuplicate = true; throw e;
        }
        const compSerials = components.map(c => String(c.serial).trim());
        const dupComps = await client.query(
          `SELECT component_serial FROM jumbo_assembly_components WHERE component_serial=ANY($1)`,
          [compSerials]
        );
        if (dupComps.rows.length > 0) {
          const e = new Error('Serial ชิ้นส่วนซ้ำ: ' + dupComps.rows.map(r => r.component_serial).join(', '));
          e.isDuplicate = true; throw e;
        }
        // ICT gate: บล็อก assembly เฉพาะ SN ที่ทดสอบแล้วและ FAIL จริงเท่านั้น
        // SN ที่ยังรอทดสอบ (WAITING / result_status=null) หรือไม่อยู่ใน records → อนุญาต
        {
          const jig = require('../../common/jig_client');
          if (jig.isConfigured()) {
            const compSns = components.map(c => String(c.serial).trim());
            const statusMap = await jig.bulkStatus(compSns);
            const failedSns = compSns.filter((sn) => {
              const r = statusMap.get(sn.toUpperCase());
              return r && r.result_status === 'FAIL';
            });
            if (failedSns.length > 0) {
              const e = new Error('ICT ล้มเหลว: ' + failedSns.join(', '));
              e.isValidation = true; throw e;
            }
          }
        }

        const asmRow = await client.query(
          `INSERT INTO jumbo_assemblies (assembly_type,bbas_serial,note,created_by) VALUES($1,$2,$3,$4) RETURNING id`,
          [assembly_type, bbas_serial, note, userId]
        );
        const id = asmRow.rows[0].id;
        for (let i = 0; i < components.length; i++) {
          const slot = rule.slots[i];
          await client.query(
            `INSERT INTO jumbo_assembly_components (assembly_id,component_serial,part_no,slot_label) VALUES($1,$2,$3,$4)`,
            [id, String(components[i].serial).trim(), slot.part_no, slot.slot_label]
          );
        }
        await client.query(`UPDATE jumbo_serials SET status='USED' WHERE serial_string=ANY($1)`, [[...compSerials, bbas_serial]]);
        return id;
      });

      const row = await query(
        `SELECT a.*,
                json_agg(json_build_object('slot_label',c.slot_label,'part_no',c.part_no,'serial',c.component_serial) ORDER BY c.id) AS components
         FROM jumbo_assemblies a
         JOIN jumbo_assembly_components c ON c.assembly_id=a.id
         WHERE a.id=$1 GROUP BY a.id`,
        [asmId]
      );
      return res.status(201).json({ status: 'ok', data: row.rows[0], request_id: reqId(res) });
    } catch (err) {
      if (err.isDuplicate)  return conflict(res, err.message);
      if (err.isValidation) return badRequest(res, err.message);
      return internalError(res, err);
    }
  }
);

// GET /api/jumbo/assembly
router.get('/api/jumbo/assembly',
  requireRoles(['ADMIN','PM','TECH','PD','STORE','QC','QA']),
  async (req, res) => {
    const type   = String(req.query.type   || '').trim().toUpperCase() || null;
    const status = String(req.query.status || '').trim().toUpperCase() || null;
    const limit  = Math.min(parseInt(req.query.limit  || '100', 10), 500);
    const offset = Math.max(parseInt(req.query.offset || '0',   10), 0);
    try {
      const rows = await query(
        `SELECT a.id,a.assembly_type,a.bbas_serial,a.status,a.note,a.created_at,
                u.username AS created_by_name,
                json_agg(json_build_object('slot_label',c.slot_label,'part_no',c.part_no,'serial',c.component_serial) ORDER BY c.id) AS components
         FROM jumbo_assemblies a
         LEFT JOIN users u ON u.id=a.created_by
         LEFT JOIN jumbo_assembly_components c ON c.assembly_id=a.id
         WHERE ($1::text IS NULL OR a.assembly_type = $1)
           AND ($2::text IS NULL OR a.status = $2)
         GROUP BY a.id,u.username ORDER BY a.id DESC
         LIMIT $3 OFFSET $4`,
        [type, status, limit, offset]
      );
      const total = await query(
        `SELECT COUNT(*) AS cnt FROM jumbo_assemblies a
         WHERE ($1::text IS NULL OR a.assembly_type = $1)
           AND ($2::text IS NULL OR a.status = $2)`,
        [type, status]
      );
      return res.json({ status: 'ok', total: parseInt(total.rows[0].cnt, 10), data: rows.rows, request_id: reqId(res) });
    } catch (err) { return internalError(res, err); }
  }
);

// POST /api/jumbo/packing/boxes
router.post('/api/jumbo/packing/boxes',
  requireRoles(['ADMIN','STORE','PD']),
  async (req, res) => {
    const note   = String(req.body?.note || '').trim();
    const userId = req.user?.id || null;
    try {
      const result = await withTransaction(async (client) => {
        const now = new Date();
        const year = now.getFullYear();
        const startOfYear = new Date(year, 0, 1);
        const week = Math.ceil(((now - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
        const prefix = `BOX-${year}W${String(week).padStart(2, '0')}`;
        const lastBox = await client.query(
          `SELECT box_no FROM jumbo_packing_boxes WHERE box_no LIKE $1 ORDER BY id DESC LIMIT 1`,
          [prefix + '-%']
        );
        let seq = 1;
        if (lastBox.rows.length > 0) {
          const parts = lastBox.rows[0].box_no.split('-');
          seq = parseInt(parts[parts.length - 1], 10) + 1;
        }
        const boxNo = `${prefix}-${String(seq).padStart(3, '0')}`;
        const boxRow = await client.query(
          `INSERT INTO jumbo_packing_boxes (box_no, note, created_by) VALUES ($1,$2,$3) RETURNING *`,
          [boxNo, note, userId]
        );
        return boxRow.rows[0];
      });
      return res.status(201).json({ status: 'ok', data: result, request_id: reqId(res) });
    } catch (err) { return internalError(res, err); }
  }
);

// POST /api/jumbo/packing/boxes/:boxId/scan
router.post('/api/jumbo/packing/boxes/:boxId/scan',
  requireRoles(['ADMIN','STORE','PD','TECH']),
  async (req, res) => {
    const boxId       = parseInt(req.params.boxId, 10);
    const bbas_serial = String(req.body?.bbas_serial || '').trim();
    const userId      = req.user?.id || null;
    if (!bbas_serial) return badRequest(res, 'bbas_serial ต้องระบุ');
    try {
      const result = await withTransaction(async (client) => {
        const boxRow = await client.query(`SELECT id,status FROM jumbo_packing_boxes WHERE id=$1`, [boxId]);
        if (!boxRow.rows.length) { const e = new Error(`ไม่พบ Box ID ${boxId}`); e.isNotFound = true; throw e; }
        if (boxRow.rows[0].status !== 'OPEN') {
          const e = new Error(`Box ถูกปิดไปแล้ว (${boxRow.rows[0].status})`); e.isDuplicate = true; throw e;
        }
        const asmRow = await client.query(`SELECT id,status FROM jumbo_assemblies WHERE bbas_serial=$1`, [bbas_serial]);
        if (!asmRow.rows.length) { const e = new Error(`ไม่พบ BBAS Serial "${bbas_serial}" ในระบบ`); e.isNotFound = true; throw e; }
        const asm = asmRow.rows[0];
        if (asm.status === 'PACKED' || asm.status === 'SHIPPED') {
          const e = new Error(`BBAS "${bbas_serial}" ถูก Pack ไปแล้ว`); e.isDuplicate = true; throw e;
        }
        const dupItem = await client.query(`SELECT box_id FROM jumbo_box_items WHERE assembly_id=$1`, [asm.id]);
        if (dupItem.rows.length > 0) {
          const e = new Error(`BBAS "${bbas_serial}" อยู่ใน Box อื่นแล้ว`); e.isDuplicate = true; throw e;
        }
        await client.query(`INSERT INTO jumbo_box_items (box_id,assembly_id,scanned_by) VALUES($1,$2,$3)`, [boxId, asm.id, userId]);
        await client.query(`UPDATE jumbo_assemblies SET status='PACKED' WHERE id=$1`, [asm.id]);
        return { assembly_id: asm.id, bbas_serial };
      });
      return res.status(201).json({ status: 'ok', data: result, request_id: reqId(res) });
    } catch (err) {
      if (err.isNotFound)  return notFound(res, err.message);
      if (err.isDuplicate) return conflict(res, err.message);
      return internalError(res, err);
    }
  }
);

// PATCH /api/jumbo/packing/boxes/:boxId/close
router.patch('/api/jumbo/packing/boxes/:boxId/close',
  requireRoles(['ADMIN','STORE','PD']),
  async (req, res) => {
    const boxId = parseInt(req.params.boxId, 10);
    try {
      const row = await query(
        `UPDATE jumbo_packing_boxes SET status='CLOSED', closed_at=NOW()
         WHERE id=$1 AND status='OPEN' RETURNING *`,
        [boxId]
      );
      if (!row.rows.length) return notFound(res, `ไม่พบ Box ID ${boxId} หรือปิดไปแล้ว`);
      return res.json({ status: 'ok', data: row.rows[0], request_id: reqId(res) });
    } catch (err) { return internalError(res, err); }
  }
);

// GET /api/jumbo/packing/boxes
router.get('/api/jumbo/packing/boxes',
  requireRoles(['ADMIN','PM','TECH','PD','STORE','QC','QA']),
  async (req, res) => {
    const status = String(req.query.status || '').trim().toUpperCase() || null;
    const limit  = Math.min(parseInt(req.query.limit  || '50', 10), 200);
    const offset = Math.max(parseInt(req.query.offset || '0',  10), 0);
    try {
      const rows = await query(
        `SELECT b.id,b.box_no,b.status,b.note,b.created_at,b.closed_at,
                u.username AS created_by_name, COUNT(bi.id)::int AS item_count
         FROM jumbo_packing_boxes b
         LEFT JOIN users u ON u.id=b.created_by
         LEFT JOIN jumbo_box_items bi ON bi.box_id=b.id
         WHERE ($1::text IS NULL OR b.status = $1)
         GROUP BY b.id,u.username ORDER BY b.id DESC
         LIMIT $2 OFFSET $3`,
        [status, limit, offset]
      );
      const total = await query(
        `SELECT COUNT(*) AS cnt FROM jumbo_packing_boxes b
         WHERE ($1::text IS NULL OR b.status = $1)`,
        [status]
      );
      return res.json({ status: 'ok', total: parseInt(total.rows[0].cnt, 10), data: rows.rows, request_id: reqId(res) });
    } catch (err) { return internalError(res, err); }
  }
);

// GET /api/jumbo/packing/boxes/:boxId
router.get('/api/jumbo/packing/boxes/:boxId',
  requireRoles(['ADMIN','PM','TECH','PD','STORE','QC','QA']),
  async (req, res) => {
    const boxId = parseInt(req.params.boxId, 10);
    try {
      const boxRow = await query(
        `SELECT b.*, u.username AS created_by_name
         FROM jumbo_packing_boxes b LEFT JOIN users u ON u.id=b.created_by WHERE b.id=$1`,
        [boxId]
      );
      if (!boxRow.rows.length) return notFound(res, `ไม่พบ Box ID ${boxId}`);
      const items = await query(
        `SELECT a.bbas_serial,a.assembly_type,a.status,bi.scanned_at,
                u.username AS scanned_by_name,
                json_agg(json_build_object('slot_label',c.slot_label,'part_no',c.part_no,'serial',c.component_serial) ORDER BY c.id) AS components
         FROM jumbo_box_items bi
         JOIN jumbo_assemblies a ON a.id=bi.assembly_id
         LEFT JOIN users u ON u.id=bi.scanned_by
         LEFT JOIN jumbo_assembly_components c ON c.assembly_id=a.id
         WHERE bi.box_id=$1 GROUP BY a.id,bi.scanned_at,u.username`,
        [boxId]
      );
      return res.json({ status: 'ok', data: { ...boxRow.rows[0], items: items.rows }, request_id: reqId(res) });
    } catch (err) { return internalError(res, err); }
  }
);

// GET /api/jumbo/trace/:serial
router.get('/api/jumbo/trace/:serial',
  requireRoles(['ADMIN','PM','TECH','PD','STORE','QC','QA']),
  async (req, res) => {
    const serial = String(req.params.serial || '').trim();
    if (!serial) return badRequest(res, 'serial ต้องระบุ');
    try {
      const asmRow = await query(
        `SELECT a.id,a.assembly_type,a.bbas_serial,a.status,a.created_at,
                json_agg(json_build_object('slot_label',c.slot_label,'part_no',c.part_no,'serial',c.component_serial) ORDER BY c.id) AS components
         FROM jumbo_assemblies a
         LEFT JOIN jumbo_assembly_components c ON c.assembly_id=a.id
         WHERE a.bbas_serial=$1 GROUP BY a.id`,
        [serial]
      );
      const compRow = await query(
        `SELECT c.component_serial,c.slot_label,c.part_no,
                a.id AS assembly_id,a.bbas_serial,a.assembly_type,
                a.status AS assembly_status,a.created_at AS assembled_at
         FROM jumbo_assembly_components c
         JOIN jumbo_assemblies a ON a.id=c.assembly_id
         WHERE c.component_serial=$1`,
        [serial]
      );
      const lookupId = asmRow.rows.length > 0
        ? asmRow.rows[0].id
        : (compRow.rows.length > 0 ? compRow.rows[0].assembly_id : null);
      let boxInfo = null;
      if (lookupId) {
        const boxItem = await query(
          `SELECT b.box_no,b.status AS box_status,b.created_at AS box_created_at,bi.scanned_at
           FROM jumbo_box_items bi JOIN jumbo_packing_boxes b ON b.id=bi.box_id
           WHERE bi.assembly_id=$1`,
          [lookupId]
        );
        if (boxItem.rows.length > 0) boxInfo = boxItem.rows[0];
      }
      const genRow = await query(
        `SELECT serial_string,part_no,serial_no,status,created_at AS generated_at
         FROM jumbo_serials WHERE serial_string=$1`,
        [serial]
      );
      if (!asmRow.rows.length && !compRow.rows.length && !genRow.rows.length)
        return notFound(res, `ไม่พบ Serial "${serial}" ในระบบ`);
      return res.json({
        status: 'ok',
        data: {
          serial,
          generation:   genRow.rows[0]  || null,
          as_bbas:      asmRow.rows[0]  || null,
          as_component: compRow.rows[0] || null,
          packing:      boxInfo,
        },
        request_id: reqId(res),
      });
    } catch (err) { return internalError(res, err); }
  }
);

// PATCH /api/jumbo/assembly/:id  — edit note (ADMIN, TECH, PD, QC)
router.patch('/api/jumbo/assembly/:id',
  requireRoles(['ADMIN','TECH','PD','QC']),
  async (req, res) => {
    const id   = parseInt(req.params.id, 10);
    const note = String(req.body?.note ?? '').trim();
    if (!Number.isInteger(id) || id < 1) return badRequest(res, 'id ไม่ถูกต้อง');
    try {
      const row = await query(
        `UPDATE jumbo_assemblies SET note=$1 WHERE id=$2 RETURNING id,bbas_serial,assembly_type,status,note,created_at`,
        [note, id]
      );
      if (!row.rows.length) return notFound(res, `ไม่พบ Assembly ID ${id}`);
      return res.json({ status: 'ok', data: row.rows[0], request_id: reqId(res) });
    } catch (err) { return internalError(res, err); }
  }
);

// DELETE /api/jumbo/assembly/:id  — delete assembly + reset component serials (ADMIN only)
router.delete('/api/jumbo/assembly/:id',
  requireRoles(['ADMIN']),
  async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) return badRequest(res, 'id ไม่ถูกต้อง');
    try {
      await withTransaction(async (client) => {
        const asmRow = await client.query(`SELECT id,bbas_serial FROM jumbo_assemblies WHERE id=$1`, [id]);
        if (!asmRow.rows.length) { const e = new Error(`ไม่พบ Assembly ID ${id}`); e.isNotFound = true; throw e; }
        // ห้ามลบถ้าถูก Pack แล้ว
        const packed = await client.query(`SELECT box_id FROM jumbo_box_items WHERE assembly_id=$1`, [id]);
        if (packed.rows.length) { const e = new Error('ไม่สามารถลบได้ — BBAS ถูก Pack ใน Box แล้ว'); e.isDuplicate = true; throw e; }
        // คืน status serial กลับเป็น GENERATED
        const comps = await client.query(`SELECT component_serial FROM jumbo_assembly_components WHERE assembly_id=$1`, [id]);
        const serials = comps.rows.map(r => r.component_serial);
        serials.push(asmRow.rows[0].bbas_serial);
        await client.query(`UPDATE jumbo_serials SET status='GENERATED' WHERE serial_string=ANY($1)`, [serials]);
        await client.query(`DELETE FROM jumbo_assemblies WHERE id=$1`, [id]);
      });
      return res.json({ status: 'ok', message: `ลบ Assembly ID ${id} สำเร็จ`, request_id: reqId(res) });
    } catch (err) {
      if (err.isNotFound)  return notFound(res, err.message);
      if (err.isDuplicate) return conflict(res, err.message);
      return internalError(res, err);
    }
  }
);

// DELETE /api/jumbo/data/all  — clear ALL jumbo data (ADMIN only)
router.delete('/api/jumbo/data/all',
  requireRoles(['ADMIN']),
  async (req, res) => {
    const confirm = String(req.body?.confirm || '').trim();
    if (confirm !== 'CLEAR_ALL_JUMBO') return badRequest(res, 'ต้องส่ง confirm: "CLEAR_ALL_JUMBO" เพื่อยืนยัน');
    try {
      await withTransaction(async (client) => {
        await client.query(`DELETE FROM jumbo_box_items`);
        await client.query(`DELETE FROM jumbo_packing_boxes`);
        await client.query(`DELETE FROM jumbo_assembly_components`);
        await client.query(`DELETE FROM jumbo_assemblies`);
        await client.query(`DELETE FROM jumbo_serials`);
        await client.query(`DELETE FROM jumbo_serial_batches`);
      });
      return res.json({ status: 'ok', message: 'ล้างข้อมูล Jumbo ทั้งหมดสำเร็จ', request_id: reqId(res) });
    } catch (err) { return internalError(res, err); }
  }
);

// GET /api/jumbo/report/daily
router.get('/api/jumbo/report/daily',
  requireRoles(['ADMIN','PM','QA','QC']),
  async (req, res) => {
    const date = String(req.query.date || '').trim() || new Date().toISOString().slice(0, 10);
    try {
      const asm = await query(`SELECT assembly_type,COUNT(*)::int AS qty FROM jumbo_assemblies WHERE created_at::date=$1::date GROUP BY assembly_type`, [date]);
      const ser = await query(`SELECT part_no,COUNT(*)::int AS qty FROM jumbo_serials WHERE created_at::date=$1::date GROUP BY part_no`, [date]);
      const pac = await query(
        `SELECT b.status,COUNT(*)::int AS boxes,COALESCE(SUM(ic.cnt),0)::int AS items
         FROM jumbo_packing_boxes b
         LEFT JOIN (SELECT box_id,COUNT(*)::int AS cnt FROM jumbo_box_items GROUP BY box_id) ic ON ic.box_id=b.id
         WHERE b.created_at::date=$1::date GROUP BY b.status`,
        [date]
      );
      return res.json({ status: 'ok', data: { date, assembly: asm.rows, serials: ser.rows, packing: pac.rows }, request_id: reqId(res) });
    } catch (err) { return internalError(res, err); }
  }
);

// GET /api/jumbo/export/csv
router.get('/api/jumbo/export/csv',
  requireRoles(['ADMIN','PM','QA']),
  async (req, res) => {
    try {
      const rows = await query(
        `SELECT a.created_at,a.assembly_type,a.bbas_serial,a.status,c.slot_label,c.part_no,c.component_serial
         FROM jumbo_assemblies a JOIN jumbo_assembly_components c ON c.assembly_id=a.id
         ORDER BY a.id ASC, c.id ASC`
      );
      const lines = ['\uFEFFDate/Time,Assembly Type,BBAS Serial,Assembly Status,Slot,Part No,Component Serial'];
      for (const r of rows.rows) {
        const dt = new Date(r.created_at).toLocaleString('th-TH');
        lines.push(`"${dt}","${r.assembly_type}","${r.bbas_serial}","${r.status}","${r.slot_label}","${r.part_no}","${r.component_serial}"`);
      }
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="JUMBO_Traceability_${Date.now()}.csv"`);
      return res.send(lines.join('\n'));
    } catch (err) { return internalError(res, err); }
  }
);

// GET /api/jumbo/jig-status?serials=SN1,SN2
// Check ICT status for multiple serials (used by jumbo dashboard)
router.get('/api/jumbo/jig-status', requireRoles(['ADMIN','PM','TECH','PD','STORE','QC','QA']), async (req, res) => {
  const raw = String(req.query.serials || '').trim();
  if (!raw) return badRequest(res, 'serials param required');
  const sns = raw.split(',').map(s => s.trim()).filter(Boolean).slice(0, 200);
  try {
    const jig = require('../../common/jig_client');
    const statusMap = await jig.bulkStatus(sns);
    const result = sns.map((sn) => {
      const r = statusMap.get(sn.toUpperCase()) || null;
      return { serial: sn, job_status: r ? r.job_status : null, result_status: r ? r.result_status : null, ict_passed: r ? r.result_status === 'PASS' : false };
    });
    return res.json({ status: 'ok', data: result, request_id: reqId(res) });
  } catch (err) { return internalError(res, err); }
});

module.exports = router;
