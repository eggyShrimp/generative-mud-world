# Design: swap-sidebar-eventlog

## Component Hierarchy

```
App
├── StatusBar (top, unchanged)
├── <wide mode>
│   ├── flexDirection="row" height=roomHeight
│   │   ├── RoomPanel (flexGrow, height=roomHeight)
│   │   └── EventLog (width=sidebarWidth(38), height=roomHeight)  ← 从底部移至右侧
│   └── Sidebar (bottom bar, no height constraint)                 ← 从右侧移至底部
├── <narrow mode>
│   ├── RoomPanel (height=roomHeight, narrow)
│   ├── Sidebar (narrow, action buttons only, no needs)           ← 顺序前移
│   └── EventLog (height=eventLogHeight)                          ← 保持在底部
├── StatusPanel (overlay, z=40)
├── ... other overlays (unchanged)
```

## Layout Changes

### Wide mode (>100 cols)

```
Before:                                    After:
┌─────────────────────┬────────┐          ┌─────────────────────┬──────────┐
│ RoomPanel           │ Sidebar│          │ RoomPanel           │ EventLog │
│                     │ 需求    │          │                     │ 滚动事件  │
├─────────────────────┴────────┤          ├─────────────────────┴──────────┤
│ EventLog (底部)              │          │ 饥饿 80%  口渴 60% · [r]休息 [q]状态... │
└──────────────────────────────┘          └────────────────────────────────┘
```

| Metric | Before | After |
|--------|--------|-------|
| Sidebar width | 30 | — |
| EventLog (sidebar) width | — | 38 |
| Bottom bar height | 0 | 2 (1行需求 + 1行行动) |
| Room height | clamp(avail*0.68, 16, 24) | clamp(avail - bottomBar, 16, 24) |
| EventLog height | max(6, avail - roomHeight) | = roomHeight (与房间同高) |

### Narrow mode (<100 cols)

Swaps Sidebar position (action buttons) before EventLog, matching the wide-mode semantic of "HUD at bottom, log below HUD."

### Metrics interface change

```typescript
// Before
interface LayoutMetrics {
  roomHeight: number;
  eventLogHeight: number;
}

// After
interface LayoutMetrics {
  roomHeight: number;
  eventLogHeight: number;     // narrow: bottom height; wide: same as roomHeight
  bottomBarHeight: number;    // wide: 2, narrow: 1
  sidebarWidth: number;       // wide: 38, narrow: 0
}
```

### Modal reservedBottom change

```typescript
// Before
const reservedBottom = layout.eventLogHeight + (narrow ? 2 : 3);

// After
const reservedBottom = layout.bottomBarHeight + (narrow ? 2 : 3);
```

## Sidebar Bottom Bar Design (wide mode)

无边框、无标题。横向排列，`flexWrap="wrap"` 自动扩展高度。

```
┌──────────────────────────────────────────────────────────────────┐
│ 饥饿 ████░ 80%  口渴 ███░░ 60%  精力 █████ 95%                    │  ← 需求行
│ [r]休息  [q]状态  [i]背包  [j]任务  [t]游记  [m]地图  [v]存档      │  ← 行动行
└──────────────────────────────────────────────────────────────────┘
```

- 需求行：仅当 `needs.length > 0` 时显示，无 fallback "暂无状态"
- 行动行：与当前 narrow 模式逻辑一致，重用 `getGlobalBindings()` + `bindingLabel()`
- 高度自适应：需求行 1 行 + 行动行 1-2 行（取决于屏宽）

## Protocol Messages

No changes. All data flows through existing protocol:

| Data | Protocol Source |
|------|----------------|
| needs | `entity.needs` via `GameClient.entity()` |
| events | `events[]` via `GameClient.events()` |
| action labels | `capabilityLabel()` reads from server ContentPool labels |

## depcruise Boundary Verification

| Rule | Status | Notes |
|------|:--:|-------|
| tui-no-direct-engine-import | ✅ | 仅修改 TUI 组件，不引入新 import |
| combat-config-only-via-contentpool | ✅ | N/A |
| no-hardcoded-labels | ✅ | 所有 label 通过 `bindingLabel()` 和 `need.label` 来自 ContentPool |

## Display Text

| UI Element | Server ContentPool Field | Fallback |
|------------|--------------------------|----------|
| 行动按钮标签 | `capabilityLabel()` → `contentPool.xxxLabels` | none |
| 需求条标签 | `entity.needs[].label` → `contentPool.needLabels` | none |
| "事件日志" 标题 | hardcoded in EventLog component | N/A (UI structural text, not worldview) |
