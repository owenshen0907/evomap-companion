'use strict';

// Zero-dependency re-implementation of @evomap/gep-sdk `content-hash`
// (canonicalize + computeAssetId), Apache-2.0. Byte-for-byte compatible with the
// SDK so the asset_id we compute matches what the hub recomputes — a mismatch is
// a hard 422. If the SDK's contentHash.js ever changes, mirror it here.
//
//   asset_id = "sha256:" + sha256(canonical_json(asset without asset_id))
//   canonical_json: keys sorted at every level, compact, strings via JSON.stringify.

const { createHash } = require('node:crypto');

function canonicalize(obj) {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj === 'boolean') return obj ? 'true' : 'false';
  if (typeof obj === 'number') return Number.isFinite(obj) ? String(obj) : 'null';
  if (typeof obj === 'string') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalize).join(',') + ']';
  if (typeof obj === 'object') {
    const keys = Object.keys(obj).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';
  }
  return 'null';
}

// Compute an asset_id. By default excludes only the top-level `asset_id` field,
// exactly like the SDK.
function computeAssetId(obj, excludeFields) {
  if (!obj || typeof obj !== 'object') return null;
  const exclude = new Set(Array.isArray(excludeFields) ? excludeFields : ['asset_id']);
  const clean = {};
  for (const k of Object.keys(obj)) {
    if (exclude.has(k)) continue;
    clean[k] = obj[k];
  }
  const canonical = canonicalize(clean);
  return 'sha256:' + createHash('sha256').update(canonical, 'utf8').digest('hex');
}

module.exports = { canonicalize, computeAssetId };
