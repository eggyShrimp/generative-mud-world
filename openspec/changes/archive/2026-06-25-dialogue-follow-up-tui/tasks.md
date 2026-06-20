# Tasks: dialogue-follow-up-tui

## What Changes

TUI adds a single follow-up entry point: select NPC text and press `F`. Returned follow-up options reuse the existing dialogue option list and number-key behavior.

## Component: `src/tui/controllers/keyboard-controller.tsx`

- [x] Read `renderer.getSelection()?.getSelectedText()` when `F` is pressed in dialogue context
- [x] If selected text is non-empty, call `client.stashFollowUpSelection(text)` before `dispatchKey(key, client)`
- [x] Keep `dispatchKey` handler signature unchanged; do not pass selected text as a third handler argument
- [x] Keep Meta+C copy behavior unchanged
- [x] Do not listen to clipboard changes

## Component: `src/tui/key-layer/layers.ts`

- [x] Add `f` binding to `DIALOGUE_LAYER`
- [x] Bind `f` to `handleDialogueFollowUp`
- [x] Keep `1-9` bound to normal dialogue option selection
- [x] Do not add a follow-up mode layer

## Component: `src/tui/key-layer/handlers.ts`

- [x] Add `handleDialogueFollowUp(client)`
- [x] Read selected text via `client.popFollowUpSelection()`
- [x] If selected text is empty, call `client.showFollowUpSelectionRequired()` and return
- [x] If dialogue is absent or active tab is not chat, do nothing
- [x] Otherwise call `client.requestFollowUpOptions(selectedText)`

## Component: `src/tui/client/types.ts`

- [x] Add `requestFollowUpOptions(context: string): void`
- [x] Add `stashFollowUpSelection(text: string): void`
- [x] Add `popFollowUpSelection(): string | null`
- [x] Add `showFollowUpSelectionRequired(): void`
- [x] Add `onFollowUpOptions` to `ActiveRequest`

## Component: `src/tui/client/dialogue-state.ts`

- [x] Add helper to build chat loading state for follow-up options
- [x] Add helper to apply returned follow-up options to chat tab
- [x] Add helper to restore previous chat options when follow-up options are empty
- [x] Add optional `followUpContext` to dialogue state for display while follow-up options are visible
- [x] Ensure helpers keep dialogue history unchanged
- [x] Ensure helpers do not introduce `followUpMode`

## Component: `src/tui/client/game-client.ts`

- [x] Implement `requestFollowUpOptions(context)`
- [x] Send `request_follow_up_options` with current `dialogue.npcId` and trimmed selected text
- [x] Use existing active request blocking behavior when another request is running
- [x] Store pending follow-up metadata: npc id, context, and previous chat options
- [x] Handle `follow_up_options` and complete active request
- [x] Ignore stale `follow_up_options` when dialogue is closed, NPC differs, or context differs
- [x] Replace current chat options with returned follow-up options
- [x] If returned options are empty, restore previous chat options and log `"没有合适的追问方向。"`
- [x] Implement no-selection feedback by appending `"请先选中一句 NPC 的话。"` to the existing event log
- [x] Keep returned options compatible with `chooseDialogueOption()`

## Component: `src/tui/panels/dialogue/chat-dialogue.tsx`

- [x] Reuse existing loading UI while follow-up options load
- [x] Reuse existing `KeyHint` list after follow-up options arrive
- [x] If `followUpContext` exists, render `追问："{context}"` above returned options
- [x] Do not render message history sequence numbers
- [x] Do not render or support follow-up selection mode

## Tests

### Pure function / utility tests (.test.ts)

- [x] Add/update `src/__tests__/key-layer.test.ts`: dialogue `f` binding calls follow-up request when selected text exists
- [x] Add/update `src/__tests__/key-layer.test.ts`: `f` without selected text does not send request
- [x] Add/update `src/__tests__/keyboard-controller.test.tsx`: controller stashes selected text before dispatching `f`
- [x] Add/update `src/__tests__/game-client.test.ts`: `requestFollowUpOptions()` sends protocol message and sets loading
- [x] Add/update `src/__tests__/game-client.test.ts`: `follow_up_options` applies returned options and clears loading
- [x] Add/update `src/__tests__/game-client.test.ts`: empty `follow_up_options` restores previous options and logs feedback
- [x] Add/update `src/__tests__/game-client.test.ts`: stale `follow_up_options` is ignored
- [x] Add/update `src/__tests__/game-client.test.ts`: active request blocks follow-up request through existing feedback

### Component rendering tests (.test.tsx)

- [x] Add/update `src/__tests__/dialogue-panel.test.tsx`: loading state renders existing loading hint
- [x] Add/update `src/__tests__/dialogue-panel.test.tsx`: returned follow-up options render as numbered `KeyHint` entries
- [x] Add/update `src/__tests__/dialogue-panel.test.tsx`: follow-up context is rendered above returned options
- [x] Add/update `src/__tests__/dialogue-panel.test.tsx`: history does not show numeric follow-up selection markers

## Manual Checks

- [x] Run `npm run dev:tui` — select NPC text, press `F`, see loading then follow-up options
- [x] Run `npm run dev:tui` — press `F` without selection, confirm no mode switch
- [x] Run `npm run dev:tui` — choose returned follow-up option and confirm normal dialogue reply

## Verification

- [x] Run `npm run lint` (biome check + tsc --noEmit)
- [x] Run `npx vitest run`
- [x] Run `npx depcruise src` — confirm no tui-no-direct-engine-import violations
