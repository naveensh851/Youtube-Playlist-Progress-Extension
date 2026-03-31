/**
 * utils.js
 * Helper utilities: topic extraction, storage helpers, DOM helpers
 */

// ─── Stopwords ────────────────────────────────────────────────────────────────
const STOPWORDS = new Set([
  'the','is','are','was','were','be','been','being','a','an','and','or','but',
  'in','on','at','to','for','of','with','by','from','as','into','through',
  'about','above','after','before','between','during','without','within',
  'this','that','these','those','it','its','i','you','he','she','we','they',
  'my','your','his','her','our','their','what','which','who','how','when',
  'where','why','will','would','could','should','may','might','do','does',
  'did','have','has','had','not','no','so','if','then','than','just','also',
  'more','most','very','even','still','here','there','get','got','can','all',
  'up','out','now','new','how','your','full','course','part','series','ep',
  'episode','tutorial','intro','introduction','basics','beginner','learn',
  'using','use','make','build','create','day','days','week','weeks','year',
  'years','watch','video','youtube','playlist','subscribe','like','share',
  'complete','guide','overview','review','ft','feat','official','hd','4k',
  'vs','top','best','tips','tricks','hindi','english','urdu','lecture',
  'class','chapter','module','section','lesson','free','paid','amp'
]);

/**
 * Extract top keywords across all titles (overall playlist topics).
 * @param {string[]} titles
 * @param {number} topN
 * @returns {string[]}
 */
function extractTopics(titles, topN = 15) {
  const freq = {};
  titles.forEach(title => {
    tokenize(title).forEach(w => { freq[w] = (freq[w] || 0) + 1; });
  });
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word]) => word);
}

/**
 * Extract topics for a single video title (per-video keywords).
 * @param {string} title
 * @param {number} topN
 * @returns {string[]}
 */
function extractVideoTopics(title, topN = 4) {
  const words = tokenize(title);
  const seen = new Set();
  const unique = [];
  for (const w of words) {
    if (!seen.has(w)) { seen.add(w); unique.push(w); }
  }
  return unique.slice(0, topN);
}

/**
 * Tokenise a title string into meaningful lowercase words.
 * @param {string} title
 * @returns {string[]}
 */
function tokenize(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

async function loadPlaylistData(playlistId) {
  return new Promise(resolve => {
    chrome.storage.local.get([playlistId], result => {
      resolve(result[playlistId] || {});
    });
  });
}

async function savePlaylistData(playlistId, data) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [playlistId]: data }, resolve);
  });
}

async function clearPlaylistData(playlistId) {
  return new Promise(resolve => {
    chrome.storage.local.remove([playlistId], resolve);
  });
}

// ─── URL helpers ──────────────────────────────────────────────────────────────

function getPlaylistIdFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get('list') || null;
}

function isPlaylistPage() {
  return window.location.href.includes('youtube.com/playlist?list=');
}

// ─── DOM helpers ─────────────────────────────────────────────────────────────

function waitForElement(selector, timeout = 8000) {
  return new Promise(resolve => {
    const existing = document.querySelector(selector);
    if (existing) return resolve(existing);
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) { observer.disconnect(); resolve(el); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { observer.disconnect(); resolve(null); }, timeout);
  });
}
