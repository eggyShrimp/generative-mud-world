# Design: large-file-split-tui

## 拆分策略

采用**模式 D（工厂函数壳 + 子工厂）**：`createGameClient` 壳保留工厂函数身份 + 组装职责，子模块导出独立的工厂函数，接收 shared state（signals, transport, request pipeline）作为参数。

```
src/tui/client/
  signals.ts                → 所有 Solid.js signal 声明 (createSignal + helper like showDialogue, hideDialogue)
  transport.ts              → WS 生命周期: pushEvents, send, connect, disconnect
  request-pipeline.ts       → sendRequest, completeActiveRequest, activeRequest 状态
  dialogue-orchestrator.ts  → dialogue 相关所有操作函数
  entity-interaction.ts     → selectEntity, interactWithEntity
  game-client.ts            → 壳: createGameClient 组装 → return GameClient object
```

## 状态所有权

`createGameClient` 是工厂函数，所有状态通过闭包捕获。拆分策略：

| 状态来源 | 所有权 | 传递规则 |
|----------|--------|----------|
| Solid.js signals | shell 创建 | 作为参数传给子工厂 |
| `ws` (WebSocket) | transport 模块持有 | shell 创建后注入 |
| `followUpSelectionStash`, `pendingFollowUp` | shell 持有 | 作为参数传入 dialogue-orchestrator |
| sub-systems (combat, endDay, save) | shell 持有 | 在 shell 中创建并作为参数传给需要它们的函数 |

## ContentPool Integration

无新增。拆分不改任何逻辑。

## State Mutation Path

无变更。

## Test Plan

| Test File | Coverage |
|-----------|----------|
| `src/__tests__/game-client.test.ts` | 拆分后客户端行为不变 |
| `src/__tests__/tui-app.test.ts` | 拆分后 TUI app 行为不变 |
