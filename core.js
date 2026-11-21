/**
 * core.js - Shared Foundation for Handyman Manager
 * Handles IndexedDB persistence, schema migrations, branding loader,
 * shared navigation/UI shell, cross-page routing, and common helpers.
 */
"use strict";

// ============================================================================
// 1. GLOBAL CONFIGURATION & SHARED CONSTANTS
// ============================================================================
const APP_CONFIG = {
  dbName: 'handyman-manager-complete',
  dbVersion: 2, // Incremented for multi-page platform support
  stores: [
    'customers',
    'jobs',
    'qaReports',
    'quotes',
    'invoices',
    'payments',
    'docs',
    'templates',
    'settings',
    'counters'
  ],
  pages: {
    home: 'index.html',
    archive: 'archive.html',
    legalQa: 'legal-qa.html',
    peripherals: 'peripherals.html'
  }
};

const DEFAULT_BRAND = {
  name: 'David Kennedy Handyman Services',
  slogan: '',
  address: '',
  phone: '',
  email: '',
  website: '',
  color: '#0f5c5c',
  footer: '',
  bankDetails: '',
  logo: ''
};

let db = null;
let brand = { ...DEFAULT_BRAND };

// ============================================================================
// 2. DOM, FORMATTING & FILE UTILITIES
// ============================================================================
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const esc = (str) =>
  String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));

const uid = () =>
  crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now()) + Math.random().toString(16).slice(2);

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const GBP = (n) => '£' + (Number(n) || 0).toFixed(2);

const dateFmt = (d) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('en-GB') : '';

function formData(formId) {
  const form = typeof formId === 'string' ? $('#' + formId) : formId;
  if (!form) return {};
  return Object.fromEntries(new FormData(form).entries());
}

function fileData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function presentPdf(blob, filename, win) {
  const url = URL.createObjectURL(blob);
  if (win && !win.closed) {
    win.location.href = url;
  } else {
    downloadBlob(blob, filename);
  }
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}

function saveText(text, filename, type = 'text/plain') {
  downloadBlob(new Blob([text], { type }), filename);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') return resolve();
      existing.addEventListener('load', resolve);
      existing.addEventListener('error', reject);
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => {
      s.dataset.loaded = 'true';
      resolve();
    };
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ============================================================================
// 3. INDEXEDDB ENGINE & MIGRATION HANDLER
// ============================================================================
function dbRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function store(storeName, mode = 'readonly') {
  if (!db) throw new Error('Database not initialized');
  return db.transaction(storeName, mode).objectStore(storeName);
}

const all = (storeName) => dbRequest(store(storeName).getAll());
const get = (storeName, id) => dbRequest(store(storeName).get(id));
const put = (storeName, obj) => dbRequest(store(storeName, 'readwrite').put(obj));
const del = (storeName, id) => dbRequest(store(storeName, 'readwrite').delete(id));

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(APP_CONFIG.dbName, APP_CONFIG.dbVersion);

    req.onupgradeneeded = (event) => {
      const database = req.result;
      const oldVersion = event.oldVersion;

      // Ensure all required object stores exist (v1 & v2)
      APP_CONFIG.stores.forEach((storeName) => {
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName, { keyPath: 'id' });
        }
      });

      // Future-proof migration hooks
      if (oldVersion < 2) {
        console.info('Database migrated to v2 (Multi-file platform architecture)');
      }
    };

    req.onsuccess = () => {
      db = req.result;
      resolve(db);
    };

    req.onerror = () => reject(req.error);
  });
}

// ============================================================================
// 4. BRANDING LOADER & THEME ENGINE
// ============================================================================
async function loadBrand() {
  try {
    const saved = await get('settings', 'brand');
    brand = { ...DEFAULT_BRAND, ...(saved || {}) };
  } catch (e) {
    console.warn('Could not load saved brand, using default:', e);
    brand = { ...DEFAULT_BRAND };
  }

  // Apply brand primary accent color & mobile theme meta tag
  const accent = brand.color || '#0f5c5c';
  document.documentElement.style.setProperty('--ac', accent);
  const metaTheme = $('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute('content', accent);

  // Update header DOM if present
  const nameEl = $('#brandName');
  const sloganEl = $('#brandSlogan');
  if (nameEl) nameEl.textContent = brand.name || DEFAULT_BRAND.name;
  if (sloganEl) sloganEl.textContent = brand.slogan || '';

  return brand;
}

// ============================================================================
// 5. SHARED SHELL (HEADER, NAVIGATION, TOAST & MODALS)
// ============================================================================
function toast(message, duration = 2800) {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.style.display = 'block';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => {
    el.style.display = 'none';
  }, duration);
}

function modal(contentHtml, showClose = true) {
  let dlg = $('#modal');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'modal';
    document.body.appendChild(dlg);
  }
  dlg.innerHTML =
    contentHtml +
    (showClose
      ? '<button class="secondary w" type="button" onclick="closeModal()">Close</button>'
      : '');
  if (!dlg.open) {
    dlg.showModal();
  }
}

function closeModal() {
  const dlg = $('#modal');
  if (dlg && dlg.open) {
    dlg.close();
  }
}

/**
 * Injects the unified header, modal container, toast container, and 4-tab
 * bottom navigation bar across all HTML pages so navigation feels seamless.
 */
function renderAppShell(activeSection) {
  // Ensure Header exists
  if (!$('header')) {
    const header = document.createElement('header');
    header.innerHTML = `<b id="brandName">${esc(brand.name)}</b><small id="brandSlogan">${esc(brand.slogan)}</small>`;
    document.body.prepend(header);
  }

  // Ensure Toast & Modal exist
  if (!$('#toast')) {
    const t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  if (!$('#modal')) {
    const m = document.createElement('dialog');
    m.id = 'modal';
    document.body.appendChild(m);
  }

  // Ensure Bottom Navigation exists and reflects the active page
  let nav = $('nav');
  if (!nav) {
    nav = document.createElement('nav');
    document.body.appendChild(nav);
  }

  const navItems = [
    { id: 'home', label: 'Dashboard', href: APP_CONFIG.pages.home },
    { id: 'archive', label: 'Customers & Jobs', href: APP_CONFIG.pages.archive },
    { id: 'legalQa', label: 'Legal & QA', href: APP_CONFIG.pages.legalQa },
    { id: 'peripherals', label: 'Branding & Backup', href: APP_CONFIG.pages.peripherals }
  ];

  nav.innerHTML = navItems
    .map(
      (item) => `
      <button
        type="button"
        data-section="${item.id}"
        class="${activeSection === item.id ? 'on' : ''}"
        onclick="navigateTo('${item.href}')"
      >${item.label}</button>`
    )
    .join('');
}

// ============================================================================
// 6. CROSS-PAGE NAVIGATION & SHARING HELPER
// ============================================================================
/**
 * Navigates between the 4 HTML files while passing query parameters cleanly.
 * Example: navigateTo('legal-qa.html', { action: 'start-qa', jobId: '123' })
 */
function navigateTo(pageFile, params = {}) {
  const url = new URL(pageFile, window.location.href);
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== '') {
      url.searchParams.set(key, String(val));
    }
  });
  window.location.href = url.toString();
}

function getQueryParams() {
  const params = {};
  new URLSearchParams(window.location.search).forEach((val, key) => {
    params[key] = val;
  });
  return params;
}

function clearQueryParams() {
  const cleanUrl = window.location.pathname;
  window.history.replaceState({}, document.title, cleanUrl);
}

/**
 * Shared native Web Share / Download helper for PDFs and JSON backups
 * across archive.html, legal-qa.html, and peripherals.html.
 */
async function shareOrDownloadFile(blob, filename, title = 'Handyman Document') {
  const file = new File([blob], filename, { type: blob.type || 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        title,
        files: [file]
      });
      return true;
    } catch (err) {
      if (err.name === 'AbortError') return false;
      // Fallback to standard download if share fails
    }
  }
  downloadBlob(blob, filename);
  return true;
}

// ============================================================================
// 7. PLATFORM BOOTSTRAPPER
// ============================================================================
/**
 * Call initCore(activeSection) at the start of every HTML page.
 * Ensures DB is open, storage persistence is requested, shell is rendered,
 * and branding is applied before page-specific logic executes.
 */
async function initCore(activeSection = 'home') {
  try {
    await openDB();
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }
    await loadBrand();
    renderAppShell(activeSection);
    await loadBrand(); // Re-sync header text after shell injection
    return { db, brand, params: getQueryParams() };
  } catch (err) {
    console.error('Core initialization failed:', err);
    const view = $('#view');
    if (view) {
      view.innerHTML = `<div class="c"><b style="color:#b3261e">Storage Error:</b> Your browser could not open local IndexedDB storage. Please ensure you are not in Private Browsing mode and try Safari or Chrome.</div>`;
    }
    throw err;
  }
}
