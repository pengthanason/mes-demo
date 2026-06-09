const express = require('express');
const productionController = require('../../controllers/production.controller');
const { requireRoles } = require('../../common/http');

const router = express.Router();

router.post('/api/fai/request', requireRoles(['TECH', 'ADMIN']), productionController.postRequestFai);
router.post('/api/fai/approve-qa', requireRoles(['QA', 'ADMIN']), productionController.postApproveFaiByQa);
router.post('/api/fai/approve-mgr', requireRoles(['PD', 'ADMIN']), productionController.postApproveFaiByMgr);

router.post('/api/machine/event', requireRoles(['TECH', 'ADMIN']), productionController.postMachineEvent);
router.get('/api/machine/durations/:woId', requireRoles(['PM', 'STORE', 'QC', 'QA', 'TECH', 'PD', 'ADMIN']), productionController.getMachineDurations);

module.exports = router;
