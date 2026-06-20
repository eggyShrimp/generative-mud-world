# Design: item-popup-properties

## Prerequisite

This change builds on `tui-entity-detail-popup`. It assumes:

- `EntityDetailPopup` already exists and is routed for room item entities.
- The `.test.tsx` rendering test entry introduced by `tui-entity-detail-popup` is executable.

Do not implement this change as a fallback path inside `TargetActionPopup`; the correct mechanism is to extend the item-specific popup and pass room item properties through the existing room entity protocol.

## Component Hierarchy

```
RoomPanel
├── <Show when={selectedEntity?.type === "item"}>
│   └── EntityDetailPopup                 ← changed
│       └── PopupPanel
│           ├── box                        ← typeLabel + description
│           ├── <Show when={properties text}>  ← NEW
│           │   └── text                    ← formatted properties
│           ├── divider (border-top)
│           └── KeyHint action list
└── TargetActionPopup (unchanged)
```

`EntityDetailPopup` 保持轻量目标弹窗形态，属性展示行内嵌在描述与操作分隔线之间，不改变组件 props 接口。

## Data Flow

```
ContentPool.itemPropertyLabels
  → state_update (ws-server)
    → client.itemPropertyLabels()
      → EntityDetailPopup 中 formatItemProperties()

ItemEntity.properties (server)
  → getRoomEntitiesInfo()                ← changed: 现在附带 properties
    → ws-server RoomEntity 响应
      → RoomPanel → EntityDetailPopup    ← 新增属性展示
```

## Protocol Messages

`RoomEntity` 新增字段：

```typescript
export interface RoomEntity {
  // ... existing fields unchanged
  properties?: Record<string, unknown>;  // NEW — item type 实体携带
}
```

与 `InventoryItem.properties` 完全同类型，复用 `formatItemProperties()` 格式化函数。

## Display Text

| UI Element | Source | Notes |
|------------|--------|-------|
| `entity.typeLabel` | `RoomEntity.typeLabel` (server ContentPool → capability-provider) | 不变 |
| `entity.description` | `RoomEntity.description` | 不变 |
| item properties | `RoomEntity.properties` → `formatItemProperties()` → `client.itemPropertyLabels()` | **新增** |
| action labels | `getEntityActions()` → `Capability.label` | 不变 |

格式化示例：
- 输入: `{ weapon: true, atkBonus: 5, defBonus: 2 }`
- Output: `武器，攻击：5，防御：2`

## Engine Change

`src/engine/capability-provider.ts` — `getRoomEntitiesInfo()` 在构建 entry 后，对 `e.type === "item"` 的实体附加：

```typescript
if (e.type === "item") {
  entry.properties = (e as ItemEntity).properties;
}
```

无需新增 ContentPool 读取。ItemEntity 的 `properties` 已在内存中，仅需透传即可。

## Test Plan

### Test toolkit

- Component tests: `testRender` from `@opentui/solid`
- Engine tests: vitest, 参考 `src/__tests__/capability-provider.test.ts`

### Test files

| Test File | Scenario | Assertions |
|-----------|----------|------------|
| `src/__tests__/entity-detail-popup.test.tsx` | item entity with properties | 属性行出现在描述和操作之间 |
| `src/__tests__/entity-detail-popup.test.tsx` | item entity without properties | 不展示属性行，回退到现有行为 |
| `src/__tests__/entity-detail-popup.test.tsx` | null entity | 弹窗不渲染（已有测试） |
| `src/__tests__/engine.test.ts` | item entity → RoomEntity has properties | `getRoomEntitiesInfo` 返回的 item 实体包含 `properties` 字段 |
| `src/__tests__/engine.test.ts` | npc entity → RoomEntity has no properties | npc 实体不包含 `properties` |

## Manual Checks

- [ ] `npm run dev:tui` — 房间中选择物品确认弹窗展示属性行（如"武器，攻击：5"）
- [ ] 选择无属性物品确认弹窗回退正常（不崩溃，不显示空属性行）
- [ ] 背包详情（按键 `i`）中属性展示不受影响
