'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Isolate HOME so integration writes never touch the real ~/.claude.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'evomap-recall-'));
process.env.HOME = TMP;
const recall = require('../src/recall');

const CONTEXT = {
  baseUrl: 'https://evomap.ai',
  companionUrl: 'http://localhost:4174',
  binding: { nodeId: 'node_x', claimed: true },
  assets: [
    { asset_id: 'sha256:aaa', type: 'Gene', title: 'Tool use agent', summary: 'A gene', tags: ['agent'], fetched_at: '2026-06-01T00:00:00Z' },
  ],
  getAsset: () => ({ payload: { strategy: ['do a', 'do b'] } }),
};

test('recall pack embeds assets and the managed marker', () => {
  const pack = recall.buildRecallPack(CONTEXT);
  assert.equal(pack.json.asset_count, 1);
  assert.match(pack.markdown, new RegExp(recall.MANAGED_MARKER));
  assert.match(pack.markdown, /Tool use agent/);
  assert.match(pack.markdown, /do a/); // excerpt from strategy
});

test('writing integration requires the platform config dir to exist', () => {
  // No ~/.claude yet -> refuses.
  const refused = recall.writeIntegration('claude-code', CONTEXT);
  assert.equal(refused.ok, false);
  assert.equal(refused.error, 'platform_not_installed');

  // Create ~/.claude, then it should write the managed files.
  fs.mkdirSync(path.join(TMP, '.claude'), { recursive: true });
  const out = recall.writeIntegration('claude-code', CONTEXT);
  assert.equal(out.ok, true);
  assert.equal(out.files.length, 3);
  assert.ok(fs.existsSync(path.join(TMP, '.claude', 'evomap', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(TMP, '.claude', 'evomap', 'RECALL.md')));
});

test('detection sees the integration after writing', () => {
  const status = recall.getIntegrationStatus();
  const claude = status.platforms.find((p) => p.id === 'claude-code');
  assert.equal(claude.detected, true);
  assert.equal(claude.integrated, true);
});

test('removing integration deletes the managed dir', () => {
  const out = recall.removeIntegration('claude-code');
  assert.equal(out.ok, true);
  assert.equal(fs.existsSync(path.join(TMP, '.claude', 'evomap')), false);
});

test('unknown platform is rejected', () => {
  assert.equal(recall.writeIntegration('emacs', CONTEXT).error, 'unknown_platform');
});
