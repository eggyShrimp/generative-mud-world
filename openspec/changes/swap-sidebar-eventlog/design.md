# Design: swap-sidebar-eventlog

## Component Hierarchy

```
App
├── StatusBar (top, unchanged)
├── <wide mode>
│   ├── flexDirection="row" height=roomHeight
│   │   ├── RoomPanel (flexGrow, height=roomHeight)
│   │   └── EventLog (width=sidebarWidth(38), height=roomHeight)  ← 从底部移至右侧
│   └── Sidebar (bottom bar, height=2)                              ← 从右侧移至底部
├── <narrow mode>
│   ├── RoomPanel (height=roomHeight, narrow)
│   ├── Sidebar (narrow, height=1, action buttons only)            ← 顺序前移
│   └── EventLog (height=eventLogHeight)                           ← 保持在底部
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
| Bottom bar height | 0 | 2 (固定) |
| Room height | clamp(avail*0.68, 16, 24) | clamp(avail - 2, 16, 24) |
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
  bottomBarHeight: number;    // wide: 2, narrow: 1 (固定)
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

### Bottom bar height rule (fixed)

底部栏高度固定分配，不依赖内容动态计算：

| 模式 | 行高 | 组成 |
|------|------|------|
| wide | 2 | 第 1 行需求条 + 第 2 行行动按钮 |
| narrow | 1 | 行动按钮（无需求条） |

在 wide 模式（>= 100 列）下，8 个行动按钮约 80 字符宽，总能在一行内显示完毕，不存在溢出。需求条同理（约 75 字符）。如果极端情况超出（按钮标签因 mod 变长导致 >100 列），按钮行 `flexWrap` 超出部分不可见但不会影响布局。

## Sidebar Bottom Bar Design (wide mode)

无边框、无标题。固定 2 行高，`flexWrap="nowrap"`（不换行，超出部分不渲染）。

```
┌──────────────────────────────────────────────────────────────────┐
│ 饥饿 ████░ 80%  口渴 ███░░ 60%  精力 █████ 95%                    │  ← 第 1 行: 需求
│ [r]休息  [q]状态  [i]背包  [j]任务  [t]游记  [m]地图  [v]存档      │  ← 第 2 行: 行动
└──────────────────────────────────────────────────────────────────┘
```

- 需求行：仅当 `needs.length > 0` 时显示，紧凑格式 `{label} {percentBar} {value}`；无需求时第 1 行空白
- 行动行：重用现有 `getGlobalBindings()` + `bindingLabel()` 逻辑
- 高度始终 2 行，不因内容为空而缩小（保持弹窗 reservedBottom 计算稳定性）

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

| UI Element | Source | Notes |
|------------|--------|-------|
| 行动按钮标签 | `capabilityLabel()` → `contentPool.xxxLabels` | 世界观/业务文本 |
| 需求条标签 | `entity.needs[].label` → `contentPool.needLabels` | 世界观/业务文本 |
| "事件日志" 面板标题 | 硬编码 in EventLog | 结构性 UI 文案，允许硬编码 |

## Test Plan

### Pure function tests (.test.ts)

| Test File | Scenario | Assertions |
|-----------|----------|------------|
| `src/__tests__/layout-metrics.test.ts` | wide 模式返回 sidebarWidth=38 | `getLayoutMetrics(40, false).sidebarWidth === 38` |
| | wide 模式 eventLogHeight === roomHeight | 同高，共享同一行 |
| | wide 模式 reservedBottom 用 bottomBarHeight | `getModalMetrics` 预留 2+3=5 行 |
| | narrow 模式 eventLogHeight 独立 | `eventLogHeight ≠ roomHeight` |
| | narrow 模式 sidebarWidth=0 | 窄屏无侧栏 |
| | narrow 模式 bottomBarHeight=1 | 窄屏仅 1 行行动按钮 |
| | 边界值 (40/30/24/20 行终端) | 各高度下 roomHeight clamp 行为 |
| | 新 LayoutMetrics 接口完整性 | 返回对象包含全部 4 个字段 |

### Component rendering tests (.test.tsx)

Uses `testRender` from `@opentui/solid`. Mock `GameClient` per `src/__tests__/key-layer.test.ts`.

| Test File | Scenario | Assertions |
|-----------|----------|------------|
| `src/__tests__/tui-app.test.tsx` | 宽屏渲染顺序 | `captureCharFrame()` 中 EventLog 与 RoomPanel 同行，Sidebar 在底部行 |
| | 窄屏渲染顺序 | resize 到 80 列后 RoomPanel → Sidebar → EventLog 纵向排列 |
| | 宽屏 Sidebar 无"角色状态"标题 | `not.toContain("角色状态")` |
| `src/__tests__/sidebar.test.tsx` | 宽屏无边框无标题 | `not.toContain("角色状态")`，无 border 字符 |
| | 无 needs 不显示"暂无状态" | `not.toContain("暂无状态")` |
| | 有 needs 显示紧凑横排格式 | `label` + `percentBar` + 数值在同一行 |
| | 行动按钮标签来自 ContentPool | `toContain("休息")` / `toContain("背包")` |
| | 请求中按钮 disabled | disabled 色号出现 |
| | narrow 模式仅 1 行行动按钮 | 帧快照无需求条行 |
| `src/__tests__/event-log.test.tsx` | 接收 width prop | 渲染宽度为 38 列 |
| | pending event 显示 "正在处理..." | `toContain("正在处理...")` |
| | 大量事件保持 sticky scroll 到底 | 最新事件可见 |

## Manual Checks

- [ ] `npm run dev:tui` at 120x40 — confirm no overlap, no "角色状态" in wide mode, EventLog in right sidebar
- [ ] `npm run dev:tui` at 80x30 — confirm narrow mode: RoomPanel → Sidebar → EventLog vertical
- [ ] Popups (StatusPanel, InventoryPanel) do not overlap with the 2-row bottom bar
