---
name: content-pool
description: >
  内容池完整生命周期：字段清单、三层加载、schema 覆盖、mutation 通路矩阵、LLM 工具→mutation→materializer 映射。
  Use for: ContentPool schema changes, mutation pipeline, YAML loading, materializer, adding ContentPool fields.
---

# 06 — 内容池架构与生命周期

## 核心原则

**ContentPool 是代码与数据之间的硬边界。** 引擎代码只读 ContentPool，所有业务数据必须走 YAML。

```
┌───────────────┐
│  YAML 数据    │ ← 设计师手写 / LLM 演化
└───────┬───────┘
        │ 加载 + 校验
        ▼
┌───────────────┐
│  ContentPool  │ ← 运行时只读
└───────┬───────┘
        │ 查表
        ▼
┌───────────────┐
│  规则引擎     │ ← 代码不变
└───────────────┘
```

---

## 字段清单（26 个字段）

> 定义于 `src/core/types.ts` 的 `ContentPool` 接口。

### 数组字段

| 字段 | 类型 | YAML 源 | Schema | 说明 |
|------|------|---------|:---:|------|
| `needDefinitions` | `NeedDefinition[]` | `needs-actions.yaml` | ✅ | 需求定义（饥饿/安全/社交/休息） |
| `actionEffects` | `ActionEffect[]` | `needs-actions.yaml` | ✅ | 动作的效果映射（action → needDeltas 等） |
| `needActionMap` | `NeedActionMapping[]` | `needs-actions.yaml` | ✅ | 需求→动作 映射表 |
| `scheduleTemplates` | `RoleScheduleTemplate[]` | `schedules.yaml` | ✅ | NPC 日程模板（按角色+小时） |
| `behaviorAtoms` | `BehaviorAtom[]` | `schedules.yaml` | ❌ | 复合行为原子（空数组，未实现） |
| `namePools` | `NamePool[]` | `culture-narrative.yaml` | ✅ | 命名规则+姓氏/名字库（按文化） |
| `roomTemplates` | `RoomTemplatePool[]` | `room-templates.yaml` | ✅ | 场景模板（按文化/功能） |
| `itemTemplates` | `ItemTemplate[]` | `needs-actions.yaml` | ✅ | 物品模板 |
| `questTemplates` | `QuestTemplate[]` | `quests.yaml` | ✅ | 任务模板（6 个 MVP 任务） |
| `combatSkills` | `CombatSkill[]` | `combat.yaml` | ✅ | 战斗技能（当前空数组） |
| `terrainConfig` | `TerrainConfigEntry[]` | `terrain.yaml` | ✅ | 16 种地形及其成本/速度/危险值 |
| `sensitiveTraitNames` | `string[]` | — | ❌ | 敏感特质名列表（有此特质的 NPC 被观察时产生记忆） |

### Record 字段

| 字段 | 类型 | YAML 源 | Schema | 说明 |
|------|------|---------|:---:|------|
| `emotionLabels` | `Record<string,string>` | `social-dialogue.yaml` | ✅ | 情绪标签映射 |
| `needLabels` | `Record<string,string>` | `social-dialogue.yaml` | ✅ | 需求中文标签 |
| `traitLabels` | `Record<string,string>` | `social-dialogue.yaml` | ✅ | 特质中文标签 |
| `itemPropertyLabels` | `Record<string,string>` | `social-dialogue.yaml` | ✅ | 物品属性标签 |
| `entityActionsByTag` | `Record<string,string[]>` | `entity-actions.yaml` | ✅ | 房间 tag → 可用动作列表 |
| `entityActionLabels` | `Record<string,string>` | `entity-actions.yaml` | ✅ | 房间动作中文标签 |
| `entityTagLabels` | `Record<string,string>` | `entity-actions.yaml` | ✅ | 房间 tag 中文标签 |

### 对象字段

| 字段 | 类型 | YAML 源 | Schema | 说明 |
|------|------|---------|:---:|------|
| `narrativeTemplates` | `NarrativeTemplates` | `culture-narrative.yaml` / `social-dialogue.yaml` | ✅ | 叙事模板集合（含记忆模板、区域状态标签等） |
| `calendar` | `CalendarConfig` | `culture-narrative.yaml` | ✅ | 历法配置（月/日/季节） |
| `llmTriggerConfig` | `LLMTriggerConfig` | `triggers.yaml` | ✅ | LLM 触发频率/阈值配置 |
| `dialogueEffectMapping` | `DialogueEffectMapping` | `social-dialogue.yaml` | ✅ | 对话工具调用 → 数值映射 |
| `socialRippleConfig` | `SocialRippleConfig` | `social-dialogue.yaml` | ✅ | 社交涟漪参数 |
| `combatConfig` | `CombatConfig` | `combat.yaml` | ✅ | 战斗公式参数 |
| `storylineConfig` | `StorylineConfig` | — | ✅ | 剧情配置（事件回溯窗口） |

---

## 三层加载

| 层 | 来源 | 实现 | 说明 |
|----|------|------|------|
| 1. 代码兜底 | `createDefaultContentPool()` (`core/world.ts`) | 所有 26 字段有默认值 | 保证程序能启动 |
| 2. base YAML | `content-pool/*.yaml` | 覆盖兜底层 | 设计师主战场 |
| 3. evolve YAML | `content-pool/evolve/*.yaml` | 覆盖 base 层 | LLM 写回阵地 |

加载实现：`core/content-pool-loader.ts` 的 `loadContentPoolFromDir()` 执行三层 deep-merge，`DOMAIN_FIELDS` 将 26 字段路由到 11 个 YAML domain。

### Schema 即契约

- 数组字段：严格校验（schema 匹配才接受）
- 对象字段：深合并（partial 数据合法）
- 校验失败：log warn + 跳过该字段 + 用兜底数据

⚠ **1 个字段无 zod schema**：`behaviorAtoms`。YAML 数据有误时将静默加载而不被校验拒绝。

---

## 完整生命周期

```
1. 定义
   ContentPool 接口
   ContentPoolMutation 接口（仅 LLM 可写或运行时可写字段需要）

2. Schema 校验 (core/schemas/content-pool.ts)
   ↓

3. YAML 数据 (worlds/content-pool/ — 10 个文件)
   ↓

4. 加载 (core/content-pool-loader.ts)
   default → base YAML → evolve YAML (3 层 deep-merge)
   ↓

5. 运行时读取
   引擎层只读 pool.actionEffects / pool.scheduleTemplates / ...
   ↓

6. LLM 演化 (6 阶段流水线)
   ┌─ trigger detection (dispatcher.ts:155-177)
   ├─ prompt build (prompts/content-pool-evolve.ts)
   ├─ LLM call (adapter.chat)
   ├─ parse (JSON/tool call → ContentPoolMutation；schema validate 待补)
   ├─ return to round-engine
   ├─ materialize (content-pool-materializer.ts — 合并到运行时 pool)
   └─ persist (writeEvolveDeltas — 写入 evolve/*.yaml)
   ↓

7. 持久化恢复
   重启时步骤 4 重新执行，evolve 层覆盖 base 层
```

## 生命周期优先级建议

ContentPool 的维护优先级高于拆分大文件、整理命名和一般重构。原因是它是数据、引擎、LLM、YAML 和测试之间的共同入口；这里断一环，表现通常不是编译失败，而是“数据写了但不生效”“重启后丢失”“LLM 生成了坏形状”。

### 先修闭环，再扩能力

新增或修改 ContentPool 字段时，先确认它属于哪一种：

| 字段类型 | 应该具备的闭环 | 不需要做的事 |
|----------|----------------|--------------|
| 设计师手写数据 | 类型、schema、loader、默认值、base YAML、消费者测试 | 不一定要加 mutation |
| LLM 可演化数据 | 上面全部 + mutation、materializer、写回、prompt/tool、演化测试 | 不要只加 prompt |
| 引擎配置旋钮 | 类型、schema、loader、默认值、base YAML、消费者测试 | 通常不要让 LLM 改 |
| 引擎约定 | 保持在代码中，并在附近注释说明为什么不是内容数据 | 不要迁入 ContentPool |

### 最小验收标准

每个 ContentPool 字段都要能回答下面 8 个问题：

1. 类型在哪定义：`ContentPool` 是否有字段？
2. 形状在哪校验：`core/schemas/content-pool.ts` 是否有 schema？
3. YAML 从哪来：`DOMAIN_FIELDS` 是否路由到正确 domain？
4. 加载是否校验：`DOMAIN_SCHEMAS` 是否覆盖该字段？
5. 默认值在哪：`createDefaultContentPool()` 是否有完整兜底？
6. 基础数据在哪：`worlds/content-pool/<domain>.yaml` 是否有可维护基值？
7. 谁消费它：引擎、TUI、prompt 是否只读 ContentPool，不重复写常量表？
8. 怎么验证：是否有 loader 测试、消费者测试、必要的演化写回测试？

如果字段允许 LLM 写，还要额外回答 5 个问题：

1. mutation 字段叫什么，语义是 add、replace 还是 patch？
2. `applyContentPoolMutation()` 是否能立刻应用到运行时？
3. `writeEvolveDeltas()` 是否能写回正确 YAML domain？
4. prompt 或 tool definition 是否和 schema 同步？
5. LLM 输出是否经过 schema 校验后再进入 materializer？

### 当前最该补的闭环

| 优先级 | 缺口 | 原因 |
|--------|------|------|
| P1 | ContentPool mutation 解析校验 | `content_pool_evolve` JSON 解析后直接 cast，坏输出不容易定位 |
| P1 | 新增 mutation 字段的 prompt/tool 暴露 | 多个 mutation 已有 type/materializer/write-back，但 `content_pool_evolve` prompt 还没告知 LLM 可写 |
| P2 | `behaviorAtoms` schema | YAML 错误不会被 schema 捕获 |
| P2 | `behaviorAtoms` / `needActionMap` mutation | 仍不能被 LLM 演化 |
| P2 | `docs/dev-guide/content-pool-yaml.md` 与本文件保持同步 | agent 通常先读开发指南，指南过期会导致漏改 |

### 不建议迁入 ContentPool 的内容

- 键盘绑定、WebSocket 消息类型、错误码、出口 bitmask 这类协议或引擎约定。
- 技术上限，比如 batch size、日志级别、缓存窗口，除非它已经被明确设计为游戏平衡参数。
- 为了避免崩溃而加的兜底逻辑。优先修数据链路、schema 或调用方契约。

---

## Mutation 通路矩阵

`ContentPoolMutation` 有 23 个字段，与 ContentPool 的 26 个字段的映射关系：

| Mutation 字段 | 影响的 ContentPool 字段 | Materializer handler | LLM 可调用? | 持久化路由 |
|---------------|------------------------|:---:|:---:|:---:|
| `addNeedDefinitions[]` | `needDefinitions` | ❌ (已移除 — 离线专用) | ❌ (tool 已移除) | `evolve/needs-actions.yaml` |
| `addActionEffects[]` | `actionEffects` | ✅ `:27-38` | ❌ (同上) | `evolve/needs-actions.yaml` |
| `addScheduleTemplates[]` | `scheduleTemplates` | ✅ `:40-51` | ❌ (同上) | `evolve/schedules.yaml` |
| `addNamePools[]` | `namePools` | ✅ `:68-79` | ✅ (prompt 内 JSON) | `evolve/culture-narrative.yaml` |
| `addRoomTemplates[]` | `roomTemplates` | ✅ `:53-66` | ✅ (prompt 内 JSON) | `evolve/room-templates.yaml` |
| `addQuestTemplates[]` | `questTemplates` | ✅ | ❌ (`tool-mutations.ts` 能解析，但无 ToolDefinition / prompt 暴露) | `evolve/quests.yaml` |
| `addCombatSkills[]` | `combatSkills` | ✅ `:118-129` | ❌ | `evolve/combat.yaml` |
| `replaceNarrativeTemplates` | `narrativeTemplates` | ✅ `:81-91` | ✅ (prompt 内 JSON) | `evolve/culture-narrative.yaml` |
| `replaceCalendar` | `calendar` | ✅ `:93-96` | ✅ (prompt 内 JSON) | `evolve/culture-narrative.yaml` |
| `replaceNeedLabels` | `needLabels` | ✅ `:98-101` | ✅ (prompt 内 JSON) | `evolve/social-dialogue.yaml` |
| `replaceTraitLabels` | `traitLabels` | ✅ `:103-106` | ✅ (prompt 内 JSON) | `evolve/social-dialogue.yaml` |
| `replaceItemPropertyLabels` | `itemPropertyLabels` | ✅ `:108-111` | ✅ (prompt 内 JSON) | `evolve/social-dialogue.yaml` |
| `replaceCombatConfig` | `combatConfig` | ✅ `:113-117` | ❌ | `evolve/combat.yaml` |
| `replaceEntityActionsByTag` | `entityActionsByTag` | ✅ | ❌ | `evolve/entity-actions.yaml` |
| `replaceEntityActionLabels` | `entityActionLabels` | ✅ | ❌ | `evolve/entity-actions.yaml` |
| `replaceEntityTagLabels` | `entityTagLabels` | ✅ | ❌ | `evolve/entity-actions.yaml` |
| `replaceSocialRippleConfig` | `socialRippleConfig` | ✅ | ❌ | `evolve/social-dialogue.yaml` |
| `replaceDialogueEffectMapping` | `dialogueEffectMapping` | ✅ | ❌ | `evolve/social-dialogue.yaml` |
| `replaceEmotionLabels` | `emotionLabels` | ✅ | ❌ | `evolve/social-dialogue.yaml` |
| `replaceLlmTriggerConfig` | `llmTriggerConfig` | ✅ | ❌ | `evolve/triggers.yaml` |
| `replaceTerrainConfig` | `terrainConfig` | ✅ | ❌ | `evolve/terrain.yaml` |
| `narrativeContext` | (元数据，不写入任何字段) | N/A | ✅ | N/A |

---

## 不可被 LLM 演化的字段（4 个）

这些 ContentPool 字段在 `ContentPoolMutation` 中没有对应字段，LLM 无法通过任何路径修改：

| 字段 | 影响 | 是否应可演化 |
|------|------|:---:|
| `needActionMap` | 无 mutation 路由。持久化时作为 ride-along 被写入（随 `needs-actions` domain 一起），但值永远不变。 | 是 |
| `behaviorAtoms` | 无 mutation 路由 + 无 zod schema。持久化时 ride-along。 | 是 |
| `itemTemplates` | 无 mutation 路由。持久化时 ride-along（随 `needs-actions` domain）。 | 是 |
| `sensitiveTraitNames` | 无 mutation 路由 + 无 YAML 加载路径。仅从代码默认值读取。 | 是 |
| `storylineConfig` | 有 schema + 默认值，但无 mutation 路由。 | 否（配置字段，不需要 LLM 演化） |

另有一批字段已经具备 mutation/materializer/write-back，但还没有在 `content_pool_evolve` prompt/tool 中暴露：`addQuestTemplates`、`replaceEntityActionsByTag`、`replaceEntityActionLabels`、`replaceEntityTagLabels`、`replaceSocialRippleConfig`、`replaceDialogueEffectMapping`、`replaceEmotionLabels`、`replaceLlmTriggerConfig`、`replaceTerrainConfig`。

---

## LLM 工具 → Mutation → Materializer 映射

### 对话工具（5 个，已激活）

| 工具 | 定义位置 | 产出 | 处理位置 |
|------|---------|------|---------|
| `shift_relation` | `dialogue-tools.ts` | `SimulationDelta.relationChanges[]` | `dialogue-generator.ts — processToolCalls()` |
| `affect_need` | `dialogue-tools.ts` | `SimulationDelta.needChanges[]` | 同上 |
| `share_information` | `dialogue-tools.ts` | `SimulationDelta.worldEvents[]` | 同上 |
| `exchange_item` | `dialogue-tools.ts` | 直接实体状态变更（物品转移） | 同上 |
| `express_emotion` | `dialogue-tools.ts` | `SimulationDelta.worldEvents[]` | 同上 |

### 世界生成工具（2 个，已激活）

| 工具 | 定义位置 | 产出 | 处理位置 |
|------|---------|------|---------|
| `create_room` | `tools/room-mutation.ts` | `WorldMutation.newRooms[]` | `simulation/materializer.ts` |
| `add_npc` | `tools/room-mutation.ts` | `WorldMutation.newNPCs[]` | `simulation/materializer.ts` |

### ContentPool 演化工具（2 个，**孤儿** — 定义了但 dispatcher 走 JSON 解析而非 tool calling）

| 工具 | 定义位置 | 产出 | 说明 |
|------|---------|------|------|
| `add_action` | `tools/content-pool-evolve.ts` | `ContentPoolMutation.addActionEffects[]` | `content_pool_evolve` dispatch 走原始 JSON |
| `add_schedule` | `tools/content-pool-evolve.ts` | `ContentPoolMutation.addScheduleTemplates[]` | 同上 |

> `add_need` 已移除（2026-06-08）：Need 是引擎概念，LLM 不应动态新增。`addNeedDefinitions` 字段保留供离线世界生成使用。

### ContentPool Mutation 工具（3 个，**缺失 ToolDefinition**）

`tool-mutations.ts` 的 `contentPoolMutationFromToolCalls()` 能处理以下 mutation，但**没有对应的 `ToolDefinition`**——LLM 永远不会调用：

| 处理的 mutation | 说明 |
|----------------|------|
| `add_room_template` | 有 handler 有持久化，无 ToolDefinition |
| `add_name_pool` | 有 handler 有持久化，无 ToolDefinition |
| `add_quest_template` | 有 handler 有持久化，无 ToolDefinition |

---

## 已知缺口

### 高严重度

1. **`content_pool_evolve` 的 JSON 解析无 schema 校验** — `JSON.parse()` 后直接 cast 成 `ContentPoolMutation`。如果 LLM 输出格式异常，会在后续 materializer 中以更难定位的方式失败。

### 中严重度

2. **新增 mutation 字段未向 LLM 暴露** — 多个字段已有 type/materializer/write-back，但 `content_pool_evolve` prompt/tool 仍没有说明这些字段可写，因此 LLM 正常路径不会生成它们。

3. **`behaviorAtoms` 无 zod schema** — 如果 YAML 数据有误，不会在校验环节被捕获。

4. **3 个字段无 mutation 路由** — 见上方表格"不可被 LLM 演化的字段"。

5. **`llmTriggerConfig` 虽有 mutation 路径，但不一定应该由 LLM 演化** — 如果保留该 mutation，需要明确哪些场景允许写；否则应视为配置旋钮，从运行时演化 prompt 中排除。

### 低严重度

6. **3 个 ContentPool 演化工具是孤儿** — `add_need`/`add_action`/`add_schedule` 已定义但从未传入 LLM（对应的 dispatch 走 JSON 解析）。

---

## 演化安全

- LLM 只能写 evolve 层，不改 base YAML
- LLM 产出通过 `applyContentPoolMutation()` 合并到运行时 ContentPool
- tool call 路径会对单个工具参数做 schema 校验；`content_pool_evolve` 的 JSON 路径仍缺 mutation schema 校验
- `writeEvolveDeltas()` 将有效 mutation 持久化——重启后通过三层加载恢复

## 新增数据类型流程

1. 在 `src/core/schemas/` 定义 zod schema
2. 在 `ContentPool` 接口加字段
3. 在 `ContentPoolMutation` 接口（如需 LLM 可写）加 mutation 字段
4. 在 `content-pool-loader.ts` 的 `DOMAIN_FIELDS` 注册域名
5. 在 `content-pool-loader.ts` 的 `DOMAIN_SCHEMAS` 添加校验器
6. 在 `createDefaultContentPool()` 提供兜底值
7. 编写 YAML 数据文件
8. 在 `content-pool-materializer.ts` 实现 mutation handler
9. （如需 LLM 生成）在 `src/llm/tools/` 创建 tool definition
10. 在 `llm/prompts/content-pool-evolve.ts` 注入 LLM prompt schema
11. 在 `content-pool-loader.ts` 的 `writeEvolveDeltas()` 添加持久化路由
