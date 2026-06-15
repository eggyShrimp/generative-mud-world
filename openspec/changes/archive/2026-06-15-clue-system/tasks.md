# Tasks: clue-system

## 0. Split OpenSpec Changes

- [ ] Create `openspec/changes/clue-content-pool/` with `schema: world-yaml`
- [ ] Create `openspec/changes/clue-engine/` with `schema: world-engine`
- [ ] Keep this directory as the umbrella plan, or archive it after the two schema-specific changes exist

## 1. ContentPool Data (`world-yaml`)

- [ ] Add `ClueDefinition` to `src/core/types.ts`
- [ ] Add `clueDefinitions: ClueDefinition[]` to `ContentPool` in `src/core/types.ts`
- [ ] Decide whether Phase 1 includes LLM evolution; if yes, add `addClueDefinitions?: ClueDefinition[]` to `ContentPoolMutation` in `src/core/types.ts`
- [ ] Add `ClueDefinitionSchema` to `src/core/schemas/content-pool.ts`
- [ ] Add `clueDefinitions` to `ContentPoolSchema` in `src/core/schemas/content-pool.ts`
- [ ] Export new schemas from `src/core/schemas/index.ts` if the project needs direct schema imports
- [ ] Register `clueDefinitions` under the selected YAML domain in `DOMAIN_FIELDS` at `src/core/content-pool-loader.ts`
- [ ] Register the schema in `DOMAIN_SCHEMAS` at `src/core/content-pool-loader.ts`
- [ ] If Phase 1 includes LLM evolution, add `addClueDefinitions` handling in `src/simulation/content-pool-materializer.ts`
- [ ] If Phase 1 includes LLM evolution, add write-back routing in `writeEvolveDeltas` at `src/core/content-pool-loader.ts`
- [ ] If Phase 1 includes LLM evolution, expose the mutation in `src/llm/prompts/content-pool-evolve.ts`
- [ ] Add `clueDefinitions: []` default in `createDefaultContentPool()` at `src/core/world.ts`
- [ ] Add initial sample clues to `worlds/content-pool/social-dialogue.yaml`
- [ ] Run `rg "clueDefinitions" src/ --type ts | grep -v __tests__ | grep -v "\.d\.ts"` and confirm all consumers are intentional

## 2. Runtime Types (`world-engine`)

- [ ] Add `KnownClue` to `src/core/types.ts` with `{ clueId, sourceNpcId?, learnedAt }`
- [ ] Add `KnownClueChange` to `src/core/types.ts` with `{ playerId, clueId, sourceNpcId? }`
- [ ] Add `DiscoverableCondition` to `src/core/types.ts` with `{ requiredClueId }`
- [ ] Add `DiscoverableChange` to `src/core/types.ts` with `{ playerId, entityId, operation: "discover" }`
- [ ] Add `knownClues: KnownClue[]` to `PlayerEntity` in `src/core/types.ts`
- [ ] Add `discoveredEntities: EntityId[]` to `PlayerEntity` in `src/core/types.ts`
- [ ] Add `discoverable?: DiscoverableCondition` to `ItemEntity` in `src/core/types.ts`
- [ ] Add `knownClueChanges?: KnownClueChange[]` to `SimulationDelta` in `src/core/types.ts`
- [ ] Add `discoverableChanges?: DiscoverableChange[]` to `SimulationDelta` in `src/core/types.ts`
- [ ] Extend `ExitConditionSchema.type` to include `"clue"` in `src/core/schemas/exit.ts`

## 3. State Write Path (`world-engine`)

- [ ] Initialize `knownClues: []` in `createPlayer()` at `src/core/world.ts`
- [ ] Initialize `discoveredEntities: []` in `createPlayer()` at `src/core/world.ts`
- [ ] Implement `applyDelta` handling for `knownClueChanges` in `src/core/world.ts`
- [ ] Implement `applyDelta` handling for `discoverableChanges` in `src/core/world.ts`
- [ ] Ensure `applyDelta` skips duplicate known clues and duplicate discovered entities in `src/core/world.ts`
- [ ] Ensure `applyDelta` logs and ignores invalid player IDs, invalid entity IDs, and non-discoverable entities in `src/core/world.ts`
- [ ] Add `knownClueChanges` merging to `composeDeltas()` in `src/engine/delta-composer.ts`
- [ ] Add `discoverableChanges` merging to `composeDeltas()` in `src/engine/delta-composer.ts`
- [ ] Add both fields to the empty-delta check in `src/engine/delta-composer.ts` and `src/engine/act-loop.ts`
- [ ] Add event conversion for clue acquisition and discovery in `deltaToEvents()` at `src/engine/delta-composer.ts`

## 4. Dialogue Acquisition (`world-engine`)

- [ ] Extend `ShareInformationArgs` with optional `clue_id` in `src/llm/dialogue-tools.ts`
- [ ] Update the `share_information` tool description in `src/llm/dialogue-tools.ts`
- [ ] In `buildContext`, read `world.contentPool.clueDefinitions` and filter clues whose `knownByNpcIds` includes the current NPC ID in `src/llm/dialogue-generator.ts`
- [ ] Inject NPC known clue summaries into `buildIdleChatPrompt()` in `src/llm/dialogue-generator.ts`
- [ ] In `processToolCalls`, validate that `clue_id` exists in `world.contentPool.clueDefinitions` in `src/llm/dialogue-generator.ts`
- [ ] In `processToolCalls`, validate that the current NPC knows the clue before producing `knownClueChanges` in `src/llm/dialogue-generator.ts`
- [ ] Preserve current `share_information` behavior when `clue_id` is missing in `src/llm/dialogue-generator.ts`

## 5. Personal Discovery (`world-engine`)

- [ ] Define how ContentPool marks room actions as discovery actions; do not hardcode a local `["search", "explore"]` list in `src/engine/command-executor.ts`
- [ ] In `executeRoomAction`, after the normal room action succeeds, scan current room entities with `discoverable` in `src/engine/command-executor.ts`
- [ ] In `executeRoomAction`, match `discoverable.requiredClueId` against `player.knownClues` in `src/engine/command-executor.ts`
- [ ] In `executeRoomAction`, return `discoverableChanges` for matching hidden entities that the player has not already discovered in `src/engine/command-executor.ts`
- [ ] Do not remove `ItemEntity.discoverable` during personal discovery in `src/engine/command-executor.ts`
- [ ] Do not use `itemChanges` for discoverability in `src/engine/command-executor.ts`

## 6. Visibility And Capability Filtering (`world-engine`)

- [ ] Update `getRoomEntitiesInfo()` to accept `playerId` or `viewerId` in `src/engine/capability-provider.ts`
- [ ] Filter discoverable entities from `getRoomEntitiesInfo()` unless `player.discoveredEntities` contains the entity ID in `src/engine/capability-provider.ts`
- [ ] Update `deriveCapabilities()` look targets to hide undiscovered entities in `src/engine/capability-provider.ts`
- [ ] Update `deriveCapabilities()` take targets to hide undiscovered items in `src/engine/capability-provider.ts`
- [ ] Update `deriveCapabilities()` move directions to show clue-gated hidden exits only when the player has the clue in `src/engine/capability-provider.ts`
- [ ] Update `src/server/ws-server.ts` to pass the active player ID into `getRoomEntitiesInfo()`
- [ ] Update room exit detail serialization in `src/server/ws-server.ts` so clue-gated hidden exits are not leaked before the player knows the clue

## 7. Move Enforcement (`world-engine`)

- [ ] In `executeMove`, allow hidden exits with `ExitCondition { type: "clue", value: clueId }` when the player knows the clue in `src/engine/command-executor.ts`
- [ ] In `executeMove`, reject clue-gated hidden exits when the player lacks the clue in `src/engine/command-executor.ts`
- [ ] Keep the server-side move check even when `deriveCapabilities()` hides the direction in `src/engine/command-executor.ts`
- [ ] Keep existing move behavior unchanged for exits without clue conditions in `src/engine/command-executor.ts`

## 8. Persistence

- [ ] Verify whether `PlayerEntity` runtime fields are captured by the current save path in `src/core/save-manager.ts`
- [ ] If `knownClues` and `discoveredEntities` are not persisted, extend `SaveData` in `src/core/types.ts`
- [ ] If needed, extend `SaveDataSchema` in `src/core/schemas/save-data.ts`
- [ ] If needed, update `SaveManager.capture()` in `src/core/save-manager.ts`
- [ ] If needed, update `SaveManager.restore()` in `src/core/save-manager.ts`
- [ ] Add migration behavior for old saves that do not contain clue state in `src/core/save-manager.ts`

## 9. Tests

- [ ] Add `share_information` + valid `clue_id` test to `src/__tests__/dialogue-generator.test.ts`
- [ ] Add `share_information` + unknown `clue_id` test to `src/__tests__/dialogue-generator.test.ts`
- [ ] Add `share_information` + clue known by another NPC test to `src/__tests__/dialogue-generator.test.ts`
- [ ] Add no-`clue_id` backward compatibility test to `src/__tests__/dialogue-generator.test.ts`
- [ ] Add `applyDelta` known clue tests to `src/__tests__/world.test.ts`
- [ ] Add `applyDelta` discoverable change tests to `src/__tests__/world.test.ts`
- [ ] Add room search discovery tests to `src/__tests__/integration/room-actions.test.ts`
- [ ] Add capability filtering tests to `src/__tests__/capability-provider.test.ts`
- [ ] Add clue-gated move tests to `src/__tests__/round-engine.test.ts`
- [ ] Add same-room multi-player visibility test to `src/__tests__/integration/multiplayer-ws.test.ts`
- [ ] Add persistence test for known clues and discovered entities to `src/__tests__/integration/multi-day-persistence.test.ts`

## Verification

- [ ] Run `npm run build -- --noEmit`
- [ ] Run `npm test`
- [ ] Run `npm run lint`
- [ ] Run `npx depcruise src --config .dependency-cruiser.js`
- [ ] Run `rg "clueDefinitions" src/ --type ts | grep -v __tests__ | grep -v "\.d\.ts"` and verify all consumers are expected
- [ ] Trap token re-check:
  - [ ] no-hardcoded-labels: no new `Record<string,string>` constants
  - [ ] no-direct-world-mutation: clue and discovery writes go through `SimulationDelta` and `applyDelta`
  - [ ] no-create-default-outside-world: no new `createDefaultXxx()` use outside `createDefaultContentPool()`
  - [ ] no-hardcoded-description-text: no new Chinese engine text outside ContentPool templates
  - [ ] no-empty-catch: no empty catch blocks
- [ ] Manual: verify a player can learn a clue from the right NPC, search the matching room, and discover the hidden entity
- [ ] Manual: verify a second player in the same room still cannot see that hidden entity before discovery
