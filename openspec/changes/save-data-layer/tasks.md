# Tasks: save-data-layer

## Module: `src/core/types.ts` — Types

- [ ] Add `conversationSummaryLabel: string` and `conversationSummaryPrompt: string` to `NarrativeTemplates`.
- [ ] Add `SaveData.version`.
- [ ] Add `SaveMeta` with `slotId`, `worldId`, `savedAt`, `gameTick`, and `round`.
- [ ] Add `ConversationSummaryEntry` with `summary` and `lastTick`.
- [ ] Add `SaveData` with `meta` and `conversations.summaries`.

## Module: `src/core/schemas/` — Schemas

- [ ] Add `conversationSummaryLabel` and `conversationSummaryPrompt` to `NarrativeTemplatesSchema`.
- [ ] Create `SaveMetaSchema`, `ConversationSummaryEntrySchema`, and `SaveDataSchema`.
- [ ] Include `version` in `SaveDataSchema`.
- [ ] Export SaveData schemas from `src/core/schemas/index.ts`.

## Module: `src/core/world.ts` and YAML — ContentPool Values

- [ ] Add default `conversationSummaryLabel` and `conversationSummaryPrompt` in `createDefaultContentPool()`.
- [ ] Add base YAML values in `worlds/content-pool/culture-narrative.yaml`.
- [ ] Keep the prompt text in ContentPool. Do not duplicate prompt text in engine code except for one guarded fallback at the access boundary.

## Module: `src/core/save-manager.ts` — Save Database and DAO

- [ ] Add `SaveLoadOptions` with `rootDir`, `slotId`, `worldId`, `currentTick`, and `currentRound`.
- [ ] Make the save root configurable. Do not hard-code tests to the repo-level `saves/` directory.
- [ ] Implement `SaveManager.load(options)`.
- [ ] Reject or reset saves whose `meta.worldId` does not match `options.worldId`.
- [ ] Validate SaveData with zod before constructing DAOs.
- [ ] Add a migration entry point for future SaveData versions.
- [ ] Implement `save()` with temp-file write, rename, and trailing newline.
- [ ] Implement `capture(world)` to update `meta.gameTick` and `meta.round`.
- [ ] Implement `restore(world)` as the single restore entry. The first version may be a no-op except for documented metadata handling.
- [ ] Avoid exposing mutable raw `data` to runtime callers.
- [ ] Add `ConversationSaveDao`.
- [ ] Implement `conversations.getSummary(playerId, npcId)`.
- [ ] Implement `conversations.setSummary(playerId, npcId, summary, tick)`.
- [ ] Keep conversation key construction inside `ConversationSaveDao`.

## Module: `src/llm/dialogue-generator.ts` — Dialogue Integration

- [ ] Accept a SaveData DAO or `SaveManager` in the constructor.
- [ ] Read prior summaries through `saveManager.conversations.getSummary(...)`.
- [ ] Inject prior summaries into idle-chat prompts when a summary exists.
- [ ] On `close`, return the close result without awaiting summary generation.
- [ ] Run summary generation and SaveData write in a background task.
- [ ] Catch and log background summary failures.
- [ ] Do not send any client message from the background summary task.
- [ ] Keep full in-memory conversation history for the active conversation.
- [ ] Consider a per `playerId:npcId` queue only if summary writes become visibly out of order.

## Module: `src/index.ts` — Wiring

- [ ] Derive `worldId` from the world file or explicit config.
- [ ] Load SaveData after `loadWorldFromYaml()`.
- [ ] Add `SAVE_SELECT=skip|prompt` behavior.
- [ ] Keep `SAVE_SELECT=skip` suitable for development so local startup can load `SAVE_SLOT` directly.
- [ ] Pass SaveData access to `DialogueGenerator`.
- [ ] On shutdown, call `saveManager.capture(world)` before `saveManager.save()`.
- [ ] Keep `SAVE_SLOT` and add or support `SAVE_DIR` for local/test separation.

## Module: `src/shared/protocol.ts` and `src/server/ws-server.ts` — Save Protocol

- [ ] Add `SaveSlotInfo` DTO.
- [ ] Add `request_save_slots` client message.
- [ ] Add `manual_save` client message.
- [ ] Add `create_save_slot` client message.
- [ ] Add `save_slots` server message.
- [ ] Add `save_result` server message.
- [ ] Implement `request_save_slots` using SaveManager list metadata, not raw SaveData.
- [ ] Implement `manual_save` as `saveManager.capture(world)` then `saveManager.save()`.
- [ ] Implement `create_save_slot` without switching runtime slot unless full restore/switch support exists.

## Module: TUI Save Panel

- [ ] Add save panel state to `game-client.ts`.
- [ ] Add a key/action to open the Save panel.
- [ ] Render a two-column Save panel similar to the trade panel.
- [ ] Left column: slot list, current marker, and keyed actions.
- [ ] Right column: selected slot details including world id, saved time, tick, round, version, summary counts, and validation status.
- [ ] Add manual save action.
- [ ] Add refresh slot list action.
- [ ] Add create slot action.
- [ ] Do not add in-game load/switch action until `restore(world)` can restore full world state.
- [ ] Keep TUI dependent on protocol DTOs only. Do not import `SaveManager` or `SaveData`.

## Module: Tests

- [ ] Use temporary directories for all SaveManager tests.
- [ ] Test loading a missing save.
- [ ] Test loading valid JSON.
- [ ] Test malformed JSON recovery.
- [ ] Test mismatched `worldId` rejection.
- [ ] Test `save()` writes valid formatted JSON.
- [ ] Test `save()` does not leave temp files after success.
- [ ] Test `capture(world)` updates `gameTick` and `round`.
- [ ] Test conversation summary read/write by player-NPC pair.
- [ ] Test different player-NPC pairs do not collide.
- [ ] Test dialogue close does not await the summary task.
- [ ] Test summary task failure logs and does not fail close.
- [ ] Add WebSocket integration test for `manual_save` with a temporary save directory.
- [ ] Add WebSocket integration test for `request_save_slots`.
- [ ] Add TUI unit test for Save panel two-column rendering data.
- [ ] Add startup test or wiring test for `SAVE_SELECT=skip`.

## Module: Tooling Guardrails

- [ ] Add a Biome/Grit rule that rejects runtime access to raw SaveData fields such as `saveManager.data.conversations`.
- [ ] Add a Biome/Grit rule that rejects runtime writes to `world.contentPool`.
- [ ] Add dependency-cruiser rules that keep SaveData schema imports inside the save layer.
- [ ] Add dependency-cruiser rules that prevent UI code from importing `SaveManager`.
- [ ] Add dependency-cruiser rules that keep `content-pool-loader` behind load/evolve boundaries.
- [ ] Verify these rules with temporary violating files before relying on them.

## Verification

- [ ] Run `npm run lint`.
- [ ] Run `npm test`.
- [ ] Confirm no test modifies the real `saves/` directory.
- [ ] Confirm no runtime caller mutates `save.data` directly.
- [ ] Confirm no SaveData field lacks zod schema coverage.
- [ ] Confirm no new ContentPool prompt or label is duplicated across engine consumers.
