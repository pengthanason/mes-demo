const { buildUid, buildWoNumber } = require('../utils/validator');

async function generateUidInTx(client, now = new Date()) {
  const yymmdd = now.toISOString().slice(2, 10).replace(/-/g, '');
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`uid-${yymmdd}`]);

  const prefix = `UID-${yymmdd}-`;
  const seqResult = await client.query(
    `SELECT COALESCE(
         MAX(
           CASE
             WHEN SPLIT_PART(uid, '-', 3) ~ '^[0-9]+$'
               THEN CAST(SPLIT_PART(uid, '-', 3) AS INTEGER)
             ELSE NULL
           END
         ),
         0
       ) AS seq
     FROM inventory_uids
     WHERE uid LIKE $1`,
    [`${prefix}%`]
  );

  const nextSeq = Number(seqResult.rows[0]?.seq || 0) + 1;
  return buildUid(yymmdd, nextSeq);
}

async function generateWoNumberInTx(client, now = new Date()) {
  const yy = now.toISOString().slice(2, 4);
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`wo-${yy}`]);

  const seqResult = await client.query(
    `SELECT COALESCE(
         MAX(
           CASE
             WHEN SUBSTRING(wo_number FROM 3 FOR 4) ~ '^[0-9]+$'
               THEN CAST(SUBSTRING(wo_number FROM 3 FOR 4) AS INTEGER)
             ELSE NULL
           END
         ),
         0
       ) AS seq
     FROM work_orders
     WHERE wo_number LIKE $1`,
    [`${yy}%`]
  );

  const nextSeq = Number(seqResult.rows[0]?.seq || 0) + 1;
  return buildWoNumber(yy, nextSeq);
}

async function generateReqNumberInTx(client, now = new Date()) {
  const yymmdd = now.toISOString().slice(2, 10).replace(/-/g, '');
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`req-${yymmdd}`]);

  const prefix = `RQ${yymmdd}`;
  const seqResult = await client.query(
    `SELECT COALESCE(
         MAX(
           CASE
             WHEN SUBSTRING(req_no FROM 9 FOR 2) ~ '^[0-9]+$'
               THEN CAST(SUBSTRING(req_no FROM 9 FOR 2) AS INTEGER)
             ELSE NULL
           END
         ),
         0
       ) AS seq
     FROM material_requisitions
     WHERE req_no LIKE $1`,
    [`${prefix}%`]
  );

  const nextSeq = Number(seqResult.rows[0]?.seq || 0) + 1;
  return `${prefix}${String(nextSeq).padStart(2, '0')}`;
}

module.exports = {
  generateUidInTx,
  generateWoNumberInTx,
  generateReqNumberInTx,
};
