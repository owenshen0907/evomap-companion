'use strict';

// EvoMap network client (GEP-A2A protocol), zero runtime dependencies.
//
// EvoMap exposes an Agent-to-Agent (A2A) HTTP surface. This module is the only
// place that talks to the network; everything else in the companion works on
// the local store. The shapes here follow the verified protocol described in
// docs/tutorials/evomap-onboarding-recall.md:
//
//   GET  /skill.md                       public protocol reference (text)
//   GET  /onboarding.md                  public onboarding guide (text)
//   POST /a2a/hello                      register a node -> { claim_url, your_node_id, node_secret }
//   POST /a2a/heartbeat                  verify binding -> { claimed, onboarding }   (Bearer node_secret)
//   GET  /a2a/assets/search?q=&limit=    keyword summaries -> { assets, search_status, next_action_suggested }
//   GET  /a2a/assets/semantic-search     semantic summaries
//   GET  /a2a/policy                     free starter asset ids
//   POST /a2a/fetch                      full asset content (Bearer node_secret), payload.asset_ids
//   POST /a2a/publish                    upload an asset (Bearer node_secret), payload.asset
//
// Every call resolves (never rejects) to { ok, status, json, text, error } so a
// flaky network can't take the dashboard down.

const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');

const PROTOCOL = 'gep-a2a';
const PROTOCOL_VERSION = '1.0.0';
const DEFAULT_TIMEOUT = 15000;

function newMessageId(kind = 'msg') {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${kind}_${Date.now()}_${rand}`;
}

// Build a GEP-A2A envelope. sender_id is the bound node_id (or 'unbound' before
// registration). payload is the message-type-specific body.
function envelope(messageType, payload, { senderId } = {}) {
  return {
    protocol: PROTOCOL,
    protocol_version: PROTOCOL_VERSION,
    message_type: messageType,
    message_id: newMessageId(messageType),
    sender_id: senderId || 'unbound',
    timestamp: new Date().toISOString(),
    payload: payload || {},
  };
}

function request(method, urlString, { headers = {}, body = null, timeout = DEFAULT_TIMEOUT } = {}) {
  return new Promise((resolve) => {
    let url;
    try {
      url = new URL(urlString);
    } catch (error) {
      resolve({ ok: false, status: 0, json: null, text: '', error: `bad_url: ${error.message}` });
      return;
    }

    const transport = url.protocol === 'http:' ? http : https;
    const payload = body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body));
    const options = {
      method,
      headers: {
        accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
        'user-agent': 'evomap-companion/0.1',
        ...headers,
      },
      timeout,
    };
    if (payload != null) {
      options.headers['content-type'] = options.headers['content-type'] || 'application/json';
      options.headers['content-length'] = Buffer.byteLength(payload);
    }

    const req = transport.request(url, options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch (error) { /* not JSON, keep text */ }
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          json,
          text,
          error: res.statusCode >= 400 ? (json?.error || `http_${res.statusCode}`) : null,
        });
      });
    });

    req.on('error', (error) => {
      resolve({ ok: false, status: 0, json: null, text: '', error: `network_error: ${error.message}` });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, status: 0, json: null, text: '', error: 'timeout' });
    });

    if (payload != null) req.write(payload);
    req.end();
  });
}

function bearer(secret) {
  return secret ? { authorization: `Bearer ${secret}` } : {};
}

// --- Public protocol docs ----------------------------------------------

async function fetchSkillDoc(baseUrl) {
  const res = await request('GET', `${baseUrl}/skill.md`);
  return { ok: res.ok, status: res.status, markdown: res.ok ? res.text : '', error: res.error };
}

async function fetchOnboardingDoc(baseUrl) {
  const res = await request('GET', `${baseUrl}/onboarding.md`);
  return { ok: res.ok, status: res.status, markdown: res.ok ? res.text : '', error: res.error };
}

// --- Node lifecycle -----------------------------------------------------

// Layer 1: register a node. On a node's FIRST hello, sender_id must be omitted
// entirely so the hub auto-generates a valid node_id (sending 'unbound' is
// rejected as node_id_format_invalid). The response is a GEP-A2A envelope whose
// payload carries your_node_id, node_secret (one-time), claim_url and claim_code.
async function hello(baseUrl, { agent, rotateSecret = false, nodeId = null } = {}) {
  const body = envelope('hello', {
    agent: agent || { name: 'evomap-companion', kind: 'local-control-panel' },
    ...(rotateSecret
      ? { rotate_secret: true, env_fingerprint: { platform: process.platform, arch: process.arch } }
      : {}),
  }, { senderId: nodeId });
  // First registration: omit sender_id entirely so the hub assigns a node id.
  // Secret rotation: keep sender_id = the existing node_id being rotated, and
  // send NO Bearer header (the old secret is already invalid after a reset).
  if (!rotateSecret && !nodeId) delete body.sender_id;
  const res = await request('POST', `${baseUrl}/a2a/hello`, { body });
  return res;
}

// Layer 2c: a single heartbeat to verify the binding and read the (cached) full
// discovery payload — claimed state, recommendations, onboarding, etc.
async function heartbeat(baseUrl, { nodeId, nodeSecret } = {}) {
  const body = envelope('heartbeat', {}, { senderId: nodeId });
  const res = await request('POST', `${baseUrl}/a2a/heartbeat`, { body, headers: bearer(nodeSecret) });
  return res;
}

// Node profile: alias (the public display name set on the claim page),
// reputation, online status, publish stats. The heartbeat does NOT return our
// own alias, so this GET is how the companion gets a display name.
async function nodeProfile(baseUrl, nodeId, { nodeSecret } = {}) {
  return request('GET', `${baseUrl}/a2a/nodes/${encodeURIComponent(nodeId)}`, { headers: bearer(nodeSecret) });
}

// --- Asset retrieval ----------------------------------------------------

async function search(baseUrl, query, { limit = 5 } = {}) {
  const url = `${baseUrl}/a2a/assets/search?q=${encodeURIComponent(query)}&limit=${limit}`;
  return request('GET', url);
}

async function semanticSearch(baseUrl, query, { limit = 5 } = {}) {
  const url = `${baseUrl}/a2a/assets/semantic-search?q=${encodeURIComponent(query)}&limit=${limit}`;
  return request('GET', url);
}

async function policy(baseUrl) {
  return request('GET', `${baseUrl}/a2a/policy`);
}

// Layer 3: fetch full asset content. Requires a bound node_secret.
async function fetchAssets(baseUrl, assetIds, { nodeId, nodeSecret } = {}) {
  const body = envelope('fetch', { asset_ids: assetIds }, { senderId: nodeId });
  return request('POST', `${baseUrl}/a2a/fetch`, { body, headers: bearer(nodeSecret) });
}

// Sync account-level assets to disk. POST /a2a/fetch does not persist anything;
// these REST-style endpoints return the account's owned assets (with full
// payload) so they can be materialised into the local recall cache. Both are
// account-level: they aggregate across every node owned by the bound account.
// One page per call; pass the returned next_cursor back in to paginate.
//   purchased         -> assets this account has fetched in full (paid or free)
//   published-by-me   -> assets published by any node owned by this account
async function assetsPurchased(baseUrl, { nodeId, nodeSecret, limit = 100, cursor = null, type = null, since = null } = {}) {
  const params = new URLSearchParams({ node_id: nodeId, limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  if (type) params.set('type', type);
  if (since) params.set('since', since);
  return request('GET', `${baseUrl}/a2a/assets/purchased?${params.toString()}`, { headers: bearer(nodeSecret) });
}

async function assetsPublishedByMe(baseUrl, { nodeId, nodeSecret, limit = 100, cursor = null, status = 'all' } = {}) {
  const params = new URLSearchParams({ node_id: nodeId, limit: String(limit), status });
  if (cursor) params.set('cursor', cursor);
  return request('GET', `${baseUrl}/a2a/assets/published-by-me?${params.toString()}`, { headers: bearer(nodeSecret) });
}

// Publish (upload) a local asset to EvoMap. Requires a bound node_secret.
async function publish(baseUrl, asset, { nodeId, nodeSecret } = {}) {
  const body = envelope('publish', { asset }, { senderId: nodeId });
  return request('POST', `${baseUrl}/a2a/publish`, { body, headers: bearer(nodeSecret) });
}

// Vote up/down on an asset. This is a USER-level action: /a2a/assets/:id/vote
// uses requireAuth (ek_* API key or session), NOT node_secret. Plain REST body,
// no envelope. Re-voting the same direction toggles the vote off.
async function voteAsset(baseUrl, assetId, vote, { apiKey } = {}) {
  return request('POST', `${baseUrl}/a2a/assets/${encodeURIComponent(assetId)}/vote`, {
    headers: bearer(apiKey),
    body: { vote },
  });
}

module.exports = {
  PROTOCOL,
  PROTOCOL_VERSION,
  envelope,
  newMessageId,
  request,
  fetchSkillDoc,
  fetchOnboardingDoc,
  hello,
  heartbeat,
  nodeProfile,
  search,
  semanticSearch,
  policy,
  fetchAssets,
  assetsPurchased,
  assetsPublishedByMe,
  publish,
  voteAsset,
};
