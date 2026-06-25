# Tasks: large-file-split-tui

## Module: `src/tui/client/game-client.ts` (876行 → 6个文件)

### Phase 1-1: 提取 `signals.ts`（所有 Solid.js signal 声明）

- [ ] 创建 `src/tui/client/signals.ts`，移入所有 `createSignal` 调用 + helper（`showDialogue`, `hideDialogue` 等）
- [ ] `src/tui/client/game-client.ts` 改为从 `signals.ts` import
- [ ] 验证: `npm test -- src/__tests__/game-client.test.ts`

### Phase 1-2: 提取 `transport.ts`（WS 生命周期）

- [ ] 创建 `src/tui/client/transport.ts`，移入: `pushEvents`, `pushBlockedEvent`, `send`, `connect`, `disconnect`
- [ ] `createGameClient` 调用 `createTransport(signals, ...)`
- [ ] 验证: `npm test -- src/__tests__/game-client.test.ts`

### Phase 1-3: 提取 `request-pipeline.ts`

- [ ] 创建 `src/tui/client/request-pipeline.ts`，移入: `activeRequest`, `hasActiveRequest`, `sendRequest`, `completeActiveRequest`, `pendingDialogueRequest`
- [ ] `createGameClient` import + 组装
- [ ] 验证: `npm test -- src/__tests__/game-client.test.ts`

### Phase 1-4: 提取 `dialogue-orchestrator.ts`

- [ ] 创建 `src/tui/client/dialogue-orchestrator.ts`，移入: `buildTalkHandlers`, `requestDialogueOptions`, `chooseDialogueOption`, `handleTradeSelection`, `chooseTradeOption`, `switchDialogueTab`, `requestTradeOptions`, `requestSellOptions`, `clearTradeSelection`, `stashFollowUpSelection`, `popFollowUpSelection`, `requestFollowUpOptions`, `showFollowUpSelectionRequired`, `sendDialogueCleanupIfNeeded`
- [ ] 工厂函数，接收 signals / request pipeline / transport 作参数
- [ ] 验证: `npm test -- src/__tests__/game-client.test.ts`

### Phase 1-5: 提取 `entity-interaction.ts`

- [ ] 创建 `src/tui/client/entity-interaction.ts`，移入: `selectEntity`, `interactWithEntity`
- [ ] 验证: `npm test -- src/__tests__/game-client.test.ts`

### Phase 1-6: `game-client.ts` 变为壳

- [ ] `createGameClient` 变为组装工厂：import 各子模块 → 创建 signals → 创建 sub-systems → 组装 return object
- [ ] 验证: `npm test -- src/__tests__/game-client.test.ts src/__tests__/tui-app.test.ts`

## Verification

- [ ] 每完成一个 Phase 后，执行: `npm test -- src/__tests__/game-client.test.ts`
- [ ] 全部完成后:
  - [ ] `npm test` — 全部测试通过
  - [ ] `npm run build -- --noEmit` — 零 TypeScript 错误
