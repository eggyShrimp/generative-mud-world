# Proposal: quest-narrative-flow

## Why

NPC 任务对话现在缺少一个稳定的叙事决策回合。玩家选择任务入口后，系统直接展示原始任务标题并进入接受路径；这会让前一层由 LLM 包装过的自然对话，和后一层任务选择之间出现明显断层。

这个变更要把任务入口改成"NPC 先讲清背景，玩家再接受、追问或推辞"的流程。接受任务仍然复用已有 quest accept 路径；推辞只结束这次协商，不修改任务状态。

## Change Type

**engine-logic** — Dialogue generation, quest negotiation state, and talk protocol handling.

new-feature

## What Changes

- Replace the raw `quest_trigger_menu` submenu with one generated quest negotiation turn.
- Generate one NPC narrative plus at most four options: accept, defer, one ordinary follow-up, and goodbye.
- Track the generated negotiation menu in `DialogueGenerator` by player and NPC so later ordinary follow-ups can reinsert accept/defer options.
- Limit ordinary first-round dialogue options when a task option is present so the total stays near four, while preserving all fixed decision options even if they alone exceed four.
- Add a `quest_defer` dialogue option type that clears the negotiation menu and returns an NPC defer acknowledgement without quest changes.
- Clear the negotiation menu when the player accepts, defers, or explicitly chooses goodbye.
- Keep all quest acceptance state changes on the existing `SimulationDelta.questChanges -> applyDelta` path.
- Add six `QuestMessages` fields to ContentPool for player-facing labels and fallback narrative templates.

TUI rendering and popup behavior are specified separately in `quest-narrative-flow-tui` and `dialogue-option-behavior-protocol`.

## Modules Touched

| File | Change Type | Description |
|------|-------------|-------------|
| `src/shared/protocol.ts` | modify-interface | Add `quest_defer` to `DialogueOptionType`. |
| `src/core/types.ts` | modify-interface | Add `goodbyeOptionLabel`, `goodbyeNarrative`, `deferReply`, `deferReplyFallback`, `acceptLabelTemplate`, `deferLabel` to `QuestMessages`. |
| `src/core/schemas/content-pool.ts` | modify-schema | Add corresponding zod schema fields to `QuestMessagesSchema`. |
| `src/core/world.ts` | modify-defaults | Add default values in `createDefaultContentPool()`. |
| `worlds/content-pool/social-dialogue.yaml` | modify-data | Add YAML values for new quest dialogue labels. |
| `src/llm/dialogue-generator.ts` | new-method / modify-logic | Add quest negotiation menu generation, pending menu cache, option-count limiting, injection into follow-up options, and cleanup. Replace hardcoded fallback text with ContentPool reads. |
| `src/core/round-engine.ts` | no-change expected | Existing talk path already forwards `optionId`, `optionType`, and label to `DialogueGenerator`. |
| `src/server/ws-server.ts` | no-change expected | Existing talk request forwarding is sufficient because engine behavior does not require sending option `meta`. |
| `src/__tests__/dialogue-generator.test.ts` | add-tests | Cover generated quest negotiation, fallback, lifecycle cleanup, option-count limiting, and follow-up injection. |
| `src/__tests__/round-engine.test.ts` | add-tests if needed | Cover the talk path for `quest_defer` if generator-only tests do not exercise the full route. |

## ContentPool Reads

| pool.xxx field | Used in | Purpose |
|----------------|---------|---------|
| `questTemplates` | `src/llm/dialogue-generator.ts` | Find eligible quests and provide quest title/description/objective context for negotiation generation. |
| `conversationDirections` | existing dialogue menu generation | Ordinary chat directions remain separate from quest negotiation. |
| `narrativeTemplates.questMessages.goodbyeOptionLabel` | `src/llm/dialogue-generator.ts` | Label text for the close/goodbye option. |
| `narrativeTemplates.questMessages.goodbyeNarrative` | `src/llm/dialogue-generator.ts` | NPC farewell narrative when player closes dialogue. |
| `narrativeTemplates.questMessages.deferReply` | `src/llm/dialogue-generator.ts` | NPC defer acknowledgement template. |
| `narrativeTemplates.questMessages.deferReplyFallback` | `src/llm/dialogue-generator.ts` | Minimal fallback when no defer reply is available. |
| `narrativeTemplates.questMessages.acceptLabelTemplate` | `src/llm/dialogue-generator.ts` | Player accept option label in fallback menu. |
| `narrativeTemplates.questMessages.deferLabel` | `src/llm/dialogue-generator.ts` | Player defer option label in fallback menu. |

## Interaction Contract

Quest negotiation options are data from the server. Client-only metadata may help rendering, but engine behavior MUST be recoverable from `optionType` and `optionId` alone.

Example option ids:

```text
quest_trigger:<questId>
quest_defer:<questId>
chat:followup_0
chat:goodbye
```

Ordinary follow-up options use `type: "idle_chat"` so they reuse the existing idle-chat reply path. During quest negotiation, the generator reinserts accept/defer and keeps only one ordinary follow-up option.

## Non-Goals

- Do not add a parallel quest acceptance path.
- Do not mutate player quests during menu generation.
- Do not require the client to echo `DialogueOption.meta` back to the server.
- Do not change quest delivery or functional service menus.
- Do not specify TUI scroll or close behavior here; that belongs to `quest-narrative-flow-tui` and `dialogue-option-behavior-protocol`.

## Impact

- Players get a clearer "hear the pitch, accept, defer, or ask one follow-up" task flow.
- Quest state remains unchanged until the player selects the accept option.
- Quest negotiation menus stay compact; ordinary options are trimmed before any fixed decision option is removed.
- A failed LLM generation still returns a valid negotiation menu, but fallback player-facing text must be minimal and deterministic rather than a second hardcoded quest narrative system.

## Test Impact

| Test File | Coverage |
|-----------|----------|
| `src/__tests__/dialogue-generator.test.ts` | `quest_trigger_menu` produces NPC narrative plus accept/defer/one follow-up/goodbye options and stores pending menu. |
| `src/__tests__/dialogue-generator.test.ts` | LLM parse failure returns a valid minimal negotiation menu without quest state changes. |
| `src/__tests__/dialogue-generator.test.ts` | Task-scene first dialogue options trim ordinary options while preserving fixed decision options. |
| `src/__tests__/dialogue-generator.test.ts` | Ordinary idle chat during negotiation reinserts accept/defer and keeps only one ordinary follow-up. |
| `src/__tests__/dialogue-generator.test.ts` | `quest_trigger_select`, `quest_defer`, and `close` clear pending menu. |
| `src/__tests__/dialogue-generator.test.ts` | No pending menu means ordinary idle chat follow-up options are unchanged. |
