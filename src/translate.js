'use strict';

// Lightweight, zero-dependency translation for recall-library descriptions.
//
// EvoMap assets are authored in mixed languages (mostly English). To show their
// title/summary in the dashboard's current language, we translate the natural-
// language fields through a free, key-less endpoint and cache the results on
// disk (<home>/translations.json) so each string is only translated once.
//
// Code is never sent here: only the recall index's title/summary go through.
// Failures degrade gracefully — the caller keeps the original text.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const store = require('./store');
const { request } = require('./evomap');

// Map the dashboard's language codes to the translation endpoint's codes.
const LANG_MAP = { zh: 'zh-CN', en: 'en', ja: 'ja' };
const CONCURRENCY = 4;

let CACHE = null;

function cacheFile() {
  return path.join(store.homeDir(), 'translations.json');
}

function loadCache() {
  try { return JSON.parse(fs.readFileSync(cacheFile(), 'utf8')); } catch (error) { return {}; }
}

function cache() {
  if (!CACHE) CACHE = loadCache();
  return CACHE;
}

function keyOf(text, lang) {
  return `${lang}:${crypto.createHash('sha1').update(text).digest('hex')}`;
}

function saveCache() {
  try { store.ensureHome(); fs.writeFileSync(cacheFile(), JSON.stringify(cache())); } catch (error) { /* best effort */ }
}

// Return a cached translation if present, else null. Never hits the network.
function getCached(text, lang) {
  if (!text || lang === 'en') return null;
  return cache()[keyOf(text, lang)] || null;
}

// Translate a single string. Returns the translation, or null on failure.
async function translateOne(text, lang) {
  if (!text || !text.trim() || lang === 'en') return null;
  const hit = getCached(text, lang);
  if (hit) return hit;
  const tl = LANG_MAP[lang] || lang;
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await request('GET', url);
  if (!res.ok || !Array.isArray(res.json)) return null;
  try {
    const segments = res.json[0] || [];
    const out = segments.map((s) => (s && s[0]) || '').join('').trim();
    if (!out) return null;
    cache()[keyOf(text, lang)] = out;
    return out;
  } catch (error) {
    return null;
  }
}

// Translate many strings with a small concurrency pool. De-duplicates inputs
// and skips already-cached ones, then persists the cache once at the end.
async function translateMany(texts, lang) {
  if (lang === 'en') return { total: 0, alreadyCached: 0, translated: 0, failed: 0 };
  const unique = [...new Set(texts.filter((t) => t && t.trim()))];
  const alreadyCached = unique.filter((t) => getCached(t, lang)).length;
  const todo = unique.filter((t) => !getCached(t, lang));
  let translated = 0;
  let failed = 0;
  let cursor = 0;
  async function worker() {
    while (cursor < todo.length) {
      const text = todo[cursor];
      cursor += 1;
      const out = await translateOne(text, lang);
      if (out != null) translated += 1; else failed += 1;
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length || 1) }, worker));
  saveCache();
  return { total: unique.length, alreadyCached, translated, failed };
}

module.exports = { getCached, translateOne, translateMany, LANG_MAP };
