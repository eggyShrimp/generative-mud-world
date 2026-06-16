## ADDED Requirements

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
