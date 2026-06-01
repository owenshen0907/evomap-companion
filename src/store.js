'use strict';

// Local state for EvoMap Companion.
//
// Unlike evolver-companion (which only READS a local engine workspace), this
// companion is a CLIENT of the remote EvoMap network. The durable state it owns
// lives here, under a single home directory:
//
//   <home>/config.json          network base url + preferences
//   <home>/credentials.json      node_id / node_secret / claim_url (chmod 600)
//   <home>/recall_index.jsonl    one line per asset fetched into the local cache
//   <home>/cache/<asset>.json    full fetched asset content ("recall" payloads)
//   <home>/call_log.jsonl        append-only log of EvoMap API interactions
//   <home>/publish_drafts.jsonl  local assets staged for upload to EvoMap
//
// Default home is ~/.evomap-companion; override with EVOMAP_COMPANION_HOME.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function homeDir() {
  return path.resolve(process.env.EVOMAP_COMPANION_HOME || path.join(os.homedir(), '.evomap-companion'));
}

function ensureHome() {
  const home = homeDir();
  fs.mkdirSync(path.join(home, 'cache'), { recursive: true });
  return home;
}

function filePath(name) {
  return path.join(homeDir(), name);
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

function writeJson(file, value, { mode } = {}) {
  ensureHome();
  fs.writeFileSync(file, JSON.stringify(value, null, 2), mode ? { mode } : undefined);
  if (mode) {
    try { fs.chmodSync(file, mode); } catch (error) { /* best effort on platforms without chmod */ }
  }
}

function readJsonl(file) {
  try {
    return fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try { return JSON.parse(line); } catch (error) { return null; }
      })
      .filter(Boolean);
  } catch (error) {
    return [];
  }
}

function appendJsonl(file, value) {
  ensureHome();
  fs.appendFileSync(file, `${JSON.stringify(value)}\n`);
}

// --- Config -------------------------------------------------------------

const DEFAULT_BASE_URL = process.env.EVOMAP_BASE_URL || 'https://evomap.ai';

function getConfig() {
  const stored = readJson(filePath('config.json'), {}) || {};
  return {
    baseUrl: (stored.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    autoRecall: Boolean(stored.autoRecall),
    updatedAt: stored.updatedAt || null,
  };
}

function setConfig(patch) {
  const next = { ...getConfig(), ...patch, updatedAt: new Date().toISOString() };
  writeJson(filePath('config.json'), next);
  return next;
}

// --- Credentials --------------------------------------------------------
//
// The node_secret is the single most sensitive value this companion holds. It
// is written 0600 and only ever used server-side to sign EvoMap requests; it is
// never returned to the browser (redact.js strips it from every HTTP payload).

function getCredentials() {
  return readJson(filePath('credentials.json'), null);
}

function hasSecret() {
  const creds = getCredentials();
  return Boolean(creds && creds.node_secret);
}

function saveCredentials(creds) {
  const existing = getCredentials() || {};
  const merged = { ...existing, ...creds, updatedAt: new Date().toISOString() };
  writeJson(filePath('credentials.json'), merged, { mode: 0o600 });
  return merged;
}

function clearCredentials() {
  try { fs.rmSync(filePath('credentials.json')); } catch (error) { /* already gone */ }
}

// A user-level EvoMap API key (ek_*). Distinct from node_secret: it authenticates
// USER-scoped endpoints (e.g. asset voting) that the node identity can't reach.
// Stored 0600 in its own file and never returned to the browser.
function getApiKey() {
  const j = readJson(filePath('apikey.json'), null);
  return (j && j.api_key) || null;
}

function hasApiKey() {
  return Boolean(getApiKey());
}

function setApiKey(key) {
  ensureHome();
  writeJson(filePath('apikey.json'), { api_key: key, savedAt: new Date().toISOString() }, { mode: 0o600 });
}

function clearApiKey() {
  try { fs.rmSync(filePath('apikey.json')); } catch (error) { /* already gone */ }
}

// A view of the binding state safe to surface in the UI: never includes the
// node_secret itself, only whether one is stored.
function bindingState() {
  const creds = getCredentials();
  if (!creds) {
    return { registered: false, claimed: false, credentialPresent: false, nodeId: null, claimUrl: null };
  }
  return {
    registered: Boolean(creds.node_id),
    claimed: Boolean(creds.claimed),
    // Named to avoid the redactor's secret-key filter: this is a safe boolean,
    // never the secret itself.
    credentialPresent: Boolean(creds.node_secret),
    nodeId: creds.node_id || null,
    claimUrl: creds.claim_url || null,
    registeredAt: creds.registeredAt || null,
    boundAt: creds.boundAt || null,
    lastHeartbeatAt: creds.lastHeartbeatAt || null,
    alias: creds.alias || null,
    online: creds.online ?? null,
    reputation: creds.reputation ?? null,
    onboarding: creds.onboarding || null,
  };
}

// --- Recall cache -------------------------------------------------------

function cacheFileFor(assetId) {
  const safe = String(assetId).replace(/[^A-Za-z0-9._-]/g, '_');
  return path.join(homeDir(), 'cache', `${safe}.json`);
}

function recallIndex() {
  return readJsonl(filePath('recall_index.jsonl'));
}

// Normalize EvoMap's asset field names (asset_type / short_title / nl_summary /
// comma-separated tags) into the compact shape the recall index and UI use.
function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.filter(Boolean);
  if (typeof tags === 'string') return tags.split(',').map((t) => t.trim()).filter(Boolean);
  return [];
}

// Build a compact recall-index entry from an EvoMap asset, carrying the official
// classification dimensions the UI filters on: asset_type, lifecycle status,
// domain, Gene category, chain lineage, and the GDI quality score.
function buildIndexEntry(asset) {
  const assetId = asset.asset_id || asset.id;
  const payload = asset.payload || {};
  return {
    asset_id: assetId,
    type: asset.asset_type || asset.type || payload.type || 'unknown',
    status: asset.status || payload.status || 'unknown',
    domain: asset.domain || payload.domain || '',
    category: payload.category || asset.category || '',
    chain_id: asset.chain_id || null,
    gdi_score: typeof asset.gdi_score === 'number' ? asset.gdi_score : null,
    title: asset.short_title || asset.title || payload.summary || asset.nl_summary || assetId,
    summary: asset.nl_summary || asset.summary || payload.summary || '',
    tags: normalizeTags(asset.tags || payload.tags),
    fetched_at: new Date().toISOString(),
  };
}

// Store a fetched asset and record it in the recall index. Re-fetching the same
// asset_id updates the cached body and bumps its index entry instead of
// duplicating it.
function saveRecalledAsset(asset) {
  const assetId = asset.asset_id || asset.id;
  if (!assetId) throw new Error('asset_id required to recall an asset');
  ensureHome();
  fs.writeFileSync(cacheFileFor(assetId), JSON.stringify(asset, null, 2));

  const entry = buildIndexEntry(asset);
  const existing = recallIndex().filter((row) => row.asset_id !== assetId);
  existing.push(entry);
  fs.writeFileSync(
    filePath('recall_index.jsonl'),
    existing.map((row) => JSON.stringify(row)).join('\n') + '\n',
  );
  return entry;
}

// Rebuild the recall index from the on-disk asset cache. Used to backfill new
// classification fields into entries written by an older version, without
// re-fetching from the network.
function rebuildRecallIndex() {
  ensureHome();
  const dir = path.join(homeDir(), 'cache');
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')); } catch (error) { return 0; }
  const entries = [];
  for (const f of files) {
    let asset;
    try { asset = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (error) { continue; }
    if (asset && (asset.asset_id || asset.id)) entries.push(buildIndexEntry(asset));
  }
  fs.writeFileSync(
    filePath('recall_index.jsonl'),
    entries.length ? entries.map((e) => JSON.stringify(e)).join('\n') + '\n' : '',
  );
  return entries.length;
}

function getRecalledAsset(assetId) {
  return readJson(cacheFileFor(assetId), null);
}

function removeRecalledAsset(assetId) {
  try { fs.rmSync(cacheFileFor(assetId)); } catch (error) { /* already gone */ }
  const remaining = recallIndex().filter((row) => row.asset_id !== assetId);
  fs.writeFileSync(
    filePath('recall_index.jsonl'),
    remaining.length ? remaining.map((row) => JSON.stringify(row)).join('\n') + '\n' : '',
  );
  return remaining.length;
}

// --- Call log -----------------------------------------------------------

function logCall(entry) {
  appendJsonl(filePath('call_log.jsonl'), { ts: new Date().toISOString(), ...entry });
}

function recentCalls(limit = 20) {
  return readJsonl(filePath('call_log.jsonl')).slice(-limit).reverse();
}

// --- Publish drafts -----------------------------------------------------

function publishDrafts() {
  return readJsonl(filePath('publish_drafts.jsonl'));
}

function addPublishDraft(draft) {
  const entry = { id: `draft_${Date.now()}`, status: 'draft', createdAt: new Date().toISOString(), ...draft };
  appendJsonl(filePath('publish_drafts.jsonl'), entry);
  return entry;
}

module.exports = {
  homeDir,
  ensureHome,
  filePath,
  getConfig,
  setConfig,
  getCredentials,
  hasSecret,
  saveCredentials,
  clearCredentials,
  getApiKey,
  hasApiKey,
  setApiKey,
  clearApiKey,
  bindingState,
  recallIndex,
  saveRecalledAsset,
  rebuildRecallIndex,
  getRecalledAsset,
  removeRecalledAsset,
  logCall,
  recentCalls,
  publishDrafts,
  addPublishDraft,
  DEFAULT_BASE_URL,
};
