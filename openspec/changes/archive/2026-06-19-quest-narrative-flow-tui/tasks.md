# Tasks: quest-narrative-flow-tui

## Module: `src/tui/panels/dialogue/chat-dialogue.tsx`

- [x] Replace the fixed non-scrolling option container with a scrollable option area.
- [x] Keep the tab bar outside the scrolling option list so it remains visible.
- [x] Preserve existing loading, empty-options, follow-up context, and numbered `KeyHint` rendering.

## Module: `src/tui/client/dialogue-state.ts`

- [x] Update `shouldKeepPopupOpen()` so `quest_defer` returns false.

## Module: `src/tui/client/game-client.ts`

- [x] Ensure selecting `quest_defer` still sends the talk request through `chooseDialogueOption()` before local popup close.
- [x] Add direct-close cleanup only if the engine cannot clear pending negotiation from an existing close talk option.

## Module: `src/shared/protocol.ts`

- [x] Add a close-cleanup message only if existing talk `close` cannot represent local Esc dismissal.

## Module: `src/server/ws-server.ts`

- [x] Route any new close-cleanup message to the existing dialogue cleanup path if such a message is added.

## Tests

- [x] Add/update `src/__tests__/game-client.test.ts`: `shouldKeepPopupOpen("quest_defer")` returns false.
- [x] Add/update `src/__tests__/game-client.test.ts`: selecting `quest_defer` sends the talk request and closes the popup.
- [x] Add/update `src/__tests__/game-client.test.ts`: direct close during a visible quest negotiation sends cleanup if required.
- [x] Add/update `src/__tests__/dialogue-panel.test.ts`: long option list uses a scrollable option area and keeps tab bar visible.
- [x] Add/update `src/__tests__/dialogue-panel.test.ts`: short option list and loading/empty states remain unchanged.

## Manual Checks

- [x] In TUI, start a quest negotiation with enough options to exceed the visible option area; verify scrolling works.
- [x] Select defer; verify the popup closes and no quest is accepted.
- [x] Start negotiation, press Esc, reopen dialogue; verify stale accept/defer options are not shown.

## Verification

- [x] Run `openspec validate quest-narrative-flow-tui`.
- [x] Run `openspec show quest-narrative-flow-tui --json --deltas-only`.
- [x] Run `npm run lint`.
- [x] Run `npx vitest run`.
- [x] Run `npx depcruise src`.
