# Proposal: tui-rebuild

## Why

当前 `src/client-tui/app.tsx` 是 2348 行的单文件，承载了 36 个函数/组件定义。所有面板、布局、主题、按键处理都堆在一个文件里，没有模块边界。新增面板或修改交互时，需要在巨型文件中定位上下文，容易引入意外耦合。键盘事件入口唯一但面板内部可直接访问 GameClient 全部 62 个成员，缺乏关注点分离。

目标：在 `src/tui/` 中重建 TUI，建立可持续迭代的模块边界。旧 `src/client-tui/` 保留不动，作为参考。

## Change Type

**tui-only** — Client-side TUI change. No ContentPool. No engine logic.

## Components Touched

| File | Change Type | Description |
|------|-------------|-------------|
| `src/tui/index.tsx` | new | TUI 入口：render(<App client={client} />) |
| `src/tui/app.tsx` | new | 组装根：KeyboardController + MainLayout + 面板挂载 |
| `src/tui/controllers/keyboard-controller.tsx` | new | 唯一 useKeyboard 入口 + Meta+C 复制 |
| `src/tui/client/game-client.ts` | new (copy+adapt) | 从 client-tui 复制，更新 import 路径 |
| `src/tui/key-layer/index.ts` | new (copy+adapt) | 从 client-tui 复制，更新 import 路径 |
| `src/tui/layout/main-layout.tsx` | new | WideLayout / NarrowLayout 组合 |
| `src/tui/layout/metrics.ts` | new | getLayoutMetrics / getModalMetrics / clamp |
| `src/tui/layout/popup-panel.tsx` | new | 弹窗容器组件 |
| `src/tui/layout/interaction-panel.tsx` | new | 互动面板组件 |
| `src/tui/theme/theme.ts` | new | THEME 色板常量对象 |
| `src/tui/theme/tone.ts` | new | needColor / relationColor / traitColor / hpColor |
| `src/tui/theme/event-style.ts` | new (copy) | 事件类型 → 前缀+颜色映射 |
| `src/tui/theme/progress-format.ts` | new (copy) | percentBar / ratioBar / toneColor 系列 |
| `src/tui/components/*.tsx` | new (copy) | 7 个公共组件原样复制 |
| `src/tui/panels/room/room-panel.tsx` | new | 房间面板（含 ExitList/EntityList/TargetActionPopup） |
| `src/tui/panels/sidebar/status-bar.tsx` | new | 顶部状态栏 |
| `src/tui/panels/sidebar/sidebar.tsx` | new | 侧栏（需求条 + 全局操作） |
| `src/tui/panels/event-log/event-log.tsx` | new | 事件日志列表 |
| `src/tui/panels/inventory/inventory-panel.tsx` | new | 背包面板 |
| `src/tui/panels/status/status-panel.tsx` | new | 角色状态面板 |
| `src/tui/panels/quests/quests-panel.tsx` | new | 任务面板 |
| `src/tui/panels/travelogue/travelogue-panel.tsx` | new | 游记面板 |
| `src/tui/panels/end-day/end-day-panel.tsx` | new | 结束当天确认 + 结算弹窗 |
| `src/tui/panels/dialogue/dialogue-panel.tsx` | new | 对话面板 |
| `src/tui/panels/dialogue/trade-detail.tsx` | new | 交易详情子组件 |
| `src/tui/panels/map/map-panel.tsx` | new | 地图面板 |
| `src/tui/panels/combat/combat-panel.tsx` | new | 战斗面板 |
| `src/tui/overlays/quest-notification.tsx` | new | 任务通知浮层 |
| `src/tui/overlays/item-change-notification.tsx` | new | 物品变更通知浮层 |
| `src/tui/features/room/entity-list-layout.ts` | new (copy+adapt) | 列表行构建 |
| `src/tui/features/room/relation-format.ts` | new (copy) | 关系文本格式化 |
| `src/tui/features/inventory/grouping.ts` | new | 物品分组逻辑（从 key-layer 迁出） |
| `src/tui/features/quests/progress.ts` | new | 任务进度文本 |
| `src/tui/features/map/rendering.ts` | new | 地图渲染逻辑 |
| `src/tui/features/combat/formatting.ts` | new | 战斗日志格式化 |
| `docs/dev-guide/tui-architecture.md` | new | 架构规范文档 |

## Protocol Surface

shared/protocol.ts 不需要修改。新 TUI 使用与旧 TUI 完全相同的协议类型。

## Boundary Self-Check

- [x] No imports from `src/engine/`
- [x] No imports from `src/combat/`
- [x] No imports from `src/simulation/`
- [x] No imports from `src/llm/`
- [x] No imports from `src/core/` (except `src/shared/` which is allowed)
- [x] All Chinese display text comes from server ContentPool label fields (never hardcoded in TUI)

注：第一轮重建中，面板内的固定文案（如"当前地点"、"事件日志"等 section title）暂保持现状，不在本轮改 ContentPool。后续单独判断。

## Impact

- UX 无变化，行为与旧 TUI 完全一致
- 新增 dependency-cruiser 规则约束模块边界
- 新增单元测试覆盖 features/theme/layout 中的纯函数
- 旧 `src/client-tui/` 保留，不删除、不移动
