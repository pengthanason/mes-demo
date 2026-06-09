const COMPONENT_WHITELIST = new Set([
  'RES',
  'CAP',
  'ICC',
  'LED',
  'CON',
  'DIO',
  'MOS',
  'MOD',
  'POW',
  'REG',
  'TRS',
  'TRF',
  'WIR',
  'PCB',
  'IND',
  'SWT',
  'CRY',
  'OSC',
  'FUS',
  'BAT',
  'BUZ',
]);

function normalizeCode(value) {
  if (value == null) return '';
  return String(value).trim().toUpperCase();
}

function validatePN(code, options = {}) {
  const { enforceComponentWhitelist = true } = options;
  const normalized = normalizeCode(code);
  const errors = [];

  if (normalized.length !== 12) {
    errors.push('part number must be exactly 12 characters');
    return { valid: false, normalized, errors };
  }

  const typeDigit = normalized[0];
  const groupCode = normalized.slice(1, 3);
  const layerCode = normalized[4];
  const componentCode = normalized.slice(5, 8);

  if (!['1', '3', '4', '5'].includes(typeDigit)) {
    errors.push('part number type must start with 1, 3, 4, or 5');
  }

  if ((typeDigit === '1' || typeDigit === '5') && (groupCode === 'E2' || groupCode === 'E3')) {
    if (!['S', 'D', 'M'].includes(layerCode)) {
      errors.push('FG/PCBA PCB rule failed: digit 5 must be S, D, or M for E2/E3');
    }
  }

  if ((typeDigit === '3' || typeDigit === '4') && (groupCode === '01' || groupCode === '02')) {
    if (!['S', 'D', 'M'].includes(layerCode)) {
      errors.push('RawMat PCB rule failed: digit 5 must be S, D, or M for 01/02');
    }
  }

  if (!/^[A-Z]{3}$/.test(componentCode)) {
    errors.push('digits 6-8 must be exactly 3 uppercase letters');
  } else if (enforceComponentWhitelist && !COMPONENT_WHITELIST.has(componentCode)) {
    errors.push(`component code ${componentCode} is not in whitelist`);
  }

  return {
    valid: errors.length === 0,
    normalized,
    errors,
  };
}

function validateWoNumber(value) {
  const normalized = String(value == null ? '' : value).trim();
  const valid = /^[0-9]{6}$/.test(normalized);
  return {
    valid,
    normalized,
    errors: valid ? [] : ['wo_number must match YYXXXX (6 digits)'],
  };
}

function buildWoNumber(year2Digits, runningSeq) {
  const yy = String(year2Digits).padStart(2, '0').slice(-2);
  const seq = String(runningSeq).padStart(4, '0').slice(-4);
  return `${yy}${seq}`;
}

function validateUid(value) {
  const normalized = String(value == null ? '' : value).trim().toUpperCase();
  const valid = /^UID-[0-9]{6}-[0-9]{4}$/.test(normalized);
  return {
    valid,
    normalized,
    errors: valid ? [] : ['uid must match UID-YYMMDD-XXXX'],
  };
}

function buildUid(datePartYYMMDD, runningSeq) {
  const yymmdd = String(datePartYYMMDD).replace(/[^0-9]/g, '').padStart(6, '0').slice(-6);
  const seq = String(runningSeq).padStart(4, '0').slice(-4);
  return `UID-${yymmdd}-${seq}`;
}

module.exports = {
  COMPONENT_WHITELIST,
  normalizeCode,
  validatePN,
  validateUid,
  validateWoNumber,
  buildWoNumber,
  buildUid,
};
