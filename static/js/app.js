/**
 * static/js/app.js — AI News Dashboard Frontend Logic
 * Handles: fetch, render, filter, save/unsave, localStorage, toasts, skeleton loaders
 */

'use strict';

// ─── State ───────────────────────────────────────────────────────
const STATE = {
  articles: [],
  filter: 'all',        // 'all' | 'bens' | 'rundown' | 'reddit'
  savedIds: new Set(),  // loaded from localStorage
  meta: null,
  drawerOpen: false,
};

const STORAGE_KEYS = {
  SAVED: 'ai_dash_saved_articles',
  CACHE: 'ai_dash_cached_articles',
  CACHE_TS: 'ai_dash_cache_timestamp',
};

const SOURCE_MAP = {
  "Ben's Bites": { key: 'bens', cls: 'bens', badgeCls: 'bens' },
  "The Rundown": { key: 'rundown', cls: 'rundown', badgeCls: 'rundown' },
  "Reddit": { key: 'reddit', cls: 'reddit', badgeCls: 'reddit' },
};

// ─── DOM References ───────────────────────────────────────────────
const $ = id => document.getElementById(id);
const dom = {
  articlesGrid: () => $('articles-grid'),
  statTotal: () => $('stat-total'),
  statSaved: () => $('stat-saved'),
  statSources: () => $('stat-sources'),
  statFresh: () => $('stat-fresh'),
  lastUpdated: () => $('last-updated-badge'),
  refreshBtn: () => $('refresh-btn'),
  drawerOverlay: () => $('drawer-overlay'),
  drawer: () => $('saved-drawer'),
  drawerBody: () => $('drawer-body'),
  drawerCount: () => $('drawer-count'),
  staleBanner: () => $('stale-banner'),
  sourceStatuses: () => $('source-statuses'),
  filterBtns: () => document.querySelectorAll('.filter-pill[data-filter]'),
  filterCounts: () => document.querySelectorAll('[data-filter-count]'),
  toastContainer: () => $('toast-container'),
};

// ─── localStorage Helpers ─────────────────────────────────────────
function loadSavedIds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SAVED);
    if (raw) STATE.savedIds = new Set(JSON.parse(raw));
  } catch { STATE.savedIds = new Set(); }
}

function persistSavedIds() {
  localStorage.setItem(STORAGE_KEYS.SAVED, JSON.stringify([...STATE.savedIds]));
}

function loadLocalCache() {
  try {
    const ts = localStorage.getItem(STORAGE_KEYS.CACHE_TS);
    if (!ts) return null;
    const age = Date.now() - new Date(ts).getTime();
    if (age > 24 * 60 * 60 * 1000) return null; // stale
    const raw = localStorage.getItem(STORAGE_KEYS.CACHE);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveToLocalCache(payload) {
  try {
    localStorage.setItem(STORAGE_KEYS.CACHE, JSON.stringify(payload));
    localStorage.setItem(STORAGE_KEYS.CACHE_TS, new Date().toISOString());
  } catch { }
}

// ─── Time Formatting ──────────────────────────────────────────────
function timeAgo(isoStr) {
  if (!isoStr) return 'Unknown time';
  const diff = (Date.now() - new Date(isoStr).getTime()) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Toast ────────────────────────────────────────────────────────
function showToast(message, icon = '✓') {
  const container = dom.toastContainer();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    toast.addEventListener('animationend', () => toast.remove());
  }, 2800);
}

// ─── render Article Card ──────────────────────────────────────────
function renderCard(article) {
  const src = SOURCE_MAP[article.source] || SOURCE_MAP["The Rundown"];
  const saved = STATE.savedIds.has(article.id);
  const escapedTitle = article.title.replace(/"/g, '&quot;');

  const card = document.createElement('article');
  card.className = `article-card source-${src.cls}`;
  card.dataset.id = article.id;
  card.dataset.source = src.key;

  card.innerHTML = `
    <div class="card-header">
      <span class="source-badge ${src.badgeCls}">${article.source_icon} ${article.source}</span>
      <button class="save-btn ${saved ? 'saved' : ''}" 
              id="save-${article.id}"
              aria-label="${saved ? 'Unsave' : 'Save'} article"
              data-id="${article.id}"
              title="${saved ? 'Unsave' : 'Save'}">
        ${saved ? '❤️' : '🤍'}
      </button>
    </div>
    <h3 class="card-title">${article.title}</h3>
    ${article.summary ? `<p class="card-summary">${article.summary}</p>` : ''}
    <div class="card-footer">
      <span class="card-time">🕐 ${timeAgo(article.published_at)}</span>
      <a class="read-link" href="${article.url}" target="_blank" rel="noopener noreferrer">
        Read more →
      </a>
    </div>
  `;

  card.querySelector('.save-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSave(article);
  });

  return card;
}

// ─── Skeleton Loaders ─────────────────────────────────────────────
function renderSkeletons(count = 6) {
  const grid = dom.articlesGrid();
  grid.innerHTML = '';
  for (let i = 0; i < count; i++) {
    grid.innerHTML += `
      <div class="skeleton-card">
        <div class="sk-row">
          <div class="sk sk-badge"></div>
          <div class="sk sk-btn"></div>
        </div>
        <div class="sk sk-title-1"></div>
        <div class="sk sk-title-2"></div>
        <div class="sk sk-sum-1"></div>
        <div class="sk sk-sum-2"></div>
        <div class="sk sk-sum-3"></div>
        <div class="sk-row" style="margin-top:8px;border-top:1px solid rgba(255,255,255,0.05);padding-top:12px">
          <div class="sk sk-footer"></div>
          <div class="sk sk-link"></div>
        </div>
      </div>`;
  }
}

// ─── Render All Cards with Active Filter ─────────────────────────
function renderArticles() {
  const grid = dom.articlesGrid();
  grid.innerHTML = '';

  const filtered = STATE.filter === 'all'
    ? STATE.articles
    : STATE.articles.filter(a => {
      const src = SOURCE_MAP[a.source];
      return src && src.key === STATE.filter;
    });

  // Update filter pill counts
  document.querySelectorAll('.filter-pill[data-filter]').forEach(btn => {
    const f = btn.dataset.filter;
    const countEl = btn.querySelector('.count');
    if (!countEl) return;
    if (f === 'all') {
      countEl.textContent = STATE.articles.length;
    } else {
      const n = STATE.articles.filter(a => SOURCE_MAP[a.source]?.key === f).length;
      countEl.textContent = n;
    }
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <p class="empty-title">No articles found</p>
        <p class="empty-sub">
          ${STATE.filter !== 'all'
        ? 'No articles from this source in the last 24 hours. Try "All" to see everything.'
        : 'No new articles in the last 24 hours. Check back later or hit Refresh.'}
        </p>
      </div>`;
    return;
  }

  filtered.forEach(article => {
    grid.appendChild(renderCard(article));
  });

  // Re-attach glow listeners after every render (cards are replaced in DOM)
  setupGlowEffect();
}

// ─── Update Stats Row ─────────────────────────────────────────────
function updateStats() {
  if (dom.statTotal()) dom.statTotal().textContent = STATE.articles.length;
  if (dom.statSaved()) dom.statSaved().textContent = STATE.savedIds.size;
  if (dom.statSources()) {
    const active = STATE.meta?.sources_scraped?.filter(s => s.status === 'ok').length ?? 0;
    dom.statSources().textContent = active;
  }
  if (dom.statFresh()) {
    const ts = STATE.meta?.last_updated;
    dom.statFresh().textContent = ts ? timeAgo(ts) : '—';
  }
}

// ─── Update Last-Updated Badge ────────────────────────────────────
function updateBadge(loading = false, stale = false) {
  const badge = dom.lastUpdated();
  if (!badge) return;
  if (loading) {
    badge.className = 'header-badge loading';
    badge.innerHTML = `<span class="dot"></span> Fetching...`;
    return;
  }
  const ts = STATE.meta?.last_updated;
  const label = ts ? `Updated ${timeAgo(ts)}` : 'Never updated';
  badge.className = `header-badge${stale ? ' stale' : ''}`;
  badge.innerHTML = `<span class="dot"></span> ${label}`;
}

// ─── Update Source Status Indicators ─────────────────────────────
function updateSourceStatuses() {
  const container = dom.sourceStatuses();
  if (!container || !STATE.meta) return;
  container.innerHTML = '';
  (STATE.meta.sources_scraped || []).forEach(src => {
    const cls = src.status === 'ok' ? 'ok'
      : src.status === 'error' ? 'error'
        : 'coming';
    const label = src.status === 'ok' ? 'Live'
      : src.status === 'error' ? 'Error'
        : 'Soon';
    container.innerHTML += `
      <span class="source-status ${cls}">${src.icon} ${src.name} · ${label}</span>`;
  });
}

// ─── Toggle Save ─────────────────────────────────────────────────
function toggleSave(article) {
  const wasSaved = STATE.savedIds.has(article.id);
  if (wasSaved) {
    STATE.savedIds.delete(article.id);
    showToast('Removed from saved', '🗑️');
  } else {
    STATE.savedIds.add(article.id);
    showToast('Article saved!', '❤️');
  }
  persistSavedIds();
  updateStats();

  // Update button in grid
  const btn = document.getElementById(`save-${article.id}`);
  if (btn) {
    btn.className = `save-btn ${STATE.savedIds.has(article.id) ? 'saved' : ''}`;
    btn.innerHTML = STATE.savedIds.has(article.id) ? '❤️' : '🤍';
  }

  // Refresh drawer if open
  if (STATE.drawerOpen) renderDrawer();
}

// ─── Saved Drawer ─────────────────────────────────────────────────
function renderDrawer() {
  const body = dom.drawerBody();
  const count = dom.drawerCount();
  if (!body) return;

  const savedArticles = STATE.articles.filter(a => STATE.savedIds.has(a.id));

  if (count) count.textContent = savedArticles.length;

  body.innerHTML = '';

  if (savedArticles.length === 0) {
    body.innerHTML = `
      <div class="empty-state" style="padding:40px 20px">
        <div class="empty-icon">🤍</div>
        <p class="empty-title">No saved articles yet</p>
        <p class="empty-sub">Hit the ❤️ button on any article to save it for later.</p>
      </div>`;
    return;
  }

  savedArticles.forEach(article => {
    const src = SOURCE_MAP[article.source] || {};
    const el = document.createElement('div');
    el.className = 'drawer-article';
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <p class="drawer-article-title">${article.title}</p>
        <button class="unsave-btn" title="Remove" data-id="${article.id}">✕</button>
      </div>
      <div class="drawer-article-meta">
        <span class="drawer-article-source">${article.source_icon} ${article.source} · ${timeAgo(article.published_at)}</span>
        <a class="drawer-article-link" href="${article.url}" target="_blank" rel="noopener">Read →</a>
      </div>`;
    el.querySelector('.unsave-btn').addEventListener('click', () => toggleSave(article));
    body.appendChild(el);
  });
}

function openDrawer() {
  STATE.drawerOpen = true;
  renderDrawer();
  dom.drawerOverlay().classList.add('open');
  dom.drawer().classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeDrawer() {
  STATE.drawerOpen = false;
  dom.drawerOverlay().classList.remove('open');
  dom.drawer().classList.remove('open');
  document.body.style.overflow = '';
}

// ─── Fetch Articles ────────────────────────────────────────────────
async function fetchArticles(forceRefresh = false) {
  const btn = dom.refreshBtn();
  if (btn) { btn.classList.add('spinning'); btn.disabled = true; }
  updateBadge(true);
  renderSkeletons(6);

  try {
    const url = forceRefresh ? '/api/articles?refresh=true' : '/api/articles';
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Server error: ${resp.status}`);
    const payload = await resp.json();

    STATE.articles = payload.articles || [];
    STATE.meta = payload.meta || null;

    // Sync saved state from localStorage
    STATE.articles.forEach(a => { a.is_saved = STATE.savedIds.has(a.id); });

    saveToLocalCache(payload);
    renderArticles();
    updateStats();
    updateBadge(false, payload.meta?.is_stale);
    updateSourceStatuses();

    // Show stale banner if needed
    const staleBanner = dom.staleBanner();
    if (staleBanner) {
      staleBanner.className = payload.meta?.is_stale ? 'stale-banner visible' : 'stale-banner';
    }

    if (forceRefresh) showToast('Feed refreshed!', '✨');
  } catch (err) {
    console.error('[APP] Fetch failed:', err);
    // Try local cache fallback
    const cached = loadLocalCache();
    if (cached) {
      STATE.articles = cached.articles || [];
      STATE.meta = cached.meta || null;
      renderArticles();
      updateStats();
      updateBadge(false, true);
      showToast('Using cached data (offline?)', '⚠️');
    } else {
      dom.articlesGrid().innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <p class="empty-title">Could not load articles</p>
          <p class="empty-sub">Make sure the server is running, then hit Refresh.</p>
        </div>`;
      updateBadge(false, true);
    }
  } finally {
    if (btn) { btn.classList.remove('spinning'); btn.disabled = false; }
  }
}

// ─── Filter Pills ────────────────────────────────────────────────
function setupFilters() {
  document.querySelectorAll('.filter-pill[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('disabled')) return;
      STATE.filter = btn.dataset.filter;
      document.querySelectorAll('.filter-pill[data-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderArticles();
    });
  });
}

// ─── Nav Items ────────────────────────────────────────────────────
function setupNav() {
  document.querySelectorAll('.nav-item[data-nav]').forEach(item => {
    item.addEventListener('click', () => {
      const nav = item.dataset.nav;
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      if (nav === 'saved') openDrawer();
    });
  });
}

// ─── Auto-Refresh every 24h ────────────────────────────────────────
const REFRESH_INTERVAL = 24 * 60 * 60 * 1000;
let refreshTimer = null;

function scheduleRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => fetchArticles(true), REFRESH_INTERVAL);
}

// ─── Init ─────────────────────────────────────────────────────────
function init() {
  loadSavedIds();
  setupFilters();
  setupNav();

  // Refresh button
  const refreshBtn = dom.refreshBtn();
  if (refreshBtn) refreshBtn.addEventListener('click', () => fetchArticles(true));

  // Drawer close
  const overlay = dom.drawerOverlay();
  const closeBtn = $('drawer-close');
  if (overlay) overlay.addEventListener('click', closeDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);

  scheduleRefresh();

  // Try local cache first for instant load, then fetch fresh
  const localCache = loadLocalCache();
  if (localCache) {
    STATE.articles = localCache.articles || [];
    STATE.meta = localCache.meta || null;
    renderArticles();
    updateStats();
    updateBadge(false, false);
    updateSourceStatuses();
    // Still trigger a background fetch to check for newer data
    fetchArticles(false);
  } else {
    fetchArticles(false);
  }
}

// ─── Glowing Border Effect (Aceternity-style) ─────────────────
// Tracks mouse position relative to each card and updates CSS
// custom properties --glow-x / --glow-y that drive the conic-
// gradient border beam in styles.css.

const GLOW_COLORS = {
  bens: '#d97706',   // Amber for Ben's Bites
  rundown: '#b91c1c',   // Crimson for The Rundown
  reddit: '#dc2626',   // Red for Reddit
  default: '#b91c1c',
};

function setupGlowEffect() {
  // Use event delegation — attach once to the grid, works on dynamically added cards
  const grid = dom.articlesGrid();
  if (!grid) return;

  // Remove any previous listener to avoid double-binding on re-renders
  if (grid._glowHandler) {
    grid.removeEventListener('mousemove', grid._glowHandler);
  }
  if (grid._glowLeaveHandler) {
    grid.removeEventListener('mouseleave', grid._glowLeaveHandler, true);
  }

  function onMouseMove(e) {
    const card = e.target.closest('.article-card');
    if (!card) return;

    const rect = card.getBoundingClientRect();
    // Position as percentage within the card
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    // Pick colour based on source
    const src = card.dataset.source || 'default';
    const color = GLOW_COLORS[src] || GLOW_COLORS.default;

    card.style.setProperty('--glow-x', `${x.toFixed(1)}%`);
    card.style.setProperty('--glow-y', `${y.toFixed(1)}%`);
    card.style.setProperty('--glow-color', color);
  }

  // Reset on mouse leave so next entry starts clean
  function onMouseLeave(e) {
    const card = e.target.closest?.('.article-card');
    if (card) {
      card.style.removeProperty('--glow-x');
      card.style.removeProperty('--glow-y');
    }
  }

  grid._glowHandler = onMouseMove;
  grid._glowLeaveHandler = onMouseLeave;
  grid.addEventListener('mousemove', onMouseMove);
  grid.addEventListener('mouseleave', onMouseLeave, true);
}

document.addEventListener('DOMContentLoaded', init);

