/**
 * content.js
 * Main content script — injected into every youtube.com page.
 * Handles SPA navigation, watched detection (80% threshold),
 * per-video topics, and full video list rendering.
 */

// ─── Constants ────────────────────────────────────────────────────────────────
const POPUP_ID        = 'yt-plt-popup';
const WATCHED_THRESH  = 80;    // % progress required to count as "watched"
const SCAN_DELAY_MS   = 1800;
const SCAN_INTERVAL   = 2500;

let currentPlaylistId = null;
let scanTimer         = null;

// ─── Bootstrap ───────────────────────────────────────────────────────────────
init();

function init() {
  maybeActivate();
  startURLWatcher();
}

// ─── SPA Navigation Watcher ──────────────────────────────────────────────────
function startURLWatcher() {
  let lastURL = location.href;

  setInterval(() => {
    if (location.href !== lastURL) {
      lastURL = location.href;
      onNavigate();
    }
  }, 500);

  new MutationObserver(() => {
    if (location.href !== lastURL) {
      lastURL = location.href;
      onNavigate();
    }
  }).observe(document.body, { childList: true, subtree: false });
}

function onNavigate() {
  clearInterval(scanTimer);
  removePopup();
  currentPlaylistId = null;
  maybeActivate();
}

// ─── Activation ──────────────────────────────────────────────────────────────
function maybeActivate() {
  if (!isPlaylistPage()) return;
  const id = getPlaylistIdFromURL();
  if (!id) return;
  currentPlaylistId = id;
  setTimeout(() => runScan(), SCAN_DELAY_MS);
  scanTimer = setInterval(() => runScan(), SCAN_INTERVAL);
}

// ─── Core Scan ───────────────────────────────────────────────────────────────
async function runScan() {
  if (!isPlaylistPage() || !currentPlaylistId) return;

  const videos = scrapePlaylist();
  if (videos.length === 0) return;

  const watchedCount = videos.filter(v => v.isWatched).length;
  const overallTopics = extractTopics(videos.map(v => v.title));

  await savePlaylistData(currentPlaylistId, {
    total: videos.length,
    watched: watchedCount,
    topics: overallTopics,
    updatedAt: Date.now()
  });

  renderPopup({ videos, watchedCount, overallTopics });
}

// ─── Playlist Scraping ───────────────────────────────────────────────────────
/**
 * Scrape every video from the playlist.
 * Returns array of { title, index, progress, isWatched, topics }
 *
 * "Watched" = progress bar width >= WATCHED_THRESH (80%)
 */
function scrapePlaylist() {
  const items = document.querySelectorAll('ytd-playlist-video-renderer');
  const videos = [];

  items.forEach((item, idx) => {
    const titleEl   = item.querySelector('#video-title');
    const title     = titleEl?.textContent?.trim() || `Video ${idx + 1}`;

    // YouTube's red progress bar — style.width is like "73.4%"
    const progressBar = item.querySelector('#progress');
    let progress = 0;
    if (progressBar) {
      const raw = progressBar.style.width || '0';
      progress = parseFloat(raw) || 0;
    }

    // Check for the "watched" overlay (fully completed videos sometimes
    // show a checkmark overlay instead of the progress bar)
    const watchedOverlay = item.querySelector('.ytd-thumbnail-overlay-resume-playback-renderer');
    const hasCheckmark   = !!item.querySelector('ytd-thumbnail-overlay-toggle-button-renderer[is-toggled]');

    // Count as watched only if ≥ 80% or has fully-watched indicator
    const isWatched = progress >= WATCHED_THRESH || hasCheckmark;

    const videoTopics = extractVideoTopics(title, 4);

    videos.push({ title, index: idx + 1, progress, isWatched, topics: videoTopics });
  });

  return videos;
}

// ─── Popup Rendering ─────────────────────────────────────────────────────────
function removePopup() {
  document.getElementById(POPUP_ID)?.remove();
}

function renderPopup({ videos, watchedCount, overallTopics }) {
  const total = videos.length;
  const pct   = total > 0 ? Math.round((watchedCount / total) * 100) : 0;

  const existing = document.getElementById(POPUP_ID);
  if (existing) {
    updatePopup(existing, videos, watchedCount, total, pct, overallTopics);
    return;
  }

  const popup = document.createElement('div');
  popup.id        = POPUP_ID;
  popup.className = 'yt-plt-popup yt-plt-fadein';

  popup.innerHTML = `
    <!-- HEADER -->
    <div class="yt-plt-header">
      <span class="yt-plt-icon">▶</span>
      <span class="yt-plt-title">Playlist Progress</span>
      <div class="yt-plt-header-actions">
        <button class="yt-plt-minimize" title="Minimize">−</button>
        <button class="yt-plt-close"    title="Close">✕</button>
      </div>
    </div>

    <!-- OVERALL STATS -->
    <div class="yt-plt-body" id="yt-plt-body">
      <div class="yt-plt-stats">
        <div class="yt-plt-stat">
          <span class="yt-plt-stat-value" id="yt-plt-watched">${watchedCount}</span>
          <span class="yt-plt-stat-label">Watched</span>
        </div>
        <div class="yt-plt-divider"></div>
        <div class="yt-plt-stat">
          <span class="yt-plt-stat-value" id="yt-plt-total">${total}</span>
          <span class="yt-plt-stat-label">Total</span>
        </div>
        <div class="yt-plt-divider"></div>
        <div class="yt-plt-stat">
          <span class="yt-plt-stat-value" id="yt-plt-pct">${pct}%</span>
          <span class="yt-plt-stat-label">Complete</span>
        </div>
      </div>

      <!-- OVERALL PROGRESS BAR -->
      <div class="yt-plt-bar-track">
        <div class="yt-plt-bar-fill" id="yt-plt-bar" style="width:${pct}%"></div>
      </div>
      <div class="yt-plt-bar-label" id="yt-plt-bar-label">${pct}% completed · ${watchedCount} of ${total} videos</div>

      <!-- OVERALL TOPICS -->
      <div class="yt-plt-topics-section">
        <div class="yt-plt-section-label">Playlist Topics</div>
        <div class="yt-plt-topics" id="yt-plt-topics">
          ${renderTopicChips(overallTopics)}
        </div>
      </div>

      <!-- VIDEO LIST -->
      <div class="yt-plt-section-label yt-plt-vlist-label">
        All Videos
        <span class="yt-plt-vcount">${watchedCount}/${total}</span>
      </div>
      <div class="yt-plt-video-list" id="yt-plt-video-list">
        ${renderVideoList(videos)}
      </div>

      <!-- RESET BUTTON -->
      <button class="yt-plt-reset" id="yt-plt-reset-btn">↺ Reset Progress</button>
    </div>
  `;

  document.body.appendChild(popup);

  // ── Close ──
  popup.querySelector('.yt-plt-close').addEventListener('click', () => {
    popup.classList.add('yt-plt-fadeout');
    setTimeout(() => popup.remove(), 300);
    clearInterval(scanTimer);
  });

  // ── Minimize / Expand ──
  const minBtn = popup.querySelector('.yt-plt-minimize');
  const body   = popup.querySelector('#yt-plt-body');
  minBtn.addEventListener('click', () => {
    const isMin = body.classList.toggle('yt-plt-collapsed');
    minBtn.textContent = isMin ? '+' : '−';
    minBtn.title       = isMin ? 'Expand' : 'Minimize';
  });

  // ── Reset ──
  popup.querySelector('#yt-plt-reset-btn').addEventListener('click', async () => {
    await clearPlaylistData(currentPlaylistId);
    // Zero out header stats
    popup.querySelector('#yt-plt-watched').textContent   = '0';
    popup.querySelector('#yt-plt-pct').textContent       = '0%';
    popup.querySelector('#yt-plt-bar').style.width       = '0%';
    popup.querySelector('#yt-plt-bar-label').textContent = '0% completed · 0 of ' + total + ' videos';
    // Zero out all per-video bars
    popup.querySelectorAll('.yt-plt-vid-fill').forEach(b => b.style.width = '0%');
    popup.querySelectorAll('.yt-plt-vid-pct').forEach(p => p.textContent = '0%');
    popup.querySelectorAll('.yt-plt-vid-item').forEach(item => {
      item.classList.remove('yt-plt-vid-done');
      const badge = item.querySelector('.yt-plt-vid-badge');
      if (badge) { badge.textContent = '○'; badge.classList.remove('done'); }
    });
    showToast(popup, 'Progress reset!');
  });

  makeDraggable(popup);
}

// ─── In-Place Update (called on every scan) ──────────────────────────────────
function updatePopup(popup, videos, watchedCount, total, pct, overallTopics) {
  // Stats
  const setTxt = (id, val) => { const el = popup.querySelector(id); if (el) el.textContent = val; };
  setTxt('#yt-plt-watched',    watchedCount);
  setTxt('#yt-plt-total',      total);
  setTxt('#yt-plt-pct',        `${pct}%`);
  setTxt('#yt-plt-bar-label',  `${pct}% completed · ${watchedCount} of ${total} videos`);

  const bar = popup.querySelector('#yt-plt-bar');
  if (bar) bar.style.width = `${pct}%`;

  // Overall topics
  const tc = popup.querySelector('#yt-plt-topics');
  if (tc) tc.innerHTML = renderTopicChips(overallTopics);

  // vcount badge
  const vc = popup.querySelector('.yt-plt-vcount');
  if (vc) vc.textContent = `${watchedCount}/${total}`;

  // Video list — update individual rows without rebuilding the whole list
  const listEl = popup.querySelector('#yt-plt-video-list');
  if (!listEl) return;

  const existingRows = listEl.querySelectorAll('.yt-plt-vid-item');

  // If row count changed (lazy-load), rebuild entirely
  if (existingRows.length !== videos.length) {
    listEl.innerHTML = renderVideoList(videos);
    return;
  }

  // Patch each row in-place
  videos.forEach((v, i) => {
    const row = existingRows[i];
    if (!row) return;

    const fill  = row.querySelector('.yt-plt-vid-fill');
    const pctEl = row.querySelector('.yt-plt-vid-pct');
    const badge = row.querySelector('.yt-plt-vid-badge');

    if (fill)  fill.style.width   = `${Math.min(v.progress, 100)}%`;
    if (pctEl) pctEl.textContent  = `${Math.round(v.progress)}%`;

    if (v.isWatched) {
      row.classList.add('yt-plt-vid-done');
      if (badge) { badge.textContent = '✓'; badge.classList.add('done'); }
    } else {
      row.classList.remove('yt-plt-vid-done');
      if (badge) { badge.textContent = '○'; badge.classList.remove('done'); }
    }
  });
}

// ─── Video List HTML ─────────────────────────────────────────────────────────
function renderVideoList(videos) {
  return videos.map(v => {
    const clampedProgress = Math.min(v.progress, 100);
    const doneClass  = v.isWatched ? 'yt-plt-vid-done' : '';
    const badgeIcon  = v.isWatched ? '✓' : '○';
    const badgeDone  = v.isWatched ? 'done' : '';
    const topicsHTML = v.topics.length
      ? v.topics.map(t => `<span class="yt-plt-vid-chip">${t}</span>`).join('')
      : '<span class="yt-plt-vid-chip muted">—</span>';

    return `
      <div class="yt-plt-vid-item ${doneClass}">
        <div class="yt-plt-vid-row1">
          <span class="yt-plt-vid-badge ${badgeDone}">${badgeIcon}</span>
          <span class="yt-plt-vid-num">${v.index}</span>
          <span class="yt-plt-vid-title">${escapeHTML(v.title)}</span>
          <span class="yt-plt-vid-pct">${Math.round(clampedProgress)}%</span>
        </div>
        <div class="yt-plt-vid-bar-track">
          <div class="yt-plt-vid-fill" style="width:${clampedProgress}%"></div>
        </div>
        <div class="yt-plt-vid-topics">${topicsHTML}</div>
      </div>`;
  }).join('');
}

function renderTopicChips(topics) {
  if (!topics?.length) return '<span class="yt-plt-no-topics">No topics found</span>';
  return topics.map(t => `<span class="yt-plt-chip">${t}</span>`).join('');
}

function escapeHTML(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(popup, msg) {
  const el = document.createElement('div');
  el.className   = 'yt-plt-toast';
  el.textContent = msg;
  popup.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

// ─── Drag to Move ────────────────────────────────────────────────────────────
function makeDraggable(el) {
  let startX, startY, startRight, startTop, isDragging = false;
  const header = el.querySelector('.yt-plt-header');
  if (!header) return;
  header.style.cursor = 'grab';

  header.addEventListener('mousedown', e => {
    if (e.target.closest('.yt-plt-header-actions')) return;
    isDragging = true;
    startX = e.clientX; startY = e.clientY;
    const rect = el.getBoundingClientRect();
    startRight = window.innerWidth - rect.right;
    startTop   = rect.top;
    header.style.cursor = 'grabbing';
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!isDragging) return;
    el.style.right = `${Math.max(0, startRight + (startX - e.clientX))}px`;
    el.style.top   = `${Math.max(0, startTop   + (e.clientY - startY))}px`;
  });
  document.addEventListener('mouseup', () => {
    isDragging = false;
    header.style.cursor = 'grab';
  });
}
