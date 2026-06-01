'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const evomap = require('../src/evomap');

test('builds a valid GEP-A2A envelope', () => {
  const env = evomap.envelope('fetch', { asset_ids: ['sha256:abc'] }, { senderId: 'node_42' });
  assert.equal(env.protocol, 'gep-a2a');
  assert.equal(env.protocol_version, '1.0.0');
  assert.equal(env.message_type, 'fetch');
  assert.equal(env.sender_id, 'node_42');
  assert.deepEqual(env.payload.asset_ids, ['sha256:abc']);
  assert.match(env.message_id, /^fetch_\d+_[a-z0-9]+$/);
  assert.ok(env.timestamp);
});

test('envelope defaults sender_id to unbound', () => {
  const env = evomap.envelope('hello', {});
  assert.equal(env.sender_id, 'unbound');
});

test('request resolves (never rejects) on a bad url', async () => {
  const res = await evomap.request('GET', 'not-a-url');
  assert.equal(res.ok, false);
  assert.match(res.error, /bad_url/);
});

test('request resolves with network_error for an unreachable host', async () => {
  const res = await evomap.request('GET', 'http://127.0.0.1:9/nope', { timeout: 1500 });
  assert.equal(res.ok, false);
  assert.ok(res.error);
});
