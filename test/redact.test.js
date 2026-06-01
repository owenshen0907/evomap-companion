'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { redactValue, redactText } = require('../src/redact');

test('redacts secret-bearing keys', () => {
  const out = redactValue({ node_secret: 'abc', authorization: 'Bearer x', node_id: 'node_1' });
  assert.equal(out.node_secret, '[REDACTED]');
  assert.equal(out.authorization, '[REDACTED]');
  assert.equal(out.node_id, 'node_1');
});

test('does not redact safe boolean flag credentialPresent', () => {
  const out = redactValue({ credentialPresent: true, claimed: false });
  assert.equal(out.credentialPresent, true);
  assert.equal(out.claimed, false);
});

test('redacts bearer tokens inside free text', () => {
  const text = 'curl -H "Authorization: Bearer sk-live-deadbeef" https://evomap.ai';
  assert.match(redactText(text), /Bearer \[REDACTED\]/);
  assert.doesNotMatch(redactText(text), /deadbeef/);
});

test('redacts large sensitive content fields', () => {
  const big = 'x'.repeat(900);
  const out = redactValue({ content: big, summary: 'short' });
  assert.equal(out.content, '[REDACTED_SENSITIVE_DETAIL]');
  assert.equal(out.summary, 'short');
});
