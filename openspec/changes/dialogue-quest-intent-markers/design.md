# Design: dialogue-quest-intent-markers

## Design Goal

任务相关选项要同时满足两件事：

1. 玩家能一眼看出这是重要事项，可能推进任务。
2. 选项仍然像玩家会说出口的话，而不是系统按钮。

This is achieved by separating label generation from intent marking:

- LLM-generated label: natural player-facing wording.
- System marker: `tag: "quest"` rendered by TUI as a trailing `[!]` badge plus a quest accent color.

## Option Taxonomy

Dialogue options have three relevant groups:

| Group | Meaning | Marker |
|-------|---------|--------|
| Quest trigger intent | Starts a quest/storyline publishing flow. | `[!]` plus quest accent color via `tag: "quest"` |
| Quest delivery intent | Completes or turns in an active quest. | `[!]` plus quest accent color via `tag: "quest"` |
| Ordinary chat intent | Asks, chats, follows up, or explores character/world context. | no quest marker or quest accent color |

The marker is deliberately not a new option type. It is presentation metadata on existing dialogue options.

## Quest Availability Source

Quest intent visibility is derived from rules, not from LLM output.

An NPC-given quest is eligible when all conditions are true:

- The quest template has `giverNpcId === npc.id`.
- The quest is not a storyline child quest.
- The player does not already have the quest active.
- The quest is not completed unless it is repeatable.
- Repeatable quest cooldown, if present, has elapsed.
- Quest prerequisites are satisfied.
- `minRelation`, if present, is satisfied.
- The quest is not otherwise rejected by the existing quest accept resolver.

A storyline trigger is eligible when all conditions are true:

- The template has `stages`.
- The template has `autoTrigger.type === "player_action"`.
- One auto-trigger condition is `action === "talk"` and targets the NPC.
- Existing duplicate / prerequisite / relation checks pass.

A quest delivery intent is eligible when all conditions are true:

- The player has the quest active.
- The quest template has `giverNpcId === npc.id`.
- All objective groups are complete.

## Storyline Child Exclusion

Storyline child quests must not appear as standalone NPC-given quest intents. They belong to a storyline stage and should only become active through the storyline flow.

Implementation should reuse the existing child-quest collection rule rather than inventing a local exclusion list.

## Label Generation

The dialogue generator builds a list of dialogue directions before calling the LLM:

```text
quest_trigger__<templateId>: 提及关于"<quest title>"的委托
quest_deliver__<templateId>: 告知关于"<quest title>"的任务完成情况
```

The LLM may rewrite these into natural player speech:

```text
法显，壁画后那行暗码究竟指向哪里？
```

The LLM must not be asked to add `!`, `[任务]`, ids, completion state text, or other system markers. If it does add marker-looking text, parsing should trim only whitespace and keep normal punctuation; implementation may add stricter cleanup only if tests prove the model commonly leaks markers.

## Marker Rendering

`DialogueOption.tag === "quest"` is the source of truth for quest intent presentation.

Current TUI behavior appends `!` and changes the foreground color in `KeyHint` when `tag` is `"quest"`. This change intentionally replaces the bare suffix punctuation with an explicit trailing `[!]` badge so it stays visually separate from natural sentence punctuation such as `?`.

The color should be used as a scan aid, not as the only signal. The `[!]` badge remains required so the option is still understandable in monochrome terminals, screenshots, logs, or accessibility contexts where color is unavailable.

Expected rendering:

```text
[1] 法显，壁画后那行暗码究竟指向哪里？ [!]
```

The badge is rendered after the label with a separating space. It communicates action importance and is not sentence punctuation. The quest accent color should apply to the badge and may apply to the whole option text if that remains readable; implementation should avoid making the label harder to scan.

## Fallback Behavior

If the LLM fails or returns invalid JSON:

- Quest intent options must still exist.
- Their fallback labels may use the deterministic direction instruction.
- The options must keep `tag: "quest"`.
- No UI fallback should be added independently.

This is not a "make something up" fallback; it is using the already computed rule-derived intent direction.

## Selection Flow

Selecting a quest trigger intent should not directly mutate world state. It should enter the existing quest menu / selection flow:

```text
quest_trigger_menu
  -> quest_trigger_select
  -> existing quest accept resolver
  -> SimulationDelta.questChanges
  -> applyDelta
```

Selecting a quest delivery intent should use the existing quest delivery flow:

```text
quest_deliver_menu
  -> quest_deliver_select
  -> SimulationDelta.questChanges complete
  -> applyDelta
```

No direct mutation of active quests, completed quests, rewards, inventory, relation, or world events should be introduced.

## Relation to `giverNpcId`

For this change, `giverNpcId` means the NPC can publish the quest through dialogue when the player is eligible.

This keeps the first implementation simple and matches current quest docs. If content later needs a difference between "quest source NPC" and "dialogue publisher NPC", introduce a new ContentPool field through a separate world-yaml spec.

## Why Not Prompt-Only

Prompt-only behavior is insufficient because:

- The LLM may omit the task option.
- The LLM may generate vague wording that looks like idle chat.
- The LLM may add or forget marker punctuation inconsistently.
- Availability rules must remain deterministic.

The system must compute quest intent existence first, then ask the LLM only to phrase it.

## Test Plan

| Scenario | Assertion |
|----------|-----------|
| NPC has one eligible ordinary quest | menu includes `quest_trigger_menu` with `tag: "quest"` |
| NPC has one eligible talk-triggered storyline | menu includes `quest_trigger_menu` with `tag: "quest"` |
| player has completed non-repeatable quest | menu does not include trigger intent |
| quest prerequisites are unmet | menu does not include trigger intent |
| min relation is unmet | menu does not include trigger intent |
| repeatable cooldown is active | menu does not include trigger intent |
| quest is storyline child | menu does not include standalone trigger intent |
| active quest is complete and from same NPC | menu includes `quest_deliver_menu` with `tag: "quest"` |
| LLM rewrites quest direction | generated label is used, marker remains metadata |
| LLM returns invalid output | fallback option still has `tag: "quest"` |

## Verification

- `npx vitest run src/__tests__/dialogue-generator.test.ts`
- `npm run build -- --noEmit`
- `git diff --check`
- Manual TUI check: quest intent options are visibly distinct by both `[!]` and color.
- Trap token self-check for modified files:
  - no hardcoded label map
  - no `createDefaultXxx()` outside world defaults
  - no direct quest state mutation
  - no empty catch
