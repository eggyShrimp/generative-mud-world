# Proposal: dialogue-follow-up-tui

## Why

玩家应该能选中 NPC 的一句话并按 `F` 生成追问选项。这个交互比自由文本输入成本低，也不需要进入额外的选句模式。

最终体验：

1. 玩家鼠标选中对话面板里的 NPC 原文。
2. 按 `F`。
3. 客户端发送追问请求。
4. 对话选项区显示加载状态。
5. 服务端返回追问选项后，复用现有数字键选项 UI。
6. 玩家按数字选择，继续走普通对话。

## Change Type

**tui-only** — Client-side TUI change. No ContentPool. No engine logic.

## What Changes

- Add `F` as the dialogue follow-up request key.
- Read current terminal selection when `F` is pressed.
- Transfer selected text through a temporary client stash instead of changing the key-layer handler signature.
- Send `request_follow_up_options` only when selected text is non-empty.
- Show loading through the existing dialogue loading UI.
- Render returned follow-up options through the existing numbered option UI.
- Show the selected source text above returned follow-up options.
- Restore previous options when the server returns no usable follow-up options.
- Do not add follow-up mode or history message numbering.

## Components Touched

| File | Change Type | Description |
|------|-------------|-------------|
| `src/tui/controllers/keyboard-controller.tsx` | modify | 在 `F` 键处理时读取 renderer selection 并触发追问 |
| `src/tui/key-layer/layers.ts` | modify-binding | 对话层新增 `f` 绑定 |
| `src/tui/key-layer/handlers.ts` | new-function | 新增 `handleDialogueFollowUp` |
| `src/tui/client/types.ts` | modify-interface | 增加追问请求相关 client 方法和 active request callback |
| `src/tui/client/dialogue-state.ts` | new-functions | 增加追问加载/结果应用的纯函数 |
| `src/tui/client/game-client.ts` | modify | 新增 `requestFollowUpOptions()`，处理 `follow_up_options` |
| `src/tui/panels/dialogue/chat-dialogue.tsx` | modify-display | 追问加载时复用现有加载区；返回后复用 KeyHint |

## Protocol Surface

Depends on `dialogue-follow-up-engine`:

- Client sends `request_follow_up_options`
- Client receives `follow_up_options`

No separate UI-only protocol fields.

## Boundary Self-Check

- [x] No imports from `src/engine/`
- [x] No imports from `src/combat/`
- [x] No imports from `src/simulation/`
- [x] No imports from `src/llm/`
- [x] No imports from `src/core/` (except `src/shared/` which is allowed)
- [x] Business/world display text comes from server ContentPool label fields
- [x] Structural UI text that remains hardcoded is listed in design.md

## Impact

- No follow-up selection mode.
- No numeric history selection.
- No free-text input.
- Existing dialogue options remain selectable with `1-9`.
- If no text is selected when `F` is pressed, the client writes `"请先选中一句 NPC 的话。"` to the event log and does not send a server request.
- Returned follow-up options replace the current chat options, then behave like normal options.
- Stale follow-up responses are ignored if the dialogue was closed, changed NPC, or no longer matches the pending context.

## Test Impact

| Test File | Coverage |
|-----------|----------|
| `src/__tests__/key-layer.test.ts` | dialogue layer `f` binding calls follow-up handler |
| `src/__tests__/game-client.test.ts` | follow-up request lifecycle and `follow_up_options` handling |
| `src/__tests__/dialogue-state.test.ts` or `src/__tests__/game-client.test.ts` | pure state helpers for loading/result |
| `src/__tests__/dialogue-panel.test.tsx` | loading state and returned options render through existing KeyHint UI |
