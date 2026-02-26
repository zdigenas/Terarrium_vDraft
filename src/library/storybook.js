/* ═══════════════════════════════════════════════════════════════════════
   storybook.js — Terarrium Storybook JavaScript
   All navigation, API calls, governance review, chat, and UI helpers.
   ═══════════════════════════════════════════════════════════════════════ */

const API = 'http://localhost:3001';

// Conversation history for chat (maintains context across turns)
let chatHistory = [];

/* ── Theme ────────────────────────────────────────────────────────────── */
function toggleTheme() {
  const html = document.documentElement;
  const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  // Fix 16: correct button ID is 'theme-btn'
  const btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = next === 'dark' ? '☀️ Light' : '☽ Dark';
  localStorage.setItem('t-theme', next);
}

/* ── Governance panel ─────────────────────────────────────────────────── */
function togglePanel() {
  const shell = document.getElementById('shell');
  const panel = document.getElementById('gov-panel');
  if (!shell || !panel) return;
  const isOpen = shell.classList.toggle('shell--panel-open');
  // Fix 16: correct button ID is 'panel-btn'
  const btn = document.getElementById('panel-btn');
  if (btn) {
    btn.textContent = isOpen ? 'Chat ‹' : 'Chat ›';
    btn.setAttribute('aria-expanded', isOpen);
  }
}

/* ── Navigation ───────────────────────────────────────────────────────── */
function nav(el) {
  // Fix 3: HTML uses data-target, not data-story
  const target = el.getAttribute('data-target');
  if (!target) return;

  // Deactivate all stories and nav items
  document.querySelectorAll('.story').forEach(s => s.classList.remove('story--active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('nav-item--active'));

  // Activate target
  const story = document.getElementById('story-' + target);
  if (story) story.classList.add('story--active');
  el.classList.add('nav-item--active');

  // Lazy-load story content
  if (target === 'pipeline') loadPipeline();
  if (target === 'wiki') loadWiki();
  if (target === 'seed-vault') loadSeedVault();
  if (target === 'welcome') { loadWelcomeStats(); loadWelcomeActivity(); }
}

/* ── Pipeline ─────────────────────────────────────────────────────────── */
let pipelineData = null;
let activePipelineZone = 'stable';

async function loadPipeline() {
  try {
    const res = await fetch(API + '/api/pipeline');
    pipelineData = await res.json();
    renderPipelineStats(pipelineData);
    renderAllPipelinePanels(pipelineData);
    // Update last-updated badge
    const badge = document.getElementById('pipeline-last-updated');
    if (badge) badge.textContent = 'Updated ' + fmtDate(new Date().toISOString());
  } catch (e) {
    console.warn('Pipeline load failed:', e.message);
    const panel = document.getElementById('pipeline-panel-' + activePipelineZone);
    if (panel) panel.innerHTML = '<p class="pipeline-empty__text">Server offline — start with <code>node src/server/proxy.mjs</code></p>';
  }
}

function renderPipelineStats(data) {
  const zones = ['stable', 'workshop', 'nursery', 'canopy'];
  zones.forEach(z => {
    // Welcome page stats
    const statEl = document.getElementById('stat-' + z);
    if (statEl) statEl.textContent = (data[z] || []).length;
    // Pipeline tab counts
    const countEl = document.getElementById('tab-count-' + z);
    if (countEl) countEl.textContent = (data[z] || []).length;
  });
}

function switchPipelineTab(el, zone) {
  // Fix 5: deactivate all tabs, hide all panels, show correct panel
  document.querySelectorAll('.pipeline-tab').forEach(t => t.classList.remove('pipeline-tab--active'));
  el.classList.add('pipeline-tab--active');
  activePipelineZone = zone;

  document.querySelectorAll('.pipeline-panel').forEach(p => p.classList.remove('pipeline-panel--active'));
  const panel = document.getElementById('pipeline-panel-' + zone);
  if (panel) panel.classList.add('pipeline-panel--active');

  // Render if data already loaded
  if (pipelineData) renderPipelinePanel(zone, pipelineData[zone] || []);
}

function renderAllPipelinePanels(data) {
  ['stable', 'workshop', 'canopy', 'nursery'].forEach(zone => {
    renderPipelinePanel(zone, data[zone] || []);
  });
}

// Fix 4: write to correct panel IDs (#pipeline-panel-{zone})
function renderPipelinePanel(zone, items) {
  const container = document.getElementById('pipeline-panel-' + zone);
  if (!container) return;

  if (items.length === 0) {
    container.innerHTML = '<div class="pipeline-empty"><div class="pipeline-empty__icon">🌱</div><p class="pipeline-empty__text">No components in ' + zone + ' yet.</p></div>';
    return;
  }

  container.innerHTML = items.map(comp => {
    const reviews = comp.agentReviews || {};
    const agentIds = ['ts', 'ag', 'pl', 'ca', 'px'];
    const agentChips = agentIds.map(id => {
      const r = reviews[id];
      const v = r ? r.verdict : 'pending';
      const cls = v === 'approved' ? 'comp-card__agent-chip--approved' : v === 'needs-work' ? 'comp-card__agent-chip--needs-work' : '';
      const dot = v === 'approved' ? '#2F9E44' : v === 'needs-work' ? '#F59F00' : v === 'vetoed' ? '#E03131' : '#868E96';
      return '<span class="comp-card__agent-chip ' + cls + '" title="' + id + ': ' + v + '">' +
        '<span class="comp-card__agent-chip__dot" style="background:' + dot + '"></span>' + id +
      '</span>';
    }).join('');

    const canPromote = zone !== 'stable';
    const promoteBtn = canPromote
      ? '<button class="t-btn t-btn--primary t-btn--sm" onclick="promoteComponent(\'' + comp.id + '\')">Promote ↑</button>'
      : '<span class="t-badge t-badge--stable">Stable</span>';
    const reviewBtn = '<button class="t-btn t-btn--ghost t-btn--sm" onclick="runGovernanceReview(\'' + comp.id + '\')">Review</button>';

    return '<div class="comp-card">' +
      '<div class="comp-card__header">' +
        '<span class="comp-card__name">' + escHtml(comp.name) + '</span>' +
        '<span class="comp-card__zone-badge comp-card__zone-badge--' + zone + '">' + zone + '</span>' +
      '</div>' +
      '<div class="comp-card__desc">' + escHtml(comp.description || comp.id) + '</div>' +
      '<div class="comp-card__agents">' + agentChips + '</div>' +
      '<div class="comp-card__actions">' + reviewBtn + promoteBtn + '</div>' +
    '</div>';
  }).join('');
}

async function promoteComponent(id) {
  try {
    const res = await fetch(API + '/api/pipeline/promote/' + id, { method: 'POST' });
    const data = await res.json();
    if (data.error) { showToast('error', 'Promote failed', data.error); return; }
    showToast('success', 'Promoted', (data.component?.name || id) + ' moved to ' + (data.to || data.component?.zone));
    await loadPipeline();
  } catch (e) {
    showToast('error', 'Network error', e.message);
  }
}

/* ── Governance Review ────────────────────────────────────────────────── */
async function runGovernanceReview(componentId) {
  // Fix 1: correct result container ID is 'review-results-{id}' (plural)
  const resultEl = document.getElementById('review-results-' + componentId);
  const btnEl = document.getElementById('btn-review-' + componentId);

  if (btnEl) {
    btnEl.disabled = true;
    btnEl.innerHTML = '<span class="spinner"></span> Reviewing…';
  }
  if (resultEl) {
    resultEl.innerHTML = '<div style="color:var(--t-fg-tertiary);font-size:var(--t-text-sm);padding:var(--t-space-3) 0;display:flex;align-items:center;gap:var(--t-space-2)"><span class="spinner"></span> Running governance review — this may take 15–30 seconds…</div>';
  }

  showToast('info', 'Review started', 'Agents are reviewing ' + componentId + '…');

  try {
    const res = await fetch(API + '/api/governance-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ componentId })
    });
    const data = await res.json();

    if (data.error) {
      if (resultEl) resultEl.innerHTML = '<div class="review-verdict review-verdict--failed">⚠️ ' + escHtml(data.error) + '</div>';
      if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Run Governance Review'; }
      showToast('error', 'Review failed', data.error);
      return;
    }

    renderReviewResult(componentId, data, resultEl);
    if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Re-run Review'; }

    // Fix 11: server returns zoneVerdict.passed, not overallVerdict
    const passed = data.zoneVerdict?.passed === true;
    showToast(
      passed ? 'success' : 'warning',
      passed ? 'Review passed' : 'Review needs work',
      data.zoneVerdict?.reason || (passed ? 'Component approved by agents' : 'Some agents requested changes')
    );

    // Refresh pipeline
    if (pipelineData) await loadPipeline();

  } catch (e) {
    if (resultEl) resultEl.innerHTML = '<div class="review-verdict review-verdict--failed">⚠️ Network error: ' + escHtml(e.message) + '</div>';
    if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Run Governance Review'; }
    showToast('error', 'Network error', e.message);
  }
}

function renderReviewResult(componentId, data, container) {
  if (!container) return;

  const agentMeta = {
    ts: { name: 'Token Steward',       emoji: '🪙', color: '#F59F00' },
    ag: { name: 'A11y Guardian',       emoji: '♿', color: '#2F9E44' },
    pl: { name: 'Pattern Librarian',   emoji: '📚', color: '#E03131' },
    ca: { name: 'Component Architect', emoji: '🏗️', color: '#495057' },
    px: { name: 'Product Liaison',     emoji: '🤝', color: '#4DABF7' }
  };

  // Fix 11: server returns zoneVerdict, not overallVerdict
  const zv = data.zoneVerdict || {};
  const passed = zv.passed === true;
  const verdictClass = passed ? 'passed' : 'failed';
  const verdictIcon = passed ? '✅' : '⚠️';

  let html = '<div class="review-verdict review-verdict--' + verdictClass + '">' +
    verdictIcon + ' ' + (passed ? 'PASSED' : 'NEEDS WORK') +
    (zv.reason ? ' — ' + escHtml(zv.reason) : '') +
  '</div>';

  // Fix 11: server returns agentReviews, not reviews
  const reviews = data.agentReviews || {};
  Object.entries(reviews).forEach(([agentId, review]) => {
    const meta = agentMeta[agentId] || { name: agentId, emoji: '🤖', color: '#868E96' };
    const v = review.verdict || 'pending';
    const score = review.score != null ? review.score : null;

    // Fix 12: orpa is an object {observation, reflection, plan, action}
    let orpaHtml = '';
    if (review.orpa && typeof review.orpa === 'object') {
      const o = review.orpa;
      orpaHtml = '<div class="arc__orpa">' +
        '<span class="arc__orpa-lbl">ORPA</span>' +
        (o.observation ? '<p class="arc__cond"><strong>Obs:</strong> ' + escHtml(o.observation) + '</p>' : '') +
        (o.reflection  ? '<p class="arc__cond"><strong>Ref:</strong> ' + escHtml(o.reflection)  + '</p>' : '') +
        (o.plan        ? '<p class="arc__cond"><strong>Plan:</strong> ' + escHtml(o.plan)        + '</p>' : '') +
        (o.action      ? '<p class="arc__cond"><strong>Act:</strong> ' + escHtml(o.action)       + '</p>' : '') +
      '</div>';
    }

    const condHtml = review.conditionalApproval
      ? '<div class="arc__orpa" style="margin-top:var(--t-space-1)"><span class="arc__orpa-lbl">Condition for approval</span><p class="arc__cond">' + escHtml(review.conditionalApproval) + '</p></div>'
      : '';

    html += '<div class="arc">' +
      '<div class="arc__av" style="background:' + meta.color + '22;border-color:' + meta.color + '44;">' + meta.emoji + '</div>' +
      '<div class="arc__hd">' +
        '<span class="arc__name">' + meta.name + '</span>' +
        '<span class="arc__vd arc__vd--' + v + '">' + v + (v === 'vetoed' ? ' 🚫' : v === 'approved' ? ' ✓' : '') + '</span>' +
        (score != null ? '<span class="arc__score"> · ' + score + '/100</span>' : '') +
        orpaHtml +
        condHtml +
      '</div>' +
    '</div>';
  });

  container.innerHTML = html;
}

/* ── Wiki ─────────────────────────────────────────────────────────────── */
let wikiData = null;

async function loadWiki() {
  // Fix 6: correct container ID is 'wiki-content'
  const container = document.getElementById('wiki-content');
  if (!container) return;
  container.innerHTML = '<p style="color:var(--t-fg-tertiary);font-size:var(--t-text-sm)">Loading…</p>';
  try {
    const res = await fetch(API + '/api/wiki');
    wikiData = await res.json();
    const countEl = document.getElementById('wiki-count');
    if (countEl) countEl.textContent = Object.keys(wikiData).length + ' entries';
    renderWiki(wikiData);
  } catch (e) {
    container.innerHTML = '<p style="color:var(--t-fg-tertiary)">Could not load wiki — is the server running?</p>';
  }
}

function renderWiki(data) {
  // Fix 6: correct container ID is 'wiki-content'
  const container = document.getElementById('wiki-content');
  if (!container) return;
  const entries = Object.entries(data);
  if (entries.length === 0) {
    container.innerHTML = '<p style="color:var(--t-fg-tertiary);font-size:var(--t-text-sm)">No entries match.</p>';
    return;
  }
  container.innerHTML = '<div class="wiki-grid">' + entries.map(([key, entry]) =>
    '<div class="wiki-card" onclick="showWikiDetail(\'' + key + '\')">' +
      '<span class="wiki-card__term">' + escHtml(entry.term || key) + '</span>' +
      '<span class="wiki-card__def">' + escHtml((entry.definition || '').slice(0, 140)) + '</span>' +
    '</div>'
  ).join('') + '</div>';
}

function filterWiki(query) {
  if (!wikiData) return;
  const q = query.toLowerCase();
  const filtered = {};
  Object.entries(wikiData).forEach(([k, v]) => {
    if (!q || k.includes(q) || (v.term || '').toLowerCase().includes(q) || (v.definition || '').toLowerCase().includes(q)) {
      filtered[k] = v;
    }
  });
  renderWiki(filtered);
}

function showWikiDetail(key) {
  if (!wikiData || !wikiData[key]) return;
  const entry = wikiData[key];
  showToast('info', entry.term || key, (entry.definition || '').slice(0, 160));
}

/* ── Seed Vault ───────────────────────────────────────────────────────── */
async function loadSeedVault() {
  // Fix 7: correct container ID is 'vault-content'
  const container = document.getElementById('vault-content');
  if (!container) return;
  container.innerHTML = '<p style="color:var(--t-fg-tertiary);font-size:var(--t-text-sm)">Loading…</p>';
  try {
    const res = await fetch(API + '/api/seed-vault');
    const data = await res.json();
    const countEl = document.getElementById('vault-count');
    if (countEl) countEl.textContent = data.length + ' archived';
    if (!data.length) {
      container.innerHTML = '<p style="color:var(--t-fg-tertiary);font-size:var(--t-text-sm);">Seed vault is empty.</p>';
      return;
    }
    container.innerHTML = data.map(item =>
      '<div class="vault-item vault-item--revivable">' +
        '<div class="vault-item__header">' +
          '<span class="vault-item__name">' + escHtml(item.name || item.id) + '</span>' +
          '<span style="font-size:11px;color:var(--t-fg-tertiary)">' + fmtDate(item.archivedAt) + '</span>' +
        '</div>' +
        '<div class="vault-item__reason">' + escHtml(item.reason || 'Archived') + '</div>' +
        (item.agents ? '<div class="vault-item__context">Agents: ' + Object.entries(item.agents).map(([k,v]) => k + ':' + v).join(' · ') + '</div>' : '') +
      '</div>'
    ).join('');
  } catch (e) {
    container.innerHTML = '<p style="color:var(--t-fg-tertiary)">Could not load seed vault.</p>';
  }
}

/* ── Welcome ──────────────────────────────────────────────────────────── */
async function loadWelcomeActivity() {
  const container = document.getElementById('welcome-activity');
  if (!container) return;
  try {
    const res = await fetch(API + '/api/activity');
    const lines = await res.json();
    const recent = lines.slice(-8).reverse();
    container.innerHTML = '<div class="activity-feed">' +
      recent.map(item =>
        '<div class="activity-item">' +
          '<span class="activity-item__icon">' + actionIcon(item.action) + '</span>' +
          '<span class="activity-item__text">' + escHtml(item.detail || item.action) + '</span>' +
          '<span class="activity-item__time">' + fmtDate(item.timestamp) + '</span>' +
        '</div>'
      ).join('') +
    '</div>';
  } catch (e) {
    container.innerHTML = '<p style="color:var(--t-fg-tertiary);font-size:var(--t-text-sm);">Activity unavailable — start the server.</p>';
  }
}

async function loadWelcomeStats() {
  try {
    const res = await fetch(API + '/api/pipeline');
    const data = await res.json();
    const set = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    set('stat-stable',   (data.stable   || []).length);
    set('stat-workshop', (data.workshop || []).length);
    set('stat-nursery',  (data.nursery  || []).length);
    set('stat-canopy',   (data.canopy   || []).length);
  } catch (_) { /* server not running */ }
}

/* ── Spacing bars ─────────────────────────────────────────────────────── */
function renderSpacingBars() {
  const container = document.getElementById('spacing-bars');
  if (!container) return;
  const tokens = [
    { name: '--t-space-1',  px: 4  },
    { name: '--t-space-2',  px: 8  },
    { name: '--t-space-3',  px: 12 },
    { name: '--t-space-4',  px: 16 },
    { name: '--t-space-5',  px: 20 },
    { name: '--t-space-6',  px: 24 },
    { name: '--t-space-8',  px: 32 },
    { name: '--t-space-10', px: 40 },
    { name: '--t-space-12', px: 48 },
    { name: '--t-space-16', px: 64 }
  ];
  const style = getComputedStyle(document.documentElement);
  container.innerHTML = tokens.map(t => {
    const computed = style.getPropertyValue(t.name).trim();
    const displayVal = computed || t.px + 'px';
    return '<div class="space-bar">' +
      '<span class="space-bar__label">' + t.name + '</span>' +
      '<div class="space-bar__visual" style="width:' + (t.px * 3) + 'px"></div>' +
      '<span style="font-size:10px;font-family:var(--t-font-mono);color:var(--t-fg-tertiary);margin-left:var(--t-space-2)">' + displayVal + '</span>' +
    '</div>';
  }).join('');
}

/* ── Dialog ───────────────────────────────────────────────────────────── */
function openDialog() {
  // Fix 8: correct ID is 'dialog-demo'
  const d = document.getElementById('dialog-demo');
  if (d) d.style.display = 'flex';
}
function closeDialog() {
  // Fix 8: correct ID is 'dialog-demo'
  const d = document.getElementById('dialog-demo');
  if (d) d.style.display = 'none';
}

/* ── Tabs ─────────────────────────────────────────────────────────────── */
function switchTab(el, panelId) {
  const tabList = el.closest('[role="tablist"]');
  if (!tabList) return;
  const tabsContainer = tabList.closest('.t-tabs');
  if (!tabsContainer) return;

  tabList.querySelectorAll('[role="tab"]').forEach(t => {
    t.setAttribute('aria-selected', 'false');
    t.classList.remove('t-tab--active');
  });
  tabsContainer.querySelectorAll('[role="tabpanel"]').forEach(p => p.hidden = true);

  el.setAttribute('aria-selected', 'true');
  el.classList.add('t-tab--active');
  const panel = document.getElementById(panelId);
  if (panel) panel.hidden = false;
}

/* ── Toast ────────────────────────────────────────────────────────────── */
function showToast(severity, title, message) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const severityMap = {
    info:    { cls: 't-toast--info',    icon: '<svg class="t-toast__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>' },
    success: { cls: 't-toast--success', icon: '<svg class="t-toast__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' },
    warning: { cls: 't-toast--warning', icon: '<svg class="t-toast__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' },
    error:   { cls: 't-toast--error',   icon: '<svg class="t-toast__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' }
  };
  const s = severityMap[severity] || severityMap.info;

  const toast = document.createElement('div');
  toast.className = 't-toast ' + s.cls;
  toast.setAttribute('role', severity === 'error' || severity === 'warning' ? 'alert' : 'status');
  toast.setAttribute('aria-live', severity === 'error' || severity === 'warning' ? 'assertive' : 'polite');
  toast.innerHTML =
    s.icon +
    '<div class="t-toast__content">' +
      '<div class="t-toast__title">' + escHtml(title) + '</div>' +
      (message ? '<div class="t-toast__message">' + escHtml(String(message).slice(0, 200)) + '</div>' : '') +
    '</div>' +
    '<button class="t-toast__dismiss" aria-label="Dismiss" onclick="this.closest(\'.t-toast\').remove()">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
    '</button>';

  container.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 5000);
}

/* ── Tool display mapping ─────────────────────────────────────────────── */
const TOOL_DISPLAY = {
  get_pipeline_state:    { label: 'Checking pipeline',    icon: '📊' },
  get_component_details: { label: 'Loading component',    icon: '🔍' },
  get_recent_decisions:  { label: 'Reading decisions',    icon: '📋' },
  get_activity_log:      { label: 'Reading activity',     icon: '📜' },
  get_wiki:              { label: 'Searching wiki',       icon: '📖' },
  run_governance_review: { label: 'Running review',       icon: '🔬' },
  run_single_agent_review: { label: 'Running agent review', icon: '🤖' },
  promote_component:     { label: 'Promoting component',  icon: '⬆️' },
  create_component:      { label: 'Creating component',   icon: '✨' },
  seed_vault_component:  { label: 'Archiving component',  icon: '🌱' },
  read_file:             { label: 'Reading file',         icon: '📄' },
  write_component_css:   { label: 'Writing CSS',          icon: '🎨' },
  write_component_spec:  { label: 'Writing spec',         icon: '📐' },
  patch_css:             { label: 'Patching CSS',         icon: '🔧' },
  write_token_file:      { label: 'Writing tokens',       icon: '🪙' },
  update_wiki:           { label: 'Updating wiki',        icon: '📖' },
  update_terrarium_css:  { label: 'Updating imports',     icon: '📦' }
};

function formatToolInput(toolName, input) {
  if (!input) return '';
  switch (toolName) {
    case 'get_component_details':
    case 'run_governance_review':
    case 'promote_component':
    case 'seed_vault_component':
      return input.componentId || '';
    case 'run_single_agent_review':
      return (input.agentId || '') + ' on ' + (input.componentId || '');
    case 'create_component':
      return input.name || '';
    case 'get_recent_decisions':
      return input.componentId ? 'for ' + input.componentId : '';
    case 'get_wiki':
      return input.term || '';
    case 'read_file':
      return input.path || '';
    case 'write_component_css':
    case 'write_component_spec':
      return input.name || '';
    case 'patch_css':
      return input.path || '';
    case 'write_token_file':
      return input.filename || '';
    case 'update_wiki':
      return input.term || input.key || '';
    case 'update_terrarium_css':
      return (input.action || '') + ' ' + (input.name || '');
    default:
      return '';
  }
}

/* Action tools that mutate state — trigger pipeline refresh after completion */
const ACTION_TOOLS = new Set([
  'run_governance_review', 'run_single_agent_review',
  'promote_component', 'create_component', 'seed_vault_component',
  'write_component_css', 'write_component_spec', 'patch_css',
  'write_token_file', 'update_wiki', 'update_terrarium_css'
]);

/* ── Governance Chat (SSE with tool use) ──────────────────────────────── */
let chatController = null;

async function sendChat() {
  const input = document.getElementById('gov-input');
  const messagesEl = document.getElementById('gov-messages');
  const status = document.getElementById('gov-status');
  const sendBtn = document.getElementById('btn-chat-send');
  if (!input || !messagesEl) return;

  const text = input.value.trim();
  if (!text) return;

  // Abort any in-flight request
  if (chatController) chatController.abort();
  chatController = new AbortController();

  // Add to history
  chatHistory.push({ role: 'user', content: text });

  // Append user message to UI
  appendChatMsg('user', text);
  input.value = '';
  if (sendBtn) sendBtn.disabled = true;
  if (status) status.textContent = 'Thinking…';

  // Create assistant message container (holds tool indicators + text)
  const assistantContainer = document.createElement('div');
  assistantContainer.className = 'gov-msg gov-msg--assistant';
  const textSpan = document.createElement('span');
  assistantContainer.appendChild(textSpan);
  messagesEl.appendChild(assistantContainer);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  let fullResponse = '';
  let needsPipelineRefresh = false;
  const toolDivs = {};  // toolUseId → DOM element

  try {
    const res = await fetch(API + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: chatHistory,
        context: {
          currentPage: document.querySelector('.nav-item--active')?.getAttribute('data-target'),
        }
      }),
      signal: chatController.signal
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Server error ' + res.status }));
      assistantContainer.className = 'gov-msg gov-msg--error';
      textSpan.textContent = err.error || 'Server error';
      chatHistory.pop();
      if (status) status.textContent = '';
      if (sendBtn) sendBtn.disabled = false;
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') continue;
        try {
          const parsed = JSON.parse(raw);

          if (parsed.type === 'token' && parsed.token) {
            fullResponse += parsed.token;
            textSpan.textContent = fullResponse;
            messagesEl.scrollTop = messagesEl.scrollHeight;

          } else if (parsed.type === 'tool_start') {
            const display = TOOL_DISPLAY[parsed.toolName] || { label: parsed.toolName, icon: '⚙️' };
            const detail = formatToolInput(parsed.toolName, parsed.toolInput);
            const toolDiv = document.createElement('div');
            toolDiv.className = 'gov-tool-call gov-tool-call--running';
            toolDiv.innerHTML =
              '<span class="gov-tool-call__icon">' + display.icon + '</span>' +
              '<span class="gov-tool-call__label">' + escHtml(display.label) + '</span>' +
              (detail ? '<span class="gov-tool-call__detail">' + escHtml(detail) + '</span>' : '') +
              '<span class="spinner--sm"></span>';
            // Insert before text span
            assistantContainer.insertBefore(toolDiv, textSpan);
            toolDivs[parsed.toolUseId] = toolDiv;
            if (status) status.textContent = display.label + '…';
            messagesEl.scrollTop = messagesEl.scrollHeight;

          } else if (parsed.type === 'tool_result') {
            const toolDiv = toolDivs[parsed.toolUseId];
            if (toolDiv) {
              toolDiv.classList.remove('gov-tool-call--running');
              toolDiv.classList.add(parsed.success ? 'gov-tool-call--success' : 'gov-tool-call--error');
              // Remove spinner
              const spinner = toolDiv.querySelector('.spinner--sm');
              if (spinner) spinner.remove();
              // Add result preview
              if (parsed.preview || parsed.error) {
                const resultSpan = document.createElement('span');
                resultSpan.className = 'gov-tool-call__result';
                resultSpan.textContent = parsed.success ? parsed.preview : (parsed.error || 'Error');
                toolDiv.appendChild(resultSpan);
              }
            }
            if (ACTION_TOOLS.has(parsed.toolName)) needsPipelineRefresh = true;
            if (status) status.textContent = 'Thinking…';
            messagesEl.scrollTop = messagesEl.scrollHeight;

          } else if (parsed.type === 'done') {
            fullResponse = parsed.fullText || fullResponse;
            textSpan.textContent = fullResponse;

          } else if (parsed.type === 'error') {
            assistantContainer.className = 'gov-msg gov-msg--error';
            textSpan.textContent = parsed.message || 'Agent error';
          }
        } catch (_) {
          fullResponse += raw;
          textSpan.textContent = fullResponse;
          messagesEl.scrollTop = messagesEl.scrollHeight;
        }
      }
    }

    // Store only final text in chat history (tool loop state is server-side)
    if (fullResponse) {
      chatHistory.push({ role: 'assistant', content: fullResponse });
    }

    // Refresh pipeline if any action tools were used
    if (needsPipelineRefresh && pipelineData !== null) {
      await loadPipeline();
    }

  } catch (e) {
    if (e.name !== 'AbortError') {
      assistantContainer.className = 'gov-msg gov-msg--error';
      textSpan.textContent = 'Connection error: ' + e.message;
      chatHistory.pop();
    }
  } finally {
    if (status) status.textContent = '';
    if (sendBtn) sendBtn.disabled = false;
    chatController = null;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}

function appendChatMsg(role, text) {
  const messagesEl = document.getElementById('gov-messages');
  if (!messagesEl) return;
  const el = document.createElement('div');
  el.className = 'gov-msg gov-msg--' + role;
  el.textContent = text;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

/* ── API health check ─────────────────────────────────────────────────── */
async function checkApiHealth() {
  const badge = document.getElementById('api-status-badge');
  try {
    const res = await fetch(API + '/api/health', { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    // Fix 9: server returns anthropicKeyPresent, not anthropic
    if (badge) {
      if (data.anthropicKeyPresent) {
        badge.textContent = '🟢 API ready';
        badge.className = 't-badge t-badge--success';
      } else {
        badge.textContent = '🟡 No API key';
        badge.className = 't-badge t-badge--warning';
      }
    }
  } catch (_) {
    if (badge) {
      badge.textContent = '🔴 Server offline';
      badge.className = 't-badge t-badge--danger';
    }
  }
}

/* ── Helpers ──────────────────────────────────────────────────────────── */
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch (_) { return ''; }
}

function actionIcon(action) {
  const map = {
    'created': '✨', 'promoted': '⬆️', 'review': '🔍', 'approved': '✅',
    'needs-work': '⚠️', 'vetoed': '🚫', 'seeded': '🌱', 'stable': '🏆',
    'workshop': '🔧', 'nursery': '🌱', 'canopy': '🌳', 'spark': '💡',
    'governance': '🔍', 'submitted': '📥'
  };
  for (const [k, v] of Object.entries(map)) {
    if (action && action.toLowerCase().includes(k)) return v;
  }
  return '📋';
}

/* ── Keyboard shortcuts ───────────────────────────────────────────────── */
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    togglePanel();
    setTimeout(() => { const i = document.getElementById('gov-input'); if (i) i.focus(); }, 50);
  }
  if (e.key === 'Escape') {
    const shell = document.getElementById('shell');
    if (shell && shell.classList.contains('shell--panel-open')) togglePanel();
    closeDialog();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('gov-input');
  if (input) {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
    });
  }
});

/* ── Init ─────────────────────────────────────────────────────────────── */
(function init() {
  const saved = localStorage.getItem('t-theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
    const btn = document.getElementById('theme-btn');
    if (btn) btn.textContent = saved === 'dark' ? '☀️ Light' : '☽ Dark';
  }
  renderSpacingBars();
  loadWelcomeStats();
  loadWelcomeActivity();
  checkApiHealth();
  setInterval(checkApiHealth, 30000);
})();
