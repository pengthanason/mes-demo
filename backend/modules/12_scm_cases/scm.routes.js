const express = require('express');
const router = express.Router();
const scmController = require('./scm.controller');

// Case Inbox / List
router.get('/cases', scmController.listCases);

// Open New Case
router.post('/cases', scmController.openCase);

// Resolve Case
router.put('/cases/:caseId/resolve', scmController.resolveCase);

// Split Lot SOP
router.post('/lots/split', scmController.splitLot);

// Handle Supplier Dispositions (RTV/Replacement/Use-as-is/Scrap)
router.post('/dispositions', scmController.createDisposition);

module.exports = router;
