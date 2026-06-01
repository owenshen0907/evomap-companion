# EvoMap Companion 项目规划

## 一句话

把 EvoMap 资产网络变成本地 Agent 触手可及的能力：本机注册成节点，检索资产、召回到本地、引导上传。

## 和 EvoMap 的关系

这是一个伴生项目。

- EvoMap 是云端资产网络（GEP-A2A 协议），托管全网 Gene / Capsule、节点账户、积分与治理。
- EvoMap Companion 是本地连接器，不改服务端，只在本机做绑定、检索、召回与上传引导。
- 它和 evolver-companion 同级、互补：一个观察本地进化引擎，一个连接云端资产网络。

它应该尽量薄。所有网络动作都通过 `src/evomap.js` 一个出口，其余逻辑只跟本地状态打交道。

## 核心问题

这个项目要回答四个问题：

1. 这台机器有没有接入 EvoMap？绑定到哪个账号？（节点生命周期）
2. 针对当前任务，EvoMap 上有哪些可复用资产？（检索）
3. 本地 Agent 怎么才能在不重复检索的情况下，立刻用上已经 fetch 的资产？（召回）
4. Agent 沉淀的经验怎么安全地回流到 EvoMap？（上传引导）

## 设计原则

- **凭据不出本机**：`node_secret` 本地 0600 存储，只在服务端用于签名 EvoMap 请求；HTTP 接口与日志一律脱敏，只暴露 `credentialPresent` 布尔。
- **分层授权、步步确认**：注册、绑定、fetch、执行、上传是不同层级。读文档/搜摘要不授权 fetch；fetch 不授权执行；执行资产内容永不自动。
- **资产内容是不可信数据**：召回库里的内容只作参考知识，不自动执行命令或改文件。
- **零运行时依赖**：仅用 Node 标准库，clone 即跑。
- **优雅降级**：网络抖动不能拖垮仪表盘——每个 EvoMap 调用都 resolve 成 `{ok,error}`，绝不抛断进程。

## 数据源 / 数据归属

EvoMap Companion 自己拥有的本地状态（默认 `~/.evomap-companion`）：

- `config.json` —— 网络地址与偏好
- `credentials.json` —— node_id / node_secret / claim_url（0600）
- `recall_index.jsonl` —— 每个已 fetch 资产一行
- `cache/<asset>.json` —— fetch 下来的完整资产内容
- `call_log.jsonl` —— EvoMap 调用流水
- `publish_drafts.jsonl` —— 待上传草稿

EvoMap 服务端（只读消费）：`/skill.md`、`/onboarding.md`、`/a2a/hello`、`/a2a/heartbeat`、`/a2a/assets/search`、`/a2a/assets/semantic-search`、`/a2a/policy`、`/a2a/fetch`、`/a2a/publish`。

## 概念模型

### Node（节点）

本机在 EvoMap 中的身份。生命周期：`register（hello）→ claim（浏览器绑定）→ heartbeat（验证 + 发现）`。

要记录：node_id、是否 claimed、claim_url/claim_code、注册与绑定时间。

### Asset（资产）

EvoMap 上的可复用单元，分 Gene（策略基因）与 Capsule（经验胶囊）。检索返回摘要（`short_title` / `nl_summary` / `tags` / `payload`），fetch 返回完整内容。

### Recall（召回）

把 fetch 下来的资产缓存到本地，并投影到 IDE 配置，让 Agent 无需重新检索就能引用。召回库是「Agent 当前可用的 EvoMap 知识」的快照。

### Publish Draft（上传草稿）

Agent 产出的可复用经验在上传前的暂存形态。必须经用户确认才上传，绝不包含密钥、私有路径或原始会话记录。

## 输出形态

- 本地仪表盘：总览 / 节点绑定 / 资产检索 / 本地召回 / 上传引导 / 集成与诊断。
- IDE 召回包：`SKILL.md` / `RECALL.md` / `recall.json`。
- CLI：status / register / heartbeat / search / semantic / fetch / recall / policy。

## 里程碑

### M0：项目骨架（已完成）

- 零依赖 Node 服务 + CLI + 玻璃仪表盘骨架。
- 本地状态存储、EvoMap 客户端、脱敏、SSE。

### M1：节点生命周期（已完成）

- register / claim_url / heartbeat，凭据安全存储与脱敏。

### M2：检索 + 召回（已完成）

- 关键词 / 语义搜索；fetch 入本地缓存；召回库生成。

### M3：Agent 集成（已完成）

- 把召回库写入 Claude Code / Cursor / Codex 全局配置；fetch 后自动刷新。

### M4：上传引导（已完成）

- 草稿暂存 + GEP-A2A publish envelope 预览 + 确认后上传。

### M5（后续）

- heartbeat 发现 payload 的推荐 / 任务 / 生态缺口可视化。
- 召回库与本地项目主题的自动匹配（按近期 git diff / 打开文件推断检索词）。
- 积分 / 配额面板（基于 `/a2a/policy` 与 heartbeat 的 credit_balance）。

## 不做什么

- 不把 `node_secret` 写进聊天、日志、HTTP 响应或 git。
- 不在用户未确认时 fetch 付费资产或上传草稿。
- 不自动执行资产内容里的命令。
- 不修改 EvoMap 服务端逻辑。
