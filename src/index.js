#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { URL } = require('node:url');

const { redactValue, redactText } = require('./redact');
const store = require('./store');
const evomap = require('./evomap');
const recall = require('./recall');
const translate = require('./translate');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DEFAULT_PORT = Number(process.env.EVOMAP_COMPANION_PORT) || Number(process.env.PORT) || 4174;
// Auto-heartbeat interval. The Hub marks a node offline after ~15 min of
// silence, so the default beats every 10 min. Override with EVOMAP_HEARTBEAT_MS;
// set it to 0 to disable the loop entirely.
const HEARTBEAT_MS = process.env.EVOMAP_HEARTBEAT_MS !== undefined
  ? Number(process.env.EVOMAP_HEARTBEAT_MS)
  : 10 * 60 * 1000;

function parseArgs(argv) {
  const args = { command: argv[2] || 'overview', rest: [] };
  for (let index = 3; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--port' && argv[index + 1]) {
      args.port = Number(argv[index + 1]);
      index += 1;
    } else if (item.startsWith('--port=')) {
      args.port = Number(item.slice('--port='.length));
    } else if (item === '--base' && argv[index + 1]) {
      args.base = argv[index + 1];
      index += 1;
    } else if (item.startsWith('--base=')) {
      args.base = item.slice('--base='.length);
    } else if (item === '--limit' && argv[index + 1]) {
      args.limit = Number(argv[index + 1]);
      index += 1;
    } else {
      args.rest.push(item);
    }
  }
  return args;
}

function baseUrl(override) {
  return (override || store.getConfig().baseUrl).replace(/\/+$/, '');
}

// --- Safety posture -----------------------------------------------------

function buildSafetyState() {
  const warnings = [];
  const autoFetch = ['1', 'true', 'yes', 'on'].includes(String(process.env.EVOMAP_AUTO_FETCH || '').toLowerCase());
  const autoPublish = ['1', 'true', 'yes', 'on'].includes(String(process.env.EVOMAP_AUTO_PUBLISH || '').toLowerCase());
  if (autoFetch) warnings.push('EVOMAP_AUTO_FETCH is enabled: assets may be fetched without per-asset confirmation.');
  if (autoPublish) warnings.push('EVOMAP_AUTO_PUBLISH is enabled: drafts may be uploaded without confirmation.');
  return { autoFetch, autoPublish, safeMode: warnings.length === 0, warnings };
}

// --- Companion state (dashboard overview) -------------------------------

// Aggregate the "value" EvoMap delivers: how much reusable knowledge is cached
// and how much of it has actually been reused (the token-saving payoff).
function buildValueStats() {
  const idx = store.recallIndex();
  let reuse = 0; let calls = 0; let gdiSum = 0; let gdiN = 0;
  let promoted = 0; let candidate = 0; let quarantined = 0;
  for (const r of idx) {
    reuse += r.reuse_count || 0;
    calls += r.call_count || 0;
    if (typeof r.gdi_score === 'number') { gdiSum += r.gdi_score; gdiN += 1; }
    if (r.status === 'promoted') promoted += 1;
    else if (r.status === 'candidate') candidate += 1;
    else if (r.status === 'quarantined') quarantined += 1;
  }
  return {
    assets: idx.length,
    promoted,
    candidate,
    quarantined,
    totalReuse: reuse,
    totalCalls: calls,
    avgGdi: gdiN ? Number((gdiSum / gdiN).toFixed(1)) : 0,
  };
}

function buildState(override) {
  const config = store.getConfig();
  const binding = store.bindingState();
  const index = store.recallIndex();
  const drafts = store.publishDrafts();
  const byType = index.reduce((memo, row) => {
    const key = row.type || 'unknown';
    memo[key] = (memo[key] || 0) + 1;
    return memo;
  }, {});

  const gaps = [];
  if (!binding.registered) gaps.push('node_not_registered');
  else if (!binding.claimed) gaps.push('node_not_bound');
  if (binding.claimed && index.length === 0) gaps.push('no_assets_recalled');
  const integration = recall.getIntegrationStatus();
  if (integration.platforms.every((p) => !p.integrated)) gaps.push('no_agent_integration');

  return {
    generatedAt: new Date().toISOString(),
    baseUrl: baseUrl(override),
    home: store.homeDir(),
    config,
    binding,
    safety: buildSafetyState(),
    counts: {
      recalled: index.length,
      drafts: drafts.length,
      byType,
    },
    openGaps: gaps,
    integration,
    // Named 'canVote' (not 'apiKeyPresent') so the redactor's *key* filter
    // doesn't strip this safe boolean. True iff a user-level API key is stored.
    canVote: store.hasApiKey(),
    value: buildValueStats(),
    recentCalls: store.recentCalls(8),
  };
}

// --- Node lifecycle -----------------------------------------------------

async function registerNode(override) {
  const base = baseUrl(override);
  const res = await evomap.hello(base);
  store.logCall({ action: 'hello', ok: res.ok, status: res.status, error: res.error });
  if (!res.ok || !res.json) {
    return { ok: false, action: 'register', error: res.error || 'register_failed', status: res.status };
  }
  // hello replies with a GEP-A2A envelope; the registration data is in payload.
  const payload = res.json.payload || res.json;
  if (payload.status && payload.status !== 'acknowledged') {
    return { ok: false, action: 'register', error: payload.reason || payload.status, hint: payload.hint || null };
  }
  const nodeId = payload.your_node_id || payload.node_id || null;
  const claimUrl = payload.claim_url || null;
  const claimCode = payload.claim_code || null;
  const nodeSecret = payload.node_secret || null;
  store.saveCredentials({
    node_id: nodeId,
    node_secret: nodeSecret,
    claim_url: claimUrl,
    claim_code: claimCode,
    claimed: Boolean(payload.claimed),
    registeredAt: new Date().toISOString(),
  });
  return {
    ok: true,
    action: 'register',
    // node_secret intentionally omitted from the response; it is stored 0600.
    nodeId,
    claimUrl,
    claimCode,
    hint: claimUrl
      ? 'Open claim_url in a browser to bind this node to your EvoMap account, then run a heartbeat.'
      : 'Node registered. Run a heartbeat to confirm binding.',
  };
}

async function heartbeatNode(override, { silent = false } = {}) {
  const base = baseUrl(override);
  const creds = store.getCredentials();
  if (!creds || !creds.node_secret) {
    return { ok: false, action: 'heartbeat', error: 'not_registered', hint: 'Register a node first.' };
  }
  const res = await evomap.heartbeat(base, { nodeId: creds.node_id, nodeSecret: creds.node_secret });
  // Silent ticks (the auto-heartbeat loop) skip the call log so recentCalls
  // stays a record of user-initiated actions, not a 10-minute heartbeat stream.
  if (!silent) store.logCall({ action: 'heartbeat', ok: res.ok, status: res.status, error: res.error });
  if (!res.ok || !res.json) {
    return { ok: false, action: 'heartbeat', error: res.error || 'heartbeat_failed', status: res.status };
  }
  const payload = res.json.payload || res.json;
  const claimed = Boolean(payload.claimed);
  // The heartbeat discovery payload carries recommendations / onboarding hints;
  // keep a trimmed snapshot for the UI without storing the whole blob.
  const onboarding = payload.onboarding || payload.recommendations || payload.starter_pack || null;
  const update = {
    claimed,
    boundAt: claimed ? (store.getCredentials()?.boundAt || new Date().toISOString()) : null,
    lastHeartbeatAt: new Date().toISOString(),
    onboarding,
  };
  // The heartbeat doesn't return our own alias; pull the node profile (best
  // effort) so the UI can show a display name + live online / reputation.
  try {
    const prof = await evomap.nodeProfile(base, creds.node_id, { nodeSecret: creds.node_secret });
    if (prof.ok && prof.json) {
      const pp = prof.json.payload || prof.json;
      update.alias = pp.alias || null;
      update.online = Boolean(pp.online);
      update.reputation = pp.reputation_score ?? pp.reputation ?? null;
    }
  } catch (error) { /* profile is best-effort; never fail the heartbeat over it */ }
  store.saveCredentials(update);
  return { ok: true, action: 'heartbeat', claimed, alias: update.alias || null, onboarding, binding: store.bindingState() };
}

// Re-bind this machine to its EXISTING node after the secret was reset on
// evomap.ai (account/agents). Sends a rotate_secret hello carrying the current
// node_id, so the hub issues a fresh secret for the SAME node (node_id is kept)
// which we store 0600 in place of the invalidated one. Never creates a new node.
async function rebindNode(override) {
  const base = baseUrl(override);
  const creds = store.getCredentials();
  if (!creds || !creds.node_id) {
    return { ok: false, action: 'rebind', error: 'not_registered', hint: 'No existing node to re-bind. Use Register instead.' };
  }
  const res = await evomap.hello(base, { rotateSecret: true, nodeId: creds.node_id });
  store.logCall({ action: 'rebind', ok: res.ok, status: res.status, error: res.error });
  if (!res.ok || !res.json) {
    return { ok: false, action: 'rebind', error: res.error || 'rebind_failed', status: res.status, hint: 'Reset the node secret on https://evomap.ai/zh/account/agents first, then retry.' };
  }
  const payload = res.json.payload || res.json;
  const newSecret = payload.node_secret || null;
  if (!newSecret) {
    return { ok: false, action: 'rebind', error: payload.reason || 'no_secret_returned', hint: 'Rotation returned no new secret. Reset the key on evomap.ai (account/agents), then retry.' };
  }
  store.saveCredentials({
    node_secret: newSecret,
    claim_url: payload.claim_url || creds.claim_url || null,
    claim_code: payload.claim_code || creds.claim_code || null,
    claimed: Boolean(payload.claimed),
    rotatedAt: new Date().toISOString(),
  });
  return {
    ok: true,
    action: 'rebind',
    nodeId: creds.node_id,
    claimed: Boolean(payload.claimed),
    claimUrl: payload.claim_url || null,
    hint: payload.claimed
      ? 'Re-bound with a fresh secret (same node_id).'
      : 'New secret issued. Open claim_url to re-bind, then run a heartbeat.',
  };
}

// --- Asset retrieval ----------------------------------------------------

async function searchAssets(query, { override, semantic = false, limit = 5 } = {}) {
  const base = baseUrl(override);
  const res = semantic
    ? await evomap.semanticSearch(base, query, { limit })
    : await evomap.search(base, query, { limit });
  store.logCall({ action: semantic ? 'semantic-search' : 'search', query, ok: res.ok, status: res.status, count: res.json?.count ?? res.json?.assets?.length });
  return {
    ok: res.ok,
    mode: semantic ? 'semantic' : 'keyword',
    query,
    status: res.status,
    error: res.error,
    result: res.json || null,
  };
}

// All read-only asset-discovery endpoints, exposed through one proxy so the
// search page can call each and surface its live availability + raw response.
const DISCOVERY_MODES = {
  semantic:    { path: 'assets/semantic-search', q: true },
  keyword:     { path: 'assets/search',          q: true },
  web:         { path: 'web-search',             q: true, auth: true, count: true },
  ranked:      { path: 'assets/ranked' },
  graph:       { path: 'assets/graph-search',     q: true },
  explore:     { path: 'assets/explore',          q: true },
  categories:  { path: 'assets/categories' },
  recommended: { path: 'assets/recommended',      auth: true },
  daily:       { path: 'assets/daily-discovery' },
  trending:    { path: 'trending' },
  lessons:     { path: 'lessons' },
  signals:     { path: 'signals/popular' },
  list:        { path: 'assets',                  status: 'promoted' },
  policy:      { path: 'policy' },
};

async function discoverAssets({ mode, query = '', limit = 12, override } = {}) {
  const spec = DISCOVERY_MODES[mode];
  if (!spec) return { ok: false, mode, error: 'unknown_mode' };
  const base = baseUrl(override);
  const params = new URLSearchParams();
  if (spec.q && query) params.set('q', query);
  if (spec.status) params.set('status', spec.status);
  // web-search uses ?count (capped at 50) instead of ?limit.
  if (spec.count) params.set('count', String(Math.min(limit, 50)));
  else if (limit) params.set('limit', String(limit));
  const qs = params.toString() ? `?${params.toString()}` : '';
  let headers = {};
  if (spec.auth) {
    const creds = store.getCredentials();
    if (!creds || !creds.node_secret) {
      return { ok: false, mode, endpoint: `GET /a2a/${spec.path}`, error: 'auth_required', hint: 'This endpoint needs a bound node.' };
    }
    headers = { authorization: `Bearer ${creds.node_secret}` };
  }
  const res = await evomap.request('GET', `${base}/a2a/${spec.path}${qs}`, { headers });
  store.logCall({ action: `discover:${mode}`, ok: res.ok, status: res.status, error: res.error });
  const p = (res.json && (res.json.payload || res.json)) || {};
  const assets = p.assets || p.results || p.items || p.matches || p.categories || p.signals || p.lessons || (Array.isArray(p) ? p : []);
  return {
    ok: res.ok,
    mode,
    endpoint: `GET /a2a/${spec.path}`,
    auth: Boolean(spec.auth),
    status: res.status,
    error: res.error,
    count: Array.isArray(assets) ? assets.length : 0,
    assets: Array.isArray(assets) ? assets.slice(0, 30) : [],
    raw: p,
  };
}

// Related assets + lineage (chain / timeline) for one asset. The backend
// asset-core doc exposes these read endpoints; we aggregate them so the detail
// modal can show an asset's neighbours and its evolution history.
async function assetInsights({ id, chain, override } = {}) {
  if (!id) return { ok: false, error: 'id_required' };
  const base = baseUrl(override);
  const creds = store.getCredentials();
  if (!creds || !creds.node_secret) return { ok: false, error: 'not_bound', hint: 'Bind a node to view related assets / lineage.' };
  const headers = { authorization: `Bearer ${creds.node_secret}` };
  const eid = encodeURIComponent(id);
  const out = { ok: true, id, related: [], timeline: [], chain: [] };
  const calls = [
    evomap.request('GET', `${base}/a2a/assets/${eid}/related`, { headers }).then((r) => { if (r.ok) { const p = r.json?.payload || r.json || {}; out.related = (p.assets || []).slice(0, 8); } }),
    evomap.request('GET', `${base}/a2a/assets/${eid}/timeline`, { headers }).then((r) => { if (r.ok) { const p = r.json?.payload || r.json || {}; out.timeline = (p.events || []).slice(0, 12); } }),
  ];
  if (chain) calls.push(evomap.request('GET', `${base}/a2a/assets/chain/${encodeURIComponent(chain)}`, { headers }).then((r) => { if (r.ok) { const p = r.json?.payload || r.json || {}; out.chain = (p.assets || []).slice(0, 12); } }));
  await Promise.all(calls);
  return out;
}

// Vote up/down on an asset. Uses the user-level API key (ek_*), not node_secret:
// /a2a/assets/:id/vote runs requireAuth. Re-voting the same direction toggles off.
async function voteAsset(assetId, vote, { override } = {}) {
  if (!assetId) return { ok: false, action: 'vote', error: 'asset_id_required' };
  if (!['up', 'down'].includes(vote)) return { ok: false, action: 'vote', error: 'vote_must_be_up_or_down' };
  const key = store.getApiKey();
  if (!key) return { ok: false, action: 'vote', error: 'no_api_key', hint: 'Set an EvoMap API key (ek_…) first — voting is a user-level action node_secret cannot perform.' };
  const res = await evomap.voteAsset(baseUrl(override), assetId, vote, { apiKey: key });
  store.logCall({ action: 'vote', assetId, ok: res.ok, status: res.status, error: res.error });
  if (!res.ok) return { ok: false, action: 'vote', status: res.status, error: (res.json && res.json.error) || res.error };
  const payload = (res.json && (res.json.payload || res.json)) || {};
  return { ok: true, action: 'vote', vote, result: payload };
}

async function fetchAndRecall(assetIds, { override } = {}) {
  const base = baseUrl(override);
  const creds = store.getCredentials();
  if (!creds || !creds.node_secret) {
    return { ok: false, action: 'fetch', error: 'not_bound', hint: 'Register and bind a node before fetching full assets.' };
  }
  const res = await evomap.fetchAssets(base, assetIds, { nodeId: creds.node_id, nodeSecret: creds.node_secret });
  store.logCall({ action: 'fetch', assetIds, ok: res.ok, status: res.status, error: res.error });
  if (!res.ok || !res.json) {
    return { ok: false, action: 'fetch', error: res.error || 'fetch_failed', status: res.status, body: res.json };
  }
  // The fetch response is a GEP-A2A envelope whose payload carries the assets.
  const payload = res.json.payload || res.json;
  const assets = payload.assets || payload.results || (Array.isArray(payload) ? payload : []);
  const recalled = [];
  for (const asset of assets) {
    if (!asset) continue;
    recalled.push(store.saveRecalledAsset(asset));
  }
  // Keep every integrated agent's recall library fresh after a fetch.
  refreshIntegrations();
  broadcast('recall', { count: recalled.length });
  return { ok: true, action: 'fetch', recalled, count: recalled.length };
}

// Sync the account's previously-fetched ("purchased") assets into the local
// recall cache. Unlike fetch (which needs explicit asset_ids and may spend
// credits), this replays what the account already owns — across every node it
// owns — and pages through the full list. Each asset already carries its full
// payload, so no extra per-asset fetch is needed.
async function syncPurchased({ override, type = null, since = null, maxPages = 100 } = {}) {
  const base = baseUrl(override);
  const creds = store.getCredentials();
  if (!creds || !creds.node_secret) {
    return { ok: false, action: 'sync', error: 'not_bound', hint: 'Register and bind a node before syncing owned assets.' };
  }
  let cursor = null;
  let pages = 0;
  let total = null;
  const recalled = [];
  do {
    const res = await evomap.assetsPurchased(base, { nodeId: creds.node_id, nodeSecret: creds.node_secret, limit: 100, cursor, type, since });
    store.logCall({ action: 'sync-purchased', ok: res.ok, status: res.status, error: res.error });
    if (!res.ok || !res.json) {
      return { ok: false, action: 'sync', error: res.error || 'sync_failed', status: res.status, recalled: recalled.length };
    }
    const payload = res.json.payload || res.json;
    const assets = payload.assets || payload.results || [];
    if (typeof payload.total === 'number') total = payload.total;
    for (const asset of assets) {
      if (!asset || !(asset.asset_id || asset.id)) continue;
      recalled.push(store.saveRecalledAsset(asset));
    }
    cursor = payload.has_more ? (payload.next_cursor || null) : null;
    pages += 1;
  } while (cursor && pages < maxPages);
  // Keep every integrated agent's recall library fresh after a sync.
  refreshIntegrations(override);
  broadcast('recall', { count: recalled.length, synced: true });
  return { ok: true, action: 'sync', recalled: recalled.length, pages, total, capped: Boolean(cursor) };
}

async function getPolicy(override) {
  const res = await evomap.policy(baseUrl(override));
  store.logCall({ action: 'policy', ok: res.ok, status: res.status });
  return { ok: res.ok, status: res.status, error: res.error, result: res.json || null };
}

// --- Recall library -----------------------------------------------------

// List the local recall library. When `lang` is a non-English UI language and a
// cached translation exists, the title/summary are shown in that language (the
// original is kept under *_original). Code is never translated — it is not part
// of the index. Missing translations fall back to the authored text.
function listRecall(lang) {
  const assets = store.recallIndex().reverse();
  if (lang && lang !== 'en') {
    for (const a of assets) {
      const tt = translate.getCached(a.title, lang);
      const ts = translate.getCached(a.summary, lang);
      if (tt) { a.title_original = a.title; a.title = tt; a.translated = true; }
      if (ts) { a.summary_original = a.summary; a.summary = ts; a.translated = true; }
    }
  }
  return { generatedAt: new Date().toISOString(), count: assets.length, lang: lang || 'en', assets };
}

// Translate every recall-library title/summary into `lang` and cache the result.
// Idempotent: already-cached strings are skipped. English is a no-op (descriptions
// are authored mostly in English).
async function translateRecall(lang) {
  if (!lang || lang === 'en') {
    return { ok: true, action: 'translate', lang: lang || 'en', skipped: true, hint: 'Descriptions are stored as authored (mostly English); nothing to translate for en.' };
  }
  const assets = store.recallIndex();
  const texts = [];
  for (const a of assets) { if (a.title) texts.push(a.title); if (a.summary) texts.push(a.summary); }
  const stats = await translate.translateMany(texts, lang);
  store.logCall({ action: 'translate-recall', lang, ok: true, count: stats.translated });
  broadcast('recall', { translated: true, lang });
  return { ok: true, action: 'translate', lang, ...stats };
}

function companionUrl(port) {
  return `http://localhost:${port || DEFAULT_PORT}`;
}

function recallPack(port, override) {
  return recall.buildRecallPack({
    baseUrl: baseUrl(override),
    companionUrl: companionUrl(port),
    binding: store.bindingState(),
    assets: store.recallIndex(),
    getAsset: (id) => store.getRecalledAsset(id),
  });
}

let ACTIVE_PORT = DEFAULT_PORT;
function refreshIntegrations(override) {
  return recall.refreshAllIntegrations({
    baseUrl: baseUrl(override),
    companionUrl: companionUrl(ACTIVE_PORT),
    binding: store.bindingState(),
    assets: store.recallIndex(),
    getAsset: (id) => store.getRecalledAsset(id),
  });
}

// --- Publish (upload) guidance ------------------------------------------

function publishGuide() {
  const binding = store.bindingState();
  return {
    generatedAt: new Date().toISOString(),
    canPublish: binding.claimed && binding.credentialPresent,
    drafts: store.publishDrafts().reverse(),
    steps: [
      'Stage a draft: POST /api/publish/draft with { title, type, summary, content, tags }.',
      'Review the generated GEP-A2A publish envelope and confirm with the user.',
      'Publish the confirmed draft: POST /api/publish with { draftId } (requires a bound node).',
      'A published asset gets an asset_id others can search and fetch.',
    ],
    guidanceForAgent:
      'When you produce a durable, reusable pattern (a Gene-like strategy or a Capsule-like outcome), '
      + 'offer to publish it to EvoMap. Build a draft, show the user exactly what would be uploaded, and '
      + 'only publish after explicit confirmation. Never upload secrets, private paths, or raw transcripts.',
  };
}

function stageDraft(body) {
  const { title, type = 'Capsule', summary = '', content = '', tags = [] } = body || {};
  if (!title || !content) {
    return { ok: false, error: 'title_and_content_required' };
  }
  const draft = store.addPublishDraft({ title, type, summary, content, tags });
  const preview = evomap.envelope('publish', { asset: { title, type, summary, content, tags } }, { senderId: store.bindingState().nodeId });
  broadcast('draft', { id: draft.id });
  return { ok: true, draft, envelopePreview: preview };
}

async function publishDraft(draftId, { override } = {}) {
  const creds = store.getCredentials();
  if (!creds || !creds.node_secret || !creds.claimed) {
    return { ok: false, action: 'publish', error: 'not_bound', hint: 'Bind a node before publishing.' };
  }
  const draft = store.publishDrafts().find((d) => d.id === draftId);
  if (!draft) return { ok: false, action: 'publish', error: 'draft_not_found', draftId };
  const res = await evomap.publish(baseUrl(override), {
    title: draft.title, type: draft.type, summary: draft.summary, content: draft.content, tags: draft.tags,
  }, { nodeId: creds.node_id, nodeSecret: creds.node_secret });
  store.logCall({ action: 'publish', draftId, ok: res.ok, status: res.status, error: res.error });
  if (!res.ok) return { ok: false, action: 'publish', error: res.error || 'publish_failed', status: res.status };
  return { ok: true, action: 'publish', draftId, result: res.json || null };
}

// --- Companion self-update (git + pm2), mirrors evolver-companion -------

function runCommand(command, cmdArgs, options = {}) {
  return new Promise((resolve) => {
    execFile(command, cmdArgs, { timeout: 120000, ...options }, (error, stdout, stderr) => {
      resolve({ ok: !error, code: error?.code || 0, stdout: (stdout || '').trim(), stderr: (stderr || '').trim(), message: error?.message || '' });
    });
  });
}

async function git(args) {
  return runCommand('git', ['-C', ROOT, ...args]);
}

function isUnderPm2() {
  return Boolean(process.env.pm_id || process.env.pm2_id || process.env.PM2_HOME);
}

async function getSelfStatus({ fetchRemote = false } = {}) {
  const pkg = store.getConfig ? require('../package.json') : {};
  if (fetchRemote) await git(['fetch', '--prune', 'origin']);
  const [branch, head, remote, dirty, counts, lastCommit] = await Promise.all([
    git(['branch', '--show-current']),
    git(['rev-parse', '--short', 'HEAD']),
    git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']),
    git(['status', '--porcelain', '--untracked-files=no']),
    git(['rev-list', '--left-right', '--count', 'HEAD...@{u}']),
    git(['log', '-1', '--pretty=format:%H%n%h%n%cI%n%s']),
  ]);
  const [aheadText = '0', behindText = '0'] = counts.ok ? counts.stdout.split(/\s+/) : ['0', '0'];
  const behind = Number(behindText) || 0;
  const hasLocalChanges = Boolean(dirty.stdout);
  const parts = lastCommit.stdout.split('\n');
  return {
    workspace: ROOT,
    exists: true,
    name: pkg.name || 'evomap-companion',
    version: pkg.version || null,
    branch: branch.stdout || null,
    upstream: remote.ok ? remote.stdout : null,
    head: head.stdout || null,
    ahead: Number(aheadText) || 0,
    behind,
    updateAvailable: behind > 0,
    hasLocalChanges,
    status: hasLocalChanges ? 'dirty' : behind > 0 ? 'update_available' : 'current',
    restartSupported: isUnderPm2(),
    lastCommit: { hash: parts[0] || null, shortHash: parts[1] || head.stdout || null, date: parts[2] || null, subject: parts.slice(3).join('\n') || null },
    generatedAt: new Date().toISOString(),
  };
}

async function selfUpdateRestart() {
  const before = await getSelfStatus({ fetchRemote: true });
  if (before.hasLocalChanges) return { ok: false, action: 'self-update-restart', reason: 'local_changes_present', before };
  if (!before.updateAvailable) return { ok: true, action: 'self-update-restart', changed: false, reason: 'already_current', before, willRestart: false };
  const pull = await git(['pull', '--ff-only']);
  const after = await getSelfStatus();
  const underPm2 = isUnderPm2();
  const willRestart = underPm2 && pull.ok;
  return {
    ok: pull.ok,
    action: 'self-update-restart',
    changed: pull.ok,
    underPm2,
    willRestart,
    restartHint: !underPm2 ? 'Not running under pm2; restart manually to apply.' : willRestart ? 'Update applied. Exiting so pm2 relaunches on the new version.' : 'No restart performed.',
    before,
    after,
    output: pull,
  };
}

// --- Realtime (SSE) -----------------------------------------------------

const sseClients = new Set();

function broadcast(eventName, data) {
  const frame = `event: ${eventName}\ndata: ${JSON.stringify(data || {})}\n\n`;
  for (const client of sseClients) {
    try { client.write(frame); } catch (error) { sseClients.delete(client); }
  }
}

function handleSse(request, response) {
  response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store, no-transform', connection: 'keep-alive' });
  response.write('retry: 3000\n\n');
  response.write(`event: connected\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
  sseClients.add(response);
  const heartbeat = setInterval(() => {
    try { response.write(`: keepalive ${Date.now()}\n\n`); } catch (error) { /* dead socket cleaned on close */ }
  }, 15000);
  request.on('close', () => { clearInterval(heartbeat); sseClients.delete(response); });
}

// Auto-heartbeat: keep a bound node online without manual clicks. Beats every
// HEARTBEAT_MS (default 10 min, under the Hub's ~15-min offline threshold).
// Ticks are silent (no recentCalls spam), only fire when a secret is present,
// and are non-fatal — a failed beat is simply retried on the next tick.
let heartbeatTimer = null;
async function autoHeartbeatTick() {
  const creds = store.getCredentials();
  if (!creds || !creds.node_secret) return;
  const out = await heartbeatNode(undefined, { silent: true });
  if (out.ok) {
    console.log(`[companion] auto-heartbeat ok (claimed=${out.claimed})`);
    broadcast('node', { auto: true, claimed: out.claimed });
  } else {
    console.warn(`[companion] auto-heartbeat failed: ${out.error || 'unknown'} (will retry next tick)`);
  }
}
function startHeartbeatLoop() {
  if (heartbeatTimer || !(HEARTBEAT_MS > 0)) {
    if (!(HEARTBEAT_MS > 0)) console.log('[companion] auto-heartbeat disabled (EVOMAP_HEARTBEAT_MS=0)');
    return;
  }
  // Beat shortly after boot so a bound node goes online immediately, then loop.
  setTimeout(() => { autoHeartbeatTick().catch(() => {}); }, 3000);
  heartbeatTimer = setInterval(() => { autoHeartbeatTick().catch(() => {}); }, HEARTBEAT_MS);
  if (heartbeatTimer.unref) heartbeatTimer.unref();
  console.log(`[companion] auto-heartbeat every ${Math.round(HEARTBEAT_MS / 60000)} min (when bound)`);
}

function startHomeWatcher() {
  const home = store.ensureHome();
  let timer = null;
  try {
    const watcher = fs.watch(home, { persistent: false, recursive: true }, (eventType, filename) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => broadcast('change', { ts: Date.now(), file: filename || null }), 300);
    });
    watcher.on('error', () => { /* keep server alive if the dir is removed */ });
    console.log(`[companion] watching ${home} for local state changes`);
  } catch (error) {
    console.warn(`[companion] not watching ${home}: ${error.message}`);
  }
}

// --- HTTP plumbing ------------------------------------------------------

function sendJson(response, payload, statusCode = 200) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, max-age=0' });
  response.end(JSON.stringify(redactValue(payload), null, 2));
}

function methodNotAllowed(response) {
  response.writeHead(405, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
}

function readBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      try { resolve(text ? JSON.parse(text) : {}); } catch (error) { resolve({}); }
    });
    request.on('error', () => resolve({}));
  });
}

function sendFile(response, filePath) {
  const ext = path.extname(filePath);
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
  fs.readFile(filePath, (error, content) => {
    if (error) { response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); response.end('Not found'); return; }
    response.writeHead(200, { 'content-type': types[ext] || 'application/octet-stream', 'cache-control': 'no-store, max-age=0' });
    response.end(content);
  });
}

const ROUTES = [
  // --- read-only state ---
  ['GET', '/api/state', async (req, res, url) => sendJson(res, buildState(url.searchParams.get('base')))],
  ['GET', '/api/node/status', async (req, res) => sendJson(res, store.bindingState())],
  ['GET', '/api/recall', async (req, res, url) => sendJson(res, listRecall(url.searchParams.get('lang')))],
  ['GET', '/api/publish/guide', async (req, res) => sendJson(res, publishGuide())],
  ['GET', '/api/integrate/status', async (req, res) => sendJson(res, recall.getIntegrationStatus())],
  ['GET', '/api/self/status', async (req, res) => sendJson(res, await getSelfStatus())],
  ['GET', '/api/self/check', async (req, res) => sendJson(res, await getSelfStatus({ fetchRemote: true }))],
  ['GET', '/api/policy', async (req, res, url) => sendJson(res, await getPolicy(url.searchParams.get('base')))],
  ['GET', '/api/assets/search', async (req, res, url) => sendJson(res, await searchAssets(url.searchParams.get('q') || '', { override: url.searchParams.get('base'), limit: Number(url.searchParams.get('limit')) || 5 }))],
  ['GET', '/api/assets/semantic-search', async (req, res, url) => sendJson(res, await searchAssets(url.searchParams.get('q') || '', { override: url.searchParams.get('base'), semantic: true, limit: Number(url.searchParams.get('limit')) || 5 }))],
  ['GET', '/api/assets/discover', async (req, res, url) => sendJson(res, await discoverAssets({ mode: url.searchParams.get('mode'), query: url.searchParams.get('q') || '', limit: Number(url.searchParams.get('limit')) || 12, override: url.searchParams.get('base') }))],
  ['GET', '/api/assets/insights', async (req, res, url) => sendJson(res, await assetInsights({ id: url.searchParams.get('id'), chain: url.searchParams.get('chain'), override: url.searchParams.get('base') }))],
  ['POST', '/api/assets/vote', async (req, res, url) => { const body = await readBody(req); sendJson(res, await voteAsset(body.asset_id || body.assetId, body.vote, { override: url.searchParams.get('base') })); }],
  ['POST', '/api/apikey', async (req, res) => { const body = await readBody(req); const key = String(body.api_key || body.apiKey || '').trim(); if (!key) { sendJson(res, { ok: false, error: 'api_key_required' }); return; } store.setApiKey(key); broadcast('config', {}); sendJson(res, { ok: true, apiKeyPresent: true }); }],
  ['POST', '/api/apikey/forget', async (req, res) => { store.clearApiKey(); broadcast('config', {}); sendJson(res, { ok: true, apiKeyPresent: false }); }],
  ['GET', '/api/recall/pack', async (req, res, url) => {
    const pack = recallPack(ACTIVE_PORT, url.searchParams.get('base'));
    res.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'no-store' });
    res.end(redactText(pack.markdown));
  }],

  // --- mutations (POST) ---
  ['POST', '/api/config', async (req, res) => { const body = await readBody(req); sendJson(res, store.setConfig(body)); broadcast('config', {}); }],
  ['POST', '/api/node/register', async (req, res, url) => { const out = await registerNode(url.searchParams.get('base')); broadcast('node', {}); sendJson(res, out); }],
  ['POST', '/api/node/heartbeat', async (req, res, url) => { const out = await heartbeatNode(url.searchParams.get('base')); broadcast('node', {}); sendJson(res, out); }],
  ['POST', '/api/node/rebind', async (req, res, url) => { const out = await rebindNode(url.searchParams.get('base')); broadcast('node', {}); sendJson(res, out); }],
  ['POST', '/api/node/forget', async (req, res) => { store.clearCredentials(); broadcast('node', {}); sendJson(res, { ok: true, action: 'forget' }); }],
  ['POST', '/api/assets/fetch', async (req, res, url) => { const body = await readBody(req); const ids = body.asset_ids || body.assetIds || []; sendJson(res, await fetchAndRecall(ids, { override: url.searchParams.get('base') })); }],
  ['POST', '/api/recall/sync', async (req, res, url) => { const body = await readBody(req); sendJson(res, await syncPurchased({ override: url.searchParams.get('base'), type: body.type || null, since: body.since || null })); }],
  ['POST', '/api/recall/translate', async (req, res) => { const body = await readBody(req); sendJson(res, await translateRecall(body.lang)); }],
  ['POST', '/api/recall/remove', async (req, res) => { const body = await readBody(req); const remaining = store.removeRecalledAsset(body.asset_id || body.assetId); refreshIntegrations(); broadcast('recall', {}); sendJson(res, { ok: true, remaining }); }],
  ['POST', '/api/publish/draft', async (req, res) => { const body = await readBody(req); sendJson(res, stageDraft(body)); }],
  ['POST', '/api/publish', async (req, res, url) => { const body = await readBody(req); sendJson(res, await publishDraft(body.draftId || body.id, { override: url.searchParams.get('base') })); }],
  ['POST', '/api/integrate/setup', async (req, res, url) => {
    const platform = url.searchParams.get('platform');
    const out = recall.writeIntegration(platform, {
      baseUrl: baseUrl(url.searchParams.get('base')), companionUrl: companionUrl(ACTIVE_PORT),
      binding: store.bindingState(), assets: store.recallIndex(), getAsset: (id) => store.getRecalledAsset(id),
    });
    broadcast('integrate', {}); sendJson(res, out);
  }],
  ['POST', '/api/integrate/uninstall', async (req, res, url) => { const out = recall.removeIntegration(url.searchParams.get('platform')); broadcast('integrate', {}); sendJson(res, out); }],
  ['POST', '/api/self/update-restart', async (req, res) => {
    const result = await selfUpdateRestart();
    sendJson(res, result);
    if (result.willRestart) setTimeout(() => { console.log('[companion] self-update applied; exiting for pm2'); process.exit(0); }, 800);
  }],
];

function startServer({ port = DEFAULT_PORT } = {}) {
  ACTIVE_PORT = port;
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname === '/api/stream') { handleSse(request, response); return; }

    const route = ROUTES.find((r) => r[1] === url.pathname);
    if (route) {
      const [method, , handler] = route;
      if (request.method !== method) { methodNotAllowed(response); return; }
      try { await handler(request, response, url); } catch (error) { sendJson(response, { ok: false, error: `handler_error: ${error.message}` }, 500); }
      return;
    }

    const safePath = url.pathname === '/' ? '/index.html' : url.pathname;
    const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));
    if (!filePath.startsWith(PUBLIC_DIR)) { response.writeHead(403); response.end('Forbidden'); return; }
    sendFile(response, filePath);
  });

  server.listen(port, () => {
    console.log(`EvoMap Companion UI: http://localhost:${port}`);
    console.log(`EvoMap network: ${baseUrl()}`);
    console.log(`Local state: ${store.homeDir()}`);
    startHomeWatcher();
    startHeartbeatLoop();
  });
}

// --- CLI ----------------------------------------------------------------

function renderStatusText() {
  const state = buildState();
  const b = state.binding;
  return [
    'EvoMap Companion',
    '',
    `EvoMap network: ${state.baseUrl}`,
    `Local state:    ${state.home}`,
    '',
    'Node binding:',
    `- registered: ${b.registered}`,
    `- bound (claimed): ${b.claimed}`,
    `- node_id: ${b.nodeId || '(none)'}`,
    b.claimUrl && !b.claimed ? `- claim_url: ${b.claimUrl}` : '',
    '',
    'Local assets:',
    `- recalled: ${state.counts.recalled}`,
    `- publish drafts: ${state.counts.drafts}`,
    '',
    `Open gaps: ${state.openGaps.join(', ') || '(none)'}`,
    state.safety.safeMode ? 'Safety: safe (all actions require confirmation)' : `Safety warnings: ${state.safety.warnings.join('; ')}`,
  ].filter((line) => line !== '').join('\n');
}

async function main() {
  const args = parseArgs(process.argv);
  store.ensureHome();
  if (args.base) store.setConfig({ baseUrl: args.base });

  switch (args.command) {
    case 'status':
      console.log(renderStatusText());
      return;
    case 'register': {
      const out = await registerNode(args.base);
      console.log(JSON.stringify(out, null, 2));
      if (out.claimUrl) console.log(`\nOpen this to bind your node:\n  ${out.claimUrl}`);
      return;
    }
    case 'heartbeat':
      console.log(JSON.stringify(await heartbeatNode(args.base), null, 2));
      return;
    case 'rebind':
      console.log(JSON.stringify(await rebindNode(args.base), null, 2));
      return;
    case 'search':
      console.log(JSON.stringify(await searchAssets(args.rest.join(' '), { override: args.base, limit: args.limit }), null, 2));
      return;
    case 'semantic':
      console.log(JSON.stringify(await searchAssets(args.rest.join(' '), { override: args.base, semantic: true, limit: args.limit }), null, 2));
      return;
    case 'policy':
      console.log(JSON.stringify(await getPolicy(args.base), null, 2));
      return;
    case 'fetch':
      console.log(JSON.stringify(await fetchAndRecall(args.rest, { override: args.base }), null, 2));
      return;
    case 'recall':
      console.log(JSON.stringify(listRecall(), null, 2));
      return;
    case 'sync':
    case 'sync-purchased':
      console.log(JSON.stringify(await syncPurchased({ override: args.base }), null, 2));
      return;
    case 'reindex':
      console.log(JSON.stringify({ ok: true, action: 'reindex', count: store.rebuildRecallIndex() }, null, 2));
      return;
    case 'ui':
    case 'serve':
      startServer({ port: args.port || DEFAULT_PORT });
      return;
    default:
      console.log([
        'EvoMap Companion',
        '',
        'Purpose: bind a local node to EvoMap, retrieve assets, let a local agent recall them, and guide uploads.',
        '',
        'Commands:',
        '  status                 show binding + local asset state',
        '  register               register a node (returns claim_url to bind)',
        '  heartbeat              verify the binding + read onboarding',
        '  rebind                 re-bind the existing node after resetting its secret on evomap.ai',
        '  search <query>         keyword asset search (summaries)',
        '  semantic <query>       semantic asset search (summaries)',
        '  policy                 list free official starter assets',
        '  fetch <asset_id...>    fetch full assets into the local recall cache',
        '  sync                   sync all account-owned (purchased) assets into the local recall cache',
        '  reindex                rebuild the recall index from the local cache (backfill classification fields)',
        '  recall                 list locally recalled assets',
        '  ui [--port N]          launch the local dashboard',
        '',
        `Default network: ${store.getConfig().baseUrl}`,
        `Default port:    ${DEFAULT_PORT}`,
      ].join('\n'));
  }
}

module.exports = {
  buildState,
  buildSafetyState,
  registerNode,
  heartbeatNode,
  rebindNode,
  searchAssets,
  fetchAndRecall,
  syncPurchased,
  publishGuide,
  stageDraft,
  recallPack,
  getSelfStatus,
  isUnderPm2,
  baseUrl,
  DEFAULT_PORT,
};

if (require.main === module) {
  main();
}
