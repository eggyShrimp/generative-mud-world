# Proposal: quest-narrative-flow-tui

## Why

任务协商会让对话选项变长：接受、追问、推辞、普通话题和告别可能同时出现。当前对话选项区高度固定，选项多时会被裁剪。

另一个问题是关闭行为：玩家选择推辞时应关闭弹窗；玩家直接按 Esc 关闭弹窗时，也不能让服务端的任务协商状态继续影响下一轮对话。

## Change Type

**tui** — Dialogue popup rendering and client interaction behavior.

new-feature

## What Changes

- Render long dialogue option lists in a scrollable interaction area.
- Treat `quest_defer` as a popup-closing option.
- Add a client close signal for dialogue popup dismissal when a task negotiation may be active.
- Keep rendering based on server-provided options and tags; do not add fallback quest choices in the TUI.
- Keep quest marker rendering through the existing `tag: "quest"` path.

The engine-side quest negotiation behavior is specified in `quest-narrative-flow`.

## Modules Touched

| File | Change Type | Description |
|------|-------------|-------------|
| `src/tui/panels/dialogue/chat-dialogue.tsx` | modify-rendering | Make the options area scroll when generated choices exceed the visible height. |
| `src/tui/client/dialogue-state.ts` | modify-logic | Return `false` from `shouldKeepPopupOpen("quest_defer")`. |
| `src/tui/client/game-client.ts` | modify-logic if needed | Send a close notification when dismissing a dialogue with a pending quest negotiation. |
| `src/shared/protocol.ts` | modify-interface if needed | Add a lightweight close message only if existing talk `close` cannot represent Esc dismissal. |
| `src/server/ws-server.ts` | modify-logic if needed | Route client-initiated dialogue dismissal to the dialogue generator cleanup path. |
| `src/__tests__/game-client.test.ts` | add/update-tests | Cover `quest_defer` close behavior and any client close notification. |
| `src/__tests__/dialogue-panel.test.tsx` | add-tests | Cover long option rendering with a scrollable option area. |

## Boundary Check

- No imports from `src/engine/`, `src/combat/`, `src/simulation/`, `src/llm/`, or `src/core/` are allowed in TUI files.
- TUI must not create quest accept/defer options locally.
- Player-facing quest text must come from server-provided `DialogueOption.label`.
- Structural UI text such as existing loading/empty-option hints may remain in the TUI.

## Impact

- Long quest negotiation menus remain accessible instead of being clipped.
- Selecting defer closes the popup like goodbye.
- Direct popup dismissal does not leave stale task negotiation context behind.

## Test Impact

| Test File | Coverage |
|-----------|----------|
| `src/__tests__/game-client.test.ts` | `shouldKeepPopupOpen("quest_defer")` returns false. |
| `src/__tests__/game-client.test.ts` | Direct dialogue close sends cleanup signal if a negotiation is active and the protocol requires it. |
| `src/__tests__/dialogue-panel.test.tsx` | Long chat option lists render inside a scrollable interaction area without dropping later options. |
