# Design: quest-narrative-flow

## Data Flow

### Flow 1: Quest Menu Selection Starts Negotiation

```text
player selects quest_trigger_menu
  -> ws-server forwards talk optionId/optionType/label
  -> RoundEngine calls DialogueGenerator.handleChatOption()
  -> DialogueGenerator finds eligible quest triggers for the NPC
  -> generateQuestMenu() asks the LLM for structured negotiation content
  -> response is parsed and validated
  -> fallback menu is built if parsing fails
  -> pendingQuestMenu[playerId:npcId] stores accept/defer/topic options
  -> returned delta contains the NPC narrative
  -> returned subOptions contain accept/defer/one topic/goodbye
```

The returned sub-options MUST be enough for the next server round without relying on the client to echo `meta`.

### Flow 2: Ordinary Follow-Up Reuses Idle Chat

```text
player selects a quest negotiation idle_chat option
  -> existing idle_chat reply generation produces the NPC answer
  -> buildFollowUpOptions() creates ordinary follow-up choices
  -> injectQuestOptions() looks up pendingQuestMenu[playerId:npcId]
  -> accept/defer are merged back with one ordinary follow-up and goodbye
```

`injectQuestOptions()` MUST keep quest negotiation compact: accept, defer, at most one ordinary follow-up, and goodbye.

### Flow 3: Accept Uses Existing Quest State Path

```text
player selects quest_trigger:<questId> with type quest_trigger_select
  -> handleChatOption("quest_trigger_select")
  -> pendingQuestMenu[playerId:npcId] is cleared
  -> executeQuestTrigger() returns SimulationDelta.questChanges
  -> RoundEngine applies the delta through the existing applyDelta path
```

No quest state is changed before this selection.

### Flow 4: Defer Ends Negotiation Without Quest Changes

```text
player selects quest_defer:<questId> with type quest_defer
  -> pendingQuestMenu[playerId:npcId] is cleared
  -> DialogueGenerator returns an NPC acknowledgement dialogue
  -> no questChanges are returned
  -> no follow-up options are returned
```

The acknowledgement should come from the generated menu when available. If the generated menu is missing or invalid, use a minimal deterministic acknowledgement and do not create a new narrative path.

### Flow 5: Explicit Goodbye Clears Negotiation

```text
player selects chat:goodbye or close
  -> pendingQuestMenu[playerId:npcId] is cleared
  -> existing close behavior runs
  -> conversation summary scheduling remains unchanged
```

Client-side popup dismissal without a talk request is covered by `quest-narrative-flow-tui`; this engine change only clears state when a talk option reaches the server.

## ContentPool Integration

| pool.xxx field | Consumed in | Purpose | Changed? |
|----------------|-------------|---------|:--------:|
| `questTemplates` | `generateQuestMenu()` and existing eligibility helpers | Provide eligible quest details for negotiation generation. | No |
| `conversationDirections` | existing menu generation | Continue generating ordinary non-quest chat directions. | No |
| `needDefinitions` | existing idle chat reply | Existing dialogue tool schema; unchanged. | No |
| `emotionLabels` | existing idle chat reply | Existing dialogue tool schema; unchanged. | No |
| `dialogueEffectMapping` | existing idle chat reply | Existing dialogue effect mapping; unchanged. | No |
| `questMessages.goodbyeOptionLabel` | `buildFallbackQuestMenu()`, `buildFollowUpOptions()`, `getPostSelectOptions()`, `generateQuestMenu()` | Label text for the goodbye option. | Yes (new) |
| `questMessages.goodbyeNarrative` | `handleChatOption("close")` | NPC farewell narrative. | Yes (new) |
| `questMessages.deferReply` | `handleQuestDefer()`, `buildFallbackQuestMenu()` | NPC defer acknowledgement. | Yes (new) |
| `questMessages.deferReplyFallback` | `generateQuestMenu()` | Minimal fallback defer reply. | Yes (new) |
| `questMessages.acceptLabelTemplate` | `buildFallbackQuestMenu()` | Player accept label in deterministic fallback. | Yes (new) |
| `questMessages.deferLabel` | `buildFallbackQuestMenu()` | Player defer label in deterministic fallback. | Yes (new) |

No new ContentPool fields are introduced beyond the six `QuestMessages` additions listed above.

## State Mutation Path

| Change | Path | Notes |
|--------|------|-------|
| Quest acceptance | `SimulationDelta.questChanges -> applyDelta -> QuestTracker` | Existing path, unchanged. |
| NPC negotiation narrative | `SimulationDelta.dialogues -> deltaToEvents -> CommandResult.events` | Existing dialogue event path. |
| Pending negotiation menu | `DialogueGenerator.pendingQuestMenu` | Private generator session cache, not WorldState. |
| Ordinary follow-up reinjection | `pendingQuestMenu` read keyed by player/NPC | Does not mutate WorldState. |
| Defer | dialogue delta only | No questChanges. |

## Trap Token Verification

| File | Trap Checked | Status | Detail |
|------|--------------|:------:|--------|
| `src/llm/dialogue-generator.ts` | no-hardcoded-labels | Pass | No new `Record<string,string>` display mapping. |
| `src/llm/dialogue-generator.ts` | no-direct-world-mutation | Pass | Quest state changes remain in returned deltas; pending menu is not WorldState. |
| `src/llm/dialogue-generator.ts` | no-create-default-outside-world | Pass | Reads from the provided `world.contentPool`. |
| `src/llm/dialogue-generator.ts` | no-hardcoded-description-text | Watch | Prompt text is allowed as LLM instruction; fallback player-facing text must be minimal and tested. |
| `src/llm/dialogue-generator.ts` | no-empty-catch | Pass | LLM failure handling must log or return explicit fallback; no empty catch. |
| `src/shared/protocol.ts` | no-hardcoded-labels | Pass | Adds a union member only. |

## Test Plan

| Test File | Scenario | Assertions |
|-----------|----------|------------|
| `src/__tests__/dialogue-generator.test.ts` | LLM-generated quest menu succeeds | NPC narrative is returned as dialogue; subOptions include accept, defer, at most one topic, and goodbye; pending menu is stored. |
| `src/__tests__/dialogue-generator.test.ts` | LLM-generated quest menu parse fails | A valid minimal menu is returned; no questChanges are returned; pending menu is stored only when there is an eligible quest. |
| `src/__tests__/dialogue-generator.test.ts` | Task-scene first menu is generated | Ordinary options are trimmed so total options stay near four, unless fixed decision options alone exceed that count. |
| `src/__tests__/dialogue-generator.test.ts` | Ordinary follow-up is selected during negotiation | Accept/defer remain and at most one ordinary follow-up appears. |
| `src/__tests__/dialogue-generator.test.ts` | Ordinary idle chat without pending menu | SubOptions are the same as existing follow-up behavior. |
| `src/__tests__/dialogue-generator.test.ts` | Accept option selected | Existing quest trigger delta is returned and pending menu is cleared. |
| `src/__tests__/dialogue-generator.test.ts` | Defer option selected | Dialogue acknowledgement is returned; no questChanges are returned; pending menu is cleared. |
| `src/__tests__/dialogue-generator.test.ts` | Close option selected | Existing close behavior runs and pending menu is cleared. |
| `src/__tests__/round-engine.test.ts` | Talk route handles `quest_defer` | RoundEngine forwards option type/id and returns dialogue without questChanges. |

## Manual Checks

Manual TUI interaction checks are covered by `quest-narrative-flow-tui`. This engine change should be fully covered by automated tests.
