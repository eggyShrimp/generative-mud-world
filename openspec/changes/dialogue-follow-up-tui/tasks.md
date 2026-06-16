# Tasks: dialogue-follow-up-tui

## What Changes

TUI adds a single follow-up entry point: select NPC text and press `F`. Returned follow-up options reuse the existing dialogue option list and number-key behavior.

## Component: `src/tui/controllers/keyboard-controller.tsx`

- [ ] Read `renderer.getSelection()?.getSelectedText()` when `F` is pressed in dialogue context
- [ ] If selected text is non-empty, call `client.stashFollowUpSelection(text)` before `dispatchKey(key, client)`
- [ ] Keep `dispatchKey` handler signature unchanged; do not pass selected text as a third handler argument
- [ ] Keep Meta+C copy behavior unchanged
- [ ] Do not listen to clipboard changes

## Component: `src/tui/key-layer/layers.ts`

- [ ] Add `f` binding to `DIALOGUE_LAYER`
- [ ] Bind `f` to `handleDialogueFollowUp`
- [ ] Keep `1-9` bound to normal dialogue option selection
- [ ] Do not add a follow-up mode layer

## Component: `src/tui/key-layer/handlers.ts`

- [ ] Add `handleDialogueFollowUp(client)`
- [ ] Read selected text via `client.popFollowUpSelection()`
- [ ] If selected text is empty, call `client.showFollowUpSelectionRequired()` and return
- [ ] If dialogue is absent or active tab is not chat, do nothing
- [ ] Otherwise call `client.requestFollowUpOptions(selectedText)`

## Component: `src/tui/client/types.ts`

- [ ] Add `requestFollowUpOptions(context: string): void`
- [ ] Add `stashFollowUpSelection(text: string): void`
- [ ] Add `popFollowUpSelection(): string | null`
- [ ] Add `showFollowUpSelectionRequired(): void`
- [ ] Add `onFollowUpOptions` to `ActiveRequest`

## Component: `src/tui/client/dialogue-state.ts`

- [ ] Add helper to build chat loading state for follow-up options
- [ ] Add helper to apply returned follow-up options to chat tab
- [ ] Add helper to restore previous chat options when follow-up options are empty
- [ ] Add optional `followUpContext` to dialogue state for display while follow-up options are visible
- [ ] Ensure helpers keep dialogue history unchanged
- [ ] Ensure helpers do not introduce `followUpMode`

## Component: `src/tui/client/game-client.ts`

- [ ] Implement `requestFollowUpOptions(context)`
- [ ] Send `request_follow_up_options` with current `dialogue.npcId` and trimmed selected text
- [ ] Use existing active request blocking behavior when another request is running
- [ ] Store pending follow-up metadata: npc id, context, and previous chat options
- [ ] Handle `follow_up_options` and complete active request
- [ ] Ignore stale `follow_up_options` when dialogue is closed, NPC differs, or context differs
- [ ] Replace current chat options with returned follow-up options
- [ ] If returned options are empty, restore previous chat options and log `"没有合适的追问方向。"`
- [ ] Implement no-selection feedback by appending `"请先选中一句 NPC 的话。"` to the existing event log
- [ ] Keep returned options compatible with `chooseDialogueOption()`

## Component: `src/tui/panels/dialogue/chat-dialogue.tsx`

- [ ] Reuse existing loading UI while follow-up options load
- [ ] Reuse existing `KeyHint` list after follow-up options arrive
- [ ] If `followUpContext` exists, render `追问："{context}"` above returned options
- [ ] Do not render message history sequence numbers
- [ ] Do not render or support follow-up selection mode

## Tests

### Pure function / utility tests (.test.ts)

- [ ] Add/update `src/__tests__/key-layer.test.ts`: dialogue `f` binding calls follow-up request when selected text exists
- [ ] Add/update `src/__tests__/key-layer.test.ts`: `f` without selected text does not send request
- [ ] Add/update `src/__tests__/keyboard-controller.test.tsx`: controller stashes selected text before dispatching `f`
- [ ] Add/update `src/__tests__/game-client.test.ts`: `requestFollowUpOptions()` sends protocol message and sets loading
- [ ] Add/update `src/__tests__/game-client.test.ts`: `follow_up_options` applies returned options and clears loading
- [ ] Add/update `src/__tests__/game-client.test.ts`: empty `follow_up_options` restores previous options and logs feedback
- [ ] Add/update `src/__tests__/game-client.test.ts`: stale `follow_up_options` is ignored
- [ ] Add/update `src/__tests__/game-client.test.ts`: active request blocks follow-up request through existing feedback

### Component rendering tests (.test.tsx)

- [ ] Add/update `src/__tests__/dialogue-panel.test.tsx`: loading state renders existing loading hint
- [ ] Add/update `src/__tests__/dialogue-panel.test.tsx`: returned follow-up options render as numbered `KeyHint` entries
- [ ] Add/update `src/__tests__/dialogue-panel.test.tsx`: follow-up context is rendered above returned options
- [ ] Add/update `src/__tests__/dialogue-panel.test.tsx`: history does not show numeric follow-up selection markers

## Manual Checks

- [ ] Run `npm run dev:tui` — select NPC text, press `F`, see loading then follow-up options
- [ ] Run `npm run dev:tui` — press `F` without selection, confirm no mode switch
- [ ] Run `npm run dev:tui` — choose returned follow-up option and confirm normal dialogue reply

## Verification

- [ ] Run `npm run lint` (biome check + tsc --noEmit)
- [ ] Run `npx vitest run`
- [ ] Run `npx depcruise src` — confirm no tui-no-direct-engine-import violations
