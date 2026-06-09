const express = require('express');
const router = express.Router();
const pmController = require('./pm.controller');
const { requireRoles } = require('../../common/http');

const PM_READ  = requireRoles(['PM', 'ADMIN', 'QC', 'QA']);
const PM_WRITE = requireRoles(['PM', 'ADMIN']);

// Lead Inbox / List
router.get('/leads', PM_READ, pmController.listLeads);

// Lead Detail + CR timeline
router.get('/leads/:leadId', PM_READ, pmController.getLead);

// Create New Lead
router.post('/leads', PM_WRITE, pmController.createLead);

// Gate G1: Readiness
router.put('/leads/:leadId/gate-g1', PM_WRITE, pmController.gateG1);

// Gate G2: Feasibility
router.put('/leads/:leadId/gate-g2', PM_WRITE, pmController.gateG2);

// Change Request Open
router.post('/cr', PM_WRITE, pmController.openCR);

// Hook H1: Sync to Planning (M01 Placeholder)
router.post('/leads/:leadId/hook-h1', PM_WRITE, pmController.hookH1);

// Gate G3: PO Outcome / Wait PO
router.put('/leads/:leadId/gate-g3', PM_WRITE, pmController.gateG3);

// Hook H2: Sync to MRP/Finance (After PO+Contract)
router.post('/leads/:leadId/hook-h2', PM_WRITE, pmController.hookH2);

// Hook H3: Close Project (Send CSAT to QMS)
router.post('/leads/:leadId/hook-h3', PM_WRITE, pmController.hookH3);

module.exports = router;
