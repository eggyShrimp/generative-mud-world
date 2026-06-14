# Tasks: tui-rebuild

按阶段分组，每阶段完成后运行验证。

## Phase 0: 项目骨架

- [ ] 创建 `src/tui/` 目录结构（controllers, client, key-layer, layout, theme, components, panels/*, overlays, features/*）
- [ ] 创建 `docs/dev-guide/tui-architecture.md`（架构规范：目录职责、依赖规则、模块合约）
- [ ] 复制 `src/client-tui/game-client.ts` → `src/tui/client/game-client.ts`，更新 import 路径（`./key-layer.ts` → `../key-layer/index.ts`）
- [ ] 复制 `src/client-tui/key-layer.ts` → `src/tui/key-layer/index.ts`，更新 import 路径（`./event-style.ts` → `../theme/event-style.ts`，`./game-client.ts` → `../client/game-client.ts`）
- [ ] 复制 `src/client-tui/event-style.ts` → `src/tui/theme/event-style.ts`
- [ ] 复制 `src/client-tui/progress-format.ts` → `src/tui/theme/progress-format.ts`
- [ ] 复制 `src/client-tui/relation-format.ts` → `src/tui/features/room/relation-format.ts`
- [ ] 复制 `src/client-tui/entity-list-layout.ts` → `src/tui/features/room/entity-list-layout.ts`，更新 import（`./shared.tsx` → `../../components/index.ts`）
- [ ] 复制 `src/client-tui/components/*` → `src/tui/components/*`（7 个文件）
- [ ] 创建最小 `src/tui/index.tsx`（入口：render App）
- [ ] 创建最小 `src/tui/app.tsx`（空壳 App，暂渲染 LoadingHint）
- [ ] `.dependency-cruiser.js` 更新 `tui-no-direct-engine-import` 的 `from.path` 覆盖 `src/(client-tui|tui)`

**验证**: `npm run build -- --noEmit && npm test && npm run lint`

## Phase 1: 最小可用主界面

### layout/metrics.ts
- [ ] 从 `src/client-tui/app.tsx` 提取布局常量（DESKTOP_MIN_ROOM_HEIGHT 等 10 个）
- [ ] 提取 `getLayoutMetrics(termH, narrow)` 函数
- [ ] 提取 `getModalMetrics(termW, termH, layout, narrow)` 函数
- [ ] 提取 `getStatusPanelMetrics(termW, termH, layout, narrow)` 函数
- [ ] 提取 `clamp(v, min, max)` 工具函数

### theme/theme.ts
- [ ] 从 `src/client-tui/app.tsx` 提取 `THEME` 色板对象（22 个颜色键）
- [ ] 补充缺失颜色：worldEvent `#b58bd8`、travelogue `#d4a574`、combat 色板

### controllers/keyboard-controller.tsx
- [ ] 实现 headless 组件：调用 `useKeyboard` + `useRenderer`
- [ ] Meta+C → OSC 52 复制逻辑
- [ ] 其他键 → `dispatchKey(key, client)`
- [ ] 添加注释说明这是唯一 useKeyboard 入口

### panels/sidebar/status-bar.tsx
- [ ] 从 app.tsx 提取 `StatusBar` 组件
- [ ] 接收 `client: GameClient` + `compact?: boolean`
- [ ] 连接状态点颜色判定逻辑

### panels/room/room-panel.tsx
- [ ] 从 app.tsx 提取 `RoomPanel` 组件
- [ ] 从 app.tsx 提取 `ExitList` 子组件
- [ ] 从 app.tsx 提取 `EntityList` 子组件
- [ ] 从 app.tsx 提取 `TargetActionPopup` 子组件
- [ ] 从 app.tsx 提取 `RoomActionList` 子组件
- [ ] 接收 `client` + `entities` + `selectedEntity` + `height` + `narrow`

### panels/sidebar/sidebar.tsx
- [ ] 从 app.tsx 提取 `Sidebar` 组件
- [ ] 需求条渲染 + 全局操作按钮

### panels/event-log/event-log.tsx
- [ ] 从 app.tsx 提取 `EventLog` 组件
- [ ] 日志列表渲染 + pendingEvent 占位

### features/inventory/grouping.ts
- [ ] 从 key-layer.ts 迁出 `GroupedItem` 类型
- [ ] 从 key-layer.ts 迁出 `groupInventory(items)` 函数
- [ ] 从 key-layer.ts 迁出 `formatGroupedItemName(group)` 函数
- [ ] 从 key-layer.ts 迁出 `findGroupForItem(itemId, groups)` 函数
- [ ] 更新 key-layer/index.ts 的 import 路径

### app.tsx
- [ ] 组装：KeyboardController + StatusBar + MainLayout
- [ ] 宽窄屏切换逻辑（`useTerminalDimensions` → `narrow` memo）
- [ ] `onMount` connect / `onCleanup` disconnect
- [ ] 添加注释说明 App 只做组装

**验证**: `npm run build -- --noEmit && npm test && npm run lint`

## Phase 2: 独立面板

### panels/status/status-panel.tsx
- [ ] 从 app.tsx 提取 `StatusPanel`（装备/生命/需求/特质四个 Section）
- [ ] `needColor` / `relationColor` 函数 → `theme/tone.ts`

### panels/quests/quests-panel.tsx
- [ ] 从 app.tsx 提取 `QuestPanel`
- [ ] `objectiveProgressText` → `features/quests/progress.ts`

### panels/travelogue/travelogue-panel.tsx
- [ ] 从 app.tsx 提取 `TraveloguePanel`

### panels/end-day/end-day-panel.tsx
- [ ] 从 app.tsx 提取 `ConfirmEndDayModal`
- [ ] 从 app.tsx 提取 `SettlementModal`

### overlays/quest-notification.tsx
- [ ] 从 app.tsx 提取 `QuestNotificationOverlay`

### overlays/item-change-notification.tsx
- [ ] 从 app.tsx 提取 `ItemChangeNotificationOverlay`

### components/tab-bar.tsx
- [ ] 从 app.tsx 提取 `TabBar` 通用组件

**验证**: `npm run build -- --noEmit && npm test && npm run lint`

## Phase 3: 复杂面板

### panels/dialogue/dialogue-panel.tsx
- [ ] 从 app.tsx 提取 `DialoguePanel`
- [ ] 对话历史渲染 + 选项列表

### panels/dialogue/trade-detail.tsx
- [ ] 从 app.tsx 提取 `TradeDetail`（仅 dialogue-panel 可 import）

### panels/map/map-panel.tsx
- [ ] 从 app.tsx 提取 `MapPanel`
- [ ] 地图渲染逻辑 → `features/map/rendering.ts`（`_tileChar`、regionRows、worldRows、infoLines）

### panels/combat/combat-panel.tsx
- [ ] 从 app.tsx 提取 `CombatModal`
- [ ] 战斗日志格式化 → `features/combat/formatting.ts`
- [ ] 战斗颜色收敛到 `theme/tone.ts`（`hpColor`）

### theme/tone.ts
- [ ] 迁入 `needColor`、`relationColor`、`traitColor`、`hpColor`
- [ ] 添加注释说明 tone 函数的阈值含义

**验证**: `npm run build -- --noEmit && npm test && npm run lint`

## Phase 4: 依赖约束

- [ ] `.dependency-cruiser.js` 新增 `tui-panels-no-cross-import`（panels/* → panels/* 禁止）
- [ ] 新增 `tui-layout-no-panels`（layout → panels 禁止）
- [ ] 新增 `tui-theme-no-client`（theme → client 禁止）
- [ ] 新增 `tui-features-no-panels`（features → panels 禁止）
- [ ] 新增 `tui-no-old-client-tui-import`（src/tui → src/client-tui 禁止）
- [ ] 验证规则生效：故意写一个违规 import，确认 depcruise 报错，然后撤销

**验证**: `npm run build -- --noEmit && npm test && npm run lint`

## Phase 5: 切换入口

- [ ] `package.json`: `"dev:tui"` 改为 `"bun --watch src/tui/index.tsx"`，移除 `dev:tui-new`
- [ ] `start.sh`: `cleanup_client()` 匹配 pattern 从 `src/client-tui` 改为 `src/tui`
- [ ] 文档标注 `src/client-tui/` 为 legacy/reference

**验证**: `npm run build -- --noEmit && npm test && npm run lint`

## Verification

- [ ] `npm run build -- --noEmit` — 零类型错误
- [ ] `npm test` — 所有测试通过
- [ ] `npm run lint` — biome + depcruise 零错误
- [ ] `start.sh` 启动新 TUI 正常
- [ ] 新 TUI 主界面：房间/出口/目标/事件日志/基础按键正常
- [ ] `useKeyboard` 只在 `controllers/keyboard-controller.tsx` 出现
- [ ] `src/tui/` 不 import `src/client-tui/`
