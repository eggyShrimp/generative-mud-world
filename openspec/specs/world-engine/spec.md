# world-engine Specification

## Purpose
Defines engine behavior for core world actions and capabilities.
## Requirements
### Requirement: Player can read readable items

The engine MUST expose and execute a `read` command for readable items without consuming the item.

#### Scenario: Read a book from inventory

- **GIVEN** the player has an inventory item with `properties.readable === true`
- **AND** ContentPool has matching `bookContents` for the item's `templateId`
- **WHEN** the player executes `read` with that `itemId`
- **THEN** the command returns a `book_read` event
- **AND** returns `bookDisplay` with the book title and pages
- **AND** returns need and trait changes through `SimulationDelta`
- **AND** the item remains in inventory

#### Scenario: Read a book in the room

- **GIVEN** the current room contains an item with `properties.readable === true`
- **AND** ContentPool has matching `bookContents` for the item's `templateId`
- **WHEN** the player executes `read` with that room item id
- **THEN** the command returns `bookDisplay` for that item

#### Scenario: Missing readable content

- **GIVEN** an item is marked readable
- **AND** ContentPool has no matching book content
- **WHEN** the player executes `read`
- **THEN** the command returns an error
- **AND** no read effects are applied

### Requirement: Read capability is discoverable

The engine MUST include a `read` capability for readable room and inventory items.

#### Scenario: Derive read capability

- **GIVEN** the player can access readable items in inventory or the current room
- **WHEN** capabilities are derived
- **THEN** the `read` capability includes those item ids
- **AND** the label comes from ContentPool event titles

### Requirement: LLM can generate quest templates through content_pool_evolve

The `CONTENT_POOL_EVOLVE_TOOLS` array MUST include an `add_quest_template` tool definition
with the full QuestTemplate JSON schema so that LLM can output quest templates during
`content_pool_evolve` cycles. Generated quest templates MUST be validated by
`QuestTemplateSchema` and persisted through the existing ContentPool mutation pipeline.

#### Scenario: add_quest_template tool call produces a valid quest mutation

- **GIVEN** `content_pool_evolve` is triggered at the configured `checkDay`
- **AND** the LLM receives the `add_quest_template` tool definition
- **WHEN** the LLM calls `add_quest_template` with a JSON object matching QuestTemplate schema
- **THEN** `contentPoolMutationFromToolCalls` parses the call into `mutation.addQuestTemplates`
- **AND** the materializer upserts the template into `pool.questTemplates`
- **AND** the loader persists it to `evolve/quests.yaml`
- **TEST** `src/__tests__/llm-dispatcher.test.ts`: tool call with `add_quest_template` name produces mutation with `addQuestTemplates`

#### Scenario: add_quest_template schema includes advanced fields

- **GIVEN** the `add_quest_template` tool definition is sent to LLM
- **WHEN** the LLM inspects the tool parameters
- **THEN** the schema includes fields for `autoDiscover`, `autoTrigger`, `prerequisites`, `minRelation`, `stages`, `deadlineDays`, `cooldownDays`, and `abandonPenalty`
- **AND** each field's `description` explains when to use it
- **TEST** `src/__tests__/llm-dispatcher.test.ts`: tool definition exists in `CONTENT_POOL_EVOLVE_TOOLS`

### Requirement: content_pool_evolve prompt provides complete world-state context

The `buildContentPoolEvolvePrompt` function MUST include in its user message:
- All existing base context fields (`era`, `existingNeeds`, `existingActions`, `existingRoles`, `existingCultures`, `existingTraitLabels`, `previousRoomTemplateCultures`)
- A summary of world NPCs (`existingNpcs` with `id`, `name`, `room`, `role`, `personality`)
- A summary of world rooms (`existingRooms` with `id`, `name`, `region`, `tags`)
- A summary of existing quests (`existingQuests` with `id`, `title`)
- A summary of item templates (`existingItemTemplates` with `id`, `name`)
- A summary of clue definitions (`existingClues` with `id`, `description`) when available

The context MUST be provided to the LLM via the user message portion of the prompt, not only as system prompt instructions.

#### Scenario: User message includes base context fields

- **GIVEN** `buildContentPoolEvolvePrompt` is called with context containing `existingNeeds`, `existingActions`, and `era`
- **WHEN** the prompt is built
- **THEN** the user message JSON includes `era`, `existingNeeds`, `existingActions`, `existingRoles`, `existingCultures`, `existingTraitLabels`, and `previousRoomTemplateCultures`
- **TEST** `src/__tests__/llm-dispatcher.test.ts`: user message JSON contains all base context keys

#### Scenario: User message includes NPC and room summaries

- **GIVEN** the world has NPC `npc_monk_faxian` in room `room_dunhuang_mogao` with personality "温和平静"
- **AND** the world has room `room_yumen_beacon` named "玉门烽燧" with tag `garrison`
- **WHEN** `buildContentPoolEvolvePrompt` is called with this world state
- **THEN** the user message contains the NPC name "法显" and room name "玉门烽燧"
- **TEST** `src/__tests__/llm-dispatcher.test.ts`: user message includes real NPC name and room name from world

#### Scenario: User message includes existing quest and item information

- **GIVEN** the ContentPool has quest `quest_mogao_cipher` titled "千佛暗码"
- **AND** the ContentPool has item template `sutra_copy` named "佛经抄本"
- **WHEN** `buildContentPoolEvolvePrompt` is called
- **THEN** the user message contains the quest title "千佛暗码" and the item name "佛经抄本"
- **TEST** `src/__tests__/llm-dispatcher.test.ts`: user message includes quest title and item name from ContentPool

### Requirement: Quest generation prompt enforces quality constraints

The system prompt for `content_pool_evolve` MUST include explicit guidance that prevents
trivial task generation. Specifically, the prompt MUST:
- Prohibit single-objective talk-only tasks
- Require tasks to reference real NPC/room/item IDs from the provided context
- Require task descriptions to establish a narrative causal chain
- Require mixed objective types (talk + explore + collect)
- Require rewards to be connected to the task's narrative content
- Show an example of a good quest and an example of a bad quest

#### Scenario: Prompt contains anti-pattern prohibitions

- **GIVEN** the `content_pool_evolve` system prompt is built
- **WHEN** the prompt is inspected
- **THEN** it contains language prohibiting single talk-only objectives
- **AND** it requires referencing existing entity IDs
- **AND** it requires mixed objective types
- **TEST** `src/__tests__/llm-dispatcher.test.ts`: system prompt contains quality constraints and examples

#### Scenario: Prompt provides good vs bad quest examples

- **GIVEN** the `content_pool_evolve` system prompt is built
- **WHEN** the prompt is inspected
- **THEN** it contains an example task with multiple objective types, narrative depth, and specific entity references
- **AND** it contains a counter-example that violates these rules with an explanation of why it is bad
- **TEST** `src/__tests__/llm-dispatcher.test.ts`: system prompt includes both positive and negative example tasks

### Requirement: 玩家初始铜币名称来自 ContentPool

`createPlayer()` MUST 从 `contentPool.itemTemplates` 中查找 `templateId === "copper_coin"` 的模板名作为初始铜币的名称，而非硬编码 `"铜币"`。

#### Scenario: ContentPool 有 copper_coin 模板

- **GIVEN** ContentPool 的 `itemTemplates` 包含 `{ id: "copper_coin", name: "开元通宝", properties: { currency: true } }`
- **WHEN** `createPlayer(contentPool, id)` 被调用
- **THEN** 创建的玩家 inventory 中 5 枚铜币的 `name` 均为 `"开元通宝"`
- **TEST** `src/__tests__/world.test.ts`: 验证 `createPlayer` 输出的货币名称

#### Scenario: ContentPool 无 copper_coin 模板时回退

- **GIVEN** ContentPool 的 `itemTemplates` 为空或不包含 `copper_coin`
- **WHEN** `createPlayer(contentPool, id)` 被调用
- **THEN** 创建的玩家 inventory 中铜币的 `name` 为 `"铜币"`
- **TEST** `src/__tests__/world.test.ts`: 验证回退值

#### Scenario: 查找条件使用精确模板 ID 而非 currency 属性

- **GIVEN** ContentPool 包含多个 `currency: true` 的模板
- **WHEN** `createPlayer(contentPool, id)` 被调用
- **THEN** 初始铜币名称使用模板 `id === "copper_coin"` 的名称
- **TEST** `src/__tests__/world.test.ts`: 验证使用正确的模板 ID 查找

### Requirement: Room entities include item properties

The `getRoomEntitiesInfo` function SHALL include `properties` in the returned entity info for item-type entities.

#### Scenario: Item entity in room carries properties

- **GIVEN** a room contains an item entity with `type: "item"` and `properties: { weapon: true, atkBonus: 5 }`
- **WHEN** `getRoomEntitiesInfo(world, roomId)` is called
- **THEN** the returned entry for that item SHALL include `properties` field matching the entity's `ItemEntity.properties`
- **VERIFY** `src/__tests__/engine.test.ts`

#### Scenario: Non-item entity does not carry properties

- **GIVEN** a room contains an NPC entity with `type: "npc"`
- **WHEN** `getRoomEntitiesInfo(world, roomId)` is called
- **THEN** the returned entry for that NPC SHALL NOT include a `properties` field
- **VERIFY** `src/__tests__/engine.test.ts`

#### Scenario: Item entity with empty properties

- **GIVEN** a room contains an item entity with `type: "item"` and `properties: {}`
- **WHEN** `getRoomEntitiesInfo(world, roomId)` is called
- **THEN** the returned entry SHALL include `properties: {}`
- **VERIFY** `src/__tests__/engine.test.ts`

### Requirement: Server generates follow-up dialogue options from selected NPC text

The server MUST accept a request to generate follow-up options for selected NPC text and MUST return existing `DialogueOption` objects that can be selected through the normal `talk` flow.

#### Scenario: Generate follow-up options

- **GIVEN** a connected player is in dialogue with an NPC
- **AND** the client sends `request_follow_up_options` with the NPC id and selected NPC text
- **WHEN** the server handles the request
- **THEN** it calls the dialogue generator with the player id, NPC id, and selected text
- **AND** it sends `follow_up_options`
- **AND** each option has `type: "idle_chat"`
- **TEST** `src/__tests__/ws-server.test.ts`: request message returns `follow_up_options`

#### Scenario: Invalid selected text is rejected

- **GIVEN** a connected player sends `request_follow_up_options`
- **AND** `context` is empty or only whitespace
- **WHEN** the server validates the message
- **THEN** it sends an error
- **AND** it does not call the dialogue generator
- **TEST** `src/__tests__/ws-server.test.ts`: invalid context returns error

#### Scenario: Selected player text still produces usable follow-ups

- **GIVEN** the selected text appears to be the player's own dialogue line
- **WHEN** the server generates follow-up options
- **THEN** generated options stay usable as player questions
- **AND** they do not treat the selected player sentence as NPC knowledge
- **TEST** `src/__tests__/dialogue-generator.test.ts`: player-line context remains usable

#### Scenario: Empty generator result is allowed

- **GIVEN** the LLM response cannot be parsed into valid follow-up labels
- **WHEN** follow-up options are generated
- **THEN** the generator returns an empty option list
- **AND** it does not invent replacement world facts
- **TEST** `src/__tests__/dialogue-generator.test.ts`: malformed output returns empty list

### Requirement: Follow-up generation does not create a parallel dialogue execution path

Generated follow-up options MUST reuse the existing dialogue option and `talk` execution path.

#### Scenario: Choosing a generated follow-up uses normal talk

- **GIVEN** the server has returned follow-up options
- **WHEN** the player chooses one option
- **THEN** the client sends the existing `talk` message
- **AND** the engine handles it through the existing `handleChatOption` path
- **AND** any world state changes go through `SimulationDelta`
- **TEST** `src/__tests__/integration/dialogue-pipeline.test.ts`: generated follow-up option applies normal dialogue delta

### Requirement: NPC relationship feedback affects detail level, not basic answer availability

NPC replies MUST use relationship context to adjust detail and tone without turning poor relationship into default refusal.

#### Scenario: Normal relationship receives a normal answer

- **GIVEN** the player asks an NPC a normal follow-up question
- **AND** the relationship is ordinary
- **WHEN** follow-up options are generated and one is selected
- **THEN** the options remain normal player questions
- **AND** the reply flow uses the normal `talk` path
- **TEST** `src/__tests__/dialogue-generator.test.ts`: ordinary relationship produces usable follow-up options

#### Scenario: Good relationship receives more detail

- **GIVEN** the player asks an NPC a normal follow-up question
- **AND** the relationship is good
- **WHEN** follow-up options are generated
- **THEN** detail-oriented follow-up options are allowed
- **AND** known clues may be surfaced only through existing known-clue context
- **TEST** `src/__tests__/dialogue-generator.test.ts`: good relationship can produce detail-oriented follow-up options

#### Scenario: Poor relationship does not block basic answers

- **GIVEN** the player asks an NPC a normal follow-up question
- **AND** the relationship is poor
- **WHEN** follow-up options are generated and then one is selected
- **THEN** the options remain usable player questions
- **AND** the reply flow still uses the normal `talk` path
- **AND** no refusal-only option set is forced by relationship alone
- **TEST** `src/__tests__/dialogue-generator.test.ts`: poor relationship does not force refusal-only options

### Requirement: Follow-up topic tool describes relationship depth without changing schema

The `suggest_followup_topics` tool MUST keep its existing schema while describing the same relationship feedback behavior used by follow-up option generation.

#### Scenario: Tool description guides depth by relationship

- **GIVEN** dialogue tools are built from ContentPool
- **WHEN** the `suggest_followup_topics` tool is inspected
- **THEN** its description says topics are player-facing follow-up questions
- **AND** it says good relationship may allow deeper or more detailed follow-ups
- **AND** it says poor relationship should still keep options usable
- **AND** the tool parameter schema is unchanged
- **TEST** `src/__tests__/dialogue-tools.test.ts`: description and schema are verified

### Requirement: Large files MUST be split by responsibility with shell re-export

Each engine source file exceeding 1000 lines MUST be split into sub-modules grouped by responsibility.
The original file MUST remain as a shell that re-exports all public APIs so consumers do not need to change.

#### Scenario: world.ts is split

- **GIVEN** `src/core/world.ts` is 1765 lines with mixed responsibilities
- **WHEN** the split is implemented
- **THEN** sub-modules exist under `src/core/world/` (defaults.ts, entity-ops.ts, room-region.ts, event-log.ts, time-weather.ts, delta-application.ts, factories.ts)
- **AND** `src/core/world.ts` re-exports all original public exports
- **AND** `import { getEntity } from "../core/world.ts"` still works for all consumers

#### Scenario: command-executor.ts is split

- **GIVEN** `src/engine/command-executor.ts` is 1685 lines with 20 commands in a single switch
- **WHEN** the split is implemented
- **THEN** command implementation files exist under `src/engine/commands/`
- **AND** `src/engine/command-executor.ts` contains `executeCommand` with a forwarding switch
- **AND** all 20 command behavior tests pass unchanged

#### Scenario: dialogue-generator.ts is split

- **GIVEN** `src/llm/dialogue-generator.ts` is 2359 lines with ~40 private methods in a single class
- **WHEN** the split is implemented
- **THEN** private method bodies are extracted to free functions under `src/llm/dialogue/`
- **AND** the `DialogueGenerator` class shell retains its 6 public method signatures
- **AND** all dialogue tests pass unchanged

#### Scenario: ws-server.ts is split

- **GIVEN** `src/server/ws-server.ts` is 1085 lines
- **WHEN** the split is implemented
- **THEN** helper modules exist under `src/server/ws/`
- **AND** the `GameServer` class retains its public API
- **AND** all WS tests pass unchanged

#### Scenario: types.ts is split

- **GIVEN** `src/core/types.ts` is 1040 lines with ~95 type definitions
- **WHEN** the split is implemented
- **THEN** type files exist under `src/core/types/` grouped by domain
- **AND** `src/core/types/index.ts` re-exports all types
- **AND** `tsc --noEmit` reports zero errors
- **AND** no consumer import paths change

### Requirement: Split extraction order MUST follow dependency hierarchy

Shared utility functions that are imported by multiple sub-modules MUST be extracted first.
No extraction step MAY introduce circular dependencies between new sub-modules.

#### Scenario: command helpers extracted first

- **GIVEN** `src/engine/command-executor.ts` is being split
- **WHEN** extraction begins
- **THEN** `commands/helpers.ts` is created first (buildDelta, resolveActionEffect, fail, etc.)
- **AND** all subsequent execute* extractions import from helpers.ts without circular dependencies

#### Scenario: dialogue context builders extracted early

- **GIVEN** `src/llm/dialogue-generator.ts` is being split
- **WHEN** extraction begins
- **THEN** `dialogue/helpers.ts` and `dialogue/context-builders.ts` are created first
- **AND** subsequent sub-modules import from these without circular dependencies

### Requirement: Verification MUST run after each file split

Every individual file split MUST run full build, lint, depcruise, and test verification before proceeding.

#### Scenario: Verification after each split step

- **GIVEN** a sub-module has been extracted from a large file
- **WHEN** the shell file has been updated to import and re-export
- **THEN** `npm test` passes
- **AND** `npm run build -- --noEmit` passes
- **AND** `npx depcruise src` reports zero violations

### Requirement: Quality cleanup MUST be tracked as a formal OpenSpec change

The remaining P3-P4 engineering-quality work MUST live under `openspec/changes/engineering-quality-p3-p4` and MUST be validated by OpenSpec before implementation proceeds.

#### Scenario: The change validates

- **GIVEN** the engineering-quality P3-P4 change exists
- **WHEN** `openspec validate engineering-quality-p3-p4 --strict` is run
- **THEN** validation succeeds

### Requirement: Lint-blocking hardcoded Chinese fallbacks MUST be removed without new local fallback text

The engine MUST remove the current hardcoded Chinese fallback values reported by the custom Biome Grit rules by using existing ContentPool-backed mechanisms, explicit null/empty skip behavior, or a separate ContentPool schema/YAML change.

#### Scenario: Lint no longer reports hardcoded fallback values

- **GIVEN** the fallback cleanup is implemented
- **WHEN** `npm run lint` is run
- **THEN** the 10 current hardcoded Chinese fallback errors are gone
- **AND** no replacement local fallback text has been added to bypass the rule

#### Scenario: Fallback cleanup targets are stable

- **GIVEN** `plugins/no-hardcoded-fallback.grit` reports diagnostics
- **WHEN** cleanup tasks are written
- **THEN** they reference the rule name and target file
- **AND** line numbers are treated as diagnostic snapshots, not stable spec identifiers

#### Scenario: A missing ContentPool value is required

- **GIVEN** a fallback value has no existing ContentPool field and cannot be represented by null/skip behavior
- **WHEN** the implementation reaches that item
- **THEN** the item is split into a separate `world-yaml` change
- **AND** it follows the ContentPool field checklist

### Requirement: ESM tests MUST NOT use local CommonJS require

Test helpers in this module MUST use ESM imports in the `"type": "module"` project.

#### Scenario: ContentPool loader test writes YAML

- **GIVEN** `src/__tests__/content-pool-loader.test.ts` imports YAML helpers at the file top level
- **WHEN** the test writes a YAML file
- **THEN** it uses the existing ESM import
- **AND** it does not call `require("yaml")`

### Requirement: Type-only cleanup MUST remain behavior-neutral

Simulation type cleanup MUST replace inline type imports with top-level `import type` references without introducing runtime guards or new behavior.

#### Scenario: Simulation behavior is unchanged

- **GIVEN** inline type references in `src/simulation/index.ts` are replaced with top-level type imports
- **WHEN** simulation tests run
- **THEN** behavior remains unchanged
- **AND** no new runtime type guard is added solely to hide the type cleanup

### Requirement: Boundary tests MUST separate current behavior from contract changes

Boundary coverage MUST distinguish behavior that can be tested as-is from behavior that requires a contract decision first.

#### Scenario: Existing clamp behavior is tested

- **GIVEN** a need change would move a need outside `[0, 100]`
- **WHEN** the delta is applied
- **THEN** the resulting need value stays within `[0, 100]`

#### Scenario: Missing target behavior is contract-first

- **GIVEN** a delta references a missing `targetId`
- **WHEN** the team decides whether `applyDelta` remains `void` or reports structured errors
- **THEN** tests assert that chosen observable behavior
- **AND** implementation does not add an unrelated fallback path

#### Scenario: Empty name pool behavior is contract-first

- **GIVEN** a name pool has no usable names
- **WHEN** the team decides whether generation should fail, skip, or use configured data
- **THEN** tests assert that chosen behavior
- **AND** implementation does not add hardcoded name text

### Requirement: Quest registry status MUST be stated as current code facts

The engineering-quality change MUST NOT track vague quest follow-up items when the registry migration phase is already complete in current code.

#### Scenario: Old QuestObjective type enum is absent

- **GIVEN** current `QuestObjective` type definitions and ContentPool schema
- **WHEN** the engineering-quality change describes quest registry status
- **THEN** it states that `QuestObjective.condition` is the active format
- **AND** it states that the old `QuestObjective.type` enum is absent from `src/core/types.ts` and `src/core/schemas/content-pool.ts`

#### Scenario: Future quest work references exact phase criteria

- **GIVEN** a future quest registry regression is found
- **WHEN** a task is added to this change
- **THEN** it references the exact failing phase or acceptance criterion from `docs/specs/quest-evaluator-registry.md`
- **AND** it does not use a generic "confirm remaining items" task

### Requirement: Large-file splits MUST preserve behavior

Large-file decomposition MUST move one responsibility at a time and preserve the existing external behavior of the moved code.

#### Scenario: A large file responsibility is extracted

- **GIVEN** code is moved from a large source file into a focused module
- **WHEN** build and targeted tests are run
- **THEN** existing imports still work or are intentionally updated
- **AND** behavior remains unchanged except for explicitly specified cleanup

#### Scenario: Delta application extraction handles current applyDelta contract

- **GIVEN** `src/core/world.ts` delta application is extracted
- **WHEN** `applyDelta` is moved to a focused module
- **THEN** the implementation either preserves `applyDelta(world, delta): void` warning-only behavior
- **OR** first defines and tests a structured error observability contract

