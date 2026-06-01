# EvoMap Companion

EvoMap Companion 是 [EvoMap](https://evomap.ai) 资产网络的本地伴生控制台。

它不替代 EvoMap，也不直接改 EvoMap 的服务端。它专门做四件事：

1. **创建节点并绑定** —— 把本机注册成一个 EvoMap 节点，引导你在浏览器完成账号绑定。
2. **检索资产** —— 通过 EvoMap 的关键词 / 语义搜索接口，根据你的近期主题找到候选 Gene / Capsule。
3. **本地召回（recall）** —— 把确认后 fetch 下来的资产缓存到本地，并写入你的 IDE（Claude Code / Cursor / Codex），让本地 Agent 在会话开始时就能召回这些资产。
4. **引导上传** —— 当 Agent 沉淀出可复用的经验时，把它整理成草稿，确认后上传回 EvoMap。

## 和 EvoMap 的关系

| | EvoMap | EvoMap Companion |
| --- | --- | --- |
| 角色 | 云端资产网络（GEP-A2A 协议） | 本地客户端 / 控制台 |
| 持有 | 全网资产、节点账户、积分 | 本机的 node 凭据、fetch 下来的资产缓存 |
| 动作 | search / fetch / publish 服务端 | 注册绑定、检索、召回、引导上传 |

> 它和同级的 **evolver-companion** 形成对照：evolver-companion 是本地进化引擎的*只读观察器*；evomap-companion 是云端资产网络的*本地连接器*。

## 安全边界（重要）

Companion 严格遵循 EvoMap 的分层授权，**每一步都需要你确认**：

- 读取文档 / 搜索摘要：参考用途，不授权任何外部动作。
- 注册节点：你点「注册」后才执行；返回 `claim_url`，**`node_secret` 永不离开本机**（本地 0600 存储，HTTP 接口只暴露 `credentialPresent` 布尔）。
- fetch 完整资产：需要已绑定节点 + 你确认具体 `asset_id`（可能消耗积分）。
- 执行资产里的命令 / 改文件：**永不自动**。资产内容是不可信数据。
- 上传资产：需要你确认具体草稿。

## 安装

零运行时依赖（仅 Node 标准库），clone 下来直接跑，**不需要 `npm install`**：

```bash
cd evomap-companion
node src/index.js ui
```

要求 Node.js >= 18。

## 运行方式

```bash
npm run status          # 查看节点绑定与本地资产状态
node src/index.js register          # 注册节点（返回 claim_url）
node src/index.js heartbeat         # 心跳验证绑定
node src/index.js rebind            # 在 evomap.ai 重置节点密钥后，用新密钥重新绑定原节点（保留 node_id）
node src/index.js semantic <query>  # 语义检索资产摘要
node src/index.js fetch <asset_id>  # fetch 完整资产到本地召回库
node src/index.js sync              # 同步本账号历史已获取(purchased)的全部资产到本地召回库
node src/index.js recall            # 列出本地召回库
npm run ui              # 启动本地仪表盘
```

本地仪表盘默认运行在：

```text
http://localhost:4174
```

默认连接的网络是 `https://evomap.ai`。可通过环境变量或命令行覆盖：

```bash
EVOMAP_BASE_URL=https://staging.evomap.ai npm run ui
# 或
node src/index.js ui --base https://staging.evomap.ai --port 4174
```

本地状态（node 凭据、资产缓存、召回索引）默认存放在 `~/.evomap-companion`，可用 `EVOMAP_COMPANION_HOME` 覆盖。

仪表盘通过 SSE（`/api/stream`）实时感知本地状态变化：注册、fetch、集成等动作完成后页面会自动刷新。

已绑定的节点会**每 10 分钟自动心跳**保活（Hub 约 15 分钟无心跳才标记离线），服务一启动就开始、绑定后立即生效。用 `EVOMAP_HEARTBEAT_MS`（毫秒）覆盖间隔，设为 `0` 关闭。建议用 pm2 托管让服务常驻、心跳不中断。

## 典型流程

1. 打开仪表盘 → 「节点绑定」→ **注册节点**。
2. 浏览器打开返回的 `claim_url`，在 EvoMap 网站把节点绑到你的账号。
3. 回到仪表盘 → **心跳验证绑定**（状态变为「已绑定」）。
4. 「资产检索」→ 输入近期主题（如 `agent workflow memory`）→ 选择候选 → **获取**。
5. 「集成与诊断」→ 给 Claude Code / Cursor / Codex **集成**：召回库写入 `~/.claude/evomap/` 等。
6. 重启 IDE。之后本地 Agent 会在会话开始读取 `RECALL.md`，召回这些资产。
7. 当 Agent 产出可复用经验 → 「上传引导」生成草稿 → 确认后 **上传**。

## 召回库：同步历史资产 & 母语显示

「本地召回」页有两个按钮：

- **同步账号已获取资产**：调 `GET /a2a/assets/purchased`（账号级，跨该账号所有节点），把历史 fetch 过的全部资产一次性拉进本地召回库；已购买资产不额外消耗积分。等价命令 `node src/index.js sync` / `POST /api/recall/sync`。
- **翻译描述为当前语言**：EvoMap 资产多为英文原文，点此用免费机器翻译把召回库的**标题 / 摘要**翻成当前界面语言（中 / 英 / 日）。译文缓存在 `~/.evomap-companion/translations.json`，每条只翻一次；**代码不翻译**，缺译文自动回退原文。对应 `POST /api/recall/translate {"lang":"zh"}`，读取时 `GET /api/recall?lang=zh` 注入译文（原文保留在 `*_original`）。

> 集成给 Agent 的 `RECALL.md` 仍保留作者原文 —— Agent 不需要翻译，原文更精确。

## 让本地 Agent 用上 EvoMap 资产

「集成」会在每个已安装 IDE 的全局配置里写三份受管文件：

```text
~/.claude/evomap/SKILL.md      # 何时、如何使用 EvoMap 资产（含授权边界）
~/.claude/evomap/RECALL.md     # 本地召回库（人类 + Agent 可读）
~/.claude/evomap/recall.json   # 同上，机器可读
```

每次 fetch 新资产后，已集成平台的召回库会自动刷新。Agent 通过这些文件：

- **召回**：会话开始读取 `RECALL.md`，知道本地已有哪些 EvoMap 知识。
- **检索更多**：`GET http://localhost:4174/api/assets/semantic-search?q=<topic>`。
- **获取**：用户确认 `asset_id` 后 `POST /api/assets/fetch`。
- **上传**：产出可复用经验时引导用户走上传流程。

## 用 pm2 守护与开机自启（推荐）

```bash
npm i -g pm2
npm run pm2:start            # = pm2 start ecosystem.config.js
pm2 save && pm2 startup      # 可选：开机自启

npm run pm2:restart
npm run pm2:logs
npm run pm2:stop
```

`ecosystem.config.js` 里设置了 `autorestart: true`，这是仪表盘「Companion 自身 → 更新并重启」按钮生效的前提：更新后进程干净退出，pm2 立刻以新版本拉起。

## 测试

```bash
npm test     # redact / evomap envelope / store / recall 集成 单元测试
```

测试全部离线运行，使用临时目录，不触碰真实的 `~/.evomap-companion` 或 `~/.claude`。

## 主要文档

- [项目规划](docs/PROJECT_PLAN.md)
- [架构与数据模型](docs/ARCHITECTURE.md)
- [当前状态](memory/PROJECT_STATE.md)
