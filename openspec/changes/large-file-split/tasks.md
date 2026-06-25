# Tasks: large-file-split

## 拆分原则

每条规则适用于所有模块：

1. **每次只拆一个文件** — 完成一个文件的提取后跑 `npm test && npm run build -- --noEmit && npx depcruise src`
2. **壳文件保持原 public export 接口不变** — consumer 不感知内部重构
3. **先提取被依赖最多的公共函数** — 如果函数 A 被多个 execute* 调用，先提取 A
4. **不新增 import 路径变更到 consumer** — 拆分通过壳文件 re-export 对外透明

---

## Module: `src/core/world.ts` (1765行 → 8个文件)

### Phase 1-1: 提取 `createDefaultContentPool`（纯数据，无逻辑依赖）

- [ ] 创建 `src/core/world/defaults.ts`，移入 `createDefaultContentPool` 函数体
- [ ] `src/core/world.ts` 改为 `import { createDefaultContentPool } from "./world/defaults.ts"` + re-export
- [ ] 验证: `npm test -- src/__tests__/content-pool-loader.test.ts src/__tests__/world.test.ts`

### Phase 1-2: 提取 entity CRUD（addEntity, removeEntity, getEntity, moveEntity, discoverRoom, initializePlayer）

- [ ] 创建 `src/core/world/entity-ops.ts`，移入对应的 6 个函数
- [ ] 函数体内 import 改为相对路径（从 `../types.ts` 改为 `../../types.ts`）
- [ ] `src/core/world.ts` import + re-export
- [ ] 验证: `npm test -- src/__tests__/world.test.ts`

### Phase 1-3: 提取 room/region 查询（addRoom, getRoomEntities, addRegion, getRegionEntities）

- [ ] 创建 `src/core/world/room-region.ts`，移入 4 个函数
- [ ] `src/core/world.ts` import + re-export
- [ ] 验证: `npm test -- src/__tests__/world.test.ts`

### Phase 1-4: 提取 event log（logEvent, getRecentEvents）

- [ ] 创建 `src/core/world/event-log.ts`，移入 2 个函数
- [ ] `src/core/world.ts` import + re-export
- [ ] 验证: `npm test -- src/__tests__/world.test.ts`

### Phase 1-5: 提取 time + weather（advanceTime, advanceDay, refreshDailyEnvironment 等 8 个函数。**itemCounter 不在此**）

- [ ] 创建 `src/core/world/time-weather.ts`，移入: advanceTime, advanceDay, refreshDailyEnvironment, computeDayPeriod, computeSeason, selectWeather, computeWeatherByRegion, formatDate
- [ ] `src/core/world.ts` import + re-export
- [ ] 验证: `npm test -- src/__tests__/day-night-season.test.ts src/__tests__/world.test.ts`

### Phase 1-6: 提取 delta application（applyDelta + 3 个 private reward helpers + `itemCounter` 变量）

- [ ] 创建 `src/core/world/delta-application.ts`，移入: `applyDelta`, `applyTraitRewards`, `applyNeedRewards`, `applyItemRewards`, `itemCounter`
- [ ] `src/core/world.ts` import + re-export `applyDelta`
- [ ] 验证: `npm test -- src/__tests__/world.test.ts src/__tests__/simulation.test.ts`

### Phase 1-7: 提取 entity factories（createNPC, createPlayer, createRoom, createItem, createDefaultCombatState）

- [ ] 创建 `src/core/world/factories.ts`，移入 5 个工厂函数
- [ ] `src/core/world.ts` import + re-export
- [ ] `src/core/world.ts` 保留 `createWorld`（编排函数，依赖以上所有模块）
- [ ] 验证: `npm test -- src/__tests__/world.test.ts src/__tests__/name-generator.test.ts src/__tests__/materializer.test.ts`

---

## Module: `src/engine/command-executor.ts` (1685行 → 11个文件)

### Phase 2-1: 提取共享公共函数 `helpers.ts`（必须先提取，被全部 execute* 依赖）

- [ ] 创建 `src/engine/commands/helpers.ts`，移入: `buildDelta`, `resolveActionEffect`, `fail`, `commandMessages`, `combatTemplates`, `hasInventory`, `findReadableCandidate`, `getItemNeedDeltas`, `getItemTraitModifiers`, `formatNeedDeltas`, `checkItemCostFeasibility`, `countItemsByTemplate`, `removeItems`
- [ ] `src/engine/command-executor.ts` import + re-export
- [ ] 验证: `npm test -- src/__tests__/engine.test.ts`

### Phase 2-2: 提取 `feasibility.ts`（独立子系统，被 round-engine 单独 import）

- [ ] 创建 `src/engine/commands/feasibility.ts`，移入: `checkFeasibility`, `FeasibilityBlocker`, `FeasibilityResult`, `resolveActionDuration`, `checkRestFeasibility`, `getCurrentRest`, `getActionRestCost`, `calcMoveRestCost`, `calcMoveDuration`, `checkActionRequirements`, `isBuiltinAction`, `checkRoomTagFeasibility`, `checkExitConditions`, `BUILTIN_ACTIONS`
- [ ] `BUILTIN_ACTIONS` 只内用，不 export
- [ ] `src/engine/command-executor.ts` import + re-export
- [ ] 验证: `npm test -- src/__tests__/engine.test.ts src/__tests__/round-engine.test.ts`

### Phase 2-3: 提取 `move.ts`

- [ ] 创建 `src/engine/commands/move.ts`，移入: `executeMove`, `executeLook`
- [ ] `src/engine/command-executor.ts` import + re-export
- [ ] 验证: `npm test -- src/__tests__/engine.test.ts`

### Phase 2-4: 提取 `social.ts`

- [ ] 创建 `src/engine/commands/social.ts`，移入: `executeTalk`, `executeSay`, `executeWait`
- [ ] `src/engine/command-executor.ts` import + re-export
- [ ] 验证: `npm test -- src/__tests__/engine.test.ts`

### Phase 2-5: 提取 `inventory.ts`

- [ ] 创建 `src/engine/commands/inventory.ts`，移入: `executeTake`, `executeDrop`, `executeUse`, `executeOperate`, `executeEat`, `executeRead`
- [ ] `src/engine/command-executor.ts` import + re-export
- [ ] 验证: `npm test -- src/__tests__/engine.test.ts src/__tests__/operate-command.test.ts src/__tests__/book-command.test.ts`

### Phase 2-6: 提取 `combat.ts`

- [ ] 创建 `src/engine/commands/combat.ts`，移入: `executeAttack`, `executeFlee`, `executeDefend`
- [ ] `src/engine/command-executor.ts` import + re-export
- [ ] 验证: `npm test -- src/__tests__/combat-integration.test.ts src/__tests__/combat-p3.test.ts`

### Phase 2-7: 提取 `equipment.ts`

- [ ] 创建 `src/engine/commands/equipment.ts`，移入: `executeEquip`, `executeUnequip`
- [ ] `src/engine/command-executor.ts` import + re-export
- [ ] 验证: `npm test -- src/__tests__/engine.test.ts`

### Phase 2-8: 提取 `day-cycle.ts`

- [ ] 创建 `src/engine/commands/day-cycle.ts`，移入: `executeEndDay`, `executeEndDayRoomAction`
- [ ] `src/engine/command-executor.ts` import + re-export
- [ ] 验证: `npm test -- src/__tests__/engine.test.ts`

### Phase 2-9: 提取 `room-actions.ts`

- [ ] 创建 `src/engine/commands/room-actions.ts`，移入: `executeRoomAction`
- [ ] `src/engine/command-executor.ts` import + re-export
- [ ] 验证: `npm test -- src/__tests__/integration/room-actions.test.ts`

### Phase 2-10: 提取 `utility.ts`

- [ ] 创建 `src/engine/commands/utility.ts`，移入: `executeRest`, `executeStatus`, `executeInventory`
- [ ] `src/engine/command-executor.ts` import + re-export
- [ ] 最终 `command-executor.ts` 变为 ~80 行：`executeCommand` 的 switch 转发 + `executeRoomAction` fallback
- [ ] 验证: `npm test -- src/__tests__/engine.test.ts`

---

## Module: `src/llm/dialogue-generator.ts` (2359行 → 14个文件)

### Phase 3-1: 提取模块级自由函数（class 外部函数）

- [ ] 创建 `src/llm/dialogue/helpers.ts`，移入: `isNpc`, `emotionTranslate`, `labelForLevel`, `formatOptionalList`, `makeContinueOption`, `makeCloseOption`
- [ ] `src/llm/dialogue-generator.ts` import 这些函数
- [ ] 验证: `npm test -- src/__tests__/dialogue-generator.test.ts`

### Phase 3-2: 提取 `context-builders.ts`（被 6+ 个方法依赖，先提取）

- [ ] 创建 `src/llm/dialogue/context-builders.ts`，移入: `buildContext`, `buildMinimalContext` 函数体
- [ ] class 私有状态 `adapter`, `saveManager` 以参数传入
- [ ] `DialogueGenerator` 的 private 方法改为从 `context-builders.ts` import
- [ ] 验证: `npm test -- src/__tests__/dialogue-generator.test.ts`

### Phase 3-3: 提取 `prompt-builders.ts`

- [ ] 创建 `src/llm/dialogue/prompt-builders.ts`，移入: `buildIdleChatPrompt`, `buildFollowUpOptionsPrompt`, `parseFollowUpOptions`
- [ ] `DialogueGenerator` import + class public 方法转发
- [ ] 验证: `npm test -- src/__tests__/dialogue-generator.test.ts`

### Phase 3-4: 提取 `tool-processing.ts`

- [ ] 创建 `src/llm/dialogue/tool-processing.ts`，移入 `processToolCalls` 函数体
- [ ] `DialogueGenerator` import + class public 方法转发
- [ ] 验证: `npm test -- src/__tests__/dialogue-generator.test.ts src/__tests__/llm-tool-mutations.test.ts`

### Phase 3-5: 提取 `conversation-history.ts`

- [ ] 创建 `src/llm/dialogue/conversation-history.ts`，移入: `getHistoryKey`, `scheduleConversationSummary`, `generateAndSaveConversationSummary`, `recordConversationHistory`, `formatConversationHistory`
- [ ] 函数签名: `(adapter, saveManager, conversationHistories, ...) => result`
- [ ] `DialogueGenerator` import + class 的 public / private 方法转发
- [ ] 验证: `npm test -- src/__tests__/dialogue-generator.test.ts`

### Phase 3-6: 提取 `follow-up.ts`

- [ ] 创建 `src/llm/dialogue/follow-up.ts`，移入: `extractFollowUpTopics`, `buildFollowUpOptions`, `getPostSelectOptions`
- [ ] `DialogueGenerator` import + class public 方法转发
- [ ] 验证: `npm test -- src/__tests__/dialogue-generator.test.ts`

### Phase 3-7: 提取 `conversation-menu.ts`

- [ ] 创建 `src/llm/dialogue/conversation-menu.ts`，移入: `generateConversationDirectionOptions`, `buildConversationDirectionOptions`, `buildConversationMenuPrompt`, `parseConversationMenuOptions`
- [ ] `DialogueGenerator` import + class public 方法转发
- [ ] 验证: `npm test -- src/__tests__/dialogue-generator.test.ts`

### Phase 3-8: 提取 `fixed-menu.ts`

- [ ] 创建 `src/llm/dialogue/fixed-menu.ts`，移入: `generateFixedChatMenu`, `getFunctionalActions`, `getFunctionalLabel`
- [ ] `DialogueGenerator` import + class public 方法转发
- [ ] 验证: `npm test -- src/__tests__/dialogue-generator.test.ts`

### Phase 3-9: 提取 `quest-dialogue.ts`

- [ ] 创建 `src/llm/dialogue/quest-dialogue.ts`，移入: `getEligibleQuestTriggers`, `handleQuestTriggerMenu`, `handleQuestDefer`, `handleQuestTalkMenu`, `generateQuestMenu`, `tryGenerateQuestMenu`, `buildFallbackQuestMenu`, `injectQuestOptions`, `clearPendingQuestMenu`, `executeQuestTrigger`, `executeQuestDeliver`, `getQuestDeliverSubOptions`, `limitTaskSceneOptions`
- [ ] `pendingQuestMenu` 由 class 持有，quest 函数通过参数接收 get/set 操作
- [ ] `DialogueGenerator` import + class public 方法转发
- [ ] 验证: `npm test -- src/__tests__/dialogue-generator.test.ts`

### Phase 3-10: 提取 `idle-chat.ts`

- [ ] 创建 `src/llm/dialogue/idle-chat.ts`，移入: `generateIdleChatReply`
- [ ] `DialogueGenerator` import + class public 方法转发
- [ ] 验证: `npm test -- src/__tests__/dialogue-generator.test.ts`

### Phase 3-11: 提取 `trade.ts`

- [ ] 创建 `src/llm/dialogue/trade.ts`，移入: `executeTrade`, `executeSellTrade`, `getItemValue`, `isTradeable`, `countCurrency`, `findCurrencyItems`, `getRelation`, `tradePriceMultiplier`, `computeBuyPrice`, `computeSellPrice`, `npcHasTrait`, `getCurrencyName`, `generateTradeReply`
- [ ] `DialogueGenerator` import + class public 方法转发
- [ ] 验证: `npm test -- src/__tests__/dialogue-generator.test.ts`

### Phase 3-12: 提取 `functional-dialogue.ts` + `menu-transition.ts`

- [ ] 创建 `src/llm/dialogue/functional-dialogue.ts`，移入: `executeFunctional`, `getFunctionalSubOptions`
- [ ] 创建 `src/llm/dialogue/menu-transition.ts`，移入: `generateMenuTransitionDelta`
- [ ] `DialogueGenerator` import + class public 方法转发
- [ ] 验证: `npm test -- src/__tests__/dialogue-generator.test.ts`

### Phase 3-13: 提取 private 工具函数 + 收尾

- [ ] 创建 `src/llm/dialogue/internal-helpers.ts`，移入: `getQuestTemplate`, `extractReplyText`, `getFallbackDelta`, `getTradeSubOptions`
- [ ] `DialogueGenerator` import + class public 方法转发
- [ ] 最终 `dialogue-generator.ts` 变为 ~200 行 class 壳
- [ ] 验证: `npm test -- src/__tests__/dialogue-generator.test.ts`

---

## Module: `src/server/ws-server.ts` (1085行 → 6个文件)

### Phase 4-1: 提取 `minimap.ts`

- [ ] 创建 `src/server/ws/minimap.ts`，移入 `buildMinimap` (module-private 函数)
- [ ] 创建 `src/server/ws/server-helpers.ts`，移入: `getDirectionLabel`, `getExitLabels`, `getTerrainLabel`, `getExitMask`
- [ ] `src/server/ws-server.ts` import
- [ ] 验证: `npm test -- src/__tests__/ws-server.test.ts`

### Phase 4-2: 提取 `session-manager.ts`

- [ ] 创建 `src/server/ws/session-manager.ts`，移入: `Session` interface, `getConnectedPlayerIds`, `pruneClosedSessions`
- [ ] `GameServer` class 持有 `sessions` Map，以参数传入自由函数
- [ ] 验证: `npm test -- src/__tests__/ws-server.test.ts`

### Phase 4-3: 提取 `state-pusher.ts`

- [ ] 创建 `src/server/ws/state-pusher.ts`，移入: `pushState`, `buildEnrichedQuests`
- [ ] `GameServer` class import + public 方法转发
- [ ] 验证: `npm test -- src/__tests__/ws-server.test.ts`

### Phase 4-4: 提取 `message-handler.ts`

- [ ] 创建 `src/server/ws/message-handler.ts`，移入: `handleMessage`, `handleDialogueOptionsRequest`, `handleChatOptionsRequest`, `handleTradeOptionsRequest`, `handleFollowUpOptionsRequest`
- [ ] `GameServer` class import + public 方法转发
- [ ] 验证: `npm test -- src/__tests__/ws-server.test.ts src/__tests__/integration/multiplayer-ws.test.ts`

### Phase 4-5: `ws-server.ts` 变为壳

- [ ] 保留: `GameServer` class + `enrichQuests` + Zod schemas + broadcast 方法
- [ ] class 方法 body 改为转发调用
- [ ] 验证: `npm test -- src/__tests__/ws-server.test.ts`

---

## Module: `src/core/types.ts` (1040行 → 11个文件)

### Phase 5-1: 提取 entity 类型

- [ ] 创建 `src/core/types/entity.ts`，移入: EntityId, RoomId, RegionId, Tick, EntityType, BaseEntity, NPCEntity, TravelogueEntry, PlayerEntity, ItemEntity, FactionEntity, Entity, Relation, Need, NeedType, Trait, Memory
- [ ] 创建 `src/core/types/world-room.ts`，移入: Room, RoomNode, RegionLinkInfo, RoomGraph, Region
- [ ] 创建 `src/core/types/schedule.ts`，移入: ScheduleEntry, Action, WorldEvent
- [ ] 创建 `src/core/types/index.ts`，re-export 以上
- [ ] 验证: `npm run build -- --noEmit`

### Phase 5-2: 提取 delta + environment 类型

- [ ] 创建 `src/core/types/delta.ts`，移入: SimulationDelta, TraitModifier, NeedChange, RelationChange, DialogueLine, CulturalTag, RevealRoom, ItemChange, QuestObjectiveEvent
- [ ] 创建 `src/core/types/environment.ts`，移入: DayPeriod, Season, WeatherId, DayNightConfig, SeasonConfig, WeatherConfig, WeatherState, WarmthComfortConfig
- [ ] 更新 `index.ts` re-export
- [ ] 验证: `npm run build -- --noEmit`

### Phase 5-3: 提取 quest + storyline 类型

- [ ] 创建 `src/core/types/quest-storyline.ts`，移入: QuestObjectiveCondition, QuestObjective, QuestReward, QuestAbandonPenalty, MinRelationCondition, QuestPrerequisite, TriggerCondition, QuestAutoDiscover, QuestStage, QuestAutoTrigger, ClueDefinition, KnownClue, KnownClueChange, DiscoverableCondition, DiscoverableChange, QuestTemplate, ActiveQuest, StorylineState, QuestChange
- [ ] 更新 `index.ts` re-export
- [ ] 验证: `npm run build -- --noEmit`

### Phase 5-4: 提取 ContentPool + config 类型

- [ ] 创建 `src/core/types/content-pool.ts`，移入: ContentPool, ContentPoolMutation, NarrativeTemplates, CalendarConfig, NamePool, BookContent, NeedDefinition, ActionEffect, ItemTemplate, NeedActionMapping, RoleScheduleTemplate, BehaviorAtom, BehaviorResponse, MemoryTemplates, CombatTemplates, CommandMessages, SettlementMessages, QuestMessages, ConversationDirection, RoomTemplatePool
- [ ] 创建 `src/core/types/llm-config.ts`，移入: LLMTriggerConfig, StorylineConfig, DialogueEffectMapping, SocialRippleConfig
- [ ] 创建 `src/core/types/daily-report.ts`，移入: DailyReport, Encounter
- [ ] 创建 `src/core/types/save.ts`，移入: SaveMeta, ConversationSummaryEntry, SaveData
- [ ] 更新 `index.ts` re-export
- [ ] 验证: `npm run build -- --noEmit`

### Phase 5-5: barrel re-export + 最终验证

- [ ] `src/core/types/index.ts` 统一 re-export 所有类型 + combat/schema re-export
- [ ] 原 `src/core/types.ts` 改为 `export * from "./types/index.ts"`
- [ ] 验证: `npm run build -- --noEmit && npm test`

---

## Verification

- [ ] 每完成一个 Module 的拆分后，执行: `npm test && npm run build -- --noEmit && npx depcruise src`
- [ ] 全部 5 个 Module 完成后，执行完整验证:
  - [ ] `npm test` — 全部测试通过
  - [ ] `npm run build -- --noEmit` — 零 TypeScript 错误
  - [ ] `npm run lint` — zero biome errors, zero depcruise violations
  - [ ] Trap token re-check: 无新增 hardcoded-labels, no-direct-world-mutation, no-create-default-outside-world, no-hardcoded-description-text, no-empty-catch
