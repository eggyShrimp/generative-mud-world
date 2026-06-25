# Design: large-file-split

## Data Flow

此变更无数据流变化——纯代码内部结构重组。

```
[原始大文件] → [壳文件: 保留所有 public export，转发调用] → [Consumer 无感]
                  ↓
             [子模块: 原 private/internal 逻辑搬至独立文件]
```

## 拆分策略：三种壳模式

根据原始文件的结构，采用三种不同的拆分模式。**共同约束：所有 consumer 无需修改任何 import 路径。**

### 模式 A：自由函数 re-export（world.ts, command-executor.ts, types.ts）

原始文件全部是自由函数或类型声明。策略：

1. 将函数体/类型定义搬到子模块文件
2. 壳文件改为 `import { ... } from "./sub/module.ts"; export { ... }`
3. Consumer 原本 `import { getEntity } from "../core/world.ts"` —— 路径不变，仍从 `world.ts` 拿到

适用文件：`core/world.ts`, `engine/command-executor.ts`, `core/types.ts`

### 模式 B：类壳 public 方法转发（dialogue-generator.ts）

原始文件是一个 class，6 个 public 方法对外暴露 API。策略：

1. private 方法体抽成独立**自由函数**，签名为 `(state, ...params) => result`
2. class 壳保留所有 public 方法签名，body 改为转发调用提取后的自由函数
3. Consumer 原本 `new DialogueGenerator(adapter, srv)` —— 不变，仍通过 class 实例调用

模式 A 是函数级 re-export；模式 B 是类级转发——不是 re-export class 内部方法（ts 不支持），而是 class 的 public 方法 body 内转发调用子模块的自由函数。

适用文件：`llm/dialogue-generator.ts`

### 模式 C：工厂函数壳组装（ws-server.ts）

原始文件是一个 class `GameServer`，内部方法处理 WS 生命周期。策略：

1. 内部方法体（如 `pushState`, `handleMessage`）抽成自由函数，签名为 `(state, ...params) => result`
2. `GameServer` class 保留构造和生命周期方法，持有所需 state
3. Consumer 原本 `new GameServer(port, world, eventBus)` —— 不变

适用文件：`server/ws-server.ts`

### 模式 D：工厂函数壳 + 子工厂（game-client.ts）

> 属于 `world-tui` schema，在独立 change `large-file-split-tui` 中实现，此处仅作存档。

## 状态所有权规则

### DialogueGenerator class 状态

class 持有 4 个私有字段，拆分时必须明确每个字段的所有权：

| 字段 | 类型 | 所有权 | 传递给子函数的规则 |
|------|------|--------|-------------------|
| `adapter` | `LLMAdapter` | class 持有 | 作为参数传给需要 LLM 调用的自由函数 |
| `saveManager` | `SaveManager` | class 持有 | 作为参数传给需要存档的自由函数 |
| `conversationHistories` | `Map<string, ConversationEntry[]>` | class 持有 | 传给对话历史和摘要函数；函数返回修改后的 map，class 负责写回 |
| `pendingQuestMenu` | `Map<string, PendingQuestMenu>` | class 持有 | 传给 quest 对话函数；get/set/delete 由 class 的 public 方法完成，不暴露给自由函数 |

**规则**：自由函数不持有任何状态引用。所有状态由 class 持有并作为参数传入。自由函数返回 `{ result, newState }` 或纯计算结果，class 负责将新状态写回私有字段。

### GameServer class 状态

| 字段 | 类型 | 所有权 | 传递规则 |
|------|------|--------|----------|
| `sessions` | `Map<string, Session>` | class 持有 | 作为参数传给消息处理和会话管理的自由函数 |
| `world` | `WorldState` | class 持有（引用） | 作为参数传入 |
| `eventBus` | `EventBus` | class 持有（引用） | 作为参数传入 |
| 8 个 handler callbacks | 函数引用 | class 持有 | 作为参数传入 |

## 各文件的具体拆分方案

### `core/world.ts` → 模式 A（自由函数 re-export）

全部是自由函数，可直接将函数体搬到子模块。

```
src/core/
  world/
    defaults.ts          → createDefaultContentPool（882行纯数据）
    entity-ops.ts        → addEntity, removeEntity, getEntity, moveEntity, discoverRoom, initializePlayer
    room-region.ts       → addRoom, getRoomEntities, addRegion, getRegionEntities
    event-log.ts         → logEvent, getRecentEvents
    time-weather.ts      → advanceTime, advanceDay, refreshDailyEnvironment, computeDayPeriod,
                           computeSeason, selectWeather, computeWeatherByRegion, formatDate
    delta-application.ts → applyDelta, applyTraitRewards, applyNeedRewards, applyItemRewards,
                           itemCounter（模块级变量，只被 applyDelta 使用）
    factories.ts         → createNPC, createPlayer, createRoom, createItem, createDefaultCombatState
  world.ts               → 壳: import + re-export 以上所有 + createWorld（编排层）
```

`createDefaultContentPool` 是最大单函数（882行纯配置数据），单独成文件。

### `engine/command-executor.ts` → 模式 A（自由函数 re-export）

所有 `execute*` 和 `check*` 是自由函数。抽到子目录 `commands/`，壳文件做转发。

```
src/engine/
  commands/
    helpers.ts              → buildDelta, resolveActionEffect, fail, commandMessages,
                              combatTemplates, hasInventory, findReadableCandidate,
                              getItemNeedDeltas, getItemTraitModifiers, formatNeedDeltas,
                              checkItemCostFeasibility, countItemsByTemplate, removeItems
    feasibility.ts          → checkFeasibility, FeasibilityBlocker, FeasibilityResult,
                              resolveActionDuration, checkRestFeasibility, getCurrentRest,
                              getActionRestCost, calcMoveRestCost, calcMoveDuration,
                              checkActionRequirements, checkRoomTagFeasibility,
                              checkExitConditions, BUILTIN_ACTIONS
    move.ts                 → executeMove, executeLook
    social.ts               → executeTalk, executeSay, executeWait
    inventory.ts            → executeTake, executeDrop, executeUse, executeOperate,
                              executeEat, executeRead
    combat.ts               → executeAttack, executeFlee, executeDefend
    equipment.ts            → executeEquip, executeUnequip
    day-cycle.ts            → executeEndDay, executeEndDayRoomAction
    room-actions.ts         → executeRoomAction
    utility.ts              → executeRest, executeStatus, executeInventory
  command-executor.ts       → 壳: executeCommand (switch 转发，每个 case 调对应子模块)
```

**提取顺序**：`helpers.ts` 必须先提取（被所有 execute* 依赖），其次 `feasibility.ts`（被 round-engine 单独 import），再按依赖从少到多提取 execute*。

**函数归属原则**：被 2 个及以上 execute* 调用的辅助函数统一放 `helpers.ts`（如 `checkItemCostFeasibility` 被 `executeOperate` 和 `executeRoomAction` 共用）。仅被单一 execute* 使用的辅助函数随该 execute* 放入对应文件。

### `llm/dialogue-generator.ts` → 模式 B（类壳 public 方法转发）

class 保留所有 public 方法签名，private 方法体抽成自由函数，类壳的 public 方法改为转发调用。

```
src/llm/
  dialogue/
    helpers.ts                 → getQuestTemplate, extractReplyText, getFallbackDelta
    context-builders.ts        → buildContext, buildMinimalContext
    prompt-builders.ts         → buildIdleChatPrompt, buildFollowUpOptionsPrompt, parseFollowUpOptions
    tool-processing.ts         → processToolCalls
    conversation-history.ts    → getHistoryKey, scheduleConversationSummary,
                                 generateAndSaveConversationSummary, recordConversationHistory,
                                 formatConversationHistory
    follow-up.ts               → extractFollowUpTopics, buildFollowUpOptions, getPostSelectOptions
    conversation-menu.ts       → generateConversationDirectionOptions, buildConversationDirectionOptions,
                                 buildConversationMenuPrompt, parseConversationMenuOptions
    fixed-menu.ts              → generateFixedChatMenu, getFunctionalActions, getFunctionalLabel
    quest-dialogue.ts          → handleQuestTriggerMenu, handleQuestDefer, handleQuestTalkMenu,
                                 generateQuestMenu, tryGenerateQuestMenu, buildFallbackQuestMenu,
                                 injectQuestOptions, clearPendingQuestMenu, executeQuestTrigger,
                                 executeQuestDeliver, getEligibleQuestTriggers,
                                 getQuestDeliverSubOptions, limitTaskSceneOptions
    idle-chat.ts               → generateIdleChatReply
    trade.ts                   → executeTrade, executeSellTrade, getItemValue, isTradeable,
                                 countCurrency, findCurrencyItems, getRelation, tradePriceMultiplier,
                                 computeBuyPrice, computeSellPrice, npcHasTrait, getCurrencyName,
                                 generateTradeReply
    functional-dialogue.ts     → executeFunctional, getFunctionalSubOptions
    menu-transition.ts         → generateMenuTransitionDelta
  dialogue-generator.ts        → 壳: class DialogueGenerator（~200行）+ 6 public 方法转发
```

**提取顺序**：`helpers.ts` → `context-builders.ts`（被多数方法依赖） → `prompt-builders.ts` → `tool-processing.ts` → `conversation-history.ts` → `follow-up.ts` → `conversation-menu.ts` → `fixed-menu.ts` → `quest-dialogue.ts` → `idle-chat.ts` → `trade.ts` → `functional-dialogue.ts` + `menu-transition.ts`

### `server/ws-server.ts` → 模式 C（工厂函数壳组装）

```
src/server/
  ws/
    minimap.ts              → buildMinimap（已是模块级函数）
    server-helpers.ts       → getDirectionLabel, getExitLabels, getTerrainLabel, getExitMask
    session-manager.ts      → Session 接口, getConnectedPlayerIds, pruneClosedSessions
    state-pusher.ts         → pushState, buildEnrichedQuests
    message-handler.ts      → handleMessage, handleDialogueOptionsRequest 等
  ws-server.ts              → 壳: GameServer class + enrichQuests + Zod schemas + broadcast 方法
```

### `core/types.ts` → 模式 A（类型 re-export）

类型定义是纯声明（interface / type alias），天然可拆分。

```
src/core/types/
  entity.ts            → EntityId, RoomId, RegionId, Tick, EntityType, BaseEntity,
                          NPCEntity, PlayerEntity, ItemEntity, FactionEntity, Entity,
                          TravelogueEntry, Relation, Need, NeedType, Trait, Memory
  world-room.ts        → Room, RoomNode, RegionLinkInfo, RoomGraph, Region
  delta.ts             → SimulationDelta, TraitModifier, NeedChange, RelationChange,
                          DialogueLine, CulturalTag, RevealRoom, ItemChange, QuestObjectiveEvent
  environment.ts       → DayPeriod, Season, WeatherId, DayNightConfig, SeasonConfig,
                          WeatherConfig, WeatherState, WarmthComfortConfig
  quest-storyline.ts   → QuestObjectiveCondition, QuestObjective, QuestReward,
                          QuestAbandonPenalty, MinRelationCondition, QuestPrerequisite,
                          TriggerCondition, QuestAutoDiscover, QuestStage, QuestAutoTrigger,
                          ClueDefinition, KnownClue, KnownClueChange, DiscoverableCondition,
                          DiscoverableChange, QuestTemplate, ActiveQuest, StorylineState, QuestChange
  content-pool.ts      → ContentPool, ContentPoolMutation, NarrativeTemplates,
                          CalendarConfig, NamePool, BookContent, NeedDefinition, ActionEffect,
                          ItemTemplate, NeedActionMapping, RoleScheduleTemplate, BehaviorAtom,
                          BehaviorResponse, MemoryTemplates, CombatTemplates, CommandMessages,
                          SettlementMessages, QuestMessages, ConversationDirection, RoomTemplatePool
  llm-config.ts        → LLMTriggerConfig, StorylineConfig, DialogueEffectMapping, SocialRippleConfig
  daily-report.ts      → DailyReport, Encounter
  save.ts              → SaveMeta, ConversationSummaryEntry, SaveData
  schedule.ts          → ScheduleEntry, Action, WorldEvent
  index.ts             → 统一 re-export 所有类型 + combat/schema re-export
```

类型间交叉引用通过 import 解决，TypeScript 的 `interface` 允许跨文件引用。

## ContentPool Integration

无新增。拆分不改 ContentPool 读取路径。

## State Mutation Path

无变更。拆分不改任何状态写入逻辑。

## Trap Token Verification

| File | Trap Checked | Status |
|------|-------------|--------|
| 全部拆分文件 | no-hardcoded-labels | ✅ 只搬代码，不新增映射表 |
| 全部拆分文件 | no-direct-world-mutation | ✅ 不修改世界状态写入 |
| 全部拆分文件 | no-create-default-outside-world | ✅ 不新增 default 构造调用 |
| 全部拆分文件 | no-hardcoded-description-text | ✅ 不新增/修改硬编码字符串 |

## Test Plan

全部现有测试须在每次拆分后通过。每完成一个 Module 的拆分，执行：

```bash
npm test && npm run build -- --noEmit && npx depcruise src --config .dependency-cruiser.js
```

| 拆分目标 | 关联测试文件 | 验证断言 |
|----------|-------------|----------|
| `world.ts` | `world.test.ts`, `simulation.test.ts`, `content-pool-loader.test.ts`, `day-night-season.test.ts`, `name-generator.test.ts`, `materializer.test.ts` | 所有 world 相关测试通过 |
| `command-executor.ts` | `engine.test.ts`, `combat-*.test.ts`, `operate-command.test.ts`, `book-command.test.ts`, `room-actions.test.ts`, `combat-integration.test.ts` | 所有命令执行测试通过 |
| `dialogue-generator.ts` | `dialogue-generator.test.ts`, `llm-dispatcher.test.ts`, `llm-tool-mutations.test.ts` | 所有对话生成测试通过 |
| `ws-server.ts` | `ws-server.test.ts`, `multiplayer-ws.test.ts` | 所有 WS 测试通过 |
| `types.ts` | 全部测试 | `tsc --noEmit` 零错误 |

## Manual Checks

无。所有验证可自动化（build + test + lint + depcruise）。若拆分 `types.ts` 后出现 IDE 推断问题，手动检查受影响文件的 import 自动补全。
