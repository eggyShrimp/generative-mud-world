# Proposal: swap-sidebar-eventlog

## Why

当前 TUI 布局中，侧边栏（Sidebar）显示角色需求条和全局行动按钮，事件日志（EventLog）放在底部。这个布局有两个问题：

1. **垂直空间浪费**：侧边栏 30 列宽度中，需求条 + 行动按钮只占约 14 行，剩余大量空白。事件日志作为滚动流更需要垂直空间，却被挤压在底部 6-8 行中。
2. **水平比例失衡**：场景面板（RoomPanel）占据约 74% 水平空间，侧边栏仅占 26%。在事件流和场景信息之间，事件流应获得更多展示空间。

## What Changes

调换侧边栏（需求条 + 行动按钮）和事件日志（EventLog）的布局位置，同时调整水平比例：

- **EventLog** 从底部移至右侧纵向侧栏（宽度从 30 增至 38 列），高度与 RoomPanel 相同，获得更多垂直空间展示事件历史
- **需求条 + 行动按钮** 从右侧侧栏移至底部横栏（固定 2 行），横向紧凑排列，作为游戏 HUD
- **窄屏模式** 中 Sidebar 顺序前移到 EventLog 之前，与宽屏语义一致

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
- [x] 世界观/业务文本（需求标签、行动标签等）来自服务端 ContentPool 标签字段；结构性 UI 文案（如面板标题"事件日志"）允许硬编码

## Impact

- UX: 事件日志获得更多垂直空间，玩家可看到更多历史事件上下文；需求条移至底部 HUD，更符合游戏 UI 直觉
- 窄屏模式：基本不变，仅组件顺序微调
- 弹窗面板：`getModalMetrics` / `getStatusPanelMetrics` 的预留底部空间从 `eventLogHeight` 改为 `bottomBarHeight`
