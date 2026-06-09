// ─── API Config ───────────────────────────────────────────────────────────────
const API_BASE_CANDIDATES = ['/mes-api', ''];
let resolvedApiBase = '';
let apiBaseReady = false;
let apiBasePromise = null;
const AUTO_LOGIN_CREDENTIALS = {
  username: 'admin_web',
  password: 'Syntech@12345',
};
let authRefreshPromise = null;

async function resolveApiBase() {
  if (apiBaseReady) return resolvedApiBase;
  if (apiBasePromise) return apiBasePromise;

  apiBasePromise = (async () => {
    for (const candidate of API_BASE_CANDIDATES) {
      try {
        const res = await fetch(candidate + '/api/mes/health', {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        const contentType = String(res.headers.get('content-type') || '').toLowerCase();
        if (!res.ok || !contentType.includes('application/json')) continue;

        const body = await res.json().catch(() => null);
        if (body?.status === 'ok' && typeof body?.database === 'string') {
          resolvedApiBase = candidate;
          apiBaseReady = true;
          return resolvedApiBase;
        }
      } catch (_) {
        // Try the next candidate.
      }
    }

    resolvedApiBase = '';
    apiBaseReady = true;
    return resolvedApiBase;
  })();

  try {
    return await apiBasePromise;
  } finally {
    apiBasePromise = null;
  }
}

function getToken() {
  return sessionStorage.getItem('mes_token') || localStorage.getItem('mes_token') || '';
}

function setToken(token) {
  if (!token) return;
  sessionStorage.setItem('mes_token', token);
}

function clearToken() {
  sessionStorage.removeItem('mes_token');
  localStorage.removeItem('mes_token');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function authenticateAutoUser(forceRefresh = false) {
  if (authRefreshPromise) return authRefreshPromise;

  authRefreshPromise = (async () => {
    const apiBase = await resolveApiBase();
    if (!forceRefresh) {
      const token = getToken();
      if (token) {
        const me = await fetch(apiBase + '/api/mes/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null);
        if (me && me.ok) return true;
      }
    }

    clearToken();
    const res = await fetch(apiBase + '/api/mes/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(AUTO_LOGIN_CREDENTIALS),
    }).catch(() => null);
    if (!res || !res.ok) return false;

    const data = await res.json().catch(() => null);
    if (!data?.access_token) return false;

    setToken(data.access_token);
    return true;
  })();

  try {
    return await authRefreshPromise;
  } finally {
    authRefreshPromise = null;
  }
}

async function apiFetch(path, options = {}) {
  const apiBase = await resolveApiBase();
  const makeRequest = async () => {
    const token = getToken();
    return fetch(apiBase + path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
  };

  let res = await makeRequest();
  if (res.status === 401) {
    const refreshed = await authenticateAutoUser(true);
    if (!refreshed) {
      Swal.fire({ icon: 'error', title: 'เชื่อมต่อไม่ได้', text: 'ไม่สามารถยืนยันตัวตนกับ MES Server ได้', timer: 2500, showConfirmButton: false });
      return null;
    }
    res = await makeRequest();
  }
  return res;
}

// ─── Part Config ──────────────────────────────────────────────────────────────
const PART_CONFIG = {
  '1E4D25234000': { name: 'PCBA MAIN',  type: 'pcba', size: '5'  },
  '1E4D25234001': { name: 'PCBA IO',    type: 'pcba', size: '5'  },
  '1E4D25234002': { name: 'PCBA RS485', type: 'pcba', size: '5'  },
  '1E4D25234003': { name: 'PCBA RSU',   type: 'pcba', size: '5'  },
  '1E6D25234000': { name: 'BBAS MAIN',  type: 'bbas', size: '20' },
  '1E6D25234001': { name: 'BBAS RSU',   type: 'bbas', size: '20' },
};

// ─── App State ────────────────────────────────────────────────────────────────
let generatedQRs = [];

document.addEventListener('DOMContentLoaded', () => {
  checkAuthAndInit();
});

async function checkAuthAndInit() {
  const ready = await authenticateAutoUser();
  if (!ready) {
    Swal.fire({
      icon: 'error',
      title: 'เปิดระบบไม่ได้',
      text: 'JUMBO ไม่สามารถเชื่อมต่อระบบยืนยันตัวตนได้',
      allowOutsideClick: false,
      allowEscapeKey: false,
    });
    return;
  }
  initApp();
}

function initApp() {
  initNavigation();
  initQRGenerator();
  initMatchingMain();
  initMatchingRSU();
  initPacking();
  loadHistory();
  defaultQuantities();
  initExportClear();
}

function defaultQuantities() {
  const partSelect = document.getElementById('part-select');
  const qtyInput   = document.getElementById('serial-qty');
  const defaults   = { '1E4D25234000': 60, '1E4D25234001': 120, '1E4D25234002': 180, '1E4D25234003': 60, '1E6D25234000': 60, '1E6D25234001': 60 };
  partSelect.addEventListener('change', (e) => { qtyInput.value = defaults[e.target.value] || 60; });
}

// ─── Tab Navigation ───────────────────────────────────────────────────────────
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-menu li');
  const tabPanes = document.querySelectorAll('.tab-pane');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navItems.forEach(n => n.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));
      item.classList.add('active');
      const target = item.getAttribute('data-target');
      document.getElementById(target).classList.add('active');
      if (target === 'tab-match-main') setTimeout(() => document.getElementById('scan-bb-main').focus(), 100);
      else if (target === 'tab-match-rsu') setTimeout(() => document.getElementById('scan-bb-rsu').focus(), 100);
      else if (target === 'tab-history') loadHistory();
      else if (target === 'tab-packing') loadBoxes();
    });
  });
}

// ─── QR Generator ─────────────────────────────────────────────────────────────
function initQRGenerator() {
  const form     = document.getElementById('qr-form');
  const printBtn = document.getElementById('btn-print');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const partNo      = document.getElementById('part-select').value;
    const startSerial = parseInt(document.getElementById('serial-start').value);
    const qty         = parseInt(document.getElementById('serial-qty').value);

    const res = await apiFetch('/api/jumbo/serials/generate', {
      method: 'POST',
      body: JSON.stringify({ part_no: partNo, start_serial: startSerial, qty }),
    });
    if (!res) return;
    const data = await res.json();
    if (!res.ok) {
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: data.message || 'ไม่สามารถสร้าง Serial ได้' });
      return;
    }
    generateQRs(partNo, startSerial, qty, data.data.serials);
    printBtn.disabled = false;
  });

  printBtn.addEventListener('click', () => window.print());
}

function generateQRs(partNo, start, qty, serials) {
  const container      = document.getElementById('qr-preview-container');
  const printContainer = document.getElementById('print-container');
  const countSpan      = document.getElementById('preview-count');
  container.innerHTML = ''; printContainer.innerHTML = '';
  generatedQRs = serials || [];

  const config      = PART_CONFIG[partNo];
  const isBBAS      = config.type === 'bbas';
  const printCopies = isBBAS ? 2 : 1;
  const sizePx      = isBBAS ? 128 : 64;

  for (let i = 0; i < qty; i++) {
    const serialString = serials ? serials[i] : `${partNo}-${String(start + i).padStart(3, '0')}`;

    const previewItem = document.createElement('div');
    previewItem.className = 'qr-item-preview';
    const previewQrTarget = document.createElement('div');
    previewItem.appendChild(previewQrTarget);
    const textLabel = document.createElement('p');
    textLabel.textContent = serialString;
    previewItem.appendChild(textLabel);
    container.appendChild(previewItem);
    new QRCode(previewQrTarget, { text: serialString, width: 100, height: 100, colorDark: '#000000', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });

    for (let copy = 0; copy < printCopies; copy++) {
      const printLabel = document.createElement('div');
      printLabel.className = `print-label size-${config.size}`;
      const qrDiv = document.createElement('div');
      printLabel.appendChild(qrDiv);
      const pText = document.createElement('div');
      pText.className = 'label-text';
      pText.textContent = serialString;
      printLabel.appendChild(pText);
      printContainer.appendChild(printLabel);
      new QRCode(qrDiv, { text: serialString, width: sizePx, height: sizePx, colorDark: '#000000', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
    }
  }

  countSpan.textContent = isBBAS ? `${qty} (พิมพ์ ${qty * 2} ดวง)` : qty;
  Swal.fire({ icon: 'success', title: 'สร้าง QR Code สำเร็จ', text: `${qty} หมายเลข — บันทึกลง DB แล้ว`, timer: 1500, showConfirmButton: false });
}

// ─── Scanner Helper ───────────────────────────────────────────────────────────
function setupScannerInput(inputId, expectedPrefix, nextInputId, validationCallback) {
  const input         = document.getElementById(inputId);
  const stepContainer = input.closest('.scan-step');

  input.addEventListener('keypress', function(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const val = this.value.trim();
    if (!val.startsWith(expectedPrefix)) {
      stepContainer.classList.add('error-scan');
      stepContainer.classList.remove('success-scan', 'active-scan');
      playErrorSound();
      Swal.fire({ icon: 'error', title: 'สแกนผิดพลาด', text: `ต้องการ Serial ที่ขึ้นต้นด้วย: ${expectedPrefix}` });
      this.value = ''; this.focus();
      return;
    }
    playSuccessSound();
    stepContainer.classList.remove('error-scan', 'active-scan');
    stepContainer.classList.add('success-scan');
    if (validationCallback) validationCallback(val);
    if (nextInputId) {
      const nextInput = document.getElementById(nextInputId);
      if (nextInput) { nextInput.disabled = false; nextInput.focus(); nextInput.closest('.scan-step').classList.add('active-scan'); }
    } else { this.blur(); }
  });

  input.addEventListener('focus', () => stepContainer.classList.add('active-scan'));
  input.addEventListener('blur',  () => { if (!input.value) stepContainer.classList.remove('active-scan'); });
}

function playSuccessSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(800, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
    osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.1);
  } catch(_) {}
}

function playErrorSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, ctx.currentTime);
    gain.gain.setValueAtTime(0.2, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.5);
  } catch(_) {}
}

// ─── Assembly BBAS MAIN ───────────────────────────────────────────────────────
function initMatchingMain() {
  const form     = document.getElementById('match-main-form');
  const saveBtn  = document.getElementById('btn-save-main');
  const resetBtn = document.getElementById('btn-reset-main');

  setupScannerInput('scan-bb-main',  '1E6D25234000', 'scan-pc-main-1');
  setupScannerInput('scan-pc-main-1','1E4D25234000', 'scan-pc-io-1');
  setupScannerInput('scan-pc-io-1',  '1E4D25234001', 'scan-pc-io-2');
  setupScannerInput('scan-pc-io-2',  '1E4D25234001', 'scan-pc-rs-1');
  setupScannerInput('scan-pc-rs-1',  '1E4D25234002', 'scan-pc-rs-2');
  setupScannerInput('scan-pc-rs-2',  '1E4D25234002', 'scan-pc-rs-3');
  setupScannerInput('scan-pc-rs-3',  '1E4D25234002', null, () => { saveBtn.disabled = false; saveBtn.focus(); });

  resetBtn.addEventListener('click', resetMainForm);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      assembly_type: 'BBAS_MAIN',
      bbas_serial: document.getElementById('scan-bb-main').value,
      components: [
        { serial: document.getElementById('scan-pc-main-1').value },
        { serial: document.getElementById('scan-pc-io-1').value   },
        { serial: document.getElementById('scan-pc-io-2').value   },
        { serial: document.getElementById('scan-pc-rs-1').value   },
        { serial: document.getElementById('scan-pc-rs-2').value   },
        { serial: document.getElementById('scan-pc-rs-3').value   },
      ],
    };
    const res = await apiFetch('/api/jumbo/assembly', { method: 'POST', body: JSON.stringify(payload) });
    if (!res) return;
    const data = await res.json();
    if (!res.ok) { Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: data.message || 'เกิดข้อผิดพลาด' }); return; }
    Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', text: 'จับคู่ BBAS MAIN เรียบร้อยแล้ว', timer: 1500, showConfirmButton: false }).then(() => resetMainForm());
  });
}

function resetMainForm() {
  document.getElementById('btn-save-main').disabled = true;
  ['scan-bb-main','scan-pc-main-1','scan-pc-io-1','scan-pc-io-2','scan-pc-rs-1','scan-pc-rs-2','scan-pc-rs-3'].forEach((id, idx) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = '';
    el.closest('.scan-step').classList.remove('success-scan','error-scan','active-scan');
    if (idx > 0) el.disabled = true;
  });
  setTimeout(() => { const f = document.getElementById('scan-bb-main'); if (f) { f.focus(); f.closest('.scan-step').classList.add('active-scan'); } }, 100);
}

// ─── Assembly BBAS RSU ────────────────────────────────────────────────────────
function initMatchingRSU() {
  const form     = document.getElementById('match-rsu-form');
  const saveBtn  = document.getElementById('btn-save-rsu');
  const resetBtn = document.getElementById('btn-reset-rsu');

  setupScannerInput('scan-bb-rsu', '1E6D25234001', 'scan-pc-rsu');
  setupScannerInput('scan-pc-rsu', '1E4D25234003', null, () => { saveBtn.disabled = false; saveBtn.focus(); });

  resetBtn.addEventListener('click', resetRsuForm);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      assembly_type: 'BBAS_RSU',
      bbas_serial: document.getElementById('scan-bb-rsu').value,
      components: [{ serial: document.getElementById('scan-pc-rsu').value }],
    };
    const res = await apiFetch('/api/jumbo/assembly', { method: 'POST', body: JSON.stringify(payload) });
    if (!res) return;
    const data = await res.json();
    if (!res.ok) { Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: data.message || 'เกิดข้อผิดพลาด' }); return; }
    Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', text: 'จับคู่ BBAS RSU เรียบร้อยแล้ว', timer: 1500, showConfirmButton: false }).then(() => resetRsuForm());
  });
}

function resetRsuForm() {
  document.getElementById('btn-save-rsu').disabled = true;
  ['scan-bb-rsu','scan-pc-rsu'].forEach((id, idx) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = '';
    el.closest('.scan-step').classList.remove('success-scan','error-scan','active-scan');
    if (idx > 0) el.disabled = true;
  });
  setTimeout(() => { const f = document.getElementById('scan-bb-rsu'); if (f) { f.focus(); f.closest('.scan-step').classList.add('active-scan'); } }, 100);
}

// ─── Packing ──────────────────────────────────────────────────────────────────
function initPacking() {
  const btnNewBox = document.getElementById('btn-new-box');
  if (!btnNewBox) return;
  btnNewBox.addEventListener('click', async () => {
    const { value: note } = await Swal.fire({
      title: 'สร้าง Box ใหม่', input: 'text', inputLabel: 'หมายเหตุ (ถ้ามี)',
      showCancelButton: true, confirmButtonText: 'สร้าง', cancelButtonText: 'ยกเลิก',
    });
    if (note === undefined) return;
    const res  = await apiFetch('/api/jumbo/packing/boxes', { method: 'POST', body: JSON.stringify({ note: note || '' }) });
    if (!res) return;
    const data = await res.json();
    if (!res.ok) { Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: data.message }); return; }
    Swal.fire({ icon: 'success', title: `สร้าง Box สำเร็จ`, text: `Box No: ${data.data.box_no}`, timer: 1500, showConfirmButton: false });
    loadBoxes();
  });
}

async function loadBoxes() {
  const container = document.getElementById('boxes-container');
  if (!container) return;
  const res = await apiFetch('/api/jumbo/packing/boxes?limit=20');
  if (!res) return;
  const data = await res.json();
  if (!res.ok || !data.data) return;

  container.innerHTML = '';
  if (!data.data.length) {
    container.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:2rem;">ยังไม่มี Box</p>';
    return;
  }
  data.data.forEach(box => {
    const div = document.createElement('div');
    div.className = 'card';
    div.style.marginBottom = '12px';
    const boxNo = escapeHtml(box.box_no);
    const boxStatus = escapeHtml(box.status);
    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <strong style="color:var(--primary)">${boxNo}</strong>
          <span style="margin-left:8px;padding:2px 8px;border-radius:12px;font-size:0.8rem;background:${box.status==='OPEN'?'#22c55e':box.status==='CLOSED'?'#64748b':'#3b82f6'};color:#fff">${boxStatus}</span>
        </div>
        <span style="color:#94a3b8;font-size:0.85rem">${box.item_count} ชิ้น</span>
      </div>
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
        <span class="box-actions"></span>
      </div>
    `;
    const actions = div.querySelector('.box-actions');
    if (box.status === 'OPEN') {
      const scanBtn = document.createElement('button');
      scanBtn.className = 'btn btn-primary';
      scanBtn.style.padding = '4px 12px';
      scanBtn.style.fontSize = '0.85rem';
      scanBtn.textContent = 'สแกนใส่ Box';
      scanBtn.addEventListener('click', () => scanIntoBox(box.id, box.box_no));
      actions.appendChild(scanBtn);

      const closeBtn = document.createElement('button');
      closeBtn.className = 'btn btn-secondary';
      closeBtn.style.padding = '4px 12px';
      closeBtn.style.fontSize = '0.85rem';
      closeBtn.textContent = 'ปิด Box';
      closeBtn.addEventListener('click', () => closeBox(box.id));
      actions.appendChild(closeBtn);
    }

    const viewBtn = document.createElement('button');
    viewBtn.className = 'btn btn-secondary';
    viewBtn.style.padding = '4px 12px';
    viewBtn.style.fontSize = '0.85rem';
    viewBtn.textContent = 'ดูรายละเอียด';
    viewBtn.addEventListener('click', () => viewBox(box.id));
    actions.appendChild(viewBtn);

    container.appendChild(div);
  });
}

async function scanIntoBox(boxId, boxNo) {
  const { value: serial } = await Swal.fire({
    title: `สแกน BBAS ใส่ ${boxNo}`, input: 'text', inputLabel: 'สแกน BBAS Serial',
    inputAttributes: { autocomplete: 'off' }, showCancelButton: true, confirmButtonText: 'ยืนยัน', cancelButtonText: 'ยกเลิก',
  });
  if (!serial) return;
  const res  = await apiFetch(`/api/jumbo/packing/boxes/${boxId}/scan`, { method: 'POST', body: JSON.stringify({ bbas_serial: serial.trim() }) });
  if (!res) return;
  const data = await res.json();
  if (!res.ok) { Swal.fire({ icon: 'error', title: 'สแกนไม่สำเร็จ', text: data.message }); return; }
  playSuccessSound();
  Swal.fire({ icon: 'success', title: 'สแกนสำเร็จ', text: `${serial} → ${boxNo}`, timer: 1200, showConfirmButton: false });
  loadBoxes();
}

async function closeBox(boxId) {
  const confirm = await Swal.fire({ title: 'ปิด Box?', text: 'จะไม่สามารถเพิ่มชิ้นงานได้อีก', icon: 'warning', showCancelButton: true, confirmButtonText: 'ปิด Box', cancelButtonText: 'ยกเลิก' });
  if (!confirm.isConfirmed) return;
  const res  = await apiFetch(`/api/jumbo/packing/boxes/${boxId}/close`, { method: 'PATCH', body: '{}' });
  if (!res) return;
  const data = await res.json();
  if (!res.ok) { Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: data.message }); return; }
  Swal.fire({ icon: 'success', title: 'ปิด Box สำเร็จ', timer: 1200, showConfirmButton: false });
  loadBoxes();
}

async function viewBox(boxId) {
  const res  = await apiFetch(`/api/jumbo/packing/boxes/${boxId}`);
  if (!res) return;
  const data = await res.json();
  if (!res.ok) return;
  const box  = data.data;
  const itemList = (box.items || []).map((i) => `<li><strong>${escapeHtml(i.bbas_serial)}</strong> (${escapeHtml(i.assembly_type)})</li>`).join('');
  Swal.fire({
    title: box.box_no,
    html: `<p>สถานะ: <strong>${escapeHtml(box.status)}</strong> | จำนวน: <strong>${(box.items||[]).length} ชิ้น</strong></p><ul style="text-align:left">${itemList || '<li>ว่างเปล่า</li>'}</ul>`,
    confirmButtonText: 'ปิด',
  });
}

// ─── History ──────────────────────────────────────────────────────────────────
async function loadHistory() {
  const tbody = document.getElementById('history-table-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:2rem">กำลังโหลด...</td></tr>';

  const res = await apiFetch('/api/jumbo/assembly?limit=200');
  if (!res) return;
  const data = await res.json();

  if (!res.ok || !data.data) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#ef4444;padding:2rem">ไม่สามารถโหลดข้อมูลได้</td></tr>';
    return;
  }
  if (!data.data.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:2rem">ยังไม่มีประวัติการจับคู่</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  data.data.forEach(record => {
    const tr = document.createElement('tr');
    const dt = new Date(record.created_at).toLocaleString('th-TH');
    const badges = (record.components || []).map((c) => `<span class="part-badge">${escapeHtml(c.serial)}</span>`).join(' ');
    tr.innerHTML = `
      <td>${escapeHtml(dt)}</td>
      <td><strong>${escapeHtml(record.assembly_type)}</strong></td>
      <td><span style="color:var(--primary);font-weight:bold">${escapeHtml(record.bbas_serial)}</span></td>
      <td>${badges}</td>
      <td class="history-actions" style="white-space:nowrap"></td>
    `;
    const actions = tr.querySelector('.history-actions');
    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-secondary';
    editBtn.style.padding = '3px 10px';
    editBtn.style.fontSize = '0.8rem';
    editBtn.style.marginRight = '4px';
    editBtn.textContent = 'แก้ไข';
    editBtn.addEventListener('click', () => editAssembly(record.id, record.bbas_serial, record.note || ''));
    actions.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-danger';
    deleteBtn.style.padding = '3px 10px';
    deleteBtn.style.fontSize = '0.8rem';
    deleteBtn.textContent = 'ลบ';
    deleteBtn.addEventListener('click', () => deleteAssembly(record.id, record.bbas_serial));
    actions.appendChild(deleteBtn);

    tbody.appendChild(tr);
  });
}

async function editAssembly(id, bbasSn, currentNote) {
  const { value: note } = await Swal.fire({
    title: `แก้ไข ${bbasSn}`,
    input: 'text',
    inputLabel: 'หมายเหตุ',
    inputValue: currentNote,
    showCancelButton: true,
    confirmButtonText: 'บันทึก',
    cancelButtonText: 'ยกเลิก',
  });
  if (note === undefined) return;
  const res = await apiFetch(`/api/jumbo/assembly/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ note }),
  });
  if (!res) return;
  const data = await res.json();
  if (!res.ok) { Swal.fire({ icon: 'error', title: 'แก้ไขไม่สำเร็จ', text: data.message }); return; }
  Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', timer: 1000, showConfirmButton: false });
  loadHistory();
}

async function deleteAssembly(id, bbasSn) {
  const confirm = await Swal.fire({
    title: `ลบ ${bbasSn}?`,
    html: 'Serial ทุกตัวในชุดนี้จะกลับมาใช้ได้ใหม่<br><span style="color:#ef4444">ไม่สามารถกู้คืนได้</span>',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'ลบ',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#ef4444',
  });
  if (!confirm.isConfirmed) return;
  const res = await apiFetch(`/api/jumbo/assembly/${id}`, { method: 'DELETE' });
  if (!res) return;
  const data = await res.json();
  if (!res.ok) { Swal.fire({ icon: 'error', title: 'ลบไม่สำเร็จ', text: data.message }); return; }
  Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1000, showConfirmButton: false });
  loadHistory();
}

// ─── Export & Clear ───────────────────────────────────────────────────────────
function initExportClear() {
  const btnExport = document.getElementById('btn-export-csv');
  if (btnExport) {
    btnExport.addEventListener('click', async () => {
      const res = await apiFetch('/api/jumbo/export/csv', {
        headers: { Accept: 'text/csv' },
      });
      if (!res) return;
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        Swal.fire({ icon: 'error', title: 'ดาวน์โหลดไม่สำเร็จ', text: data?.message || 'ไม่สามารถดาวน์โหลด CSV ได้' });
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `JUMBO_Traceability_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    });
  }
  const btnClear = document.getElementById('btn-clear-history');
  if (btnClear) {
    btnClear.addEventListener('click', async () => {
      const step1 = await Swal.fire({
        title: 'ล้างข้อมูลทั้งหมด?',
        html: 'จะลบ <strong>Serial, Assembly, Packing</strong> ทุกรายการออกถาวร<br><span style="color:#ef4444;font-weight:bold">ไม่สามารถกู้คืนได้</span>',
        icon: 'warning',
        input: 'text',
        inputPlaceholder: 'พิมพ์ CONFIRM เพื่อยืนยัน',
        showCancelButton: true,
        confirmButtonText: 'ล้างข้อมูล',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#ef4444',
        preConfirm: (val) => {
          if (val !== 'CONFIRM') { Swal.showValidationMessage('พิมพ์ CONFIRM เท่านั้น'); return false; }
          return true;
        },
      });
      if (!step1.isConfirmed) return;
      const res = await apiFetch('/api/jumbo/data/all', {
        method: 'DELETE',
        body: JSON.stringify({ confirm: 'CLEAR_ALL_JUMBO' }),
      });
      if (!res) return;
      const data = await res.json();
      if (!res.ok) { Swal.fire({ icon: 'error', title: 'ล้างข้อมูลไม่สำเร็จ', text: data.message }); return; }
      Swal.fire({ icon: 'success', title: 'ล้างข้อมูลสำเร็จ', timer: 1500, showConfirmButton: false });
      loadHistory();
    });
  }
}
