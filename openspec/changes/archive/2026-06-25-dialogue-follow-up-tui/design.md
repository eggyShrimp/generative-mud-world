# Design: dialogue-follow-up-tui

## Component Hierarchy

```
App
├── KeyboardController
│   └── renderer.getSelection().getSelectedText() on F
│       └── client.stashFollowUpSelection(text)
├── key-layer
│   └── dialogue layer binds f
└── ChatDialoguePanel
    ├── history content (unchanged)
    └── interaction area
        ├── LoadingHint while follow-up options load
        └── existing KeyHint list after follow-up options arrive
```

## Interaction Model

### Press `F` with selected text

1. `KeyboardController` checks `renderer.getSelection()?.getSelectedText()`.
2. If selected text is non-empty, `KeyboardController` calls `client.stashFollowUpSelection(text)`.
3. `KeyboardController` still calls the normal `dispatchKey(key, client)` path.
4. The dialogue `f` handler calls `client.popFollowUpSelection()` and receives the stashed text.
5. The handler calls `client.requestFollowUpOptions(selectedText)`.
6. The client sends `request_follow_up_options` with current `dialogue.npcId` and selected text.
7. Chat options are cleared and chat loading is set to true.
8. `follow_up_options` replaces chat options.
9. The player presses `1-9`, and existing `chooseDialogueOption()` runs.

This keeps the existing key-layer handler signature unchanged. `dispatchKey` continues to call handlers as `(client, keyName)`.

### Press `F` without selected text

1. No request is sent.
2. The client appends a local system event to the existing event log: `"请先选中一句 NPC 的话。"`
3. No follow-up mode is entered.
4. Existing options remain unchanged.

### Press `F` while another request is active

1. No follow-up request is sent.
2. The client uses the existing active-request feedback path and appends the existing event log message: `"正在处理操作，请稍候。"`
3. Existing options remain unchanged.

## Protocol Messages

Requires the engine change:

- `request_follow_up_options`
- `follow_up_options`

Client-side active request lifecycle:

- `ActiveRequest` gets `onFollowUpOptions`
- `handleMessage()` completes active request after `follow_up_options`
- errors complete the active request through the existing error path

## State Design

No persistent `followUpMode`.

Dialogue state and client request state need transient metadata only:

- Reuse existing `tabs.chat.loading` for follow-up loading.
- Keep `followUpContext` in `DialogueState` only while returned follow-up options are visible, so the panel can show which text is being followed up.
- Keep pending request metadata outside persistent dialogue mode state:
  - `npcId`
  - `context`
  - previous chat options

The loading text remains the existing `"正在思考中..."`. This intentionally does not distinguish first-load chat options from follow-up generation in the first implementation.

Returned follow-up options are stored in `tabs.chat.options`.

This keeps the panel and numeric selection behavior unchanged.

### Stale Response Handling

When `follow_up_options` arrives, the client applies it only if all conditions are true:

- there is an active dialogue
- `dialogue.npcId === message.npcId`
- the pending follow-up context equals `message.context`
- the request was still waiting for follow-up options

If any condition fails, the client ignores the returned options and only completes the active request. This covers closing dialogue, switching NPCs, or replacing the pending follow-up before the response arrives.

### Empty Options Handling

If `follow_up_options.options.length === 0`:

- clear chat loading
- restore the previous chat options captured when the request was sent
- clear `followUpContext`
- append a local system event: `"没有合适的追问方向。"`

No blank option panel is shown.

## Display Text

| UI Element | Source | Notes |
|------------|--------|-------|
| follow-up loading | hardcoded structural text | Reuse existing `"正在思考中..."` |
| no selection feedback | hardcoded structural text | `"请先选中一句 NPC 的话。"` |
| empty options feedback | hardcoded structural text | `"没有合适的追问方向。"` |
| active request feedback | existing hardcoded structural text | Reuse `"正在处理操作，请稍候。"` |
| follow-up context label | hardcoded structural text + server response | `追问："{context}"`, shown above returned options |
| option labels | server response | Generated `DialogueOption.label` |
| NPC name / dialogue history | server response | Existing data |

## depcruise Boundary Verification

| Rule | Status | Notes |
|------|:--:|-------|
| tui-no-direct-engine-import | ✅ | TUI only imports client/key-layer/shared protocol types |
| combat-config-only-via-contentpool | ✅ | N/A |

## Test Plan

| Test File | Scenario | Assertions |
|-----------|----------|------------|
| `src/__tests__/key-layer.test.ts` | dialogue layer binds `f` | pressing `f` pops stashed text and calls `requestFollowUpOptions` |
| `src/__tests__/keyboard-controller.test.tsx` | keyboard controller stashes selection | selected text is stashed before `dispatchKey` handles `f` |
| `src/__tests__/game-client.test.ts` | request follow-up with active dialogue | sends `request_follow_up_options`, sets chat loading, registers active request |
| `src/__tests__/game-client.test.ts` | no selected text | no websocket send; event log contains `"请先选中一句 NPC 的话。"` |
| `src/__tests__/game-client.test.ts` | receives empty follow_up_options | restores previous chat options and logs empty-options feedback |
| `src/__tests__/game-client.test.ts` | stale follow_up_options | ignores options when dialogue is closed, npc differs, or context differs |
| `src/__tests__/game-client.test.ts` | receives follow_up_options | chat loading false; options replace current chat options |
| `src/__tests__/game-client.test.ts` | active request exists | request is blocked through existing active request feedback |
| `src/__tests__/dialogue-panel.test.tsx` | loading render | panel shows existing loading hint |
| `src/__tests__/dialogue-panel.test.tsx` | follow-up options render | options appear through existing `KeyHint` numbering |
| `src/__tests__/dialogue-panel.test.tsx` | follow-up context render | `追问："{context}"` appears above returned options |
| `src/__tests__/dialogue-panel.test.tsx` | history remains unnumbered | no `[1]` history selection markers are rendered |

## Manual Checks

- [ ] `npm run dev:tui` — select NPC text with mouse, press `F`, see follow-up options
- [ ] `npm run dev:tui` — press `F` without selection, confirm no mode switch
- [ ] `npm run dev:tui` — choose a follow-up option with `1-9`, confirm normal NPC reply flow
