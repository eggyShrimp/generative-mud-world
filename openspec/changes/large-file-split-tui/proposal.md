# Proposal: large-file-split-tui

## Why

`src/tui/client/game-client.ts` (876行) 混合同一个工厂函数中 5 种职责：Solid.js signals, WebSocket transport, request pipeline, dialogue orchestrator, entity interaction。单独拆出作为 `world-tui` change 实现。

此 change 是 `large-file-split` 的配套项，拆分面只涉及 TUI 客户端层。

## Change Type

**tui-logic** — TUI client 维护性重构。

refactor

## What Changes

`src/tui/client/game-client.ts` (876行) → 拆为 5 个子模块 + 壳文件

## Modules Touched

| 文件 | 当前行数 | Change Type | Description |
|------|----------|-------------|-------------|
| `src/tui/client/game-client.ts` | 876 | split-to-6 | 拆为 signals / transport / request-pipeline / dialogue-orchestrator / entity-interaction + game-client.ts 壳 |

## Impact

- `createGameClient` 工厂函数壳保留组装职责
- 子模块为独立工厂函数，接收 signals / request pipeline / transport 作参数
- Consumer (`src/tui/index.tsx` 等 30+ 文件) 无需修改

## Test Impact

| Test File | Coverage |
|-----------|----------|
| `src/__tests__/game-client.test.ts` | 拆分后客户端行为不变 |
| `src/__tests__/tui-app.test.ts` | 拆分后 TUI app 行为不变 |
