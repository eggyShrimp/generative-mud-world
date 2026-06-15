# Tasks: swap-sidebar-eventlog

## What Changes

1. `metrics.ts`: 布局计算切换 — 新增 `sidebarWidth`/`bottomBarHeight`，弹窗预留空间改用底部栏高度
2. `app.tsx`: 组件挂载顺序重排 — wide 模式 EventLog 入侧栏、Sidebar 成底部栏；narrow 模式 Sidebar 前移
3. `sidebar.tsx`: wide 模式重写为固定 2 行底部横栏（需求行 + 行动行）
4. `event-log.tsx`: 新增可选 `width` prop

## Component: `src/tui/layout/metrics.ts`

- [ ] 1. 新增常量 `SIDEBAR_WIDTH = 38`、`BOTTOM_BAR_HEIGHT = 2`、`NARROW_BOTTOM_BAR_HEIGHT = 1`
- [ ] 2. `LayoutMetrics` 接口新增 `bottomBarHeight: number` 和 `sidebarWidth: number` 字段
- [ ] 3. `getLayoutMetrics()` wide 分支：`availableHeight` 扣除 `BOTTOM_BAR_HEIGHT`；`eventLogHeight` 设为 `roomHeight`；返回 `bottomBarHeight=BOTTOM_BAR_HEIGHT`、`sidebarWidth=SIDEBAR_WIDTH`
- [ ] 4. `getLayoutMetrics()` narrow 分支：`availableHeight` 扣除 `NARROW_BOTTOM_BAR_HEIGHT`；返回 `bottomBarHeight=NARROW_BOTTOM_BAR_HEIGHT`、`sidebarWidth=0`
- [ ] 5. `getModalMetrics()` 和 `getStatusPanelMetrics()`：`reservedBottom` 从 `layout.eventLogHeight` 改为 `layout.bottomBarHeight`

## Component: `src/tui/panels/event-log/event-log.tsx`

- [ ] 6. `EventLog` props 新增可选 `width?: number`
- [ ] 7. `scrollbox` 上透传 `width={props.width}`

## Component: `src/tui/panels/sidebar/sidebar.tsx`

- [ ] 8. wide 模式（非 narrow）重写为底部横栏：去掉 `border`、`title="角色状态"`、`width={30}`；固定 `height={2}`
- [ ] 9. 第 1 行：需求条横向紧凑格式 `{need.label} {percentBar(need.value)} {Math.round(need.value)}`，`gap={2}`；`Show when={needs().length > 0}`，无 fallback
- [ ] 10. 第 2 行：行动按钮，复用 `getGlobalBindings()` + `bindingLabel()`；`height={1}`
- [ ] 11. narrow 模式不变（仅行动按钮，1 行横栏），移除 `SectionTitle label="行动"`

## Component: `src/tui/app.tsx`

- [ ] 12. wide 模式：`flexDirection="row"` 内含 `RoomPanel` + `EventLog`（`width=sidebarWidth`, `height=roomHeight`）；下方 `Sidebar`（`height=bottomBarHeight=2`）
- [ ] 13. narrow 模式：顺序改为 RoomPanel → Sidebar(narrow, height=1) → EventLog(height=eventLogHeight)
- [ ] 14. `EventLog` 调用在 wide 模式下传入 `width={layoutMetrics().sidebarWidth}`

## Tests

### Pure function tests (.test.ts)

- [ ] 15. Add `src/__tests__/layout-metrics.test.ts`
  - wide: sidebarWidth=38, eventLogHeight=roomHeight, bottomBarHeight=2
  - narrow: sidebarWidth=0, bottomBarHeight=1, eventLogHeight independent
  - reservedBottom: `getModalMetrics`/`getStatusPanelMetrics` 使用 `bottomBarHeight`
  - edge: 40/30/24/20 行终端下 roomHeight clamp 行为
  - interface: 返回对象含全部 4 字段

### Component rendering tests (.test.tsx)

Uses `testRender` from `@opentui/solid`. Mock `GameClient` per `src/__tests__/key-layer.test.ts` pattern.

- [ ] 16. Add `src/__tests__/tui-app.test.tsx`
  - 宽屏: EventLog 与 RoomPanel 同行，Sidebar 在底部；不含"角色状态"
  - 窄屏 (resize to 80): RoomPanel → Sidebar → EventLog 纵向

- [ ] 17. Add `src/__tests__/sidebar.test.tsx`
  - 宽屏无 border/标题，无 needs 不显示"暂无状态"
  - 有 needs 显示紧凑横排格式
  - 按钮标签来自 `getGlobalBindings()`/`bindingLabel()`
  - 请求中按钮 disabled；narrow 模式仅 1 行

- [ ] 18. Add `src/__tests__/event-log.test.tsx`
  - 接收透传 `width` prop
  - pending event 显示 "正在处理..."
  - sticky scroll 到底

## Manual Checks

- [ ] 19. Run `npm run dev:tui` at 120x40 — no overlap, EventLog in right sidebar, no "角色状态"
- [ ] 20. Run `npm run dev:tui` at 80x30 — narrow mode sequential layout
- [ ] 21. Popups (StatusPanel, InventoryPanel) do not overlap bottom bar

## Verification

- [ ] 22. Run `npm run lint` (biome check + tsc --noEmit)
- [ ] 23. Run `npx vitest run`
- [ ] 24. Run `npx depcruise src` — confirm no boundary violations
