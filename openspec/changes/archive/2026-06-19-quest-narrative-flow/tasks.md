# Tasks: quest-narrative-flow

## Module: `src/shared/protocol.ts`

- [x] Add `"quest_defer"` to `DialogueOptionType`.
- [x] Keep `DialogueOption.meta` as generic display metadata; do not require clients to echo it in `TalkMessage`.

## Module: `src/llm/dialogue-generator.ts`

- [x] Define `PendingQuestMenu` with stable accept, defer, and optional casual topic options.
- [x] Add `pendingQuestMenu = new Map<string, PendingQuestMenu>()` keyed by player id and NPC id.
- [x] Add `generateQuestMenu()` with LLM prompt, JSON parsing, validation, explicit failure handling, and minimal fallback.
- [x] Change `quest_trigger_menu` handling to call `generateQuestMenu()`, store pending menu, and return narrative plus generated subOptions.
- [x] Add `quest_defer` handling that clears pending menu, returns an NPC acknowledgement dialogue, and returns no questChanges.
- [x] Clear pending menu in `quest_trigger_select` before or after executing the existing accept path.
- [x] Clear pending menu in `close`.
- [x] Add `injectQuestOptions()` after ordinary idle-chat follow-up generation.
- [x] Limit task-scene first dialogue menus by trimming ordinary options while preserving all fixed decision options.
- [x] Ensure no quest state changes happen during menu generation or ordinary follow-up questions.

## Module: `src/core/round-engine.ts`

- [x] Confirm the existing talk path forwards `optionId`, `optionType`, and `optionLabel`; only change this file if tests show the route cannot carry `quest_defer`.

## Tests

- [x] Add/update `src/__tests__/dialogue-generator.test.ts`: LLM success creates NPC narrative and accept/defer/topic/goodbye options.
- [x] Add/update `src/__tests__/dialogue-generator.test.ts`: LLM parse failure returns a valid minimal menu without questChanges.
- [x] Add/update `src/__tests__/dialogue-generator.test.ts`: `quest_trigger_menu` stores pending menu.
- [x] Add/update `src/__tests__/dialogue-generator.test.ts`: `quest_trigger_select` clears pending menu and uses existing accept delta.
- [x] Add/update `src/__tests__/dialogue-generator.test.ts`: `quest_defer` clears pending menu and returns no questChanges.
- [x] Add/update `src/__tests__/dialogue-generator.test.ts`: `close` clears pending menu.
- [x] Add/update `src/__tests__/dialogue-generator.test.ts`: task-scene first dialogue menus trim ordinary options and preserve fixed decision options.
- [x] Add/update `src/__tests__/dialogue-generator.test.ts`: selecting ordinary idle chat during negotiation preserves accept/defer and keeps one ordinary follow-up.
- [x] Add/update `src/__tests__/dialogue-generator.test.ts`: ordinary idle chat without pending menu is unchanged.
- [x] Add/update `src/__tests__/round-engine.test.ts` only if generator-level tests do not cover the talk route for `quest_defer`.

## Manual Checks

No engine-only manual check is required; TUI manual checks are tracked in `quest-narrative-flow-tui`.

## Verification

- [x] Run `openspec validate quest-narrative-flow`.
- [x] Run `openspec show quest-narrative-flow --json --deltas-only`.
- [x] Run `npm run lint`.
- [x] Run `npx vitest run`.
- [x] Run `npx depcruise src`.
- [x] Trap token re-check: no-hardcoded-labels, no-direct-world-mutation, no-create-default-outside-world, no-hardcoded-description-text, no-empty-catch.
