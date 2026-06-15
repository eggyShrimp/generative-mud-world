# Tasks: travelogue-clue-integration

## Module: ContentPool Clue Definition Maintenance

- [ ] In `src/core/types.ts`: verify `ClueDefinition`, `ContentPool.clueDefinitions`, and `ContentPoolMutation.addClueDefinitions` are present and match the YAML data shape
- [ ] In `src/core/schemas/content-pool.ts`: verify `ClueDefinitionSchema` validates every required clue field
- [ ] In `src/core/schemas/index.ts`: verify `ClueDefinitionSchema` is exported for loader/tool parser reuse
- [ ] In `src/core/content-pool-loader.ts`: verify `DOMAIN_FIELDS` routes `clueDefinitions` to `social-dialogue`
- [ ] In `src/core/content-pool-loader.ts`: verify `DOMAIN_SCHEMAS` validates `clueDefinitions` with `ClueDefinitionSchema`
- [ ] In `src/llm/tools/content-pool-evolve.ts`: add or verify an `add_clue_definition` tool with JSON schema for `id`, `description`, `knownByNpcIds`, and optional `relatedRoomId`
- [ ] In `src/llm/tool-mutations.ts`: parse `add_clue_definition` tool calls into `ContentPoolMutation.addClueDefinitions`
- [ ] In `src/llm/prompts/content-pool-evolve.ts`: document when and how the LLM should emit `addClueDefinitions`
- [ ] In `src/simulation/content-pool-materializer.ts`: verify `addClueDefinitions` adds new clues and updates existing clues by `id`
- [ ] In `src/core/content-pool-loader.ts`: verify `writeEvolveDeltas()` persists `addClueDefinitions` to `content-pool/evolve/social-dialogue.yaml`
- [ ] In `worlds/content-pool/social-dialogue.yaml`: verify shipped clue definitions live in the social-dialogue content domain
- [ ] In `.dependency-cruiser.js`: keep or add boundary constraints so runtime modules do not import raw ContentPool loader/schema/tooling outside approved boundaries

## Tests: ContentPool Clue Definition Chain

- [ ] In `src/__tests__/content-pool-loader.test.ts`: add loader coverage for `social-dialogue.yaml` `clueDefinitions`
- [ ] In `src/__tests__/content-pool-loader.test.ts`: add schema rejection coverage for malformed clue definitions
- [ ] In `src/__tests__/content-pool-loader.test.ts`: add write-back coverage proving `addClueDefinitions` persists to `evolve/social-dialogue.yaml`
- [ ] In `src/__tests__/content-pool-loader.test.ts`: add reload coverage proving persisted clue definitions survive `loadContentPoolFromDir`
- [ ] In `src/__tests__/llm-tool-mutations.test.ts`: add parser coverage for `add_clue_definition`
- [ ] In `src/__tests__/llm-dispatcher.test.ts`: add dispatcher coverage proving `add_clue_definition` is exposed during ContentPool evolution
- [ ] In `src/__tests__/content-pool-materializer.test.ts`: add materializer coverage for adding and updating clue definitions
- [ ] Run `npx depcruise src --config .dependency-cruiser.js` after any boundary-rule change

## Module: LLM — Travelogue Generator (`src/llm/travelogue-generator.ts`)

- [ ] In `src/llm/travelogue-generator.ts` `buildTraveloguePrompt`: filter `player.knownClues` for clues learned after the player's previous travelogue and no later than the current world tick (`lastTravelogue.createdAt < learnedAt <= world.tick`)
- [ ] In `src/llm/travelogue-generator.ts` `buildTraveloguePrompt`: for each todayClue, lookup `world.contentPool.clueDefinitions` for description and `world.entities` for NPC source name
- [ ] In `src/llm/travelogue-generator.ts` `buildTraveloguePrompt`: append "今日获悉的线索" section to prompt lines before "今日事件" section
- [ ] In `src/llm/travelogue-generator.ts` `generateTravelogueEntry`: include clue descriptions in `keyEvents` after event descriptions
- [ ] In `src/llm/travelogue-generator.ts`: skip clue injection when `player.knownClues` is empty or no valid clue definitions are found
- [ ] In `src/llm/travelogue-generator.ts`: skip any clue whose definition is missing; do not generate fallback clue text
- [ ] In `src/llm/travelogue-generator.ts`: include source NPC name when found, and omit the source label when the NPC is missing

## Tests (`src/__tests__/travelogue-generator.test.ts`)

- [ ] Add a prompt test proving clues learned since the previous travelogue appear under "今日获悉的线索"
- [ ] Add a prompt test proving clues learned before the previous travelogue are not repeated
- [ ] Add an entry test proving clue descriptions are appended to `keyEvents`
- [ ] Add a guard test proving missing `clueDefinition` entries are skipped without fallback text

## Verification (`npm run lint && npx vitest run && npx depcruise src --config .dependency-cruiser.js`)

- [ ] Run `npm run lint`
- [ ] Run `npx vitest run`
- [ ] Run `npx depcruise src --config .dependency-cruiser.js`
- [ ] Trap token re-check:
  - [ ] no-hardcoded-labels: no new `Record<string,string>`
  - [ ] no-direct-world-mutation: read-only
  - [ ] no-create-default-outside-world: no new defaults
  - [ ] no-hardcoded-description-text: text from ContentPool
  - [ ] no-empty-catch: no new catch blocks
- [ ] Manual: 对话获取线索后 end_day，游记 narrative 提及线索，keyEvents 包含线索记录
