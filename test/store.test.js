'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Point the store at an isolated temp home BEFORE requiring it.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'evomap-store-'));
process.env.EVOMAP_COMPANION_HOME = path.join(TMP, 'home');
const store = require('../src/store');

test('binding state is empty before registration', () => {
  const b = store.bindingState();
  assert.equal(b.registered, false);
  assert.equal(b.claimed, false);
  assert.equal(b.credentialPresent, false);
});

test('saving credentials writes a 0600 file and updates binding', () => {
  store.saveCredentials({ node_id: 'node_x', node_secret: 's3cr3t', claim_url: 'https://evomap.ai/claim/x' });
  const b = store.bindingState();
  assert.equal(b.registered, true);
  assert.equal(b.credentialPresent, true);
  assert.equal(b.nodeId, 'node_x');
  const mode = fs.statSync(store.filePath('credentials.json')).mode & 0o777;
  assert.equal(mode, 0o600);
});

test('recalling an asset normalizes EvoMap field names and dedupes', () => {
  store.saveRecalledAsset({
    asset_id: 'sha256:aaa',
    asset_type: 'Gene',
    short_title: 'Tool use agent',
    nl_summary: 'A gene for tool-using agents',
    tags: 'agent, tools, state',
    payload: { strategy: ['step one', 'step two'] },
  });
  let index = store.recallIndex();
  assert.equal(index.length, 1);
  assert.equal(index[0].type, 'Gene');
  assert.equal(index[0].title, 'Tool use agent');
  assert.deepEqual(index[0].tags, ['agent', 'tools', 'state']);

  // re-fetch same id -> still one entry
  store.saveRecalledAsset({ asset_id: 'sha256:aaa', asset_type: 'Gene', short_title: 'Tool use agent v2' });
  index = store.recallIndex();
  assert.equal(index.length, 1);
  assert.equal(index[0].title, 'Tool use agent v2');

  const full = store.getRecalledAsset('sha256:aaa');
  assert.equal(full.short_title, 'Tool use agent v2');
});

test('removing a recalled asset clears index and cache', () => {
  const remaining = store.removeRecalledAsset('sha256:aaa');
  assert.equal(remaining, 0);
  assert.equal(store.getRecalledAsset('sha256:aaa'), null);
});

test('publish drafts append with ids', () => {
  const d = store.addPublishDraft({ title: 'My capsule', type: 'Capsule', content: 'body' });
  assert.match(d.id, /^draft_/);
  assert.equal(store.publishDrafts().length, 1);
});

test('forgetting credentials removes the file', () => {
  store.clearCredentials();
  assert.equal(store.getCredentials(), null);
});
