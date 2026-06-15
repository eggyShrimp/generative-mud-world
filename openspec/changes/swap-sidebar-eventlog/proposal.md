# Proposal: swap-sidebar-eventlog

## Why

当前 TUI 布局中，侧边栏（Sidebar）显示角色需求条和全局行动按钮，事件日志（EventLog）放在底部。这个布局有两个问题：

1. **垂直空间浪费**：侧边栏 30 列宽度中，需求条 + 行动按钮只占约 14 行，剩余大量空白。事件日志作为滚动流更需要垂直空间，却被挤压在底部 6-8 行中。
2. **水平比例失衡**：场景面板（RoomPanel）占据约 74% 水平空间，侧边栏仅占 26%。在事件流和场景信息之间，事件流应获得更多展示空间。

调换侧边栏和事件日志的位置：事件日志移至右侧纵向侧栏，需求条和行动按钮移至底部横栏。同时将侧栏宽度从 30 列增加到 38 列。

## Change Type

**tui-only** — Client-side TUI change. No ContentPool. No engine logic.

## Components Touched

| File | Change Type | Description |
|------|-------------|-------------|
| `src/tui/layout/metrics.ts` | modify | 新增 sidebarWidth(38)、bottomBarHeight(2) 常量；LayoutMetrics 接口扩展；弹窗 reservedBottom 改用 bottomBarHeight |
| `src/tui/app.tsx` | modify | 重排 wide/narrow 两种模式的组件挂载顺序 |
| `src/tui/panels/sidebar/sidebar.tsx` | modify | wide 模式改为底部横栏（需求横向紧凑格式 + 行动按钮自动换行）；narrow 模式保持不变 |
| `src/tui/panels/event-log/event-log.tsx` | modify | 新增可选 `width` prop，侧栏模式下设置宽度 |

## Protocol Surface

No changes. 所有数据通过已有协议字段传输（entity.needs、events）。

## Boundary Self-Check

- [x] No imports from `src/engine/`
- [x] No imports from `src/combat/`
- [x] No imports from `src/simulation/`
- [x] No imports from `src/llm/`
- [x] No imports from `src/core/` (except `src/shared/` which is allowed)
- [x] All Chinese display text comes from server ContentPool label fields (never hardcoded in TUI)

## Impact

- UX: 事件日志获得更多垂直空间，玩家可看到更多历史事件上下文；需求条移至底部 HUD，更符合游戏 UI 直觉
- 窄屏模式：基本不变，仅组件顺序微调
- 弹窗面板：`getModalMetrics` / `getStatusPanelMetrics` 的预留底部空间从 `eventLogHeight` 改为 `bottomBarHeight`
