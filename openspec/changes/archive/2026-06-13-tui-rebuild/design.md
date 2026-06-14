# Design: tui-rebuild

## Component Hierarchy

```
index.tsx
└── App (app.tsx)                         ← 组装根，无业务逻辑
    ├── KeyboardController                ← 唯一 useKeyboard 入口
    ├── StatusBar                         ← 角色名/日期/连接状态
    ├── [wide] MainLayout                 ← 宽屏：左主右辅底部日志
    │   ├── RoomPanel                     ← 房间名/描述/出口/目标/动作弹窗
    │   │   ├── ExitList
    │   │   ├── EntityList
    │   │   └── TargetActionPopup
    │   ├── Sidebar                       ← 需求条 + 全局操作
    │   └── EventLog                      ← 事件日志
    ├── [narrow] MainLayout               ← 窄屏：堆叠布局
    │   ├── RoomPanel
    │   ├── EventLog
    │   └── Sidebar (compact)
    ├── DialoguePanel                     ← isLayerActive("dialogue")
    │   ├── TabBar
    │   └── TradeDetail
    ├── InventoryPanel                    ← isLayerActive("inventory")
    ├── MapPanel                          ← isLayerActive("map")
    ├── StatusPanel                       ← isLayerActive("status")
    ├── QuestPanel                        ← isLayerActive("quests")
    ├── TraveloguePanel                   ← isLayerActive("travelogue")
    ├── CombatModal                       ← isLayerActive("combat")
    ├── QuestNotificationOverlay          ← questNotification() !== null
    ├── ItemChangeNotificationOverlay     ← itemChangeNotification() !== null
    ├── ConfirmEndDayModal                ← isLayerActive("confirm-end-day")
    └── SettlementModal                   ← settlementPending()
```

## 模块依赖图

```
src/tui/
├── controllers/keyboard-controller.tsx
│   ├── → @opentui/solid (useKeyboard, useRenderer)
│   ├── → key-layer/index.ts (dispatchKey)
│   └── → client/game-client.ts (GameClient type)
│
├── client/game-client.ts
│   ├── → shared/protocol.ts (类型)
│   ├── → shared/log.ts (logWrite)
│   └── → key-layer/index.ts (activeLayer, pushLayer, popLayer, hasLayer, KeyLayer)
│
├── key-layer/index.ts
│   ├── → shared/protocol.ts (类型)
│   ├── → theme/event-style.ts (getEventStyle)
│   ├── → client/game-client.ts (import type { GameClient })
│   └── → features/inventory/grouping.ts (GroupedItem, groupInventory, formatGroupedItemName, findGroupForItem)
│
├── layout/metrics.ts                    ← 纯函数，无外部依赖
├── layout/popup-panel.tsx               ← 仅依赖 @opentui/solid
├── layout/interaction-panel.tsx         ← 仅依赖 layout/popup-panel.tsx
├── layout/main-layout.tsx
│   ├── → layout/metrics.ts
│   └── → panels/* (组装)
│
├── theme/theme.ts                       ← 纯常量，无依赖
├── theme/tone.ts                        ← 纯函数，无依赖
├── theme/event-style.ts                 ← 纯函数，无依赖
├── theme/progress-format.ts             ← 纯函数，无依赖
│
├── components/*                         ← 仅依赖 @opentui/solid，互相引用仅限 index.ts barrel
│
├── panels/*                             ← 每个面板独立，互不 import
│   ├── → theme/*
│   ├── → layout/popup-panel.tsx
│   ├── → components/*
│   ├── → features/*
│   └── → key-layer/index.ts (action builders)
│
├── features/*                           ← 纯函数，无外部依赖（仅 shared/protocol 类型）
│   ├── → shared/protocol.ts (类型)
│   └── → components/* (formatKeyBracket 仅 entity-list-layout 使用)
│
└── overlays/*                           ← 仅依赖 theme + client 类型
```

## 循环依赖说明

`client/game-client.ts` ↔ `key-layer/index.ts` 存在类型级循环：

- `game-client.ts` 运行时导入 `activeLayer`、`pushLayer`、`popLayer`、`hasLayer`、`getLayerStack`
- `key-layer/index.ts` 用 `import type` 导入 `GameClient` 接口

ES 模块处理此情况：`import type` 在运行时被擦除，不产生循环。

## Protocol Messages

本变更不新增协议消息。新 TUI 使用与旧 TUI 完全相同的 `shared/protocol.ts` 类型：

| 消息类型 | 方向 | 用途 |
|----------|------|------|
| `ServerMessage` (union) | server→client | 所有服务端推送 |
| `CommandEvent` | server→client | 操作结果事件 |
| `RoomInfo` | server→client | 房间信息 |
| `RoomEntity` | server→client | 房间实体 |
| `EntityState` | server→client | 玩家状态 |
| `StatusMessage` | server→client | 角色状态详情 |
| `DialogueOption` | server→client | 对话选项 |
| `MinimapData` | server→client | 地图数据 |
| `QuestInfo` | server→client | 任务信息 |
| `TravelogueDataMessage` | server→client | 游记数据 |
| `Capability` | server→client | 可用能力 |

## depcruise Boundary Verification

| 规则 | 状态 | 说明 |
|------|:----:|------|
| tui-no-direct-engine-import | ✅ | src/tui/ 不导入 engine/combat/simulation/llm/core |
| tui-panels-no-cross-import | ✅ | panels/* 互不 import |
| tui-layout-no-panels | ✅ | layout/ 不导入 panels/ |
| tui-theme-no-client | ✅ | theme/ 不导入 client/ |
| tui-features-no-panels | ✅ | features/ 不导入 panels/ |
| tui-no-old-client-tui-import | ✅ | src/tui/ 不导入 src/client-tui/ |

## Display Text

第一轮重建中，面板固定文案暂保持现状（硬编码中文 section title）。后续单独判断是否迁入 ContentPool。

| UI 元素 | 当前来源 | 后续计划 |
|---------|----------|----------|
| "当前地点" section title | 面板硬编码 | 待定 |
| "事件日志" section title | 面板硬编码 | 待定 |
| "行动" section title | 面板硬编码 | 待定 |
| "装备/生命/需求/特质" | 面板硬编码 | 待定 |
| 事件类型前缀+颜色 | theme/event-style.ts | 渲染约定，不属 ContentPool |
| 连接状态文本 ("已连接"等) | 面板硬编码 | 待定 |

## 测试策略

新增单元测试覆盖纯函数（features、theme、layout）：

| 模块 | 测试内容 |
|------|----------|
| features/inventory/grouping | groupInventory / formatGroupedItemName / findGroupForItem |
| features/quests/progress | objectiveProgressText |
| theme/event-style | getEventStyle 全类型覆盖 + fallback |
| theme/progress-format | percentBar / ratioBar / toneColor 边界 |
| layout/metrics | getLayoutMetrics / getModalMetrics / clamp 边界 |

依赖检查通过 `npm run lint` 中的 depcruise 验证，不新增测试工具。
