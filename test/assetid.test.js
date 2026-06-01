'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { canonicalize, computeAssetId } = require('../src/assetid');

test('canonicalize sorts keys at every level and stays compact', () => {
  assert.strictEqual(
    canonicalize({ b: 1, a: [3, { y: 2, x: 1 }] }),
    '{"a":[3,{"x":1,"y":2}],"b":1}',
  );
});

test('canonicalize handles primitives like the SDK', () => {
  assert.strictEqual(canonicalize(null), 'null');
  assert.strictEqual(canonicalize(true), 'true');
  assert.strictEqual(canonicalize(42), '42');
  assert.strictEqual(canonicalize(1e21), '1e+21');
  assert.strictEqual(canonicalize('中文'), JSON.stringify('中文'));
});

test('computeAssetId matches @evomap/gep-sdk byte-for-byte (locked fixture)', () => {
  // Verified === @evomap/gep-sdk `content-hash` computeAssetId on 2026-06-01.
  // If this breaks, the canonicalization drifted from the SDK and asset_ids
  // would be rejected by the hub (422 asset_id mismatch).
  assert.strictEqual(
    computeAssetId({ a: 1, A: 2, '中': 3, _: 4 }),
    'sha256:a0a75f30fc33fce77834020d5766b2aede821c0931de864aebf84a7b3d2034f4',
  );
});

test('computeAssetId excludes the top-level asset_id field', () => {
  const without = computeAssetId({ type: 'Gene', summary: 'x' });
  const withId = computeAssetId({ type: 'Gene', summary: 'x', asset_id: 'sha256:anything' });
  assert.strictEqual(without, withId);
});
