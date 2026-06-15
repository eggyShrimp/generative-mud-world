# Tasks: swap-sidebar-eventlog

## Component: `src/tui/layout/metrics.ts`

- [ ] 1. 新增常量 `SIDEBAR_WIDTH = 38`、`BOTTOM_BAR_HEIGHT = 2`、`NARROW_BOTTOM_BAR_HEIGHT = 1`
- [ ] 2. `LayoutMetrics` 接口新增 `bottomBarHeight: number` 和 `sidebarWidth: number` 字段
- [ ] 3. `getLayoutMetrics()` wide 分支：计算 `availableHeight` 时扣除 `bottomBarHeight`；`eventLogHeight` 设为 `roomHeight`
- [ ] 4. `getLayoutMetrics()` narrow 分支：计算 `availableHeight` 时扣除 `NARROW_BOTTOM_BAR_HEIGHT`；返回 `sidebarWidth=0`
- [ ] 5. `getModalMetrics()` 和 `getStatusPanelMetrics()`：`reservedBottom` 从 `layout.eventLogHeight` 改为 `layout.bottomBarHeight`

## Component: `src/tui/panels/event-log/event-log.tsx`

- [ ] 6. `EventLog` props 新增可选 `width?: number`
- [ ] 7. `scrollbox` 上透传 `width={props.width}`（仅 sidebar 模式设置）

## Component: `src/tui/panels/sidebar/sidebar.tsx`

- [ ] 8. wide 模式（非 narrow）重写为底部横栏：去掉 `border`、`title="角色状态"`、固定 `width={30}`、固定 `height`
- [ ] 9. 需求条改为横向紧凑格式：`{need.label} {percentBar(need.value)} {Math.round(need.value)}`，无 fallback "暂无状态"
- [ ] 10. 行动按钮保持现有 `getGlobalBindings()` + `bindingLabel()` 逻辑，`flexWrap="wrap"` 自动换行
- [ ] 11. narrow 模式不变（仅行动按钮，1 行横栏），移除 `SectionTitle label="行动"`（窄屏空间紧）

## Component: `src/tui/app.tsx`

- [ ] 12. wide 模式：`box flexDirection="row"` 内含 `RoomPanel`（flexGrow）+ `EventLog`（width=sidebarWidth, height=roomHeight）；下方 `Sidebar`（无 height 约束）
- [ ] 13. narrow 模式：`Sidebar`（narrow）移到 `EventLog` 前面，顺序为 RoomPanel → Sidebar(narrow) → EventLog
- [ ] 14. `EventLog` 调用在 wide 模式下传入 `width={layoutMetrics().sidebarWidth}`
- [ ] 15. `RoomPanel` 在 wide 模式下添加 `flexGrow={1}`（取代之前的隐式 flexGrow）

## Verification

- [ ] 16. Run `npm run lint` — ensure biome check + tsc --noEmit pass
- [ ] 17. Run `npx vitest run` — all existing tests pass
- [ ] 18. Run `npx depcruise src` — confirm no boundary violations
