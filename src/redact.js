'use strict';

// Ported from evolver-companion src/redact.js (zero-dependency).
//
// EvoMap Companion holds a node_secret server-side to authenticate against the
// EvoMap network, and it caches fetched asset content locally. Any secret keys
// or large sensitive blobs must be scrubbed before they leave the process over
// HTTP, so the browser dashboard never sees a credential and logs never leak one.

const SECRET_KEY_RE = /(secret|token|api[_-]?key|authorization|cookie|oauth|password|private[_-]?key|node_secret|claim_token|bearer)/i;
const SECRET_TEXT_RE = /(Bearer\s+)[A-Za-z0-9._~+/-]+=*|([A-Za-z0-9_]*SECRET[A-Za-z0-9_]*=)[^\s]+|([A-Za-z0-9_]*TOKEN[A-Za-z0-9_]*=)[^\s]+/g;

function redactValue(value, depth = 0) {
  if (depth > 8) return '[REDACTED_DEPTH]';
  if (Array.isArray(value)) return value.map((entry) => redactValue(entry, depth + 1));
  if (!value || typeof value !== 'object') {
    return typeof value === 'string' ? redactText(value) : value;
  }

  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY_RE.test(key)) {
      out[key] = '[REDACTED]';
    } else if (isLargeSensitiveField(key, child)) {
      out[key] = '[REDACTED_SENSITIVE_DETAIL]';
    } else {
      out[key] = redactValue(child, depth + 1);
    }
  }
  return out;
}

function redactText(text) {
  if (typeof text !== 'string') return text;
  return text.replace(SECRET_TEXT_RE, (match, bearer, secret, token) => {
    if (bearer) return `${bearer}[REDACTED]`;
    if (secret) return `${secret}[REDACTED]`;
    if (token) return `${token}[REDACTED]`;
    return '[REDACTED]';
  });
}

function isLargeSensitiveField(key, value) {
  if (typeof value !== 'string') return false;
  if (!/(prompt|diff|content|transcript|message|raw|body)/i.test(key)) return false;
  return value.length > 800;
}

module.exports = {
  redactValue,
  redactText,
};
