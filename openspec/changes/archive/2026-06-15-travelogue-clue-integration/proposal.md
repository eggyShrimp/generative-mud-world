# Proposal: travelogue-clue-integration

## Why

线索系统(clue-system)已实现，但玩家获得的线索无可视化入口。线索本质上不是资产/道具，而是世界知识和叙事元素。游记面板已经是"这一天发生了什么"的叙事容器，将线索注入游记生成流程是最自然且低心智负担的做法——不需要新面板、新快捷键、新协议。

## What Changes

This change depends on the `clueDefinitions` ContentPool field being a fully maintained content path, not just a static array read by engine code. Before the travelogue generator consumes clues, the clue content path must have schema validation, LLM tool support, tool-call parsing, materialization, evolve write-back, boundary checks, and tests.

After that ContentPool path is complete, the existing travelogue generator reads `player.knownClues` and `world.contentPool.clueDefinitions` when generating an end-of-day travelogue. Clues learned since the player's previous travelogue entry are added to the prompt and to `TravelogueEntry.keyEvents`.

The change does not add a TUI panel, protocol field, or new state store. The existing travelogue panel continues to render `narrative` and `keyEvents`.

## Change Type

**engine-logic** — Engine/combat/simulation/llm/core logic change.

new-feature

## Modules Touched

| File | Change Type | Description |
|------|-------------|-------------|
| `src/llm/tools/content-pool-evolve.ts` | modify-tool | Add/verify `add_clue_definition` tool for LLM-generated clue definitions |
| `src/llm/tool-mutations.ts` | modify-parser | Parse `add_clue_definition` tool calls into `ContentPoolMutation.addClueDefinitions` |
| `src/llm/prompts/content-pool-evolve.ts` | modify-prompt | Document how LLM can emit clue definitions during ContentPool evolution |
| `src/core/types.ts` | verify-type | Ensure `ClueDefinition`, `ContentPool.clueDefinitions`, and `ContentPoolMutation.addClueDefinitions` are present |
| `src/core/schemas/content-pool.ts` | verify-schema | Ensure `ClueDefinitionSchema` validates clue data |
| `src/core/content-pool-loader.ts` | verify-loader | Ensure `clueDefinitions` loads from and writes back to the social-dialogue domain |
| `src/simulation/content-pool-materializer.ts` | verify-materializer | Ensure clue definition mutations are applied and updated by id |
| `.dependency-cruiser.js` | verify-boundary | Ensure ContentPool loader/schema/tooling boundaries remain enforced |
| `src/llm/travelogue-generator.ts` | modify-function | `buildTraveloguePrompt` 注入今日线索上下文；`generateTravelogueEntry` 将线索加入 `keyEvents` |

## ContentPool Reads

| pool.xxx field | Used in (file) | Purpose |
|----------------|----------------|---------|
| `clueDefinitions` | `travelogue-generator.ts` | 从 `clueId` 查 `ClueDefinition.description` 以在 prompt 和 keyEvents 中显示线索文本 |

## Trap Token Self-Check

| Trap | Applies? | How Addressed |
|------|:--:|---------------|
| no-hardcoded-labels (new Record<string,string>) | no | 不新增标签映射 |
| no-direct-world-mutation (push/assign to state) | no | 只读取 player.knownClues 和 pool.clueDefinitions，不写状态 |
| no-create-default-outside-world | no | 无新增默认值 |
| no-hardcoded-description-text (Chinese in engine/combat) | no | 提示文本来自 ContentPool 线索定义，不硬编码 |
| no-empty-catch | no | 现有 catch 已有处理 |

## Impact

- 游记叙事中自动融入当天获得的线索信息
- `keyEvents` 列表中保留结构化线索记录
- 零 TUI 侵入：无新面板、无新快捷键、无新协议字段
- 零数据层侵入：复用已有 `player.knownClues` 和 `pool.clueDefinitions`
- 不从事件日志推断当天边界；只注入上一条游记之后获得的线索，避免重复展示旧线索
