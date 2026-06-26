// ==================== CONFIGURATION & INITIAL MOCK DATA ====================
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin';
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxgq75HbQ2RGde7WkpXTcYS8NQ6PfWLjtZgQsWtw17HM6HdLOED2a7N9d1-kA7ElNl3/exec';

// Helper to get local date string YYYY-MM-DD
function getLocalDateString(dateObj = new Date()) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper to get local ISO string YYYY-MM-DDTHH:MM:SS
function getLocalISOString(dateObj = new Date()) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  const hours = String(dateObj.getHours()).padStart(2, '0');
  const minutes = String(dateObj.getMinutes()).padStart(2, '0');
  const seconds = String(dateObj.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

const todayStr = getLocalDateString(); // e.g. "2026-06-11"

// Pagination & date filter state
let currentPage = 1;
const PAGE_SIZE = 10;
let filterDateFrom = todayStr;
let filterDateTo = todayStr;
let lastFilteredRecords = [];


let records = [];
let isSaving = false;

function deduplicateRecords(recs) {
  const seen = new Set();
  return recs.filter(r => {
    if (!r.id || seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

async function loadRecords() {
  try {
    const res = await fetch(APPS_SCRIPT_URL, { redirect: 'follow' });
    const json = await res.json();
    if (json.records && json.records.length > 0) {
      records = deduplicateRecords(json.records);
      localStorage.setItem('borrow_records', JSON.stringify(records));
      return;
    }
  } catch (e) {
    // ถ้าโหลดจาก Sheets ไม่ได้ ใช้ cache จาก localStorage
  }
  const cached = localStorage.getItem('borrow_records');
  if (cached) {
    records = deduplicateRecords(JSON.parse(cached));
  } else {
    records = [];
  }
}

async function refreshFromSheets() {
  if (isSaving) return;
  try {
    const res = await fetch(APPS_SCRIPT_URL, { redirect: 'follow' });
    const json = await res.json();
    if (isSaving) return; // เช็คซ้ำหลัง fetch resolve เผื่อ delete เริ่มระหว่างที่รอ
    if (json.records && json.records.length > 0) {
      records = deduplicateRecords(json.records);
      localStorage.setItem('borrow_records', JSON.stringify(records));
      renderDashboardData();
    }
  } catch (e) {}
}

// ==================== APP INITIALIZATION ====================
// โหลดจาก cache (localStorage) ก่อนทันที → โชว์หน้าเลย ไม่ค้างรอ Apps Script
function loadFromCache() {
  const cached = localStorage.getItem('borrow_records');
  records = cached ? deduplicateRecords(JSON.parse(cached)) : [];
}

document.addEventListener('DOMContentLoaded', () => {
  loadFromCache();          // instant — ไม่ await network
  initAuth();
  initDashboard();
  initModals();
  refreshFromSheets();      // ดึงข้อมูลสดเบื้องหลังรอบแรก (re-render เมื่อมาถึง)
  setInterval(refreshFromSheets, 10000);
});

// ==================== AUTHENTICATION SECTION ====================
function initAuth() {
  const loginForm = document.getElementById('login-form');
  const loginScreen = document.getElementById('login-screen');
  const dashboardScreen = document.getElementById('dashboard-screen');
  const btnLogout = document.getElementById('btn-logout');
  const togglePassword = document.getElementById('toggle-password');
  const passwordInput = document.getElementById('password');

  // Auto-login when embedded in iframe (MES already handles auth)
  const inIframe = window.self !== window.top;
  if (inIframe) {
    sessionStorage.setItem('admin_logged_in', 'true');
    document.querySelector('.navbar')?.style.setProperty('display', 'none');
  }

  // Check login state
  const isLoggedIn = inIframe || sessionStorage.getItem('admin_logged_in') === 'true';
  if (isLoggedIn) {
    loginScreen.style.display = 'none';
    dashboardScreen.style.display = 'flex';
    renderDashboardData();
  } else {
    loginScreen.style.display = 'flex';
    dashboardScreen.style.display = 'none';
  }

  // Toggle Password Visibility
  togglePassword.addEventListener('click', () => {
    const isPassword = passwordInput.getAttribute('type') === 'password';
    passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
    togglePassword.querySelector('i').className = isPassword ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye';
  });

  // Handle Login
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const userVal = document.getElementById('username').value.trim();
    const passVal = passwordInput.value;

    if (userVal === ADMIN_USERNAME && passVal === ADMIN_PASSWORD) {
      sessionStorage.setItem('admin_logged_in', 'true');
      showToast('เข้าสู่ระบบสำเร็จ ยินดีต้อนรับครับ!', 'success');
      
      // Clear inputs
      document.getElementById('username').value = '';
      passwordInput.value = '';
      
      // Page transition
      loginScreen.style.display = 'none';
      dashboardScreen.style.display = 'flex';
      renderDashboardData();
    } else {
      showToast('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง กรุณาลองอีกครั้ง', 'danger');
    }
  });

  // Handle Logout
  btnLogout.addEventListener('click', () => {
    sessionStorage.removeItem('admin_logged_in');
    showToast('ออกจากระบบเรียบร้อยแล้ว', 'info');
    
    dashboardScreen.style.display = 'none';
    loginScreen.style.display = 'flex';
  });
}

// ==================== DASHBOARD SECTION ====================
function initDashboard() {
  // Set default date filter = today
  const today = getLocalDateString();
  document.getElementById('filter-date-from').value = today;
  document.getElementById('filter-date-to').value = today;

  // Date filter events
  document.getElementById('filter-date-from').addEventListener('change', e => {
    filterDateFrom = e.target.value;
    currentPage = 1;
    renderDashboardData();
  });
  document.getElementById('filter-date-to').addEventListener('change', e => {
    filterDateTo = e.target.value;
    currentPage = 1;
    renderDashboardData();
  });
  document.getElementById('btn-today').addEventListener('click', () => {
    const t = getLocalDateString();
    filterDateFrom = t; filterDateTo = t;
    document.getElementById('filter-date-from').value = t;
    document.getElementById('filter-date-to').value = t;
    currentPage = 1;
    renderDashboardData();
  });

  // Export CSV
  document.getElementById('btn-export-csv').addEventListener('click', exportToCSV);

  // Pagination
  document.getElementById('btn-prev-page').addEventListener('click', () => {
    if (currentPage > 1) { currentPage--; renderDashboardData(); }
  });
  document.getElementById('btn-next-page').addEventListener('click', () => {
    const total = Math.ceil(lastFilteredRecords.length / PAGE_SIZE);
    if (currentPage < total) { currentPage++; renderDashboardData(); }
  });

  // Search & status filter
  const searchInput = document.getElementById('search-input');
  const statusFilter = document.getElementById('status-filter');
  searchInput.addEventListener('input', () => { currentPage = 1; renderDashboardData(); });
  statusFilter.addEventListener('change', () => { currentPage = 1; renderDashboardData(); });

  // Edit form submit
  document.getElementById('edit-form').addEventListener('submit', handleSaveEdit);

  // Table button delegation
  document.getElementById('records-tbody').addEventListener('click', (e) => {
    const editBtn = e.target.closest('.btn-action-edit');
    const deleteBtn = e.target.closest('.btn-action-delete');
    if (editBtn) openEditModal(editBtn.dataset.id);
    if (deleteBtn) handleDeleteRecord(deleteBtn.dataset.id);
  });
}

// ==================== PHOTO LIGHTBOX ====================
const photoStore = new Map();

function showPhotoLightbox(key) {
  const src = photoStore.get(key);
  if (!src) return;
  document.getElementById('lightbox-img').src = src;
  document.getElementById('photo-lightbox').classList.add('open');
}

function closePhotoLightbox() {
  document.getElementById('photo-lightbox').classList.remove('open');
  document.getElementById('lightbox-img').src = '';
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closePhotoLightbox();
});

// Event delegation for photo-link clicks in the table
document.addEventListener('click', e => {
  const link = e.target.closest('.photo-link');
  if (link && link.dataset.photoKey) showPhotoLightbox(link.dataset.photoKey);
});

// Render Table and Stats
function renderDashboardData() {
  const tbody = document.getElementById('records-tbody');
  const searchVal = document.getElementById('search-input').value.toLowerCase().trim();
  const filterVal = document.getElementById('status-filter').value;
  const emptyState = document.getElementById('empty-state');
  const recordsCount = document.getElementById('records-count');

  tbody.innerHTML = '';

  const activeTodayStr = getLocalDateString();

  // Filter: search + status + date range
  const filteredRecords = records.filter(rec => {
    const matchesSearch =
      rec.name.toLowerCase().includes(searchVal) ||
      rec.surname.toLowerCase().includes(searchVal) ||
      rec.equipment.toLowerCase().includes(searchVal);

    let matchesStatus = true;
    const isOverdue = rec.status === 'กำลังยืม' && normalizeDate(rec.returnDate) < activeTodayStr;

    if (filterVal === 'borrowing') {
      matchesStatus = rec.status === 'กำลังยืม';
    } else if (filterVal === 'returned') {
      matchesStatus = rec.status === 'คืนแล้ว';
    } else if (filterVal === 'overdue') {
      matchesStatus = isOverdue;
    }

    const borrowDateNorm = normalizeDate(rec.borrowDate);
    const matchesDateRange = borrowDateNorm >= filterDateFrom && borrowDateNorm <= filterDateTo;

    return matchesSearch && matchesStatus && matchesDateRange;
  });

  // Sort: Latest timestamp first
  filteredRecords.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // Store for export
  lastFilteredRecords = filteredRecords;

  // Pagination
  const totalRecords = filteredRecords.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * PAGE_SIZE;
  const pageRecords = filteredRecords.slice(start, start + PAGE_SIZE);

  // Update pagination UI
  const paginationWrapper = document.getElementById('pagination-wrapper');
  const pageInfo = document.getElementById('page-info');
  const btnPrev = document.getElementById('btn-prev-page');
  const btnNext = document.getElementById('btn-next-page');

  if (totalPages <= 1) {
    paginationWrapper.style.display = 'none';
  } else {
    paginationWrapper.style.display = 'flex';
    pageInfo.textContent = `หน้า ${currentPage} / ${totalPages}`;
    btnPrev.disabled = currentPage <= 1;
    btnNext.disabled = currentPage >= totalPages;
  }

  // Render rows
  if (pageRecords.length === 0) {
    emptyState.style.display = 'flex';
    recordsCount.textContent = 'แสดงทั้งหมด 0 รายการ';
  } else {
    emptyState.style.display = 'none';

    pageRecords.forEach((rec, idx) => {
      const rowNum = start + idx + 1;
      const isOverdue = rec.status === 'กำลังยืม' && normalizeDate(rec.returnDate) < activeTodayStr;

      let badgeHtml = '';
      if (rec.status === 'คืนแล้ว') {
        badgeHtml = `<span class="badge badge-success"><i class="fa-solid fa-check"></i> คืนแล้ว</span>`;
      } else if (isOverdue) {
        badgeHtml = `<span class="badge badge-danger"><i class="fa-solid fa-triangle-exclamation"></i> เกินกำหนด</span>`;
      } else {
        badgeHtml = `<span class="badge badge-warning"><i class="fa-solid fa-hourglass-half"></i> กำลังยืม</span>`;
      }

      // Register photos in photoStore
      if (rec.selfiePhoto) {
        photoStore.set(rec.id + '_selfie', rec.selfiePhoto);
      }
      if (rec.equipmentPhotos) {
        try {
          const photos = JSON.parse(rec.equipmentPhotos);
          Object.entries(photos).forEach(([i, data]) => {
            photoStore.set(rec.id + '_eq_' + i, data);
          });
        } catch(e) {}
      }

      // Name cell — clickable if has selfie
      const nameHtml = rec.selfiePhoto
        ? `<span class="photo-link" data-photo-key="${rec.id}_selfie" title="กดดูรูปถ่าย"><i class="fa-solid fa-camera" style="font-size:0.7rem;margin-right:3px;opacity:0.7"></i>${rec.name}</span>`
        : `<span style="font-weight:500">${rec.name}</span>`;

      // Equipment cell — make items clickable if has photo
      let equipHtml = rec.equipment;
      if (rec.equipmentPhotos) {
        try {
          const photos = JSON.parse(rec.equipmentPhotos);
          const parts = rec.equipment.split(', ');
          equipHtml = parts.map((part, i) => photos[i]
            ? `<span class="photo-link" data-photo-key="${rec.id}_eq_${i}" title="กดดูรูปอุปกรณ์">${part}</span>`
            : part
          ).join(', ');
        } catch(e) {}
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight: 600; text-align: center;">${rowNum}</td>
        <td>
          <div class="timestamp-text">
            <i class="fa-regular fa-clock"></i> ${formatThaiDate(rec.timestamp.split('T')[0])}
          </div>
        </td>
        <td class="col-name" title="${rec.name}">${nameHtml}</td>
        <td>${rec.surname || '-'}</td>
        <td style="font-size:0.82rem;color:var(--text-muted)">${rec.email || '-'}</td>
        <td>
          <div style="font-weight: 500; color: var(--primary-color);">
            ${equipHtml}
          </div>
        </td>
        <td>${formatThaiDate(rec.borrowDate)}</td>
        <td>${formatThaiDate(rec.returnDate)}</td>
        <td style="text-align: center;">${badgeHtml}</td>
        <td>
          <div class="notes-text" title="${rec.notes || '-'}">
            ${rec.notes || '<span style="color:#cbd5e1">-</span>'}
          </div>
        </td>
        <td style="text-align: center;">
          <div class="table-actions">
            <button class="btn-action-edit" data-id="${rec.id}" title="แก้ไข">
              <i class="fa-solid fa-pen"></i> แก้ไข
            </button>
            <button class="btn-action-delete" data-id="${rec.id}" title="ลบ">
              <i class="fa-solid fa-trash-can"></i> ลบ
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    recordsCount.textContent = `แสดงทั้งหมด ${totalRecords} รายการ`;
  }

  calculateDailyStats();
}

// Calculate summary stats
function calculateDailyStats() {
  const currentTodayStr = getLocalDateString();

  let borrowsInPeriod = 0;
  let returnsInPeriod = 0;
  let currentlyBorrowed = 0;
  let overdue = 0;

  const isToday = filterDateFrom === filterDateTo && filterDateFrom === currentTodayStr;
  const periodLabel = isToday ? 'วันนี้' : 'ในช่วงนี้';

  records.forEach(rec => {
    const borrowDateNorm = normalizeDate(rec.borrowDate);
    const returnDateNorm = normalizeDate(rec.returnDate);

    // 1. Borrows in period
    if (borrowDateNorm >= filterDateFrom && borrowDateNorm <= filterDateTo) {
      borrowsInPeriod++;
    }

    // 2. Returns in period
    if (rec.status === 'คืนแล้ว' && returnDateNorm >= filterDateFrom && returnDateNorm <= filterDateTo) {
      returnsInPeriod++;
    }

    // 3. Currently Borrowed (global, not date-filtered)
    if (rec.status === 'กำลังยืม') {
      currentlyBorrowed++;
      // 4. Overdue
      if (returnDateNorm && returnDateNorm < currentTodayStr) {
        overdue++;
      }
    }
  });

  document.getElementById('stat-label-borrows').textContent = `รายการยืม${periodLabel}`;
  document.getElementById('stat-sub-borrows').textContent = `อัปเดต${periodLabel}`;
  document.getElementById('stat-label-returns').textContent = `ส่งคืนสำเร็จ${periodLabel}`;
  document.getElementById('stat-sub-returns').textContent = `เช็คอิน${periodLabel}`;

  document.getElementById('stat-borrows-today').textContent = borrowsInPeriod;
  document.getElementById('stat-returns-today').textContent = returnsInPeriod;
  document.getElementById('stat-currently-borrowed').textContent = currentlyBorrowed;
  document.getElementById('stat-overdue').textContent = overdue;
}

// Export filtered records to CSV (UTF-8 BOM for Excel)
function exportToCSV() {
  const rows = lastFilteredRecords.length > 0 ? lastFilteredRecords : records;
  const headers = ['ลำดับ', 'วันเวลาที่ทำรายการ', 'ชื่อ', 'แผนก', 'อีเมล', 'อุปกรณ์ที่ยืม', 'วันยืม', 'วันคืน', 'สถานะ', 'หมายเหตุ'];

  const esc = val => {
    const s = String(val === null || val === undefined ? '' : val);
    return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const csvRows = [headers.join(',')];
  rows.forEach((rec, i) => {
    csvRows.push([
      i + 1,
      rec.timestamp ? rec.timestamp.substring(0, 10) : '',
      rec.name,
      rec.surname,
      rec.email || '',
      rec.equipment,
      normalizeDate(rec.borrowDate),
      normalizeDate(rec.returnDate),
      rec.status,
      rec.notes || ''
    ].map(esc).join(','));
  });

  const bom = '﻿';
  const blob = new Blob([bom + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `equipment-borrow-${getLocalDateString()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Delete Record
async function handleDeleteRecord(id) {
  const recordIndex = records.findIndex(r => r.id === id);
  if (recordIndex === -1) return;

  const target = records[recordIndex];
  const confirmMsg = `คุณต้องการลบบันทึกการยืมของ "${target.name} ${target.surname}" ที่ยืม "${target.equipment}" ใช่หรือไม่?`;

  if (confirm(confirmMsg)) {
    isSaving = true;
    records.splice(recordIndex, 1);
    localStorage.setItem('borrow_records', JSON.stringify(records));
    renderDashboardData();
    showToast('กำลังลบ...', 'info');
    try {
      await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        redirect: 'follow',
        body: JSON.stringify({ action: 'deleteRecord', id })
      });
      showToast('ลบบันทึกสำเร็จแล้ว', 'success');
    } catch(e) {
      showToast('ลบเฉพาะในเครื่อง (network error)', 'warning');
    }
    isSaving = false;
  }
};

// ==================== MODALS LOGIC ====================
function initModals() {
  const closeButtons = document.querySelectorAll('.modal-close-btn');
  
  closeButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      closeAllModals();
    });
  });

  // Close modal when clicking on backdrop
  const backdrops = document.querySelectorAll('.modal-backdrop');
  backdrops.forEach(backdrop => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        closeAllModals();
      }
    });
  });

}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('open');
  }
}

function closeAllModals() {
  const modals = document.querySelectorAll('.modal-backdrop');
  modals.forEach(m => m.classList.remove('open'));
}

function normalizeDate(val) {
  if (!val) return '';
  val = String(val).trim();
  // ISO datetime from Google Sheets — parse as local date to avoid UTC off-by-one
  if (/^\d{4}-\d{2}-\d{2}T/.test(val)) {
    const d = new Date(val);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const dy = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${dy}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(val)) return val.substring(0, 10);
  const parts = val.split('/');
  if (parts.length === 3) {
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const year = parts[2].length === 4 ? parts[2] : '20' + parts[2];
    return `${year}-${month}-${day}`;
  }
  try {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  } catch(e) {}
  return '';
}

// Open and Prepopulate Edit Modal
function openEditModal(id) {
  const rec = records.find(r => r.id === id);
  if (!rec) return;

  document.getElementById('edit-id').value = rec.id || '';
  document.getElementById('edit-name').textContent = rec.name || '-';
  document.getElementById('edit-surname').textContent = rec.surname || '-';
  document.getElementById('edit-email').value = rec.email || '';
  document.getElementById('edit-equipment').value = rec.equipment || '';
  document.getElementById('edit-borrow-date').textContent = rec.borrowDate ? formatThaiDate(normalizeDate(rec.borrowDate)) : '-';
  document.getElementById('edit-return-date').value = normalizeDate(rec.returnDate);
  document.getElementById('edit-status').value = rec.status || 'กำลังยืม';
  document.getElementById('edit-timestamp').textContent = rec.timestamp ? formatThaiDate(rec.timestamp.split('T')[0]) : '-';
  document.getElementById('edit-notes').value = rec.notes || '';

  openModal('edit-modal');
};

// Handle Save Edit Form
async function handleSaveEdit(e) {
  e.preventDefault();

  const id = document.getElementById('edit-id').value;
  const index = records.findIndex(r => r.id === id);
  if (index === -1) return;

  const newStatus = document.getElementById('edit-status').value;
  records[index].email = document.getElementById('edit-email').value.trim();
  records[index].equipment = document.getElementById('edit-equipment').value.trim();
  records[index].status = newStatus;
  records[index].returnDate = newStatus === 'คืนแล้ว'
    ? getLocalDateString()
    : document.getElementById('edit-return-date').value;
  records[index].notes = document.getElementById('edit-notes').value.trim();

  closeAllModals();
  renderDashboardData();
  showToast('บันทึกการเปลี่ยนแปลงข้อมูลเรียบร้อย', 'success');
  await saveRecordsToStorage();
}


// Save to LocalStorage + sync to Google Sheets
async function saveRecordsToStorage() {
  isSaving = true;
  localStorage.setItem('borrow_records', JSON.stringify(records));
  try {
    await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      redirect: 'follow',
      body: JSON.stringify({ action: 'saveAll', records })
    });
  } catch(e) {}
  isSaving = false;
}

// ==================== TOAST MESSAGES LOGIC ====================
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let iconClass = 'fa-solid fa-circle-info';
  if (type === 'success') iconClass = 'fa-solid fa-circle-check';
  if (type === 'danger') iconClass = 'fa-solid fa-circle-exclamation';
  if (type === 'warning') iconClass = 'fa-solid fa-triangle-exclamation';

  toast.innerHTML = `
    <span class="toast-icon"><i class="${iconClass}"></i></span>
    <span class="toast-message">${message}</span>
  `;

  container.appendChild(toast);

  // Auto remove toast after 4 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 4000);
}

// ==================== DATE UTILITY TRANSLATORS ====================
function formatThaiDate(dateStr) {
  if (!dateStr) return '-';
  const normalized = normalizeDate(String(dateStr));
  const parts = normalized.split('-');
  if (parts.length !== 3) return String(dateStr);
  
  const year = parseInt(parts[0]) + 543;
  const months = [
    'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
  ];
  const month = months[parseInt(parts[1]) - 1];
  const day = parseInt(parts[2]);
  
  return `${day} ${month} ${year}`;
}

function formatThaiDateTime(dateTimeStr) {
  if (!dateTimeStr) return '-';
  const parts = dateTimeStr.split('T');
  const dateStr = parts[0];
  const timeStr = parts[1] ? parts[1].substring(0, 5) : '';
  
  const formattedDate = formatThaiDate(dateStr);
  const formattedTime = timeStr ? `${timeStr} น.` : '';
  
  return `${formattedDate} ${formattedTime}`;
}

function formatThaiFullDate(date) {
  const year = date.getFullYear() + 543;
  const months = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];
  const month = months[date.getMonth()];
  const day = date.getDate();
  
  return `${day} ${month} ${year}`;
}
