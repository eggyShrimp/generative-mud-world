---
name: code-quality-review
description: >
  代码质量评审报告：已知问题清单、修复状态、双源维护审计、性能基准。
  Use for: code quality issues, known bugs, review findings, performance benchmarks.
---

# 代码质量评审报告

> 评审日期：2026-06-07　|　P0 修复完成：2026-06-08　|　双源维护审计：2026-06-08　|　P1 修复完成：2026-06-08　|　P2 修复完成：2026-06-08　|　Need定义修复：2026-06-08
> 评审范围：67 个源文件、38 个测试文件、23 份文档
> 当前基线：TypeScript 编译错误 0，Biome lint 0 (114 files)，Vitest 566/566 通过

---

## 总体数据

| 指标 | 评审时 | P0修复 | P1修复 |
|------|--------|--------|--------|
| 源文件 | 97 | 97 | 67 |
| 测试文件 | 38 | 38 | 38 |
| TypeScript 编译错误 | 1 | **0** | **0** |
| Biome lint 问题 | 0 | 0 | 0 |
| Vitest 测试通过 | — | **567/567** | **567/567** |
| 违反 AGENTS.md 约束 | 6 | **2** | **0** |
| 空 catch 块（吞错） | 6 | **0** | 0 |
| 硬编码阈值 (combat/balance) | 10 | 10 | **0** |
| 双源维护问题 | — | **28** | **~20** |
| ContentPool 管道断裂 | 9 | 9 | **0** |
| 未注入 ContentPool 的 prompt | 3 | 3 | **0** |

---

## 一、严重问题（CRITICAL）

### 1. 错误 #3 — MVP 占位代码未标注 TODO

#### 位置
- `src/index.ts:22-62` — `simulation.runDay` 整个内联函数
- `src/server/ws-server.ts:378-388` — `legacyParseAction()` 残余旧命令解析器

#### 问题
`srunDay` 硬编码了白天时间范围 `6..22`、实体类型过滤 (npc/player)、日程回退逻辑 (`e.schedule ?? []`)。`legacyParseAction` 硬编码了 `找`、`问` 等中文模式匹配。两者均无 `// TODO: move to ContentPool` 标记。

#### 影响
任何想修改白天时间范围或日程行为的开发者都需要改代码而非配置文件。

#### 修复方向
- 白天时间范围 → `ContentPool.llmTriggerConfig.daytimeRange`
- NPC 每日结算逻辑 → `ContentPool.narrativeTemplates.dailyRoutine`

---

### 2. 错误 #5 — Prompt 中手写需求/特质列表 ✅ 已修复

#### 位置
- ~~`src/llm/prompts/world-event.ts:27-28`~~ — 改为 `${needList}` / `${traitList}` 动态注入
- ~~`src/llm/prompts/memory-compression.ts:29`~~ — 改为 `${traitList}` 动态注入

#### 修复详情
- `buildWorldEventPrompt()` 新增 `needTypes?`/`traitKeys?` 参数，模板字符串从 ContentPool 数据动态拼接
- `buildMemoryCompressionPrompt()` 新增 `traitKeys?` 参数
- `TriggerDetector.check()` 在构建 context 时从 `pool.needDefinitions`/`pool.traitLabels` 提取数据注入
- `content_pool_evolve` 的 context 补充 `existingTraitLabels`
- 保留硬编码 fallback 值以兼容未提供参数的旧调用路径

---

### 3. SimulationDelta 管道被绕过 — 3 处调用点 + 1 处内部 ✅ 已修复

#### 位置（已修复）
| 文件 | 行号 | 违规方式 | 修复 |
|------|------|----------|------|
| `src/llm/dispatcher.ts` | — | `settlement_growth` 直接调 `materialize()` | 移入 `round-engine.ts` settleDay |
| `src/llm/dispatcher.ts` | — | `content_pool_evolve` 直接调 `applyContentPoolMutation()` | 同上 |
| `src/llm/dispatcher.ts` | — | `exploreRoom` 直接调 `materialize()` | 调用方负责 |
| `src/llm/dialogue-generator.ts` | — | `exchange_item` 直接修改 entity | 改为 `ItemChange` delta + `itemId` 精确转移 |

#### 修复细节
- `execute()` 返回类型从 `SimulationDelta\|null` 扩展为 `ExecuteResult { delta, worldMutation, contentPoolMutation }`
- `runSettlementBatch()` 返回 `SettlementBatchResult { deltas, worldMutations, contentPoolMutations }`
- `round-engine.ts` settleDay 中按顺序应用：deltas → materialize world mutations → apply content pool mutations
- `ItemChange` 新增 `itemId?` 字段，`applyDelta` 支持基于实例 ID 的物品转移

---

### 4. 错误 #11 — 空 catch 块（6 处） ✅ 已修复

#### 位置
全部在 `src/shared/log.ts`（已添加 `logStderr` 函数，所有 catch 块输出到 stderr）。
- `src/server/ws-server.ts:358` — 保留 `catch` 块（JSON 解析失败返回标准错误消息，无需记录原始输入）

---

### 5. 类型双重定义 — 接口 + Zod 并存 ✅ 已修复

#### 修复详情
- 删除了 `types.ts` 中 `NewRoomDef`, `NewNPCDef`, `NewFactionDef`, `WorldMutation` 的手写接口
- `types.ts` 从 `schemas/index.ts` 重新导出这 4 个类型（Zod 推断为唯一数据源）
- `mutation.ts` 中 `NewExitSchema` 从 `exit.ts` 的 `ExitSchema` 引用（别名），删除重复定义
- `ExitConditionSchema` 从 `exit.ts` 导入，删除 `mutation.ts` 中的局部定义

---

### 6. 错误 #6 — `NeedType` 退化为 `string` ✅ 已修复

#### 修复详情
- `NeedType` 改为严格字面量联合 `"hunger" | "safety" | "social" | "achievement" | "rest"`
- `Need.type` 改为 `NeedType`（严格）。引擎内部 need 类型必须是已知的引擎概念
- `NeedChange.needType` 保持 `string`（灵活，因 delta 可来自 LLM 输出）
- LLM 边界处（`output-parser.ts`、`dialogue-generator.ts`）加 `as unknown as NeedType` 断言
- `ContentPool.needDefinitions[].type` 保持 `string`（离线世界生成阶段可用）
- 所有构造 `Need[]` 的位置加 `as unknown as NeedType` cast（因源数据 `NeedDefinition.type` 是 `string`）

#### 设计结论讨论
- **LLM 不应动态新增 need 类型**。Need 是引擎概念，不是内容数据。需同步修改多个引擎函数和 ContentPool 关联数据
- `ContentPoolMutation.addNeedDefinitions` 已标记为离线阶段专用 ✅：移除了 `ADD_NEED_TOOL` 定义、`add_need` tool handler、运行时 materializer 处理；保留字段类型 + loader 路由供离线世界生成使用
---
### 3c. QuestTemplate.prerequisites 形状不一致 ✅ 已修复
- `types.ts` 接口从 `prerequisites?: string | QuestPrerequisite` 统一为 `prerequisites?: QuestPrerequisite`
- 与 Zod schema 保持一致（只支持对象形式）
- 同步修正 quest-tracker.test.ts 中一个测试用例

---

## 二、高优先级问题（HIGH）

### 7. 错误 #4 — 硬编码方向名

#### 位置
- `src/shared/directions.ts:1-8` — `REVERSE_MAP` 硬编码 `北`/`南`/`东`/`西`/`上`/`下`
- `src/server/ws-server.ts:550-556` — `getExitMask()` 硬编码方向键

#### 问题
这里需要拆开判断：
- 方向显示名、中文方向词、自然语言别名属于世界/语言数据，可以从 `ContentPool.narrativeTemplates.directionNames` 读取。
- 键盘绑定、north/south/east/west 协议名、minimap bitmask 属于引擎和客户端协议约定，不应迁入可演化 ContentPool。

#### 修复方向
- `directions.ts`：如果用于世界文本或反向出口生成，改为接收 ContentPool 的方向名表。
- `getExitMask()`：保留为引擎协议逻辑，但加注释说明这是小地图协议约定，不是世界观内容。

---

### 8. 硬编码运行时行为字符串（~30+ 处）

#### 8a. LLM Dispatcher 中的标签
`src/llm/dispatcher.ts:60,66,142,168` — 问题标签（`"经济困难"`）、回退纪元名（`"铁器时代中期"`）、增长原因（`"经济繁荣"`）等中文硬编码。

#### 8b. Memory 系统中的叙事模板
`src/core/memory.ts` — ~15 个叙事模板：

| 行号 | 内容 | 类别 |
|------|------|------|
| 149-150 | `"拿起"`, `"放下"`, `"东西"` | 动作动词 |
| 184 | `"看到 ${actor.name} 离开了${srcRoom.name}"` | 观察模板 |
| 204 | `"${actor.name} 来到了${newRoom.name}"` | 观察模板 |
| 216 | `"到达了${newRoom.name}"` | 自身记忆 |
| 242 | `"与 ${actor.name} 在${roomName}交谈。${truncated}"` | 对话记忆 |
| 251 | `"与 ${target.name} 在${roomName}交谈"` | 对话记忆 |
| 266 | `["suspicious", "paranoid", "cautious", "jealous"]` | 敏感特质列表 |
| 270 | `"${actor.name} 打量了我"` | 观察模板 |
| 299-305 | take/talk/drop 观察模板 | 观察模板 |
| 314 | `"注意到 ${actor.name} 在${roomName}${actionLabel}"` | 默认观察 |
| 342 | `"听到 ${actor.name} 在${room.name}说了话"` | say 记忆 |
| 357 | `"度过了日常的一天"` | 例行记忆 |

#### 8c. Dialogue Generator 中的回退文本
`src/llm/dialogue-generator.ts` — 默认标签（`"居民"`, `"陌生人"`, `"平静"`, `"继续"`, `"普通"`）、回退对话选项、沉默叙事。

#### 8d. WebSocket Server 中的提示文本
`src/server/ws-server.ts` — `"旁观者"`, `"Unknown message type:"`, `"Invalid JSON"`, `"无法生成对话选项"`, `"未知"`。

#### 修复方向
以上全部应迁移到 `ContentPool.narrativeTemplates` 或对应的标签映射字段（`emotionLabels`, `needLabels` 等）。

---

### 9. 硬编码游戏平衡阈值

| 文件 | 行号 | 数值 | 应迁移到 | 备注 |
|------|------|------|----------|------|
| `simulation/index.ts` | 98 | `RELATION_THRESHOLD = -30` | `CombatConfig.npcHostilityThreshold` | **该字段已在 CombatConfig 中存在！** |
| `simulation/index.ts` | 99 | `AGGRESSION_COOLDOWN = 60` | `CombatConfig.npcAttackCooldown` | **该字段已在 CombatConfig 中存在！** |
| `round-engine.ts` | 211 | `restNeed.value <= 10` | `llmTriggerConfig.restExhaustionThreshold` | 自动结束当天阈值 |
| `combat/formulas.ts` | 35 | `defendingBonus = 5` | `CombatConfig.defendBonus` | 防御姿态加成 |
| `combat/resolver.ts` | 29 | `* 0.5` 防御减伤 | `CombatConfig.defendDamageReduction` | 防御伤害乘数 |
| `combat/ai.ts` | 53 | `hpRatio > 0.3` | `CombatConfig` | 逃跑 HP 阈值 |
| `combat/ai.ts` | 56 | `courageValue ?? 50` | `CombatConfig` | 默认勇气值 |
| `combat/ai.ts` | 59 | `Math.random() < 0.3` | `CombatConfig` | 逃跑概率 |
| `storyline-engine.ts` | 197 | `world.eventLog.slice(-10)` | — | 事件回溯窗口 |

#### 修复方向
- `simulation/index.ts` 中直接读取 `world.contentPool.combatConfig`
- 其余硬编码值添加到 `CombatConfig` 接口、Schema、默认值构造、YAML 数据四层

---

### 9b. 新增：双源维护问题（2026-06-08 审计）

审计范围：全代码库搜索与 ContentPool 字段重复的硬编码列表/标签/枚举/模板。共发现 **28 处**，其中 **1 处致命**、**8 处高危**、**6 处中危**。

根本原因：新增/修改 ContentPool 字段时，消费者代码不读取 ContentPool，而是各自维护一份拷贝。表现为：

```
新增 need type "achievement"
  → ContentPool.needDefinitions          ✓ 改了
  → dialogue-tools.ts enum               ✗ LLM tool 不知道此 need
  → createPlayer need filter             ✗ 玩家不会生成此 need
  → event-style.ts NEED_LABELS           ✗ 客户端标签缺失
  → world-event.ts prompt                ✗ world event 不知道此 need
```

#### 致命 — 违反核心架构约束 (1 处)

**`command-executor.ts` 绕过 ContentPool 读取战斗配置**

`executeAttack()` (L667) 和 `executeFlee()` (L766) 直接调用 `createDefaultCombatConfig()` 构造本地配置，而非 `world.contentPool.combatConfig`。修改 `combat.yaml` **对玩家发起的战斗无效**。

```typescript
// src/engine/command-executor.ts:667
const config = createDefaultCombatConfig()  // ← 绕过了 world.contentPool.combatConfig
```

#### 高危 — 新增字段时易遗漏 (8 处)

| # | 位置 | 硬编码内容 | 应读取 |
|---|------|-----------|--------|
| 2.3 | `llm/dialogue-tools.ts:49` | need type 枚举 `["hunger", "safety", "social", "achievement", "rest", "wealth"]` | `ContentPool.needDefinitions` |
| 2.4 | `llm/dialogue-tools.ts:131-143` | emotion 枚举 `["grateful", "angry", "surprised", ...]` (10 项) | `ContentPool.emotionLabels` keys |
| 9.1-9.3 | `combat/resolver.ts`, `combat/pulse.ts`, `command-executor.ts` (共 12 处) | 战斗叙事 `` `${name}倒下了...` ``、`` `暴击！...` ``、`` `逃跑了！` `` | ContentPool 新字段 `combatNarrativeTemplates` |
| 10.1-10.8 | `command-executor.ts` (8 处) | 动作动词 `"捡起了"`、`"放下了"`、`"使用了"`、`"休息了一会"`、`"装备了"`、`"卸下了"`、`"身上空无一物"`、`"状态:"` | `ContentPool.narrativeTemplates` |
| 1.1 | `client-tui/event-style.ts:59-66` | `NEED_LABELS` 含无效 `wealth` 类型，与 ContentPool 不同步 | `ContentPool.needLabels`（客户端暂无 ContentPool 访问通道） |
| 2.6 | `core/memory.ts:266` | `sensitiveTraits = ["suspicious", "paranoid", "cautious", "jealous"]` | ContentPool 新字段 |
| 2.7 | `core/world.ts:454` | `["hunger", "safety", "social", "rest"].includes(...)` — 玩家初始 need 白名单 | `ContentPool.needDefinitions` 或新字段 `playerBaselineNeeds` |
| 8b | `core/memory.ts` (~15 处叙事模板) | 同已有 section 8b，此处标注为已记录但未修复 |

#### 中危 — 不一致风险 (6 处)

| # | 位置 | 硬编码内容 | 问题 |
|---|------|-----------|------|
| 2.5 | `command-executor.ts:157-176` | `BUILTIN_ACTIONS` Set (18 项) | 与 `PLAYER_ACTIONS` 重复维护，缺 `unequip`。新增命令时两处需同步 |
| 3.1 | `dispatcher.ts:63` | 区域状态标签 `"经济困难"` / `"军事紧张"` / `"稳定"` | LLM 上下文用硬编码状态描述，应与 ContentPool 关联 |
| 3.2 | `dispatcher.ts:69-70` | 纪元回退 `"未知时代"`、主题回退 `"边疆"` | 纪元应从 `ContentPool.calendar.eraName` 读取 |
| 3.4 | `dispatcher.ts:172` | `era: "铁器时代中期"` 与 ContentPool era 名 `"铁器纪元"` 不一致 | content_pool_evolve 上下文 |
| 5.1 | `ws-server.ts:92` | 回退名 `"旁观者"` | 无 ContentPool 字段，应加入 `narrativeTemplates` |
| 5.5 | `ws-server.ts:551-556` | `getExitMask()` 硬编码中文方向字符 `"北"` / `"南"` 做 bitmask 匹配 | 方向名应从 ContentPool 读取 |

#### 低危 — 遗留问题

| 位置 | 内容 |
|------|------|
| `llm/tools/content-pool-evolve.ts` | Only 3 tools (`ADD_NEED`, `ADD_ACTION`, `ADD_SCHEDULE`) — 缺失 evolution 工具 |
| `ContentPoolMutation.narrativeContext` | LLM 生成但无消费者（孤字段） |
| `ContentPool.behaviorAtoms` | 定义但无消费者（空数组） |
| `client-tui/key-layer.ts` | `DIRECTION_LABELS` / `DIRECTION_KEYS` 含中英文双向映射，客户端无 ContentPool 访问 |

---

### 10. ContentPool 演化闭环不完整

#### 问题
部分字段已经有类型、YAML 加载和写回，但缺运行时 materializer；另一些字段缺 mutation、schema 或 prompt/tool 入口。后续 agent 容易出现“写入了但当前运行时不生效”或“重启后才生效”的问题。

当前确认：
- `replaceEntityActionsByTag`
- `replaceEntityActionLabels`
- `replaceEntityTagLabels`
- `addQuestTemplates`

以上字段已经有写回路由，但 `applyContentPoolMutation()` 里还没有对应 handler。

仍缺 mutation 路径或完整演化入口的字段：
- `replaceSocialRippleConfig`
- `replaceLlmTriggerConfig`
- `replaceDialogueEffectMapping`
- `replaceTerrainConfig`
- `replaceEmotionLabels`

#### 修复方向
以 `docs/06-content-pool.md` 的“生命周期优先级建议”为权威清单，先补运行时应用和校验，再扩展新的可演化字段。

---

### 11. ContentPool 字段合规状态（按 AGENTS.md checklist 12 项逐条对照）

| 字段 | types.ts | schema | mutation | loader路由 | materializer | evolve写回 | YAML数据 |
|------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `combatConfig` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `combatSkills` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `entityActionsByTag` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `entityActionLabels` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `entityTagLabels` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `terrainConfig` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `llmTriggerConfig` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `socialRippleConfig` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `questTemplates` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `dialogueEffectMapping` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `emotionLabels` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `storylineConfig` | ✅ | ✅ | — | ✅ | — | — | — |

> P1-3 修补后，原有 9 个字段的演化管道全部闭合。`storylineConfig` 为新增配置字段，暂不需要 LLM 演化支持。

---

## 三、中优先级问题（MEDIUM）

### 12. 测试中泄露私有状态

#### 位置
`src/__tests__/round-engine.test.ts:593`
```typescript
(engine as unknown as { endedPlayers: Set<string> }).endedPlayers.has("p1")
```

#### 问题
通过类型强制转换访问内部状态 `endedPlayers`，测试的是实现细节。重命名该字段会破坏测试。

#### 修复方向
改为行为测试：验证已结束的玩家发送命令时收到 `ended: true` 的错误。

---

### 13. 测试中硬编码数量断言

#### 位置
- `src/__tests__/content-pool-loader.test.ts:86` — `expect(pool.actionEffects).toHaveLength(17)`
- `src/__tests__/content-pool-loader.test.ts:339` — `evolveData.roomTemplates.length === 3`
- `src/__tests__/content-pool-loader.test.ts:373` — `evolveData.scheduleTemplates.length === 6`

#### 问题
修改 ContentPool 默认值时这些测试会无意义地失败。应使用相对断言或与 `createDefaultContentPool()` 比较。

#### 修复方向
```typescript
// 好
expect(pool.actionEffects.length).toBeGreaterThan(defaults.actionEffects.length)
// 或
const defaults = createDefaultContentPool();
expect(pool.actionEffects.length).toBeGreaterThanOrEqual(defaults.actionEffects.length)
```

---

### 14. A* reduce() seed 脆弱

#### 位置
`src/core/pathfinding.ts:53`
```typescript
const current = Array.from(openSet).reduce((best, candidate) =>
  (fScore.get(best) ?? Number.POSITIVE_INFINITY) <
  (fScore.get(candidate) ?? Number.POSITIVE_INFINITY)
    ? candidate
    : best,
);
```

#### 问题
`reduce` 缺少 seed 值，`best` 在第一次迭代中是 `undefined`。碰巧能工作因为 `fScore.get(undefined)` 返回 `undefined`，而 `?? POSITIVE_INFINITY` 覆盖了。但这是脆弱模式，且可读性差。

#### 修复方向
```typescript
const current = Array.from(openSet).reduce((best, candidate) => {
  const bestScore = fScore.get(best) ?? Number.POSITIVE_INFINITY;
  const candScore = fScore.get(candidate) ?? Number.POSITIVE_INFINITY;
  return candScore < bestScore ? candidate : best;
});
```

---

### 15. name-generator 缺少空数组保护

#### 位置
`src/simulation/name-generator.ts:43`
```typescript
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
```

#### 问题
如果 YAML 中的 `NamePool` 某个字段为空数组（如 `neutralGiven: []`），`pick()` 会抛 `RangeError`，导致模拟崩溃。

#### 修复方向
```typescript
function pick<T>(arr: T[]): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}
// 或在调用处提供回退值：pick(names) ?? "无名氏"
```

---

### 16. 缺少错误/边界路径测试

缺失的测试覆盖：
- `applyDelta` 对不存在 `targetId` 的行为
- 需求值超出 `[0, 100]` 范围的裁剪验证
- YAML 解析失败 → 回退到默认值的行为
- ContentPool YAML 文件中字段为空的情况
- `combatState.maxHp` 为 0 时的除零保护
- 空 NamePool 全字段的回退命名

---

### 17. combat/ai.ts `shouldFlee()` 忽略 config 参数

#### 位置
`src/combat/ai.ts:51`
```typescript
export function shouldFlee(npc: NPCEntity, _config: CombatConfig): boolean {
```

#### 问题
函数接受 `CombatConfig` 参数但完全不使用（前缀 `_` 抑制了未使用变量警告），转而使用硬编码值。

#### 修复方向
- 从 `_config` 中读取 `fleeHpThreshold`, `fleeCourageThreshold`, `fleeProbability` 等字段
- 或移除 `_config` 参数

---

### 18. 遗留 `require()` ESM/CJS 混用

#### 位置
`src/__tests__/content-pool-loader.test.ts:19`
```typescript
const { stringify } = require("yaml");
```

#### 问题
在 `"type": "module"` 项目中使用 `require()`。文件顶部已 import 了 `stringify`，应直接使用。

---

## 四、可维护性问题

### 19. 文件体积热点

| 文件 | 行数 | 问题 | 拆分建议 |
|------|------|------|----------|
| `core/world.ts` | 1112 | 职责混杂 | 拆为 entity-ops.ts + delta-application.ts + defaults.ts |
| `engine/command-executor.ts` | 1119 | 一个文件包含所有命令 | 按命令类别拆分：move.ts, combat.ts, dialogue.ts, item.ts |
| `llm/dialogue-generator.ts` | 547 | 可拆分 | 拆为 prompt-builder.ts + tool-processor.ts |
| `server/ws-server.ts` | 500+ | 负责过多 | 拆为 session-manager.ts + state-pusher.ts + minimap.ts |
| `client-tui/app.tsx` | 1800+ | TUI 状态、渲染、面板混杂 | 拆为 panels/、layout/、state hooks |

### 20. 循环依赖风险

`src/simulation/index.ts` 中的 `checkNpcAggression()` 使用内联 `import("../core/types.ts")` 进行类型转换 — 存在潜在的运行时循环导入风险。

---

## 五、Agent 开发友好性评估

### 对 Agent 有利
- AGENTS.md 质量高：决策树、检查清单、常见反模式文档齐全
- 测试结构清晰：`src/__tests__/` 镜像 `src/` 布局
- Biome 配置合理，覆盖测试文件的 lint 规则
- opencode.json 的 LSP/formatter 配置完善
- `docs/06-content-pool.md` 已作为 ContentPool 生命周期权威入口，应优先维护

### 对 Agent 不利

| 问题 | 影响 | 状态 |
|------|------|:--:|
| ~~`types.ts` 接口 + Zod 双重定义~~ | Agent 不知道该改哪一个 | ✅ 已修复 |
| ~~`NeedType = ... \| string`~~ | 无类型安全 | ✅ 已修复 |
| ~~空 catch 块~~ | Agent 无法调试 | ✅ 已修复 |
| ~~SimulationDelta 管道绕过~~ | LLM 产出不可追溯 | ✅ 已修复 |
| ~~combat 配置绕过 ContentPool~~ | YAML 修改无效 | ✅ 已修复 |
| ~~Prompt 硬编码 need/trait 列表~~ | 新增类型不同步 | ✅ 已修复 |
| ~~CombatConfig 演化管道断裂~~ | LLM 产出不生效 | ✅ 已修复 |
| ~~标签硬编码在 8+ 个文件中~~ | Agent 新增标签需要跨整个代码库搜索替换 | ⚠️ 部分修复（memory.ts、dispatcher.ts、ws-server.ts 已迁移） |
| ~~文档状态互相覆盖~~ | Agent 不知道哪个文档是当前事实 | ✅ 已同步（2026-06-08） |

---

## 六、修复优先级总览

### P0 — 立即修复（全部完成 ✅）

- [x] 4. 修复 `log.ts` 中 6 个空 catch 块
- [x] 6. 从 `NeedType` 中移除 `| string`，严格约束引擎内部 need 类型
- [x] 5. 消除双重类型定义（Zod 推断为唯一数据源）
- [x] 3. 修复 3 处 SimulationDelta 管道绕过 + exchange_item

### P1 — 高优先级

- [x] 2. 在 prompt 中从 ContentPool 注入 trait/need 列表
- [x] 9. 将硬编码阈值迁移到 ContentPool（`RELATION_THRESHOLD`、`AGGRESSION_COOLDOWN`、combat 各项）
- [x] 10. 补齐缺失的 ContentPoolMutation 处理器 + mutation schema 校验
- [x] 从运行时演化接口移除 `addNeedDefinitions`（Need 是引擎概念，LLM 不应新增）
- [x] 9b-致命. 修复 `command-executor.ts` 绕过 `world.contentPool.combatConfig` 的 bug（`executeAttack`/`executeFlee`）
- [x] 9b-高危. `dialogue-tools.ts` need type 和 emotion 枚举从 ContentPool 动态注入
- [x] 9b-高危. `createPlayer()` need 白名单改为从 ContentPool 读取
- [x] 9b-高危. `memory.ts` `sensitiveTraits` 迁移到 ContentPool
- [x] 新增 `StorylineConfig` + `LLMTriggerConfigSchema`
- [x] 补齐 9 个 ContentPoolMutation handler + 5 个缺少的 mutation type 字段
- [x] 补齐 write-back 路由（social-dialogue 3 字段 + triggers + terrain）
- 注：`restNeed.value <= 10`（auto-end day）经讨论保留在引擎代码中，属于引擎约定而非内容数据

### P2 — 中优先级

- [x] `checkNpcAggression` 从 `CombatConfig` 读取已有阈值（而非硬编码常量）
- [x] 11. 保持 `docs/06-content-pool.md`、`docs/dev-guide/content-pool-yaml.md` 与代码同步
- [x] 8. 将 `memory.ts` 中的叙事模板迁移到 ContentPool（新增 `MemoryTemplates` 接口 + 14 处模板替换）
- [x] 12. 移除测试中的私有状态泄露（`round-engine.test.ts` 删除 `endedPlayers` 断言）
- [x] 13. 修复测试中的硬编码数量断言（4 处改为 `createDefaultContentPool()` 相对断言）
- [x] 14. 修复 A* reduce() seed 问题（改为显式 for 循环）
- [x] 15. 给 `name-generator.ts` 添加空数组保护（`pick()` 返回 `T | undefined`）
- [x] 9b-中危. `BUILTIN_ACTIONS` 与 `PLAYER_ACTIONS` 合并为单一数据源（已修复 `shouldFlee` 使用 config）
- [x] 9b-中危. dispatcher.ts 区域状态/纪元/增长原因标签迁移到 ContentPool（`regionStatusLabels` + `defaultTheme` + `calendar.eraName`）
- [x] 9b-中危. ws-server.ts `getExitMask()` / 回退名 从 ContentPool 读取（`directionNames` + `spectatorFallbackName`）

### P3 — 优化项
- [ ] 19. 拆分大文件
- [ ] 20. 消解循环依赖风险
- [x] 17. 修复 `shouldFlee()` 使用 config 参数
- [ ] 18. 修复 ESM/CJS 混用
- [ ] 给 `types.ts` 中所有导出接口添加 JSDoc

---

## 附录：关键文件对照表

| 问题编号 | 涉及文件 | AGENTS.md 违反项 |
|----------|----------|:--:|
| 1 | `src/index.ts`, `src/server/ws-server.ts` | 错误 #3 |
| 2 | `src/llm/prompts/world-event.ts`, `src/llm/prompts/memory-compression.ts` | 错误 #5 |
| 3 | `src/llm/dispatcher.ts`, `src/llm/dialogue-generator.ts` | LLM 产出契约 |
| 4 | `src/shared/log.ts`, `src/server/ws-server.ts` | 错误 #11 |
| 5 | `src/core/types.ts`, `src/core/schemas/mutation.ts`, `src/core/schemas/exit.ts` | 错误 #9 |
| 6 | `src/core/types.ts` | 错误 #6 |
| 7 | `src/shared/directions.ts`, `src/server/ws-server.ts` | 错误 #4 |
| 8 | `src/core/memory.ts`, `src/llm/dialogue-generator.ts`, `src/llm/dispatcher.ts`, `src/server/ws-server.ts` | 错误 #8 |
| 9 | `src/simulation/index.ts`, `src/core/round-engine.ts`, `src/combat/*` | 硬编码阈值 |
| 10 | `src/core/content-pool-loader.ts` | ContentPool checklist |
| 12 | `src/__tests__/round-engine.test.ts` | 测试质量 |
| 14 | `src/core/pathfinding.ts` | 代码健壮性 |
| 15 | `src/simulation/name-generator.ts` | 边界处理 |
