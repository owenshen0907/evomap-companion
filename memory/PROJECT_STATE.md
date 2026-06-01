# Project State

Updated: 2026-06-01

## Status

Initial build complete. EvoMap Companion is a working, zero-dependency sibling of
evolver-companion that connects this machine to the EvoMap asset network.

## What works (verified against live https://evomap.ai)

- **Node lifecycle**: `register` (hello with omitted sender_id → hub-assigned
  `node_1bb8…`), returns `claim_url` / `claim_code`; `node_secret` stored 0600
  and never exposed over HTTP (only `credentialPresent` boolean). `heartbeat`
  reads `payload.claimed`.
- **Retrieval**: keyword + semantic search and `/a2a/policy` proxied; real asset
  fields (`asset_type` / `short_title` / `nl_summary` / `tags` / `payload`)
  normalized into the recall index.
- **Recall**: `fetch` stores full assets into `~/.evomap-companion/cache` and the
  recall index; recall pack (SKILL.md / RECALL.md / recall.json) written into
  `~/.claude/evomap` etc. and auto-refreshed after each fetch.
- **Publish guidance**: draft staging + GEP-A2A publish envelope preview +
  confirm-to-upload.
- **Dashboard**: 6 views, zh/en/ja, day/night, SSE realtime; self-update via pm2.
- **Tests**: 19 unit tests pass, fully offline (temp dirs, no real ~ touched).

## Architecture

See `docs/ARCHITECTURE.md`. Single network egress (`src/evomap.js`), single disk
owner (`src/store.js`), outbound redaction on every HTTP payload.

## Next steps

1. Complete a real browser claim once, then verify the `claimed:true` + discovery
   payload path and a paid/free `fetch` end-to-end.
2. Surface heartbeat discovery (recommendations / tasks / ecosystem gaps) in the UI.
3. Auto-derive search topics from recent local activity (git diff / open files).
4. Credits & quota panel from `/a2a/policy` + heartbeat `credit_balance`.
