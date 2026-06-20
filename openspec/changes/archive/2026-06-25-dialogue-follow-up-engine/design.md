# Design: dialogue-follow-up-engine

## Data Flow

```
request_follow_up_options
  { npcId, context }
        ↓
ws-server schema validation
        ↓
DialogueGenerator.generateFollowUpOptions(world, playerId, npcId, context)
        ↓
follow_up_options
  { npcId, npcName, context, options: DialogueOption[] }
        ↓
client chooses one option
        ↓
existing talk message and handleChatOption flow
```

The follow-up request only generates selectable dialogue options. It does not apply `SimulationDelta`, create memories, change relations, or execute a command. State changes happen only after the player chooses an option and the existing `talk` path runs.

## Protocol

### Client to Server

`RequestFollowUpOptionsMessage`

- `type`: `"request_follow_up_options"`
- `npcId`: target NPC id
- `context`: selected NPC text; must be non-empty after trimming

### Server to Client

`FollowUpOptionsMessage`

- `type`: `"follow_up_options"`
- `npcId`
- `npcName`
- `context`
- `options: DialogueOption[]`

`options` MUST use existing `DialogueOption` objects. Generated follow-up options MUST use `type: "idle_chat"` so they can be selected through the existing `talk` flow.

## Follow-Up Option Generation

`DialogueGenerator.generateFollowUpOptions()` receives world, player, NPC, and selected text.

Prompt requirements:

- Generate 3-5 short player-facing follow-up questions.
- Questions must be based on the selected NPC text, not the whole conversation panel.
- If the selected text appears to be the player's own line, still generate usable follow-up questions from the surrounding dialogue context and avoid treating the player's own sentence as NPC knowledge.
- Questions should help the player ask for clarification, direction, reason, consequence, or next step.
- Do not generate free-text input fields.
- Do not introduce a new option type unless existing `idle_chat` cannot carry the behavior.
- Use relationship context:
  - normal relation: generate normal follow-up questions
  - good relation: allow deeper/detail-oriented follow-up questions
  - poor relation: keep options usable; do not make refusal the default path

Parsing requirements:

- Parse JSON output only.
- Keep 3-5 valid non-empty labels.
- Deduplicate labels.
- Trim excessive whitespace.
- If parsing fails or no valid labels remain, return an empty option list.
- The TUI is responsible for restoring previous options when it receives an empty follow-up list.

## Relationship Feedback

The existing idle chat reply prompt is updated, not replaced.

Rules:

- 普通关系：NPC 正常回答玩家的问题。
- 关系好：NPC 更愿意补充细节、解释背景、给出已知线索。
- 关系差：NPC 语气可以冷淡，但仍应提供基础回答；不要因为关系差默认拒答。
- 不加入“秘密、风险、利益冲突时拒答”规则。

This is prompt behavior only. It does not add a new relationship gate, threshold table, or code-level denial path.

## Dialogue Tool Description

`suggest_followup_topics` keeps the same tool name and schema. Only the description changes.

The new description must state:

- topics are player-facing follow-up questions
- topics should be answerable in the current conversation
- relationship affects depth:
  - normal relation: practical follow-ups
  - good relation: deeper/detail-oriented follow-ups are allowed
  - poor relation: options must stay usable and should not default to refusal wording

The tool description must not introduce new world facts, new relation thresholds, or a new refusal mechanic.

## ContentPool Integration

No new ContentPool fields.

Existing reads:

- `world.contentPool.conversationDirections`: used as broad dialogue style/context reference.
- `world.contentPool.dialogueEffectMapping`: existing relation deltas remain mapped through this field.
- `world.contentPool.clueDefinitions`: existing known clue injection remains the only source of clue ids.

## State Mutation Path

Follow-up option generation has no world-state mutation.

When a generated option is selected:

```
talk → RoundEngine.handleChatOption → DialogueGenerator.handleChatOption
     → SimulationDelta → existing applyDelta path
```

No direct mutation of relations, memories, quests, inventory, or room state is introduced.

## Trap Token Verification

| File | Trap Checked | Status |
|------|-------------|--------|
| `src/shared/protocol.ts` | no-hardcoded-labels | ✅ no label map |
| `src/server/ws-server.ts` | no-empty-catch | ✅ errors must send explicit error messages |
| `src/server/ws-server.ts` | no-direct-world-mutation | ✅ handler only sends options |
| `src/llm/dialogue-generator.ts` | no-hardcoded-labels | ✅ no new `Record<string,string>` label map |
| `src/llm/dialogue-generator.ts` | no-create-default-outside-world | ✅ no default ContentPool construction |
| `src/llm/dialogue-generator.ts` | no-hardcoded-description-text | ✅ prompt text only; generated output comes from LLM |

## Test Plan

| Test File | Scenario | Assertions |
|-----------|----------|------------|
| `src/__tests__/dialogue-generator.test.ts` | generate follow-up options from selected NPC text | returns 3-5 `idle_chat` options, labels are trimmed and deduped |
| `src/__tests__/dialogue-generator.test.ts` | malformed LLM output | returns empty list without throwing |
| `src/__tests__/dialogue-generator.test.ts` | selected text is player line | generated follow-up options remain usable and do not present the player line as NPC knowledge |
| `src/__tests__/dialogue-generator.test.ts` | poor relationship behavior | generated options and reply flow remain usable; no default refusal option is forced |
| `src/__tests__/dialogue-tools.test.ts` | suggest_followup_topics description | description includes relationship depth guidance without adding new schema |
| `src/__tests__/ws-server.test.ts` | request_follow_up_options success | sends `follow_up_options` with npc id/name/context/options |
| `src/__tests__/ws-server.test.ts` | invalid context | sends error and does not call generator |
| `src/__tests__/integration/dialogue-pipeline.test.ts` | choose generated follow-up option | sends existing `talk` path and applies normal dialogue delta |
