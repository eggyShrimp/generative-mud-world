# Design: quest-narrative-flow-tui

## Component Tree

```text
DialoguePanel
  -> ChatDialoguePanel
    -> InteractionPanel
      -> content: dialogue history
      -> interaction: scrollable option list + tab bar
```

Only the chat interaction area changes. The panel must keep the existing dialogue history area, tab bar, loading state, and numbered `KeyHint` option rendering.

## Protocol Surface

| Message / Type | Direction | Purpose |
|----------------|-----------|---------|
| `DialogueOption.type: "quest_defer"` | server -> client | Marks a defer option that should close the popup after selection. |
| `DialogueOption.tag: "quest"` | server -> client | Existing marker for quest options; TUI renders `[!]` through existing marker behavior. |
| close cleanup message | client -> server, if needed | Sent when the player dismisses a dialogue locally without selecting the server-provided goodbye option. |

The TUI must not require private engine imports to know whether a quest negotiation is active. If cleanup is needed, use protocol-visible state such as currently visible option types/ids.

## Interaction Behavior

### Long Option List

The option list inside `ChatDialoguePanel` should be scrollable when the server returns more options than fit the visible interaction area. The tab bar remains visible and must not be pushed out by the option list.

### Quest Defer

`shouldKeepPopupOpen("quest_defer")` returns false. Selecting defer still sends the talk request first through the existing `chooseDialogueOption()` path, then hides the popup locally like `close`.

### Direct Popup Dismissal

If the player closes the dialogue through Esc or another local close path while a quest negotiation is visible, the client must avoid leaving server-side negotiation state stale. Prefer sending the existing `close` talk option if that can be represented cleanly; otherwise add a small explicit cleanup message.

This is not a fallback quest mechanism. It only mirrors the user's dismissal to the server.

## Boundary Check

| File | Boundary | Status |
|------|----------|:------:|
| `src/tui/panels/dialogue/chat-dialogue.tsx` | TUI-only rendering | Pass |
| `src/tui/client/dialogue-state.ts` | TUI client state helper | Pass |
| `src/tui/client/game-client.ts` | Uses shared protocol only | Pass |
| `src/shared/protocol.ts` | Shared protocol surface | Allowed when needed |

## Test Plan

| Test File | Scenario | Assertions |
|-----------|----------|------------|
| `src/__tests__/game-client.test.ts` | `quest_defer` selected | `shouldKeepPopupOpen("quest_defer")` is false. |
| `src/__tests__/game-client.test.ts` | Direct close during visible quest negotiation | Client sends cleanup request or existing close talk request before clearing local dialogue state. |
| `src/__tests__/dialogue-panel.test.tsx` | Long option list rendered | Option list is scrollable and the tab bar remains visible. |
| `src/__tests__/dialogue-panel.test.tsx` | Normal short option list rendered | Existing numbered options and loading/empty states still render. |

## Manual Checks

- Open a dialogue that returns more options than fit the visible area; verify the option list scrolls and the tab bar remains visible.
- Select a defer option; verify the popup closes and the task is not accepted.
- Start a quest negotiation, close with Esc, reopen dialogue, and verify stale accept/defer options do not appear unless the quest negotiation is started again.
