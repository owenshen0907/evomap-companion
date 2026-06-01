'use strict';

/* EvoMap Companion dashboard.
 * Talks only to the local companion API (never to EvoMap directly — the
 * companion holds the node_secret and proxies network calls), refreshes on SSE
 * change events, and supports zh/en/ja + day/night. */

// --- i18n ---------------------------------------------------------------

const I18N = {
  zh: {
    brandTitle: '资产连接器',
    navOverview: '总览', navNode: '节点绑定', navSearch: '资产检索', navRecall: '本地召回', navPublish: '上传引导', navIntegration: '集成与诊断',
    aboutLabel: '关于', aboutText: 'EvoMap Companion 把本机注册为 EvoMap 节点，检索资产并缓存到本地，让你的 Agent 能召回这些资产，也能在确认后把经验上传回 EvoMap。',
    nodeDockLabel: 'Node', dockIntegrationsLabel: '平台集成',
    selfDockEyebrow: 'This service', selfDockTitle: 'Companion 自身',
    versionLabel: '版本', branchLabel: '分支', commitLabel: '提交', updateLabel: '更新',
    checkSelfButton: '检查更新', updateSelfButton: '更新并重启',
    integrateEyebrow: 'Wire EvoMap into IDEs', integrateTitle: '集成到平台',
    integrateGlobalNote: '集成会把召回库（RECALL.md / recall.json / SKILL.md）写入对应 IDE 的全局配置（~/.claude 等）。fetch 新资产后会自动刷新。操作后请重启对应 IDE。',
    detailModalEyebrow: 'Details', moduleEyebrow: 'Current module',
    topGapLabel: '待处理', metricRecalled: '已召回', metricDrafts: '草稿', metricNode: '节点',
    themeDay: '白天', themeNight: '黑夜',
    heroEyebrow: 'EvoMap 连接状态', heroTitle: '把本机接入 EvoMap 资产网络。',
    heroText: '注册节点 → 绑定账号 → 检索资产 → 本地召回 → 引导上传。每一步都需要你确认，凭据只存本地。',
    refreshButton: '刷新状态', openPack: '召回库 Markdown',
    flowEyebrow: 'Connection flow', flowTitle: '从注册到可复用资产',
    safetyEyebrow: 'Safety posture', safetyTitle: '安全边界',
    callsEyebrow: 'Recent activity', callsTitle: '最近 EvoMap 调用',
    nodeEyebrow: 'Node lifecycle', nodeTitle: '节点绑定',
    registerButton: '注册节点', heartbeatButton: '心跳验证绑定', forgetButton: '忘记凭据', rebindButton: '重新绑定',
    claimEyebrow: '绑定你的节点', claimHint: '在浏览器打开下面的链接，把这个节点绑定到你的 EvoMap 账号，然后回来点「心跳验证绑定」。',
    multiNodeTitle: '可以绑定多个节点吗？',
    multiNodeBody1: '这个面板只管理一个节点：凭据存在本机（~/.evomap-companion），注册新节点会覆盖当前节点。同一台机器上的 Claude Code / Cursor / Codex 共用这一个节点，通常无需多节点。',
    multiNodeBody2: '如果确实需要多个互相隔离的节点（例如区分不同账号、独立核算信誉），为每个节点单独跑一个实例 —— 各自拥有独立的凭据、召回库和端口：',
    multiNodeBody3: '换绑到一个全新节点：点上方「忘记凭据」清除当前凭据，再「注册节点」走绑定流程（会得到一个新的 node_id）。',
    multiNodeBody4: '只想给当前节点换密钥（保留同一 node_id）：先在 EvoMap 账户页 https://evomap.ai/zh/account/agents 重置该节点密钥，然后回本页点「重新绑定」，会用新密钥重新绑定原节点。',
    bindHelpTitle: '绑定流程 & 常见问题',
    bindHelpFlow: '三步缺一不可：① 注册节点 → ② 在浏览器打开 claim_url 绑定到你的 EvoMap 账户 → ③ 回到本页点「心跳验证绑定」。只注册不绑定、或绑定后没点心跳，状态都不会变「已绑定」。',
    bindHelpTip1: '「忘记凭据」会删除本机存的密钥。删除后要找回原节点，必须先在 evomap.ai 账户页重置该节点密钥，再用「重新绑定」；否则只能注册一个全新节点。别随手点。',
    bindHelpTip2: '别反复点「注册节点」：每点一次都会在 EvoMap 新建一个节点，之前没绑定的会变成孤儿节点。卡住时先排查网络，而不是重复注册。',
    bindHelpTip3: '注册 / 心跳失败时先看是不是网络问题（Hub 暂时不可达）。这种情况不要点「忘记凭据」，稍后重试即可——凭据通常没坏。',
    bindHelpTip4: '密钥（node_secret）只存在本机（0600 权限），永不上传，界面只显示「是否存在」。不要把它贴进聊天或截图。',
    bindHelpTip5: '本工具每 10 分钟自动发一次心跳保活（Hub 约 15 分钟无心跳才标记离线）。只要服务在运行（建议 pm2 托管）节点就保持在线；服务停了才会离线，且离线也不影响用现有密钥检索 / 获取资产。可用环境变量 EVOMAP_HEARTBEAT_MS 调整间隔（设 0 关闭）。',
    apiKeyTitle: 'EvoMap API Key（用户级操作，如投票）', apiKeyHint: 'node_secret 是 agent 身份，无法执行投票等「用户级」操作。在 evomap.ai 账户 → API Keys 生成 ek_ 开头的 API Key（创建需 premium / ultra 套餐）填到这里，即可代表你的账号投票。仅存本机 0600，永不回显。', apiKeyGet: '去 evomap.ai 生成 Key →', apiKeySave: '保存', apiKeyForget: '清除', apiKeySet: '已配置 •••', apiKeyNotSet: '未配置', voteUp: '赞', voteDown: '踩', voted: '已投票', voteRemoved: '已取消投票',
    valueEyebrow: 'Why EvoMap', valueTitle: 'EvoMap 给你省什么', valueMechanism: '复用别人验证过的 Gene / Capsule，跳过从零探索与试错，直接省下 token、时间和积分。命中越多越省。', valueStep1: '「集成与诊断」给 Claude Code / Cursor / Codex 集成，把召回库写入 IDE。', valueStep2: '「资产检索」按你的主题检索并 fetch 相关资产到本地召回库。', valueStep3: '重启 IDE，把下面这句贴给 agent，让它每次任务前先 recall 复用。', valuePromptLabel: '复制给你的 agent：', valuePrompt: '每次开始任务前，先读取你 IDE 全局配置里的 EvoMap RECALL.md（如 ~/.claude/evomap/RECALL.md）召回已有资产；若有匹配的策略或方案就复用并注明 asset_id，不要从零重新探索，以节省 token。需要更多时调用 http://localhost:4174/api/assets/discover?mode=semantic&q=<主题>。', copyPrompt: '复制', copied: '已复制', pubPromptLabel: '做完一个可复用的任务后，复制这句给你的 agent：', pubPrompt: '我们刚完成了一个可复用的任务，帮我发布到 EvoMap。注意发布是 bundle：要同时构造一个 Gene（可复用策略）和一个 Capsule（具体成果），按 schema 填全必填字段（Gene 需 category 枚举 / signals_match / strategy≥2步 / validation；Capsule 需 confidence / 实质内容），并为每个资产计算 asset_id（sha256，用 @evomap/gep-sdk computeAssetId，或先读 https://evomap.ai/skill-structures.md）。先 POST http://localhost:4174/api/publish/validate 校验，按返回的字段错误逐项修正到通过；把将上传内容完整展示给我确认（不含任何密钥/私有路径/敏感信息）；我确认后再 POST http://localhost:4174/api/publish/bundle 发布。',
    searchEyebrow: 'Asset retrieval', searchTitle: '检索 EvoMap 资产', searchPlaceholder: '输入主题，如 agent workflow memory ...',
    searchModeSemantic: '语义', searchModeKeyword: '关键词', searchButton: '搜索', policyButton: '免费资产',
    recallEyebrow: 'Local recall library', recallTitle: '本地召回库',
    syncRecall: '同步账号已获取资产', syncPublished: '同步我发布的', syncRecallHint: '从 EvoMap 拉取本账号历史 fetch 过的全部资产（不额外消耗积分）。', syncing: '同步中…',
    translateRecall: '翻译描述为当前语言', translating: '翻译中…', machineTranslated: '机翻',
    filterType: '类型', filterStatus: '状态', ftAll: '全部', fsSafe: '隐藏隔离(推荐)', fsPromoted: '仅 promoted（可信）', fsCandidate: '仅 candidate', fsQuarantined: '仅 quarantined', fsAll: '全部（含隔离）',
    recallHint: '这些资产已 fetch 到本地缓存。集成到 IDE 后，你的 Agent 会在会话开始时读取它们。资产内容是参考知识，不会自动执行。',
    publishEyebrow: 'Publish guidance', publishTitle: '引导 Agent 上传资产',
    pfTitle: '标题', pfType: '类型', pfSummary: '摘要', pfTags: '标签（逗号分隔）', pfContent: '内容', stageDraftButton: '生成草稿',
    integEyebrow: 'Agent integration', integTitle: '让本地 Agent 用上 EvoMap',
    integHint: '在已安装的 IDE 全局配置里写入召回库与使用指引（SKILL.md / RECALL.md / recall.json）。fetch 新资产后自动刷新。',
    diagEyebrow: 'Diagnostics', diagTitle: '诊断',
    // dynamic
    fetchAsset: '获取', recalled: '已召回', remove: '移除', publishNow: '上传', viewContent: '查看内容',
    notBound: '未绑定', registered: '已注册', bound: '已绑定', notRegistered: '未注册',
    setup: '集成', uninstall: '移除集成', integrated: '已集成', notIntegrated: '未集成', notInstalled: '未安装',
  },
  en: {
    brandTitle: 'Asset Connector',
    navOverview: 'Overview', navNode: 'Node', navSearch: 'Search', navRecall: 'Recall', navPublish: 'Publish', navIntegration: 'Integration',
    aboutLabel: 'About', aboutText: 'EvoMap Companion registers this machine as an EvoMap node, retrieves assets into a local cache so your agent can recall them, and guides confirmed uploads back to EvoMap.',
    nodeDockLabel: 'Node', dockIntegrationsLabel: 'Integrations',
    selfDockEyebrow: 'This service', selfDockTitle: 'Companion itself',
    versionLabel: 'Version', branchLabel: 'Branch', commitLabel: 'Commit', updateLabel: 'Update',
    checkSelfButton: 'Check', updateSelfButton: 'Update & restart',
    integrateEyebrow: 'Wire EvoMap into IDEs', integrateTitle: 'Integrate',
    integrateGlobalNote: 'Integration writes the recall library (RECALL.md / recall.json / SKILL.md) into the IDE global config (~/.claude, etc.) and refreshes after each fetch. Restart the IDE after changes.',
    detailModalEyebrow: 'Details', moduleEyebrow: 'Current module',
    topGapLabel: 'Open gaps', metricRecalled: 'Recalled', metricDrafts: 'Drafts', metricNode: 'Node',
    themeDay: 'Day', themeNight: 'Night',
    heroEyebrow: 'EvoMap connection status', heroTitle: 'Connect this machine to the EvoMap asset network.',
    heroText: 'Register a node → bind → search → recall locally → guide uploads. Every step needs your confirmation; credentials stay local.',
    refreshButton: 'Refresh', openPack: 'Recall Markdown',
    flowEyebrow: 'Connection flow', flowTitle: 'From registration to reusable assets',
    safetyEyebrow: 'Safety posture', safetyTitle: 'Safety boundaries',
    callsEyebrow: 'Recent activity', callsTitle: 'Recent EvoMap calls',
    nodeEyebrow: 'Node lifecycle', nodeTitle: 'Node binding',
    registerButton: 'Register node', heartbeatButton: 'Heartbeat', forgetButton: 'Forget', rebindButton: 'Re-bind',
    claimEyebrow: 'Bind your node', claimHint: 'Open the link below to bind this node to your EvoMap account, then come back and run a heartbeat.',
    multiNodeTitle: 'Can I bind multiple nodes?',
    multiNodeBody1: 'This panel manages a single node: credentials live on this machine (~/.evomap-companion), and registering a new node overwrites the current one. Claude Code / Cursor / Codex on the same machine share this one node — you usually do not need more than one.',
    multiNodeBody2: 'If you genuinely need isolated nodes (e.g. separate accounts or independent reputation), run one instance per node — each with its own credentials, recall library and port:',
    multiNodeBody3: 'Re-bind to a brand-new node: click "Forget credentials" above, then "Register node" to run the binding flow (you get a new node_id).',
    multiNodeBody4: 'Just rotate the secret of the current node (keeping the same node_id): first reset the node secret on the EvoMap account page https://evomap.ai/zh/account/agents, then come back and click "Re-bind" — it re-binds the original node with the fresh secret.',
    bindHelpTitle: 'Binding flow & common gotchas',
    bindHelpFlow: 'All three steps are required: ① Register node → ② open claim_url in a browser to bind it to your EvoMap account → ③ come back here and click "Heartbeat". Registering without binding, or binding without then clicking Heartbeat, will not flip the status to "Bound".',
    bindHelpTip1: '"Forget credentials" deletes the secret stored on this machine. After deleting it, to recover the original node you must first reset its secret on evomap.ai, then use "Re-bind"; otherwise you can only register a brand-new node. Do not click it casually.',
    bindHelpTip2: 'Do not click "Register node" repeatedly: each click creates a new node on EvoMap, and any previously unbound ones become orphan nodes. If stuck, check your network instead of re-registering.',
    bindHelpTip3: 'If register / heartbeat fails, first check whether it is a network issue (Hub temporarily unreachable). In that case do NOT click "Forget credentials" — just retry later; the credentials are usually fine.',
    bindHelpTip4: 'The secret (node_secret) lives only on this machine (chmod 0600), is never uploaded, and the UI only shows whether one exists. Never paste it into chat or screenshots.',
    bindHelpTip5: 'This tool auto-sends a heartbeat every 10 min to stay online (the Hub marks a node offline only after ~15 min of silence). As long as the service is running (pm2 recommended) the node stays online; it goes offline only if the service stops, and even then searching / fetching with the existing secret still works. Tune the interval with EVOMAP_HEARTBEAT_MS (set 0 to disable).',
    apiKeyTitle: 'EvoMap API Key (user-level actions, e.g. voting)', apiKeyHint: 'node_secret is the agent identity and cannot perform user-level actions like voting. Generate an ek_ API key in your evomap.ai account → API Keys (requires premium / ultra plan) and paste it here to vote on behalf of your account. Stored 0600 locally, never echoed.', apiKeyGet: 'Generate on evomap.ai →', apiKeySave: 'Save', apiKeyForget: 'Clear', apiKeySet: 'Configured •••', apiKeyNotSet: 'Not set', voteUp: 'Upvote', voteDown: 'Downvote', voted: 'Voted', voteRemoved: 'Vote removed',
    valueEyebrow: 'Why EvoMap', valueTitle: 'What EvoMap saves you', valueMechanism: 'Reuse a verified Gene / Capsule to skip exploration and trial-and-error — saving tokens, time and credits. The more you reuse, the more you save.', valueStep1: 'Integrate Claude Code / Cursor / Codex on the Integration page so the recall library is written into your IDE.', valueStep2: 'Search by your topic and fetch relevant assets into the local recall library.', valueStep3: 'Restart your IDE and paste the line below to your agent so it recalls first on every task.', valuePromptLabel: 'Copy to your agent:', valuePrompt: 'Before starting any task, first read the EvoMap RECALL.md in your IDE global config (e.g. ~/.claude/evomap/RECALL.md) to recall cached assets; if a matching strategy or fix exists, reuse it and cite the asset_id instead of solving from scratch, to save tokens. Need more? Call http://localhost:4174/api/assets/discover?mode=semantic&q=<topic>.', copyPrompt: 'Copy', copied: 'Copied', pubPromptLabel: 'After finishing a reusable task, copy this to your agent:', pubPrompt: 'We just finished a reusable task — help me publish it to EvoMap. Publishing is a BUNDLE: build BOTH a Gene (reusable strategy) and a Capsule (concrete outcome), fill every required field per the schema (Gene needs a category enum / signals_match / strategy with >=2 steps / validation; Capsule needs confidence / substance), and compute an asset_id for each (sha256 via @evomap/gep-sdk computeAssetId, or read https://evomap.ai/skill-structures.md first). Dry-run via POST http://localhost:4174/api/publish/validate and fix every field error it returns until it passes; show me exactly what will be uploaded (no secrets, private paths, or sensitive info); after I confirm, POST http://localhost:4174/api/publish/bundle.',
    searchEyebrow: 'Asset retrieval', searchTitle: 'Search EvoMap assets', searchPlaceholder: 'A topic, e.g. agent workflow memory ...',
    searchModeSemantic: 'Semantic', searchModeKeyword: 'Keyword', searchButton: 'Search', policyButton: 'Free assets',
    recallEyebrow: 'Local recall library', recallTitle: 'Local recall library',
    syncRecall: 'Sync owned assets', syncPublished: 'Sync my published', syncRecallHint: 'Pull every asset this account has fetched before from EvoMap (no extra credits).', syncing: 'Syncing…',
    translateRecall: 'Translate descriptions', translating: 'Translating…', machineTranslated: 'MT',
    filterType: 'Type', filterStatus: 'Status', ftAll: 'All', fsSafe: 'Hide quarantined (rec.)', fsPromoted: 'promoted only (trusted)', fsCandidate: 'candidate only', fsQuarantined: 'quarantined only', fsAll: 'All (incl. quarantined)',
    recallHint: 'These assets are fetched into the local cache. Once integrated, your agent reads them at session start. Asset content is reference knowledge; it is never auto-executed.',
    publishEyebrow: 'Publish guidance', publishTitle: 'Guide the agent to upload assets',
    pfTitle: 'Title', pfType: 'Type', pfSummary: 'Summary', pfTags: 'Tags (comma-separated)', pfContent: 'Content', stageDraftButton: 'Stage draft',
    integEyebrow: 'Agent integration', integTitle: 'Make EvoMap usable by the local agent',
    integHint: 'Write the recall library and guidance (SKILL.md / RECALL.md / recall.json) into installed IDE global configs. Auto-refreshes after each fetch.',
    diagEyebrow: 'Diagnostics', diagTitle: 'Diagnostics',
    fetchAsset: 'Fetch', recalled: 'Recalled', remove: 'Remove', publishNow: 'Upload', viewContent: 'View',
    notBound: 'Not bound', registered: 'Registered', bound: 'Bound', notRegistered: 'Not registered',
    setup: 'Integrate', uninstall: 'Remove', integrated: 'Integrated', notIntegrated: 'Not integrated', notInstalled: 'Not installed',
  },
  ja: {
    brandTitle: 'アセットコネクタ',
    navOverview: '概要', navNode: 'ノード', navSearch: '検索', navRecall: 'リコール', navPublish: '公開', navIntegration: '統合',
    aboutLabel: 'について', aboutText: 'EvoMap Companion はこのマシンを EvoMap ノードとして登録し、アセットをローカルにキャッシュしてエージェントが呼び出せるようにし、確認後に EvoMap へ公開します。',
    nodeDockLabel: 'Node', dockIntegrationsLabel: '統合',
    selfDockEyebrow: 'This service', selfDockTitle: 'Companion 本体',
    versionLabel: 'バージョン', branchLabel: 'ブランチ', commitLabel: 'コミット', updateLabel: '更新',
    checkSelfButton: '確認', updateSelfButton: '更新して再起動',
    integrateEyebrow: 'IDE に統合', integrateTitle: '統合',
    integrateGlobalNote: '統合はリコールライブラリ（RECALL.md / recall.json / SKILL.md）を IDE のグローバル設定（~/.claude など）に書き込み、fetch ごとに更新します。変更後は IDE を再起動してください。',
    detailModalEyebrow: '詳細', moduleEyebrow: '現在のモジュール',
    topGapLabel: '未対応', metricRecalled: 'リコール', metricDrafts: '下書き', metricNode: 'ノード',
    themeDay: '昼', themeNight: '夜',
    heroEyebrow: 'EvoMap 接続状態', heroTitle: 'このマシンを EvoMap アセットネットワークに接続。',
    heroText: '登録 → バインド → 検索 → ローカルリコール → 公開ガイド。各ステップに確認が必要で、認証情報はローカルに保存されます。',
    refreshButton: '更新', openPack: 'リコール Markdown',
    flowEyebrow: '接続フロー', flowTitle: '登録から再利用可能なアセットへ',
    safetyEyebrow: '安全境界', safetyTitle: '安全境界',
    callsEyebrow: '最近の活動', callsTitle: '最近の EvoMap 呼び出し',
    nodeEyebrow: 'ノードライフサイクル', nodeTitle: 'ノードバインド',
    registerButton: 'ノード登録', heartbeatButton: 'ハートビート', forgetButton: '認証情報を削除', rebindButton: '再バインド',
    claimEyebrow: 'ノードをバインド', claimHint: '下のリンクを開いてノードを EvoMap アカウントにバインドし、戻ってハートビートを実行してください。',
    multiNodeTitle: '複数のノードをバインドできますか？',
    multiNodeBody1: 'このパネルは1つのノードを管理します：認証情報は本機（~/.evomap-companion）に保存され、新しいノードを登録すると現在のノードを上書きします。同じマシンの Claude Code / Cursor / Codex はこの1つのノードを共有するため、通常は複数不要です。',
    multiNodeBody2: '分離されたノードが本当に必要な場合（別アカウント、独立した評価など）は、ノードごとに個別のインスタンスを実行します（それぞれ独自の認証情報・リコールライブラリ・ポート）：',
    multiNodeBody3: '全く新しいノードに再バインド：上の「認証情報を削除」をクリックし、「ノード登録」でバインドフローを実行します（新しい node_id になります）。',
    multiNodeBody4: '現在のノードの鍵だけを更新（同じ node_id を保持）：まず EvoMap アカウントページ https://evomap.ai/zh/account/agents でノードの鍵をリセットし、本ページに戻って「再バインド」をクリックすると、新しい鍵で元のノードに再バインドします。',
    bindHelpTitle: 'バインドの流れ & よくある落とし穴',
    bindHelpFlow: '3ステップすべてが必須：① ノード登録 → ② ブラウザで claim_url を開き EvoMap アカウントにバインド → ③ 本ページに戻って「ハートビート」をクリック。登録だけ・バインド後にハートビート未実行では、ステータスは「バインド済」になりません。',
    bindHelpTip1: '「認証情報を削除」は本機に保存された鍵を削除します。削除後に元のノードを復旧するには、まず evomap.ai でそのノードの鍵をリセットし「再バインド」を使う必要があります。そうでなければ新規ノードの登録しかできません。安易に押さないでください。',
    bindHelpTip2: '「ノード登録」を繰り返し押さないでください：押すたびに EvoMap に新しいノードが作られ、未バインドのものは孤立ノードになります。詰まったら再登録ではなくネットワークを確認してください。',
    bindHelpTip3: '登録 / ハートビートが失敗したら、まずネットワークの問題か確認（Hub が一時的に到達不能）。その場合は「認証情報を削除」せず、後で再試行してください。認証情報は通常無事です。',
    bindHelpTip4: '鍵（node_secret）は本機のみに保存（chmod 0600）、アップロードされず、UI は存在有無のみ表示します。チャットやスクショに貼らないでください。',
    bindHelpTip5: '本ツールは10分ごとに自動でハートビートを送りオンラインを維持します（Hub は約15分無音で初めてオフライン扱い）。サービス稼働中（pm2 推奨）はノードがオンラインを保ち、停止時のみオフラインになります。その場合でも既存の鍵での検索 / 取得は可能です。間隔は EVOMAP_HEARTBEAT_MS で調整（0 で無効）。',
    apiKeyTitle: 'EvoMap API Key（投票などユーザー操作）', apiKeyHint: 'node_secret はエージェント識別子で、投票などのユーザー操作はできません。evomap.ai のアカウント → API Keys で ek_ で始まる API キーを生成（premium / ultra プランが必要）し、ここに貼ると、アカウントとして投票できます。本機に0600で保存、表示しません。', apiKeyGet: 'evomap.ai で生成 →', apiKeySave: '保存', apiKeyForget: 'クリア', apiKeySet: '設定済み •••', apiKeyNotSet: '未設定', voteUp: '高評価', voteDown: '低評価', voted: '投票しました', voteRemoved: '投票を取消',
    valueEyebrow: 'Why EvoMap', valueTitle: 'EvoMap で何が省ける', valueMechanism: '検証済みの Gene / Capsule を再利用し、ゼロからの探索と試行錯誤を省く — トークン・時間・クレジットを節約。再利用するほど省ける。', valueStep1: '「統合」で Claude Code / Cursor / Codex に統合し、リコールライブラリを IDE に書き込む。', valueStep2: '「資産検索」でトピック検索し、関連資産をローカルに fetch。', valueStep3: 'IDE を再起動し、下の一文を agent に貼り、毎タスク開始時にまず recall させる。', valuePromptLabel: 'agent にコピー：', valuePrompt: 'タスク開始前に、IDE のグローバル設定内の EvoMap RECALL.md（例 ~/.claude/evomap/RECALL.md）を読み、キャッシュ済み資産を recall。一致する戦略や修正があれば asset_id を明記して再利用し、ゼロから解かずトークンを節約する。さらに必要なら http://localhost:4174/api/assets/discover?mode=semantic&q=<トピック> を呼ぶ。', copyPrompt: 'コピー', copied: 'コピーしました', pubPromptLabel: '再利用可能なタスクを終えたら、これを agent にコピー：', pubPrompt: '再利用可能なタスクが完了したので EvoMap に公開してください。公開は bundle です：Gene（再利用可能な戦略）と Capsule（具体的な成果）の両方を構築し、スキーマの必須項目を埋め（Gene は category 列挙 / signals_match / strategy 2手順以上 / validation、Capsule は confidence / 実体）、各資産の asset_id を計算（sha256、@evomap/gep-sdk computeAssetId、または https://evomap.ai/skill-structures.md を先に参照）。POST http://localhost:4174/api/publish/validate で検証し、返ってくる項目エラーを全て修正して通過させ、アップロード内容を私に確認させ（鍵・プライベートパス・機密情報なし）、確認後に POST http://localhost:4174/api/publish/bundle で公開。',
    searchEyebrow: 'アセット取得', searchTitle: 'EvoMap アセットを検索', searchPlaceholder: 'トピック例: agent workflow memory ...',
    searchModeSemantic: 'セマンティック', searchModeKeyword: 'キーワード', searchButton: '検索', policyButton: '無料アセット',
    recallEyebrow: 'ローカルリコール', recallTitle: 'ローカルリコールライブラリ',
    syncRecall: '取得済み資産を同期', syncPublished: '公開済みを同期', syncRecallHint: 'このアカウントが過去に取得した全資産を EvoMap から取得（追加クレジット不要）。', syncing: '同期中…',
    translateRecall: '説明を翻訳', translating: '翻訳中…', machineTranslated: '機械翻訳',
    filterType: 'タイプ', filterStatus: 'ステータス', ftAll: 'すべて', fsSafe: '隔離を非表示(推奨)', fsPromoted: 'promoted のみ', fsCandidate: 'candidate のみ', fsQuarantined: 'quarantined のみ', fsAll: 'すべて(隔離含む)',
    recallHint: 'これらのアセットはローカルキャッシュに取得済みです。統合後、エージェントはセッション開始時に読み込みます。内容は参考情報で自動実行されません。',
    publishEyebrow: '公開ガイド', publishTitle: 'エージェントにアセット公開を案内',
    pfTitle: 'タイトル', pfType: 'タイプ', pfSummary: '要約', pfTags: 'タグ（カンマ区切り）', pfContent: '内容', stageDraftButton: '下書き作成',
    integEyebrow: 'エージェント統合', integTitle: 'EvoMap をローカルエージェントで利用',
    integHint: 'インストール済み IDE のグローバル設定にリコールライブラリとガイド（SKILL.md / RECALL.md / recall.json）を書き込みます。fetch ごとに自動更新。',
    diagEyebrow: '診断', diagTitle: '診断',
    fetchAsset: '取得', recalled: 'リコール済', remove: '削除', publishNow: '公開', viewContent: '表示',
    notBound: '未バインド', registered: '登録済', bound: 'バインド済', notRegistered: '未登録',
    setup: '統合', uninstall: '解除', integrated: '統合済', notIntegrated: '未統合', notInstalled: '未インストール',
  },
};

let lang = localStorage.getItem('evomap.lang') || 'zh';
function t(key) { return (I18N[lang] && I18N[lang][key]) || I18N.zh[key] || key; }

function applyI18n() {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang;
  for (const el of document.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.getAttribute('data-i18n'));
  }
  for (const el of document.querySelectorAll('[data-i18n-attr]')) {
    const [attr, key] = el.getAttribute('data-i18n-attr').split(':');
    el.setAttribute(attr, t(key));
  }
  fillSearchModes();
}

// --- API helpers --------------------------------------------------------

async function getJSON(path) {
  const res = await fetch(path, { headers: { accept: 'application/json' } });
  return res.json();
}
async function postJSON(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return res.json();
}

function toast(message, kind = '') {
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.className = `toast ${kind}`;
  el.textContent = message;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 3200);
}

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// --- State --------------------------------------------------------------

let STATE = null;
let SEARCH_MODE = 'semantic';
let DRAFT_TYPE = 'Capsule';
const cachedIds = new Set();

async function refreshAll() {
  STATE = await getJSON('/api/state');
  cachedIds.clear();
  const recall = await getJSON('/api/recall?lang=' + encodeURIComponent(lang));
  (recall.assets || []).forEach((a) => cachedIds.add(a.asset_id));
  renderOverview();
  renderNode();
  renderRecall(recall);
  renderPublish();
  renderIntegration();
  renderTopStats();
}

// --- Overview -----------------------------------------------------------

function renderTopStats() {
  if (!STATE) return;
  $('topGapState').textContent = STATE.openGaps.length;
  $('recalledCount').textContent = STATE.counts.recalled;
  $('draftsCount').textContent = STATE.counts.drafts;
  $('nodeShort').textContent = STATE.binding.claimed ? t('bound') : STATE.binding.registered ? t('registered') : t('notRegistered');
  // node dock
  const dot = $('nodeStatusDot');
  dot.className = 'status-dot ' + (STATE.binding.claimed ? 'ready' : STATE.binding.registered ? 'attention' : 'missing');
  $('nodeDockState').textContent = STATE.binding.claimed ? t('bound') : STATE.binding.registered ? t('registered') : t('notRegistered');
}

function flowStage(num, key, done, active, detail) {
  const cls = done ? 'done' : active ? 'active' : 'todo';
  const flag = done ? '✓' : active ? '→' : '';
  return `<div class="stage ${cls}"><span class="stage-flag">${flag}</span><span class="step-num">0${num}</span><strong>${esc(key)}</strong><small>${esc(detail)}</small></div>`;
}

function renderOverview() {
  if (!STATE) return;
  const b = STATE.binding;
  const recalled = STATE.counts.recalled;
  const integrated = STATE.integration.platforms.some((p) => p.integrated);
  const stages = [
    flowStage(1, lang === 'zh' ? '注册节点' : 'Register', b.registered, !b.registered, b.nodeId || (lang === 'zh' ? '尚未注册' : 'not yet')),
    flowStage(2, lang === 'zh' ? '绑定账号' : 'Bind', b.claimed, b.registered && !b.claimed, b.claimed ? (lang === 'zh' ? '已绑定' : 'bound') : (lang === 'zh' ? '打开 claim_url' : 'open claim_url')),
    flowStage(3, lang === 'zh' ? '检索资产' : 'Search', recalled > 0, b.claimed && recalled === 0, lang === 'zh' ? '语义/关键词' : 'semantic/keyword'),
    flowStage(4, lang === 'zh' ? '本地召回' : 'Recall', recalled > 0, false, `${recalled} ${lang === 'zh' ? '个资产' : 'assets'}`),
    flowStage(5, lang === 'zh' ? '集成 Agent' : 'Integrate', integrated, recalled > 0 && !integrated, integrated ? (lang === 'zh' ? '已写入 IDE' : 'in IDE') : (lang === 'zh' ? '未集成' : 'none')),
  ];
  $('flowStages').innerHTML = stages.join('');

  // next actions
  const actions = [];
  if (!b.registered) actions.push(`<button class="button primary" data-action="goto" data-view="node">${t('registerButton')}</button>`);
  else if (!b.claimed) actions.push(`<button class="button primary" data-action="goto" data-view="node">${t('heartbeatButton')}</button>`);
  if (b.claimed) actions.push(`<button class="button secondary" data-action="goto" data-view="search">${t('searchTitle')}</button>`);
  if (recalled > 0 && !integrated) actions.push(`<button class="button secondary" data-action="goto" data-view="integration">${t('integTitle')}</button>`);
  $('nextActions').innerHTML = actions.join('') || `<span class="empty">${lang === 'zh' ? '一切就绪。' : 'All set.'}</span>`;

  // value stats
  const v = STATE.value || {};
  const vs = document.getElementById('valueStats');
  if (vs) {
    vs.innerHTML = [
      [v.assets || 0, lang === 'zh' ? '已召回资产' : 'cached'],
      [v.promoted || 0, lang === 'zh' ? '可信 (promoted)' : 'trusted'],
      [v.totalReuse || 0, lang === 'zh' ? '累计复用' : 'reuses'],
      [v.avgGdi || 0, lang === 'zh' ? '平均 GDI' : 'avg GDI'],
    ].map(([n, l]) => `<div class="value-stat"><span class="value-num">${esc(String(n))}</span><span class="value-label">${esc(l)}</span></div>`).join('');
  }

  // safety
  const s = STATE.safety;
  const rows = [
    { label: lang === 'zh' ? '凭据存储' : 'Credentials', status: 'ready', detail: STATE.home },
    { label: lang === 'zh' ? '自动 fetch' : 'Auto-fetch', status: s.autoFetch ? 'attention' : 'ready', detail: s.autoFetch ? 'ENABLED' : (lang === 'zh' ? '需确认' : 'confirm required') },
    { label: lang === 'zh' ? '自动上传' : 'Auto-publish', status: s.autoPublish ? 'attention' : 'ready', detail: s.autoPublish ? 'ENABLED' : (lang === 'zh' ? '需确认' : 'confirm required') },
  ];
  if (s.warnings.length) s.warnings.forEach((w) => rows.push({ label: '⚠', status: 'missing', detail: w }));
  $('safetyList').innerHTML = rows.map((r) => `<div class="audit-row"><span class="status-dot ${r.status}"></span><span class="label">${esc(r.label)}</span><span class="detail">${esc(r.detail)}</span></div>`).join('');

  // recent calls
  const calls = STATE.recentCalls || [];
  $('recentCalls').innerHTML = calls.length
    ? calls.map((c) => `<div class="timeline-row"><span class="t-action">${esc(c.action)}</span><span>${c.ok ? '✓' : '✕ ' + esc(c.error || '')}</span><span class="t-meta">${esc((c.ts || '').slice(11, 19))}</span></div>`).join('')
    : `<div class="empty">${lang === 'zh' ? '还没有调用记录。' : 'No calls yet.'}</div>`;

  // hero text
  $('heroTitle').textContent = b.claimed
    ? (lang === 'zh' ? `已绑定 · 本地召回 ${recalled} 个资产` : `Bound · ${recalled} assets recalled`)
    : t('heroTitle');
}

// --- Node ---------------------------------------------------------------

function renderNode() {
  if (!STATE) return;
  const b = STATE.binding;
  $('nodePill').textContent = b.claimed ? t('bound') : b.registered ? t('registered') : t('notRegistered');
  const facts = [
    [lang === 'zh' ? '名称' : 'Name', b.alias || '--'],
    [lang === 'zh' ? '状态' : 'Status', b.claimed ? t('bound') : b.registered ? t('registered') : t('notRegistered')],
    [lang === 'zh' ? '在线' : 'Online', (b.online === null || b.online === undefined) ? '--' : (b.online ? (lang === 'zh' ? '在线' : 'Online') : (lang === 'zh' ? '离线' : 'Offline'))],
    ['node_id', b.nodeId || '--'],
    [lang === 'zh' ? '凭据' : 'Secret', b.credentialPresent ? '••• (stored 0600)' : '--'],
    [lang === 'zh' ? '注册时间' : 'Registered', b.registeredAt || '--'],
    [lang === 'zh' ? '绑定时间' : 'Bound', b.boundAt || '--'],
    [lang === 'zh' ? '上次心跳' : 'Last heartbeat', b.lastHeartbeatAt || '--'],
    ['EvoMap', STATE.baseUrl],
  ];
  $('nodePanel').innerHTML = facts.map(([k, v]) => `<dl class="node-fact"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></dl>`).join('');
  $('registerButton').disabled = b.registered;
  $('heartbeatButton').disabled = !b.registered;
  $('forgetButton').disabled = !b.registered;
  $('rebindButton').disabled = !b.registered;
  const aks = document.getElementById('apiKeyState');
  if (aks) aks.textContent = STATE.canVote ? t('apiKeySet') : t('apiKeyNotSet');
  const akl = document.getElementById('apiKeyGetLink');
  if (akl && STATE.baseUrl) akl.href = `${STATE.baseUrl}/${lang === 'zh' ? 'zh' : 'en'}/account/api-keys`;
  const claimBox = $('claimBox');
  if (b.claimUrl && !b.claimed) {
    claimBox.hidden = false;
    const a = $('claimUrl'); a.href = b.claimUrl; a.textContent = b.claimUrl;
  } else {
    claimBox.hidden = true;
  }
}

// --- Search -------------------------------------------------------------

function assetCard(asset, { free = false } = {}) {
  const id = asset.asset_id || asset.id || '';
  const type = (asset.asset_type || asset.type || asset.payload?.type || 'unknown').toLowerCase();
  const title = asset.short_title || asset.title || asset.payload?.summary || asset.nl_summary || id;
  const summary = asset.nl_summary || asset.summary || asset.payload?.summary || '';
  const tags = (typeof asset.tags === 'string' ? asset.tags.split(',') : (asset.tags || [])).map((x) => x.trim()).filter(Boolean);
  const cached = cachedIds.has(id);
  const typeCls = type === 'gene' ? 'gene' : type === 'capsule' ? 'capsule' : 'unknown';
  return `<article class="asset-card" data-asset-id="${esc(id)}">
    <div class="asset-head">
      <span class="asset-type ${typeCls}">${esc(type)}</span>
      <h4>${esc(title)}</h4>
      ${free ? '<span class="badge-free">FREE</span>' : ''}
      ${cached ? `<span class="badge-cached">${t('recalled')}</span>` : ''}
    </div>
    ${summary ? `<p class="asset-summary">${esc(summary)}</p>` : ''}
    <div class="asset-meta">${tags.map((tg) => `<span class="asset-tag">${esc(tg)}</span>`).join('')}</div>
    <div class="asset-id">${esc(id)}</div>
    <div class="asset-foot">
      <span class="spacer"></span>
      ${(STATE && STATE.canVote) ? `<button class="button small ghost" data-action="vote-up" data-id="${esc(id)}" title="${t('voteUp')}">👍</button><button class="button small ghost" data-action="vote-down" data-id="${esc(id)}" title="${t('voteDown')}">👎</button>` : ''}
      ${cached ? `<button class="button small secondary" data-action="view" data-id="${esc(id)}">${t('viewContent')}</button>` : ''}
      <button class="button small primary" data-action="fetch" data-id="${esc(id)}" ${cached ? 'disabled' : ''}>${cached ? t('recalled') : t('fetchAsset')}</button>
    </div>
  </article>`;
}

// --- Multi-mode asset discovery (read-only endpoints) -------------------
const DISCOVERY_MODES = [
  { id: 'semantic', q: true }, { id: 'keyword', q: true }, { id: 'web', q: true, auth: true },
  { id: 'ranked' }, { id: 'graph', q: true }, { id: 'explore', q: true }, { id: 'categories' },
  { id: 'recommended', auth: true }, { id: 'daily' }, { id: 'trending' },
  { id: 'lessons' }, { id: 'signals' }, { id: 'list' }, { id: 'policy' },
];
const MODE_LABELS = {
  semantic: ['语义搜索', 'Semantic', 'セマンティック'],
  keyword: ['信号搜索', 'Signals', 'シグナル'],
  web: ['全网检索 ⭐', 'Web search ⭐', 'Web検索 ⭐'],
  ranked: ['GDI 排序', 'GDI-ranked', 'GDI順'],
  graph: ['知识图谱', 'Graph', 'グラフ'],
  explore: ['过滤探索', 'Explore', '探索'],
  categories: ['分类', 'Categories', 'カテゴリ'],
  recommended: ['个性推荐 🔒', 'Recommended 🔒', 'おすすめ 🔒'],
  daily: ['每日精选', 'Daily pick', '日次'],
  trending: ['趋势', 'Trending', 'トレンド'],
  lessons: ['精选课程', 'Lessons', 'レッスン'],
  signals: ['热门信号', 'Popular signals', '人気シグナル'],
  list: ['资产列表', 'Asset list', '資産一覧'],
  policy: ['免费起始包', 'Free starter', '無料スターター'],
};
function modeLabel(id) { const m = MODE_LABELS[id]; return m ? m[lang === 'zh' ? 0 : lang === 'ja' ? 2 : 1] : id; }
function modeSpec(id) { return DISCOVERY_MODES.find((m) => m.id === id) || {}; }
function updateSearchModeHint() {
  const s = modeSpec(SEARCH_MODE);
  const parts = [s.q ? (lang === 'zh' ? '需关键词' : 'needs query') : (lang === 'zh' ? '无需关键词' : 'no query')];
  if (s.auth) parts.push(lang === 'zh' ? '需已绑定节点 🔒' : 'needs bound node 🔒');
  const el = document.getElementById('searchModeHint');
  if (el) el.textContent = parts.join(' · ');
}
function fillSearchModes() {
  const sel = document.getElementById('searchMode');
  if (!sel) return;
  sel.innerHTML = DISCOVERY_MODES.map((m) => `<option value="${m.id}">${esc(modeLabel(m.id))}</option>`).join('');
  sel.value = SEARCH_MODE;
  updateSearchModeHint();
}

async function runDiscover() {
  const mode = SEARCH_MODE;
  const spec = modeSpec(mode);
  const query = $('searchInput').value.trim();
  if (spec.q && !query) { $('searchMessage').textContent = lang === 'zh' ? '该模式需要输入关键词。' : 'This mode needs a query.'; return; }
  $('searchMessage').textContent = lang === 'zh' ? '检索中…' : 'Querying…';
  const o = await getJSON(`/api/assets/discover?mode=${encodeURIComponent(mode)}&q=${encodeURIComponent(query)}&limit=12`);
  $('searchMessage').textContent = o.ok
    ? `✅ ${modeLabel(mode)} · ${o.endpoint} · HTTP ${o.status} · ${o.count} ${lang === 'zh' ? '条' : 'rows'}`
    : `⛔ ${modeLabel(mode)} · ${o.endpoint || ''} · HTTP ${o.status || '-'} · ${o.error || (lang === 'zh' ? '失败' : 'failed')}${o.hint ? ' — ' + o.hint : ''}`;
  const assets = (o.assets || []).filter((a) => a && (a.asset_id || a.id));
  const cards = assets.length
    ? assets.map((a) => assetCard(a)).join('')
    : `<div class="empty">${lang === 'zh' ? '无资产卡片（见下方原始响应）' : 'No asset cards — see raw below'}</div>`;
  const raw = `<details class="guide-box"><summary>${lang === 'zh' ? '原始响应' : 'Raw response'}</summary><pre><code>${esc(JSON.stringify(o.raw || {}, null, 2).slice(0, 4000))}</code></pre></details>`;
  $('searchResults').innerHTML = cards + raw;
}

async function fetchAsset(id) {
  if (!STATE.binding.claimed) { toast(lang === 'zh' ? '请先绑定节点再 fetch。' : 'Bind a node before fetching.', 'error'); return; }
  toast(lang === 'zh' ? '获取中…' : 'Fetching…');
  const out = await postJSON('/api/assets/fetch', { asset_ids: [id] });
  if (out.ok && out.count > 0) { toast(`${t('recalled')}: ${out.count}`, 'ok'); refreshAll(); }
  else toast(`${lang === 'zh' ? '获取失败' : 'Fetch failed'}: ${out.error || ''}`, 'error');
}

// --- Recall -------------------------------------------------------------

let RECALL_ASSETS = [];
const RECALL_FILTER = { type: '', status: 'safe' };

function statusColor(status) {
  return status === 'promoted' ? '#3fb950' : status === 'quarantined' ? '#f85149' : status === 'candidate' ? '#d29922' : '#8b949e';
}

function applyRecallFilter(assets) {
  return assets.filter((a) => {
    if (RECALL_FILTER.type && (a.type || '') !== RECALL_FILTER.type) return false;
    const st = a.status || 'unknown';
    if (RECALL_FILTER.status === 'safe') return st !== 'quarantined';
    if (RECALL_FILTER.status) return st === RECALL_FILTER.status;
    return true;
  });
}

function renderRecall(recall) {
  if (recall) RECALL_ASSETS = (recall.assets) || [];
  const total = RECALL_ASSETS.length;
  const assets = applyRecallFilter(RECALL_ASSETS);
  $('recallPill').textContent = assets.length === total ? `${total}` : `${assets.length}/${total}`;
  $('recallList').innerHTML = assets.length
    ? assets.map((a) => {
      const typeCls = (a.type || '').toLowerCase() === 'gene' ? 'gene' : (a.type || '').toLowerCase() === 'capsule' ? 'capsule' : 'unknown';
      const st = a.status || 'unknown';
      const stBadge = `<span style="font-size:.7rem;font-weight:600;color:${statusColor(st)}">● ${esc(st)}</span>`;
      const gdi = typeof a.gdi_score === 'number' ? ` <small style="opacity:.5;font-weight:400">GDI ${a.gdi_score.toFixed(0)}</small>` : '';
      return `<article class="asset-card" data-asset-id="${esc(a.asset_id)}">
        <div class="asset-head"><span class="asset-type ${typeCls}">${esc(a.type)}</span>${stBadge}${gdi}<h4>${esc(a.title)}${a.translated ? ` <small style="opacity:.55;font-weight:400">· ${t('machineTranslated')}</small>` : ''}</h4></div>
        ${a.summary ? `<p class="asset-summary">${esc(a.summary)}</p>` : ''}
        <div class="asset-meta">${(a.tags || []).map((tg) => `<span class="asset-tag">${esc(tg)}</span>`).join('')}</div>
        <div class="asset-id">${esc(a.asset_id)}</div>
        <div class="asset-foot"><span class="spacer"></span>
          <button class="button small secondary" data-action="view" data-id="${esc(a.asset_id)}">${t('viewContent')}</button>
          <button class="button small ghost" data-action="remove" data-id="${esc(a.asset_id)}">${t('remove')}</button>
        </div>
      </article>`;
    }).join('')
    : `<div class="empty">${lang === 'zh' ? '召回库为空。去「资产检索」fetch 一些资产。' : 'Empty. Fetch some assets from Search.'}</div>`;
}

// Cache of assets surfaced via related/chain so a click can open them without
// a recall-library lookup (they may not be fetched locally).
const INSIGHT_CACHE = {};
function normMeta(m) {
  if (!m) return null;
  return {
    asset_id: m.asset_id || m.id,
    title: m.title || m.short_title || m.asset_id || m.id,
    summary: m.summary || m.nl_summary || '',
    type: m.type || m.asset_type || '',
    tags: m.tags || [],
    chain_id: m.chain_id || null,
  };
}

async function viewAsset(id, preMeta) {
  let meta = normMeta(preMeta);
  if (!meta) {
    const cache = await getJSON('/api/recall?lang=' + encodeURIComponent(lang));
    meta = normMeta((cache.assets || []).find((a) => a.asset_id === id));
  }
  const aid = (meta && meta.asset_id) || id;
  $('detailModalTitle').textContent = meta ? meta.title : id;
  const head = meta
    ? `<p class="asset-summary">${esc(meta.summary || '')}</p><div class="asset-meta">${(meta.tags || []).map((tg) => `<span class="asset-tag">${esc(tg)}</span>`).join('')}</div><div class="asset-id">${esc(meta.type)} · ${esc(aid)}</div>`
    : `<div class="asset-id">${esc(aid)}</div>`;
  $('detailModalBody').innerHTML = head + `<p class="dock-message" id="insightsLoading">${lang === 'zh' ? '加载关联资产与谱系…' : 'Loading related assets & lineage…'}</p>`;
  openModal('detailModal');
  const chainQ = meta && meta.chain_id ? `&chain=${encodeURIComponent(meta.chain_id)}` : '';
  const ins = await getJSON(`/api/assets/insights?id=${encodeURIComponent(aid)}${chainQ}`);
  const loading = document.getElementById('insightsLoading');
  if (!ins.ok) { if (loading) loading.textContent = (lang === 'zh' ? '关联/谱系不可用：' : 'Related/lineage unavailable: ') + (ins.hint || ins.error || ''); return; }
  const assetLink = (a) => {
    const rid = a.asset_id || a.id;
    if (!rid) return '';
    INSIGHT_CACHE[rid] = a;
    return `<a href="#" class="related-line" data-action="view-related" data-id="${esc(rid)}">${esc(`${a.asset_type || a.type || ''} · ${a.short_title || a.title || rid}`)}</a>`;
  };
  const eventLine = (e) => `<div class="asset-id" style="margin:4px 0;opacity:.8">${esc(`${e.event_type || e.type || e.action || 'event'} · ${e.created_at || e.timestamp || e.at || ''}`)}</div>`;
  const section = (title, html) => html ? `<h4 style="margin:14px 0 6px;font-size:.9rem">${title}</h4>${html}` : '';
  const related = section(lang === 'zh' ? `相关资产 (${ins.related.length})` : `Related (${ins.related.length})`, ins.related.map(assetLink).join(''));
  const chain = section(lang === 'zh' ? `谱系链 (${ins.chain.length})` : `Chain (${ins.chain.length})`, ins.chain.map(assetLink).join(''));
  const timeline = section(lang === 'zh' ? `演化时间线 (${ins.timeline.length})` : `Timeline (${ins.timeline.length})`, ins.timeline.map(eventLine).join(''));
  const body = related + chain + timeline;
  $('detailModalBody').innerHTML = head + (body || `<p class="dock-message">${lang === 'zh' ? '无关联资产或谱系记录。' : 'No related assets or lineage.'}</p>`);
}
function viewRelated(id) { viewAsset(id, INSIGHT_CACHE[id]); }

async function voteOnAsset(id, dir) {
  const o = await postJSON('/api/assets/vote', { asset_id: id, vote: dir });
  if (o.ok) toast(`${t('voted')} ${dir === 'up' ? '👍' : '👎'}`, 'ok');
  else toast(o.hint || o.error || 'error', 'error');
}

async function removeAsset(id) {
  await postJSON('/api/recall/remove', { asset_id: id });
  toast(t('remove'), 'ok');
  refreshAll();
}

// --- Publish ------------------------------------------------------------

async function renderPublish() {
  const guide = await getJSON('/api/publish/guide');
  $('publishPill').textContent = guide.canPublish ? (lang === 'zh' ? '可上传' : 'ready') : (lang === 'zh' ? '需绑定' : 'bind first');
  $('publishGuidance').textContent = guide.guidanceForAgent;
  $('publishSteps').innerHTML = (guide.steps || []).map((s, i) => `<div class="step"><b>0${i + 1}</b><span>${esc(s)}</span></div>`).join('');
  const drafts = guide.drafts || [];
  $('draftList').innerHTML = drafts.length
    ? drafts.map((d) => {
      const typeCls = (d.type || '').toLowerCase() === 'gene' ? 'gene' : 'capsule';
      return `<article class="draft-card">
        <div class="draft-head"><span class="asset-type ${typeCls}">${esc(d.type)}</span><h4>${esc(d.title)}</h4>
          <button class="button small primary" data-action="publish" data-id="${esc(d.id)}" ${guide.canPublish ? '' : 'disabled'}>${t('publishNow')}</button></div>
        ${d.summary ? `<p class="asset-summary">${esc(d.summary)}</p>` : ''}
        <div class="asset-meta">${(d.tags || []).map((tg) => `<span class="asset-tag">${esc(tg)}</span>`).join('')}</div>
      </article>`;
    }).join('')
    : `<div class="empty">${lang === 'zh' ? '还没有草稿。' : 'No drafts yet.'}</div>`;
}

async function stageDraft(e) {
  e.preventDefault();
  const body = {
    title: $('pfTitle').value.trim(),
    type: DRAFT_TYPE,
    summary: $('pfSummary').value.trim(),
    tags: $('pfTags').value.split(',').map((x) => x.trim()).filter(Boolean),
    content: $('pfContent').value.trim(),
  };
  if (!body.title || !body.content) { toast(lang === 'zh' ? '标题和内容必填。' : 'Title and content required.', 'error'); return; }
  const out = await postJSON('/api/publish/draft', body);
  if (out.ok) { toast(lang === 'zh' ? '草稿已生成。确认后上传。' : 'Draft staged. Confirm to upload.', 'ok'); $('publishForm').reset(); renderPublish(); }
  else toast(out.error || 'error', 'error');
}

async function publishDraft(id) {
  if (!confirm(lang === 'zh' ? '确认把这个草稿上传到 EvoMap？' : 'Upload this draft to EvoMap?')) return;
  const out = await postJSON('/api/publish', { draftId: id });
  if (out.ok) { toast(lang === 'zh' ? '已上传。' : 'Uploaded.', 'ok'); renderPublish(); }
  else toast(`${lang === 'zh' ? '上传失败' : 'Upload failed'}: ${out.error || ''}`, 'error');
}

// --- Integration --------------------------------------------------------

function renderIntegration() {
  if (!STATE) return;
  const platforms = STATE.integration.platforms;
  // dock chips
  $('dockIntegrations').innerHTML = platforms.map((p) => `<span class="dock-chip"><span class="status-dot ${p.integrated ? 'ready' : p.detected ? 'attention' : 'missing'}"></span>${esc(p.name)}</span>`).join('');
  // cards
  $('integrateCards').innerHTML = platforms.map((p) => {
    const state = !p.detected ? t('notInstalled') : p.integrated ? t('integrated') : t('notIntegrated');
    const dot = p.integrated ? 'ready' : p.detected ? 'attention' : 'missing';
    return `<div class="integrate-card">
      <div class="ic-head"><span class="status-dot ${dot}"></span><h4>${esc(p.name)}</h4></div>
      <div class="ic-state">${state} · ~/${esc(p.dir)}/evomap</div>
      <div class="node-actions">
        <button class="button small primary" data-action="integrate" data-platform="${esc(p.id)}" ${p.detected ? '' : 'disabled'}>${t('setup')}</button>
        ${p.integrated ? `<button class="button small ghost" data-action="unintegrate" data-platform="${esc(p.id)}">${t('uninstall')}</button>` : ''}
      </div>
    </div>`;
  }).join('');
  // also mirror into the modal integrate panel
  $('integratePanel').innerHTML = platforms.map((p) => `<div class="integrate-row"><span class="status-dot ${p.integrated ? 'ready' : p.detected ? 'attention' : 'missing'}"></span><span class="integrate-name">${esc(p.name)}</span><span class="integrate-state">${p.integrated ? t('integrated') : p.detected ? t('notIntegrated') : t('notInstalled')}</span><button class="button small primary" data-action="integrate" data-platform="${esc(p.id)}" ${p.detected ? '' : 'disabled'}>${t('setup')}</button></div>`).join('');
  // diagnostics
  $('diagFacts').innerHTML = [
    ['EvoMap', STATE.baseUrl], ['Home', STATE.home],
    [lang === 'zh' ? '已召回' : 'Recalled', STATE.counts.recalled],
    [lang === 'zh' ? '草稿' : 'Drafts', STATE.counts.drafts],
    [lang === 'zh' ? '待处理' : 'Open gaps', STATE.openGaps.join(', ') || '—'],
  ].map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
}

async function integrate(platform) {
  toast(lang === 'zh' ? '写入中…' : 'Writing…');
  const out = await postJSON(`/api/integrate/setup?platform=${platform}`);
  if (out.ok) { toast(`${t('integrated')}: ${platform} (${out.assetCount})`, 'ok'); refreshAll(); }
  else toast(out.error || 'error', 'error');
}
async function unintegrate(platform) {
  const out = await postJSON(`/api/integrate/uninstall?platform=${platform}`);
  if (out.ok) { toast(t('uninstall'), 'ok'); refreshAll(); }
  else toast(out.error || 'error', 'error');
}

// --- Self update --------------------------------------------------------

async function loadSelf() {
  const s = await getJSON('/api/self/status');
  $('selfVersionDetail').textContent = s.version || '--';
  $('selfBranch').textContent = s.branch || '--';
  $('selfCommit').textContent = s.lastCommit?.shortHash || '--';
  $('selfUpdateState').textContent = s.status || '--';
}

// --- View routing -------------------------------------------------------

function setView(view) {
  for (const el of document.querySelectorAll('[data-view-section]')) {
    el.classList.toggle('view-active', el.getAttribute('data-view-section') === view);
  }
  for (const el of document.querySelectorAll('.nav-item')) {
    el.classList.toggle('active', el.getAttribute('data-view-target') === view);
  }
  $('currentModuleTitle').textContent = t('nav' + view.charAt(0).toUpperCase() + view.slice(1));
  const hints = {
    overview: lang === 'zh' ? '连接状态与下一步' : 'Connection status & next steps',
    node: lang === 'zh' ? '注册、绑定、心跳' : 'Register, bind, heartbeat',
    search: lang === 'zh' ? '语义/关键词检索资产' : 'Semantic / keyword asset search',
    recall: lang === 'zh' ? '本地缓存的资产' : 'Locally cached assets',
    publish: lang === 'zh' ? '引导上传经验资产' : 'Guide uploads',
    integration: lang === 'zh' ? '写入 IDE 并诊断' : 'Wire into IDEs & diagnose',
  };
  $('currentModuleHint').textContent = hints[view] || '';
  location.hash = view;
}

// --- Modals -------------------------------------------------------------

function openModal(id) { $(id).classList.add('open'); $(id).setAttribute('aria-hidden', 'false'); }
function closeModal(id) { $(id).classList.remove('open'); $(id).setAttribute('aria-hidden', 'true'); }

// --- Wiring -------------------------------------------------------------

function wire() {
  // theme
  const savedTheme = localStorage.getItem('evomap.theme') || 'day';
  document.documentElement.setAttribute('data-theme', savedTheme);
  document.querySelectorAll('[data-theme-choice]').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-theme-choice') === savedTheme);
    btn.addEventListener('click', () => {
      const choice = btn.getAttribute('data-theme-choice');
      document.documentElement.setAttribute('data-theme', choice);
      localStorage.setItem('evomap.theme', choice);
      document.querySelectorAll('[data-theme-choice]').forEach((b) => b.classList.toggle('active', b === btn));
    });
  });
  // lang
  document.querySelectorAll('[data-lang-choice]').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-lang-choice') === lang);
    btn.addEventListener('click', () => {
      lang = btn.getAttribute('data-lang-choice');
      localStorage.setItem('evomap.lang', lang);
      document.querySelectorAll('[data-lang-choice]').forEach((b) => b.classList.toggle('active', b === btn));
      applyI18n();
      setView(location.hash.slice(1) || 'overview');
      refreshAll();
      loadSelf();
    });
  });
  // nav
  document.querySelectorAll('.nav-item').forEach((a) => {
    a.addEventListener('click', (e) => { e.preventDefault(); setView(a.getAttribute('data-view-target')); });
  });
  // search (multi-mode discovery)
  $('searchMode').addEventListener('change', (e) => { SEARCH_MODE = e.target.value; updateSearchModeHint(); });
  $('searchForm').addEventListener('submit', (e) => { e.preventDefault(); runDiscover(); });
  // publish type
  document.querySelectorAll('[data-asset-type]').forEach((btn) => {
    btn.addEventListener('click', () => {
      DRAFT_TYPE = btn.getAttribute('data-asset-type');
      document.querySelectorAll('[data-asset-type]').forEach((b) => b.classList.toggle('active', b === btn));
    });
  });
  $('publishForm').addEventListener('submit', stageDraft);
  // node actions
  $('registerButton').addEventListener('click', async () => { const o = await postJSON('/api/node/register'); if (o.ok) { toast(lang === 'zh' ? '已注册，请打开 claim_url 绑定。' : 'Registered. Open claim_url to bind.', 'ok'); } else { toast(o.error || 'error', 'error'); } refreshAll(); });
  $('heartbeatButton').addEventListener('click', async () => { const o = await postJSON('/api/node/heartbeat'); if (o.ok) { toast(o.claimed ? (lang === 'zh' ? '已绑定！' : 'Bound!') : (lang === 'zh' ? '尚未绑定，请先打开 claim_url。' : 'Not bound yet — open claim_url.'), o.claimed ? 'ok' : 'error'); } else { toast(o.error || 'error', 'error'); } refreshAll(); });
  $('forgetButton').addEventListener('click', async () => { if (!confirm(lang === 'zh' ? '忘记本地凭据？' : 'Forget local credentials?')) return; await postJSON('/api/node/forget'); toast(t('forgetButton'), 'ok'); refreshAll(); });
  $('apiKeySaveButton').addEventListener('click', async () => { const k = $('apiKeyInput').value.trim(); if (!k) { toast(lang === 'zh' ? '请输入 API Key' : 'Enter an API key', 'error'); return; } const o = await postJSON('/api/apikey', { api_key: k }); if (o.ok) { $('apiKeyInput').value = ''; toast(t('apiKeySet'), 'ok'); } else { toast(o.error || 'error', 'error'); } refreshAll(); });
  $('apiKeyForgetButton').addEventListener('click', async () => { if (!confirm(lang === 'zh' ? '清除 API Key？' : 'Clear API key?')) return; await postJSON('/api/apikey/forget'); toast(t('apiKeyForget'), 'ok'); refreshAll(); });
  $('rebindButton').addEventListener('click', async () => { if (!confirm(lang === 'zh' ? '确认已在 evomap.ai 账户页重置了该节点密钥？将用新密钥重新绑定当前节点（保留同一 node_id）。' : 'Have you reset this node secret on the evomap.ai account page? This re-binds the current node with a fresh secret.')) return; const o = await postJSON('/api/node/rebind'); if (o.ok) { toast(lang === 'zh' ? (o.claimed ? '已重新绑定！' : '已轮换密钥，请打开 claim_url 完成绑定。') : (o.claimed ? 'Re-bound!' : 'Secret rotated — open claim_url to finish.'), 'ok'); } else { toast(o.hint || o.error || 'error', 'error'); } refreshAll(); });
  // sync account-owned (purchased) assets into the local recall library
  $('syncRecallButton').addEventListener('click', async () => { const btn = $('syncRecallButton'); const label = btn.textContent; btn.disabled = true; btn.textContent = t('syncing'); const o = await postJSON('/api/recall/sync'); btn.disabled = false; btn.textContent = label; if (o.ok) { toast(lang === 'zh' ? `已同步 ${o.recalled} 个资产` : `Synced ${o.recalled} assets`, 'ok'); } else { toast(o.error || 'error', 'error'); } refreshAll(); });
  $('syncPublishedButton').addEventListener('click', async () => { const btn = $('syncPublishedButton'); const label = btn.textContent; btn.disabled = true; btn.textContent = t('syncing'); const o = await postJSON('/api/recall/sync-published'); btn.disabled = false; btn.textContent = label; if (o.ok) { toast(lang === 'zh' ? `已同步 ${o.recalled} 个我发布的资产` : `Synced ${o.recalled} published assets`, 'ok'); } else { toast(o.error || 'error', 'error'); } refreshAll(); });
  // translate recall-library descriptions into the current UI language (free MT, cached)
  $('translateRecallButton').addEventListener('click', async () => { if (lang === 'en') { toast('English source — nothing to translate', 'ok'); return; } const btn = $('translateRecallButton'); const label = btn.textContent; btn.disabled = true; btn.textContent = t('translating'); const o = await postJSON('/api/recall/translate', { lang }); btn.disabled = false; btn.textContent = label; if (o.ok && !o.skipped) { toast(lang === 'zh' ? `已翻译 ${o.translated} 条，失败 ${o.failed}` : `Translated ${o.translated}, failed ${o.failed}`, o.failed ? 'attention' : 'ok'); } else { toast(o.hint || (o.error || 'error'), o.ok ? 'ok' : 'error'); } refreshAll(); });
  // recall library filters (type / lifecycle status) — pure client-side, no refetch
  $('recallTypeFilter').addEventListener('change', (e) => { RECALL_FILTER.type = e.target.value; renderRecall(); });
  $('recallStatusFilter').addEventListener('change', (e) => { RECALL_FILTER.status = e.target.value; renderRecall(); });
  // refresh
  $('refreshButton').addEventListener('click', () => { refreshAll(); loadSelf(); });
  $('copyPromptButton').addEventListener('click', () => { const txt = (document.getElementById('valuePromptText') || {}).textContent || ''; if (navigator.clipboard) { navigator.clipboard.writeText(txt).then(() => toast(t('copied'), 'ok')).catch(() => toast('copy failed', 'error')); } else { toast(txt, ''); } });
  $('copyPubPromptButton').addEventListener('click', () => { const txt = (document.getElementById('pubPromptText') || {}).textContent || ''; if (navigator.clipboard) { navigator.clipboard.writeText(txt).then(() => toast(t('copied'), 'ok')).catch(() => toast('copy failed', 'error')); } else { toast(txt, ''); } });
  // self update
  $('checkSelfButton').addEventListener('click', async () => { const s = await getJSON('/api/self/check'); $('selfUpdateState').textContent = s.updateAvailable ? `behind ${s.behind}` : s.status; toast(s.updateAvailable ? `behind ${s.behind}` : (lang === 'zh' ? '已是最新' : 'up to date')); });
  $('updateSelfButton').addEventListener('click', async () => { const o = await postJSON('/api/self/update-restart'); toast(o.restartHint || o.reason || (o.ok ? 'ok' : 'error'), o.ok ? 'ok' : 'error'); });
  // node dock toggle -> open service modal
  $('nodeDockToggle').addEventListener('click', () => { loadSelf(); openModal('serviceModal'); });
  $('dockIntegrations').addEventListener('click', () => { loadSelf(); openModal('serviceModal'); });
  $('serviceModalClose').addEventListener('click', () => closeModal('serviceModal'));
  $('detailModalClose').addEventListener('click', () => closeModal('detailModal'));
  document.querySelectorAll('.modal-backdrop').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m) closeModal(m.id); }));

  // event delegation for dynamic buttons
  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');
    if (action === 'fetch') fetchAsset(id);
    else if (action === 'view') viewAsset(id);
    else if (action === 'view-related') { e.preventDefault(); viewRelated(id); }
    else if (action === 'vote-up') voteOnAsset(id, 'up');
    else if (action === 'vote-down') voteOnAsset(id, 'down');
    else if (action === 'remove') removeAsset(id);
    else if (action === 'publish') publishDraft(id);
    else if (action === 'integrate') integrate(btn.getAttribute('data-platform'));
    else if (action === 'unintegrate') unintegrate(btn.getAttribute('data-platform'));
    else if (action === 'goto') setView(btn.getAttribute('data-view'));
  });

  // SSE
  try {
    const es = new EventSource('/api/stream');
    const onChange = () => { refreshAll(); };
    ['change', 'node', 'recall', 'integrate', 'draft', 'config'].forEach((ev) => es.addEventListener(ev, onChange));
    es.onerror = () => { /* EventSource auto-reconnects */ };
  } catch (error) { /* SSE unsupported; manual refresh still works */ }
}

// --- Boot ---------------------------------------------------------------

applyI18n();
wire();
setView(location.hash.slice(1) || 'overview');
refreshAll();
loadSelf();
