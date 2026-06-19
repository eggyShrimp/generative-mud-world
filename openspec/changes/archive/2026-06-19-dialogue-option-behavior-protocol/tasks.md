# Tasks: dialogue-option-behavior-protocol

## Module: `src/shared/protocol.ts`

- [x] Add `DialogueOptionBehavior`.
- [x] Add optional `behavior?: DialogueOptionBehavior` to `DialogueOption`.
- [x] Keep `DialogueOption.type` unchanged for business routing.

## Module: `src/llm/dialogue-generator.ts`

- [x] Add small local helpers for behavior-bearing options, without adding player-facing labels.
- [x] Attach continue behavior to menu, idle-chat, follow-up, action-select, and post-select options that expect returned chat options.
- [x] Attach close behavior to goodbye and quest-defer options.
- [x] Ensure quest acceptance still returns existing quest delta and does not use behavior as a state write path.

## Module: `src/tui/client/dialogue-state.ts`

- [x] Add `getDialogueOptionBehavior(option)` that returns explicit behavior when present.
- [x] Add a single `classifyLegacyDialogueOption(option)` helper for options without behavior.
- [x] Rewrite popup helpers such as keep-open / expect-options to consume behavior instead of directly inspecting task-specific types.
- [x] Keep direct quest-negotiation visibility detection only for cleanup needs, not for normal option selection behavior.

## Module: `src/tui/client/game-client.ts`

- [x] Use behavior to decide whether selecting an option closes the popup.
- [x] Use behavior to decide whether selecting an option clears visible options and shows loading.
- [x] Use behavior to decide whether to register the returned `chat_options` handler.
- [x] Preserve existing talk request shape: `npcId`, `optionId`, `label`, `optionType`.

## Module: `src/server/ws-server.ts`

- [x] Confirm no behavior field is stripped from `chat_options`, `dialogue_options`, or `follow_up_options`.
- [x] Keep server routing based on `optionId` and `optionType`; do not trust behavior for world mutation.

## Tests

- [x] Add/update `src/__tests__/dialogue-generator.test.ts`: generated first-round options include behavior.
- [x] Add/update `src/__tests__/dialogue-generator.test.ts`: quest negotiation accept/follow-up/defer/goodbye have the expected behavior.
- [x] Add/update `src/__tests__/dialogue-generator.test.ts`: post-select options include close behavior.
- [x] Add/update `src/__tests__/game-client.test.ts`: explicit continue behavior drives loading and returned option consumption.
- [x] Add/update `src/__tests__/game-client.test.ts`: explicit close behavior sends talk and closes popup.
- [x] Add/update `src/__tests__/game-client.test.ts`: legacy options without behavior still pass through the single compatibility helper.
- [x] Add/update `src/__tests__/integration/dialogue-pipeline.test.ts`: quest accept uses normal talk route and refreshes options.

## Verification

- [x] Run `openspec validate dialogue-option-behavior-protocol`.
- [x] Run `openspec show dialogue-option-behavior-protocol --json --deltas-only`.
- [x] Run `npm run lint`.
- [x] Run `npx vitest run`.
- [x] Run `git diff --check`.
