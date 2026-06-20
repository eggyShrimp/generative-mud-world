# Proposal: dialogue-quest-intent-markers

## Why

NPC 对话里的任务入口需要被玩家明确感知为一种行动意图，而不是混在普通闲聊里。当前玩家与任务 NPC 对话时，任务相关入口可能缺失，或者即使存在也只表现为一条普通自然语言选项。玩家无法稳定判断哪个选项会推进任务，容易误以为 NPC 没有当前可做的事。

这个变更要解决的是交互信号，而不是给 UI 加兜底文案：任务入口必须来自已有任务规则判断，LLM 只负责把入口包装成自然话术。选项上的特殊符号由系统根据选项语义附加，不能交给 LLM 随机决定。

## Change Type

**engine-logic** — Dialogue option generation and quest availability rules.

behavior-change

## What Changes

- Define "quest intent option" as a dialogue option that can start or complete a quest-related flow.
- Show quest intent options when an NPC currently has a quest the player can receive through dialogue.
- Preserve existing quest delivery options for completed active quests.
- Mark quest intent options with `tag: "quest"` so the TUI can render a `[!]` quest badge and quest accent color.
- Keep the marker outside LLM-generated label text; the LLM generates only the natural player-facing wording.
- Reuse the existing quest accept / quest deliver execution path after the player selects the option.
- Exclude unavailable quests: already active, completed and not repeatable, blocked by prerequisites, blocked by relation, blocked by cooldown, or storyline child quests.

## Modules Touched

| File | Change Type | Description |
|------|-------------|-------------|
| `src/llm/dialogue-generator.ts` | modify-logic | Build quest intent directions from eligible NPC quest templates and completed active quests. |
| `src/engine/quest-tracker.ts` | reuse-helper / possible extraction | Reuse or expose existing quest availability checks instead of duplicating rules. |
| `src/shared/protocol.ts` | no-change expected | Existing `DialogueOption.tag` can carry `quest`; no new protocol field is expected. |
| `src/tui/components/key-hint.tsx` | modify-rendering | Render `tag === "quest"` as a trailing `[!]` badge with quest accent color instead of bare punctuation. |
| `src/__tests__/dialogue-generator.test.ts` | add-tests | Cover NPC-given quest intent, filtering, LLM label parsing, and fallback behavior. |

## ContentPool Reads

| pool.xxx field | Used in | Purpose |
|----------------|---------|---------|
| `questTemplates` | dialogue option generation | Find NPC-given quests and storyline triggers. |
| `conversationDirections` | dialogue option generation | Existing ordinary dialogue directions remain separate from quest intent directions. |

No new ContentPool fields are required for the first implementation.

## Interaction Contract

Quest intent options should feel like dialogue, not a command button:

```text
[1] 法显，壁画后那行暗码是什么意思？ [!]
[2] 你为何会留在莫高窟？
[3] 最近附近可有什么传闻？
```

The `[!]` badge and quest accent color are not part of the LLM label. They are stable UI markers derived from `DialogueOption.tag === "quest"`.

## Non-Goals

- Do not add a fallback UI option when the engine did not provide a quest intent.
- Do not make the LLM decide whether a quest is available.
- Do not expose task ids, template ids, objective ids, or internal status text in the player-facing option label.
- Do not add a new ContentPool field unless review later decides `giverNpcId` is insufficient as the dialogue publishing rule.
- Do not create a parallel quest acceptance path.

## Open Question

Should `giverNpcId` alone mean "this NPC can publish this quest through dialogue"?

Initial recommendation: yes for this change, because current quest design already treats NPC dialogue as a first-class quest trigger. If future content needs an NPC to be the historical source of a quest but not the current publisher, add a separate ContentPool field in a later YAML/schema change.

## Impact

- Players get a visible, stable signal that an option can advance a quest flow.
- Quest options stay immersive because labels are still generated as natural player speech.
- The task marker and color stay deterministic because the system applies them from option metadata.
- Existing TUI marker behavior can be reused.

## Test Impact

| Test File | Coverage |
|-----------|----------|
| `src/__tests__/dialogue-generator.test.ts` | NPC-given available quest produces a `quest_trigger_menu` with `tag: "quest"`. |
| `src/__tests__/dialogue-generator.test.ts` | LLM output for quest directions keeps the generated label and does not require marker text in label. |
| `src/__tests__/dialogue-generator.test.ts` | Already active, completed, prerequisite-blocked, relation-blocked, cooldown-blocked, and storyline child quests are not offered. |
| `src/__tests__/dialogue-generator.test.ts` | LLM parse failure falls back to deterministic quest intent labels while preserving `tag: "quest"`. |
| `src/__tests__/dialogue-generator.test.ts` | Selecting the quest intent still returns sub-options / executes existing quest accept path. |
