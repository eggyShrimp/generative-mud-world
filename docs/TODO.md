# 待实现计划

## 1. 对话知识沉淀机制

**状态**: 待实现  
**优先级**: 高  
**背景**: 对话中 NPC 分享的世界信息（lore、传说、历史事件）目前在对话结束后全部丢失。

### 现状 (2026-06 同步)

- `share_information` 工具生成的 `information` 事件写入 `SimulationDelta.woldEvents`，但 `memory.ts` 的 `createTalkMemories()` 只创建单条截断对话记忆，不遍历 `worldEvents` 生成独立 lore 记忆
- NPC 对话记忆截断到 60 字符（`memory.ts:239`），玩家侧对话记忆不含内容
- `spreadChance` **已从 `dialogueEffectMapping` 正确读取并写入 `worldEvent.data`**（`dialogue-generator.ts:383`），但无传播代码消费该值
- `memoryImportance` 存在于 `worldEvent.data` 中，但 `memory.ts` 使用硬编码 importance（NPC 0.5 / 玩家 0.4），不使用事件携带的 importance
- ContentPool 无 `worldKnowledge` / `loreEntries` 字段

### 需要实现

- [ ] `share_information` 事件转为实体记忆（NPC + 玩家），使用 `memoryImportance` 设置记忆优先级
- [ ] 对话记忆保留实质内容（不再截断为 60 字符）
- [ ] ContentPool 新增 `worldKnowledge` / `loreEntries` 字段
- [ ] 信息传播机制：消费 `worldEvent.data.spreadChance`，将信息传播给同一区域的其他 NPC
- [ ] 记忆检索：NPC 后续对话中可以引用已知的 lore

### 涉及文件

- `src/core/memory.ts` — `createTalkMemories()` / `createMemoriesForAction()`
- `src/simulation/social-ripple.ts` — 信息传播逻辑
- `src/core/types.ts` — ContentPool 接口扩展
- `src/llm/dialogue-generator.ts` — prompt 中注入已知 lore

## 2. 场景交互系统

**状态**: 待实现（tag 路由已有，缺 roomType/facilities 模型）  
**优先级**: 高  
**背景**: Room 没有功能分类，玩家无法进行场景特有的交互（矿场挖矿、酒馆吃饭、神殿祈祷等）。

### 现状 (2026-06 同步)

- Room 接口有 `tags: string[]`，无 `roomType` / `facilities` 字段
- `command-executor.ts:998` 的 `executeRoomAction()` 已支持通过 `contentPool.entityActionsByTag` 匹配 tag → 执行房间动作（tag 路由层已存在）
- `capability-provider.ts` 只根据 exit、NPC、物品存在决定可用操作，不检查房间功能
- `command-executor.ts` 的 `use` 命令只作用于背包物品，无法"使用"房间设施
- NPC 通过 schedule 有 12+ 个场景交互，玩家无对应

### 需要实现

- [ ] Room 接口扩展：新增 `roomType` / `facilities` 字段（如 tavern / smithy / mine / temple）
- [ ] ContentPool 新增 `roomInteractionDefinitions`：按 roomType 定义可用交互及其效果
- [ ] `capability-provider` 扩展：根据 roomType + facilities 向玩家暴露场景交互
- [ ] `command-executor` 新增场景交互 handler（挖矿、吃饭、祈祷、交易等）
- [ ] look 命令优化：功能型场景需要在首选输出中呈现其特征

### 涉及文件

- `src/core/types.ts` — Room 接口扩展
- `src/core/schemas/` — Room schema 扩展（创建）
- `src/engine/capability-provider.ts` — 场景交互暴露逻辑
- `src/engine/command-executor.ts` — 新增交互 handler
- `src/engine/command-registry.ts` — 注册新的玩家合法 action
- `src/llm/prompts/` — look 命令 prompt 模板（创建）

## 3. 任务系统

**状态**: 基本完成（类型/引擎/TUI/materializer 已落地，exit resolver 缺失）
**优先级**: 中  
**背景**: 无任务/任务日志/目标追踪机制。当前设计文档明确将任务系统排除在 MVP 之外。

### 已实现 (2026-06)

- [x] 任务类型定义：`QuestObjective` / `QuestReward` / `QuestTemplate` / `ActiveQuest` / `StorylineState`（`core/types.ts:257-354`）
- [x] 任务模板数据结构：ContentPool `questTemplates` + schema（`schemas/content-pool.ts:144-230`）+ YAML 数据（`worlds/content-pool/quests.yaml`）
- [x] 任务引擎：`src/engine/quest-tracker.ts`（548 行）— 接受/进度/完成/失败全生命周期
- [x] 故事线引擎：`src/simulation/storyline-engine.ts`
- [x] 任务日志 TUI：`app.tsx:1495` `QuestPanel` — 列表/详情/追踪/放弃；`app.tsx:569` `QUEST_NOTIFICATION_LAYER` — 完成/接受弹窗
- [x] `SimulationDelta` 管道已支持 `questChanges[]` / `activeQuests`
- [x] `addQuestTemplates` mutation 运行时 handler 已接入 `content-pool-materializer.ts`，并可通过 `writeEvolveDeltas()` 写回 `quests.yaml`

### 待实现

- [ ] exit condition `quest` resolver 实际逻辑：schema 已定义 `quest` 类型（`schemas/exit.ts:4`），但 `command-executor.ts:270` 的 `checkExitConditions()` 有 `TODO` 未实现

### 涉及文件

- `src/core/types.ts` — Quest 类型定义 + SimulationDelta 扩展
- `src/core/world.ts` — `applyDelta()` 处理任务相关 delta
- `src/engine/quest-tracker.ts` — 任务生命周期引擎
- `src/simulation/storyline-engine.ts` — 故事线引擎
- `src/engine/command-executor.ts` — exit condition resolver + 任务指令
- `src/engine/act-loop.ts` — 任务进度检查钩子
- `src/client-tui/app.tsx` — QuestPanel / QuestNotificationLayer
- `src/core/schemas/exit.ts` — quest condition resolver

## 4. 地图与方向可见性

**状态**: 已完成  
**优先级**: 高  
**背景**: 出口信息不含目标房间名称，玩家在 TUI 中只能看到"东 · 密林 · 3格"，不知道该方向通往何处。

### 已实现 (2026-06)

- [x] 协议扩展：`RoomInfo.exits` 新增 `destinationName?: string`（`shared/protocol.ts:70`）
- [x] 服务器端：`ws-server.ts:255` 填充 `destinationName`（已探索房间显示名称，未探索为 `undefined`）
- [x] TUI 渲染：`ExitList`（`app.tsx:342`）调用 `formatExitMeta()` 显示 `→ ${destinationName}` 格式
- [x] 小地图详情面板（`app.tsx:802`）同步显示 `destinationName`

### 待实现（未来迭代）

- [ ] 运行时房间图数据结构 + pathfinding + 小地图（grid 坐标在加载后丢弃）
- [ ] `exit.description` 发送到客户端用于悬浮/详情显示

### 涉及文件

- `src/shared/protocol.ts` — `RoomInfo` 类型扩展
- `src/server/ws-server.ts` — 出口数据组装（`state_update` 生成处）
- `src/client-tui/app.tsx` — `ExitList` + `formatExitMeta`

## 5. LLM 演化自由度：职业与文化创建

**状态**: 部分推进（mutation/materializer/write-back 已补一批，文化/职业模型仍未落地）
**优先级**: 高  
**背景**: LLM 需要通过 ContentPool 演化创建全新的职业和文化，但当前 mutation 路径存在 10 个缺口，导致创建出来的职业/文化是"浅层"的（只是名字+时间表，无法融入其他子系统）。

### 现状：LLM 当前能做什么

LLM 通过 6 个工具调用（`src/llm/tools/content-pool-evolve.ts`）可以：
- **新职业** → 新增 `RoleScheduleTemplate`（role + 每日时间表），例如 `role: "samurai"`, `schedule: [7-12 训练, 12-18 巡逻]`
- **新文化** → 新增 `NamePool`（命名规则 + 姓氏/名字库）+ `RoomTemplatePool`（场景模板 + NPC 姓名池 + 性格池）

### 已有 mutation 路径 (2026-06 同步)

| Mutation 字段 | 运行时 materializer | LLM prompt | 说明 |
|---|---|---|---|
| `addNeedDefinitions` | ❌ (离线专用) | ❌ | Need 是引擎概念，LLM 不应新增 |
| `addActionEffects` | ✅ | ❌ | |
| `addScheduleTemplates` | ✅ | ❌ | |
| `addNamePools` | ✅ | ✅ | |
| `addRoomTemplates` | ✅ | ✅ | |
| `addQuestTemplates` | ✅ | ❌ | 运行时 handler 已补；content_pool_evolve prompt 未暴露 |
| `addCombatSkills` | ✅ | ❌ | |
| `replaceNarrativeTemplates` | ✅ | ✅ | |
| `replaceCalendar` | ✅ | ✅ | |
| `replaceNeedLabels` | ✅ | ✅ | |
| `replaceTraitLabels` | ✅ | ✅ | |
| `replaceItemPropertyLabels` | ✅ | ✅ | |
| `replaceCombatConfig` | ✅ | ❌ | |
| `replaceEntityActionsByTag` | ✅ | ❌ | 运行时 handler 已补；content_pool_evolve prompt 未暴露 |
| `replaceEntityActionLabels` | ✅ | ❌ | 同上 |
| `replaceEntityTagLabels` | ✅ | ❌ | 同上 |
| `replaceSocialRippleConfig` | ✅ | ❌ | type/materializer/write-back 已补；prompt/tool 未暴露 |
| `replaceDialogueEffectMapping` | ✅ | ❌ | type/materializer/write-back 已补；prompt/tool 未暴露 |
| `replaceEmotionLabels` | ✅ | ❌ | type/materializer/write-back 已补；prompt/tool 未暴露 |
| `replaceLlmTriggerConfig` | ✅ | ❌ | type/materializer/write-back 已补；prompt/tool 未暴露 |
| `replaceTerrainConfig` | ✅ | ❌ | type/materializer/write-back 已补；prompt/tool 未暴露 |

### 缺口清单（为什么"不自由"）

| # | 缺口 | 具体表现 |
|---|------|---------|
| 1 | **文化/职业无属性字段** | 文化只是名字+场景列表，职业只是时间表。无法表达 "武士文化崇尚荣誉"、"铁匠有锻造技能" |
| 2 | **无法新增 trait** | `traitLabels` 只有 `replace*`（覆盖已有），没有 `add*`。LLM 无法创造 "honor_bound"、 "ancestral_loyalty" 等新特质 |
| 3 | **emotionLabels 未向 LLM 暴露** | `replaceEmotionLabels` 的 type/materializer/write-back 已补，但 content_pool_evolve prompt/tool 仍未告知 LLM 可写 |
| 4 | **无法新增 behaviorAtom** | `behaviorAtoms` 无 mutation 路径。无法创造复合行为 |
| 5 | **文化创建无一致性校验** | `namePool` 和 `roomTemplate` 是两次独立 LLM 调用，`existingCultures` 来自 `roomTemplates`，可能与 `namePools` 不同步 |
| 6 | **terrain 未向 LLM 暴露** | `replaceTerrainConfig` 的 type/materializer/write-back 已补，但 content_pool_evolve prompt/tool 仍未告知 LLM 可写 |
| 7 | **social ripple / dialogue 未向 LLM 暴露** | `replaceSocialRippleConfig`、`replaceDialogueEffectMapping` 的 type/materializer/write-back 已补，但 prompt/tool 仍未告知 LLM 可写 |
| 8 | **已有 NPC 不可追溯更新** | 新定义的 cultural `personalities` 只影响新建 NPC，已有 NPC 不会随文化演化 |
| 9 | **needActionMap 不可演** | 无 mutation 路径。新需求无法映射到行为 |
| 10 | **culturalEvolution 未实现** | `LLMTriggerConfig` 中 `culturalEvolution` / `narrativeDirection` / `discoveryGeneration` 配置项存在，但 `dispatcher.ts` 没有 trigger 检测和 dispatch handler |

### 方案 A — 补全 mutation 路径（低成本）

- [ ] 给 `behaviorAtoms`、`needActionMap` 增加 `replace*` mutation 路径（`emotionLabels` 已补 type/materializer/write-back）
- [x] 给 `socialRippleConfig`、`dialogueEffectMapping` 增加 `replace*` mutation 路径
- [x] 给 `terrainConfig` 增加 `replace*` mutation 路径
- [ ] 新增 `addTraitDefinitions` mutation（让 LLM 能创建新特质，不只是改标签）
- [x] 修复 `addQuestTemplates` / `replaceEntityActionsByTag` / `replaceEntityActionLabels` / `replaceEntityTagLabels` 运行时 materializer handler
- [ ] `add_name_pool` 和 `add_room_template` 共享 culture 一致性校验（同一 culture 不跨两次调用异步创建）
- [ ] LLM prompt 中 `existingCultures` 从 `namePools` + `roomTemplates` 取并集
- [x] 新增 `replaceLLMTriggerConfig` mutation 路径
- [ ] 在 `content_pool_evolve` prompt/tool 中暴露上述新增 mutation 字段，并对 JSON mutation 做 schema 校验

### 方案 B — Culture/Profession 作为一等实体（高成本）

- [ ] 新增 `ContentPool.cultureDefinitions`：每种文化可定义特质加成、行为偏好、建筑风格、社交规范、禁忌需求、专属职业
- [ ] 新增 `ContentPool.professionDefinitions`：每种职业可定义技能树、装备偏好、社交地位、互斥/互补职业、默认 schedule
- [ ] culture → NPC 生成联动：新 NPC 自动继承所在区域的 culture 属性
- [ ] culture → dialogue 联动：不同文化的 NPC 对话风格不同
- [ ] culture → social ripple 联动：同一文化内传播更快，跨文化可能产生误解
- [ ] culture → quest 联动：文化专属任务模板
- [ ] `culturalEvolution` / `narrativeDirection` / `discoveryGeneration` dispatch 实现

### 涉及文件

- `src/core/types.ts` — `ContentPool`、`ContentPoolMutation` 接口扩展
- `src/core/schemas/content-pool.ts` — zod schema 扩展
- `src/llm/tools/content-pool-evolve.ts` — 新增 LLM 工具定义
- `src/llm/tool-mutations.ts` — `contentPoolMutationFromToolCalls()` 解析新工具调用
- `src/simulation/content-pool-materializer.ts` — `applyContentPoolMutation()` 处理新 mutation
- `src/core/content-pool-loader.ts` — `DOMAIN_FIELDS` / `DOMAIN_SCHEMAS` / `writeEvolveDeltas()` 扩展
- `src/llm/prompts/content-pool-evolve.ts` — prompt 注入新上下文（已定义了 cultures、roles 等）
- `src/llm/dispatcher.ts` — `culturalEvolution` / `narrativeDirection` / `discoveryGeneration` dispatch 代码
- `src/core/world.ts` — `createDefaultContentPool()` 默认值
- `worlds/content-pool/*.yaml` — YAML 基值扩展

## 6. 历史系统

**状态**: 待实现（零代码落地）  
**优先级**: 中  
**背景**: 世界观缺少历史深度。对话中的 `lore` 信息无结构化存储。世界初始化 prompt 提及"历史时间线"但从未实现。

### 现状问题 (2026-06 同步)

- ContentPool 无 `historicalEvents` / `loreFragments` 字段
- 玩家无法发现或积累世界知识
- NPC 对话中的传说分享无法持久化（与 TODO #1 相关）
- 历史无法解释当前世界状态（区域文化、派系关系等缺少叙事支撑）
- 世界初始化 LLM 不生成历史事件
- `HistoricalEvent` / `LoreFragment` 类型未定义

### 数据模型

```
HistoricalEvent — 世界过去的重要事件
  id, title, description, era, yearOffset, category, scope, consequences, significance
LoreFragment — 可被玩家发现的碎片知识（1-3 句话）
  id, text, category, relatedEventId, discoveryConditions (roomTags/npcIds/etc)
PlayerEntity.knownLore: string[]
```

### Phase 1: 数据模型 + ContentPool 管线

- [ ] `core/types.ts` — HistoricalEvent / LoreFragment 接口；ContentPool 新增 historicalEvents / loreFragments；ContentPoolMutation 新增 addHistoricalEvents / addLoreFragments；PlayerEntity 新增 knownLore
- [ ] `core/schemas/content-pool.ts` — HistoricalEventSchema / LoreFragmentSchema
- [ ] `core/schemas/index.ts` — 导出新 schema
- [ ] `core/content-pool-loader.ts` — DOMAIN_FIELDS["world-history"] = ["historicalEvents", "loreFragments"]；DOMAIN_SCHEMAS 新增校验器
- [ ] `simulation/content-pool-materializer.ts` — addHistoricalEvents / addLoreFragments 变异处理器
- [ ] `core/content-pool-loader.ts` — writeEvolveDeltas() 新增持久化路由
- [ ] `llm/prompts/content-pool-evolve.ts` — LLM prompt JSON schema 新增 add_historical_event / add_lore_fragment
- [ ] `llm/tool-mutations.ts` — 新增 tool 校验（regionId、factionId 存在性检查）
- [ ] `core/world.ts` — createDefaultContentPool() 新增空数组默认值
- [ ] `worlds/content-pool/world-history.yaml` — 手写基历史事件（5-10 个基础事件 + 对应 lore）

### Phase 2: 发现机制 + 知识追踪

- [ ] `core/types.ts` — SimulationDelta 新增 loreDiscoveries（含可选 trait delta）
- [ ] `core/world.ts` — applyDelta() 处理 lore discoveries：追加到 knownLore + 应用 trait 变化
- [ ] `engine/command-executor.ts` — examine 指令扩展：根据 roomTags 匹配发现条件，未发现的 lore 返回叙述 + "发现新知识"
- [ ] `llm/dialogue-generator.ts` — system prompt 注入 NPC 关联的 lore
- [ ] `engine/act-loop.ts` — 对话结束后检查 NPC 提及的 lore ID → 生成 loreDiscoveries delta
- [ ] `core/memory.ts` — lore 发现为玩家创建记忆（importance: 0.5）

### Phase 3: LLM 生成集成

- [ ] `llm/world-generator.ts` — 世界初始化 prompt 新增历史时间线请求（8-15 个 HistoricalEvent）
- [ ] `llm/prompts/world-event.ts` — 注入历史背景作为 LLM 生成事件的上下文
- [ ] `llm/dispatcher.ts` — content_pool_evolve 中已有 history domain 接入
- [ ] `worlds/content-pool/evolve/` — LLM 生成的历史数据自动持久化

### 涉及文件

- `core/types.ts` — 4 个接口新增/修改
- `core/schemas/content-pool.ts` — 2 个 schema 新增
- `core/schemas/index.ts` — 导出新增
- `core/content-pool-loader.ts` — DOMAIN_FIELDS + DOMAIN_SCHEMAS + writeEvolveDeltas
- `simulation/content-pool-materializer.ts` — 2 个变异处理器
- `llm/prompts/content-pool-evolve.ts` — prompt schema 新增
- `llm/tool-mutations.ts` — tool 校验新增
- `core/world.ts` — createDefaultContentPool + applyDelta
- `worlds/content-pool/world-history.yaml` — 新文件
- `engine/command-executor.ts` — examine 扩展
- `llm/dialogue-generator.ts` — prompt 注入
- `engine/act-loop.ts` — 对话后 lore 检查
- `core/memory.ts` — lore 发现记忆
- `llm/world-generator.ts` — 世界初始化 prompt
- `llm/prompts/world-event.ts` — 历史上下文注入

### 暂不纳入

- TUI 传说法典 ([L] 键) — 后续 UI 迭代
- NPC 之间的历史传播（用已有 spreadChance）— 依赖 TODO #1 完成
- 物品/书籍发现传说 — Phase 2 examine 扩展为此打下基础，自然跟进

---

## 7. NPC 关系提升渠道

**状态**: 待实现  
**优先级**: 中  
**背景**: 对话回复已经会读取 NPC 与玩家关系，后续追问机制也会让关系好的 NPC 给出更详细反馈。但当前玩家缺少清楚稳定的关系提升渠道。如果直接让低关系 NPC 敷衍或拒答，会造成玩家负反馈。

### 现状 (2026-06 同步)

- 闲聊中 LLM 可以通过 `shift_relation` 工具产生关系变化，但玩家无法稳定预期什么行为会提升某个 NPC 的关系
- 任务奖励可以通过 `relationDelta` 修改关系，但不是每个 NPC 都有任务
- 旁观者社会涟漪会产生关系变化，但它是间接结果，不适合作为主关系培养渠道
- 对话系统目前应先采用“两档反馈”：普通关系正常回答，关系好时补充更多细节和线索；暂不做低关系拒答

### 需要实现

- [ ] 任务帮助：完成 NPC 发布或关联的任务时，明确提升该 NPC 对玩家的关系
- [ ] 友好闲聊：玩家选择礼貌、关心、帮助型对话时，稳定产生轻微正向关系变化
- [ ] 交易让利：玩家用更低价格卖出、接受较高价格购买、或赠予小物品时，可提升对应 NPC 关系
- [ ] 场景帮助：在酒馆、神殿、矿场等场景交互中，为 NPC 解决需求后提升关系
- [ ] TUI 反馈：关系变化需要在事件日志或对话反馈中明确显示，让玩家知道关系为什么变化
- [ ] 防刷规则：同一 NPC 的重复低价值互动需要递减收益或按天冷却，避免无限刷关系

### 涉及文件

- `src/llm/dialogue-generator.ts` — 对话选项和回复中的关系变化规则
- `src/llm/dialogue-tools.ts` — `shift_relation` 工具说明
- `src/core/world.ts` — 关系变化应用和标签更新
- `src/engine/quest-tracker.ts` — 任务奖励关系变化
- `src/engine/command-executor.ts` — 交易、赠予、场景帮助等玩家动作入口
- `src/tui/client/game-client.ts` — 关系变化反馈展示
- `worlds/content-pool/quests.yaml` — 任务奖励中的关系变化数据
- `worlds/content-pool/social-dialogue.yaml` — 对话关系变化数值映射

---

## 8. 脑暴池 — 后续深入探讨

以下为创意方向，状态均为 **探索中**，优先级 **低**。每个方向需细化为可执行子任务后再纳入正式计划。

### 8.1 核心体验深化

| # | 想法 | 概要 |
|---|------|------|
| 8.1.1 | **技能/手艺系统** | 可练习的技能（锻造、炼药、钓鱼、采矿），产出物品流入世界。LLM 演化新配方 |
| 8.1.2 | **经济系统** | 物品供需与价格浮动。商队在不同聚落间移动，NPC 自主买卖。ContentPool 存价格规则 |
| 8.1.3 | **势力/家族系统** | 多组织争夺领土/资源。势力外交关系（同盟、敌对、附庸）。玩家可加入/效忠/背叛 |
| 8.1.4 | **季节与天气** | 日历驱动季节轮替，影响作物/移动/战斗。恶劣天气触发 NPC 特殊 schedule |

### 8.2 世界生命力

| # | 想法 | 概要 |
|---|------|------|
| 8.2.1 | **建筑与城建** | NPC 建造房屋/桥梁/道路。聚落根据人口和资源扩张。ContentPool 存建筑蓝图 |
| 8.2.2 | **文明科技树** | ContentPool 存技术节点。满足前置条件后 LLM 生成新技术效果。铁器→钢器→符文附魔 |
| 8.2.3 | **植物/矿物生长** | 草药、矿脉有生长/再生周期。过度采集会枯竭。ContentPool 存生长规则 |
| 8.2.4 | **动物生态** | 野兽有族群、迁徙路线、食物链。生态失衡产生连锁反应。LLM 演化新物种 |
| 8.2.5 | **疾病与医疗** | NPC 染病、瘟疫传播。医生职业出现，草药知识累积。ContentPool 存疾病模板和疗法 |

### 8.3 叙事与沉浸

| # | 想法 | 概要 |
|---|------|------|
| 8.3.1 | **预言系统** | LLM 生成模糊预言文本。若干回合后世界事件可能兑现。玩家可追踪/破解 |
| 8.3.2 | **谣言网络** | 世界事件经 NPC 链路扩散，信息沿途失真。酒馆里听到的版本和真相可能完全不同 |
| 8.3.3 | **遗迹探索** | ContentPool 存遗迹模板。LLM 生成随机地下城（房间、陷阱、谜题）。拾获物品揭示历史碎片 |
| 8.3.4 | **节日与仪式** | 每个文化在特定日历日触发节日。NPC 有特殊行为。LLM 演化新节日传统 |
| 8.3.5 | **日记与书信** | NPC 写日记、彼此通信。玩家可偷看/截获。内容由 LLM 基于 NPC 记忆和关系生成 |

### 8.4 玩家驱动的世界改变

| # | 想法 | 概要 |
|---|------|------|
| 8.4.1 | **玩家间交易** | 多人时可摆摊、以物易物、拍卖。价格由供需规则驱动 |
| 8.4.2 | **玩家建造** | 野外建营地/房屋。建材从采集/交易获取。建造影响 NPC 寻路和社会涟漪 |
| 8.4.3 | **领土宣称** | 玩家与 NPC 势力争夺区域统治权。ContentPool 存领土规则 |
| 8.4.4 | **传奇事迹铭刻** | 玩家完成重大任务后 LLM 生成史诗叙事入 ContentPool，NPC 会提及玩家事迹 |
| 8.4.5 | **教学/传承** | 高技能玩家教低技能玩家或 NPC。教学内容由 ContentPool 技能树驱动 |

### 8.5 技术架构进化

| # | 想法 | 概要 |
|---|------|------|
| 8.5.1 | **世界快照/分支** | 存档为独立 ContentPool+WorldState。支持时间旅行回旧存档，衍生平行世界 |
| 8.5.2 | **多世界服务器** | 单服务器跑多个世界实例。玩家可在世界间穿越（位面传送） |
| 8.5.3 | **Web Dashboard** | 浏览器看世界热力图、人口统计、NPC 关系网。GM 手动注入事件 |
| 8.5.4 | **Mod 系统** | 外部加载 ContentPool YAML 包。社区自制世界观/职业/文化设定，热加载不重启 |
| 8.5.5 | **回放系统** | 记录每回合 SimulationDelta 序列，可快退/快进回放世界历史，调试+叙事两用 |
| 8.5.6 | **Docs 检索优化** | 给 docs 加 YAML frontmatter（name/description/triggers/category）。AGENTS.md 加指令让 agent grep frontmatter 按任务匹配文档。关键文档放 opencode.json `instructions` 自动注入。评估 OpenViking 作为游戏运行时 ContentPool 语义检索后端（非 dev docs 检索）的可行性 |

### 8.6 大胆方向

| # | 想法 | 概要 |
|---|------|------|
| 8.6.1 | **LLM 作为"神明"** | 玩家祈祷，LLM 解读后降下神谕/奇迹/天灾。频率由 ContentPool 触发配置控制 |
| 8.6.2 | **语言谜题** | 古代文字需收集碎片对比现代语言来破译。破译后解锁隐藏遗迹或任务。依赖语言演化实现 |
| 8.6.3 | **间谍/情报玩法** | 玩家伪装潜入敌对势力，偷听 NPC 记忆中的敏感信息，传回己方 |
| 8.6.4 | **竞选/政治** | 聚落领袖由选举产生。NPC 根据 trait 投票。玩家参选/拉票/发表 LLM 生成演讲稿 |
