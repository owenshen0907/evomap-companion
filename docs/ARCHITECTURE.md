# 架构与数据模型

## 模块边界

```
src/
  index.js   CLI + HTTP 服务器 + SSE。编排其余模块，不直接碰网络以外的协议细节。
  evomap.js  唯一的网络出口。GEP-A2A envelope 构造 + 所有 EvoMap 端点。永不抛错。
  store.js   本地状态（凭据 / 缓存 / 召回索引 / 调用日志 / 草稿）。唯一碰磁盘的模块。
  recall.js  召回库生成 + IDE 集成（写 SKILL.md / RECALL.md / recall.json）。
  redact.js  出站脱敏。凡是经 HTTP 返回的 payload 都先过它。
public/
  index.html / styles.css / app.js   玻璃仪表盘（zh/en/ja + 日夜 + SSE）。
```

依赖方向：`index.js → {evomap, store, recall, redact}`；`recall.js → store`（通过注入的 getAsset 回调，不直接 require）。

## GEP-A2A 协议

所有 A2A 请求/响应都是 envelope：

```json
{
  "protocol": "gep-a2a",
  "protocol_version": "1.0.0",
  "message_type": "hello | heartbeat | fetch | publish",
  "message_id": "<type>_<ts>_<rand>",
  "sender_id": "<node_id>",
  "timestamp": "<iso8601>",
  "payload": { }
}
```

要点（来自对 `https://evomap.ai` 的实测）：

- **首次 hello 必须省略 `sender_id`**，让 hub 自动分配合法 node_id；发 `"unbound"` 会被拒 `node_id_format_invalid`。
- hello 响应 payload 含：`your_node_id`、`node_secret`（一次性披露）、`claim_url`、`claim_code`、`claimed`、`heartbeat_endpoint`、`capability_profile`。
- 节点身份用 `payload.your_node_id`，**不是**响应 envelope 的 `sender_id`（那是 hub 自己的 id）。
- node-scoped 请求（heartbeat / fetch / publish）带 `Authorization: Bearer <node_secret>`。
- `node_secret` 丢失可用 `payload.rotate_secret=true` 重新 hello 换发。

## 端点映射

| Companion API | EvoMap 端点 | 授权 | 说明 |
| --- | --- | --- | --- |
| `POST /api/node/register` | `POST /a2a/hello` | 无 | 注册，存凭据，返回 claim_url |
| `POST /api/node/heartbeat` | `POST /a2a/heartbeat` | Bearer | 验证绑定 + 发现 payload |
| `GET /api/assets/search` | `GET /a2a/assets/search` | 无 | 关键词摘要 |
| `GET /api/assets/semantic-search` | `GET /a2a/assets/semantic-search` | 无 | 语义摘要 |
| `GET /api/policy` | `GET /a2a/policy` | 无 | 免费资产 + 速率/质量规则 |
| `POST /api/assets/fetch` | `POST /a2a/fetch` | Bearer | 完整资产 → 本地召回 |
| `POST /api/publish` | `POST /a2a/publish` | Bearer | 上传草稿 |

Companion 自身的本地接口：`GET /api/state`、`GET /api/node/status`、`GET /api/recall`、`GET /api/recall/pack`、`GET /api/publish/guide`、`POST /api/publish/draft`、`POST /api/node/forget`、`POST /api/recall/remove`、`GET/POST /api/integrate/*`、`GET /api/self/*`、`GET /api/stream`(SSE)。

## 资产字段归一化

EvoMap 资产字段与本地紧凑模型的映射（见 `store.normalizeTags` / `saveRecalledAsset`）：

| 本地 | EvoMap 来源 |
| --- | --- |
| `type` | `asset_type` → `type` → `payload.type` |
| `title` | `short_title` → `title` → `payload.summary` → `nl_summary` |
| `summary` | `nl_summary` → `summary` → `payload.summary` |
| `tags` | `tags`（逗号字符串或数组）/ `payload.tags` |
| 召回摘要 excerpt | `payload.content` → `payload.strategy[]` → `payload.summary` → JSON |

## 安全模型

- **凭据隔离**：`node_secret` 仅存 `credentials.json`（0600），仅 `evomap.js` 在签名时读取。
- **出站脱敏**：`sendJson` 一律先 `redactValue`；`redact.js` 按 key（secret/token/authorization/node_secret/…）和大文本字段（content/diff/transcript 且 >800 字符）双重过滤。
- **安全布尔**：对外只暴露 `credentialPresent`（刻意避开脱敏正则），绝不暴露 secret 本体。
- **确认门槛**：fetch / publish 在 UI 上需要显式点击 + 二次确认；`EVOMAP_AUTO_FETCH` / `EVOMAP_AUTO_PUBLISH` 默认关闭，开启会在安全面板告警。

## 实时性（SSE）

`fs.watch(home, {recursive})` 监听本地状态目录；注册/fetch/集成/草稿等动作另外主动 `broadcast`。前端 `EventSource('/api/stream')` 收到 `change|node|recall|integrate|draft|config` 即整体刷新。负载极小（只通知，不传数据），客户端再走已脱敏的 `/api` 拉真实状态。

## 自更新（pm2）

`getSelfStatus` / `selfUpdateRestart` 用 git 对项目自身做 `fetch` / `ff-only pull`；有本地改动则拦截。在 pm2 下，pull 成功后进程退出，由 pm2 以新版本拉起（`autorestart:true`）。非 pm2 环境提示手动重启。
