# EvoMap 观察反馈

> 从 evomap-companion 接入 EvoMap (GEP-A2A) 的全过程中实测得到的观察。
> 目标:既帮普通用户用会 EvoMap,也记录哪些设计值得肯定、哪些可以优化。
> 所有结论均来自对 `https://evomap.ai` 的真实调用,非文档推断。

## 一、值得肯定的设计

1. **双身份体系(agent 级 vs 用户级)**
   `node_secret` 是机器/agent 身份(走 envelope,用于 search/fetch/publish/heartbeat);
   `ek_` API key / session 是用户身份(`requireAuth`,用于 vote 等)。投票用用户身份,
   有效防止 agent 用机器身份刷票——治理上很干净。

2. **内容寻址 asset_id**
   `asset_id = sha256(canonical_json(asset 去 asset_id))`,每层 key 排序。去重、防篡改、
   跨实现一致。算法简单(可零依赖复刻,我们已验证与官方 SDK 逐字节一致)。

3. **Gene+Capsule 捆绑发布**
   强制"可复用策略(Gene)+ 具体成果(Capsule)"成对入网,保证沉淀既有方法也有证据。

4. **validate == publish 的 dry-run**
   两者 schema 完全相同,可先 `/a2a/validate` 拿字段级错误逐项修正,再 `/a2a/publish`。
   字段错误带 `path` + `message` + `correction`,对接入方很友好。

5. **生命周期 + 质量门 + 自适应免疫**
   `candidate → promoted → quarantined` 状态机;发布串多重扫描;抗体指数衰减、Sybil 冷却、
   命令白名单(node/npm/npx)。仿生免疫的思路很有意思。

6. **fetch 是评价的强制前置**
   未 fetch 不能 vote/反馈(usage_not_verified),防止凭摘要刷评价。

7. **分层授权**
   读文档/摘要不授权任何动作;fetch/publish 需逐项确认。边界清晰,适合 agent 自动化。

8. **GDI 多维评分**
   intrinsic / usage / social / freshness 多维度,而非单一热度。

## 二、可优化点(均有实测支撑)

1. **⚠️ 信号搜索对自然语言几乎 0 命中**
   `/a2a/assets/search` 按信号标签精确匹配。但接入方/用户很自然会输自然语言查询,
   实测同一自然语言 query 返回 0。**建议**:文档/响应明确提示"用信号词",或服务端在
   0 命中时自动回退到语义检索 + 在 `next_action_suggested` 里给信号词建议。

2. **⚠️ recommended 与 explore 返回完全相同**
   同 query 下 `/a2a/assets/recommended` 与 `/a2a/assets/explore` 结果一字不差。
   个性化推荐似乎未真正生效(或与探索共用后端)。**建议**:确认 recommended 是否真的
   基于调用方历史个性化。

3. **⚠️ 文档与实际不一致**(平台文档自身也已标注)
   - fetch 限流:文档 6/min,实际约 60/min(差 10 倍)
   - Gene `validation`:对外文档多处说"可选",实际质量门必填(≥1 条、≥10 字)
   - `category` 枚举:对外文档缺 `regulatory` / `explore`(实际 schema 含)
   **建议**:以 `/a2a/policy` 为唯一真相源,前端/文档自动取值,避免多处分叉。

4. **⚠️ publish 的 `decision` 与资产 `status` 语义易混**
   发布返回 `decision: quarantine`,但同一资产实际落库 `status: candidate`(且
   contentQuality 0.9 通过)。两个字段含义不同却都叫"隔离/候选",接入方易误判为失败。
   **建议**:在 publish 响应里同时给出落库后的 `status` 和一句人类可读的解释。

5. **⚠️ 错误信息可更面向新手**
   - 单发一个 Gene → `bundle_required`,但新手不知道要 Gene+Capsule 捆绑
   - `validation` 命令含分号 → `validation_command_dangerous: matched /;\s*[a-z]/i`
     (正则对用户晦涩)
   - 用 `node_secret` 调 vote → `401 unauthorized`(没说明需要用户级 ek_ key)
   **建议**:错误里带一句"怎么修"的引导(类似 publish 的 `correction`)。

6. **⚠️ 获取类接口缺资产创建时间**
   `/a2a/assets/purchased` 不返回 `created_at`(只有 `first/last_fetched_at`)。
   展示"资产何时创建"时拿不到。**建议**:purchased 也带 `created_at`。

7. **⚠️ 新节点首发体验**
   新注册节点(reputation 低)首次发布,`decision` 总是 quarantine 初判后才落 candidate。
   冷启动门槛对新用户不够友好。**建议**:对质量门通过(contentQuality 高、intentDrift 低)
   的首发资产,给更明确的"已入网待晋升"反馈,而非看起来像被拒。

## 三、普通用户视角的门槛(companion 已尝试补齐)

| 门槛 | 现象 | companion 的应对 |
| --- | --- | --- |
| 语言 | 资产标题/摘要多为英文 | 召回库一键机器翻译(代码不翻) |
| asset_id | 发布需算 sha256 canonical,门槛高 | 零依赖复刻 SDK 算法,自动补 id |
| bundle | Gene+Capsule + 必填字段复杂 | 校验透传 + 可复制的 agent 提示词 |
| 摘要 | 摘要不全、要 fetch 才有内容 | 卡片只显标题,点详情看简介,模拟"免费看简介" |
| 身份 | vote 为何 401 难理解 | 节点页加 API key 配置 + 生成引导 |
| 质量 | candidate/quarantined 难辨 | 召回库按状态筛选 + 状态色点 |

## 四、一句话总结

EvoMap 的**核心机制(内容寻址、双身份、bundle、质量门、免疫)设计扎实**;
当前更值得打磨的是**接入与新手体验**——尤其是信号搜索的零命中、recommended 未个性化、
文档与实际的若干不一致,以及错误信息的"可操作性"。这些都是低成本、高收益的优化点。

---
*数据来源:evomap-companion 接入 evomap.ai 的真实调用(2026-06)。*
