# Proposal: item-popup-properties

## Why

物品交互弹窗（当前 `EntityDetailPopup`）只展示类型标签和一行描述，不展示物品属性。武器、食物、光源等物品的核心特征（如"武器，攻击：5"）要拾取进背包后才能看到。玩家在房间内选择物品时信息量不足，弹窗显得单薄。

## What Changes

- 服务端 `getRoomEntitiesInfo` 在构建 room entities 时，对 item 类型实体附带 `properties`
- `RoomEntity` 协议类型新增 `properties?: Record<string, unknown>`
- `EntityDetailPopup` 在描述下方新增属性展示行

## Depends On

- `tui-entity-detail-popup` — this change modifies the `EntityDetailPopup` introduced there. Apply this change after that popup exists and after the `.test.tsx` rendering test entry is runnable.

## Change Type

**cross-cutting** — 协议字段新增（shared/protocol）+ 引擎函数改动（engine/capability-provider）+ TUI 组件改动（tui/components/entity-detail-popup）

## Components Touched

| File | Change Type | Description |
|------|-------------|-------------|
| `src/shared/protocol.ts` | modify | `RoomEntity` 新增 `properties?: Record<string, unknown>` |
| `src/engine/capability-provider.ts` | modify | `getRoomEntitiesInfo` 对 item 实体附带 `properties` |
| `src/tui/components/entity-detail-popup.tsx` | modify | 描述下方显示 item properties |

## Protocol Surface

- `RoomEntity` 新增字段 `properties?: Record<string, unknown>` — 与 `InventoryItem.properties` 同类型
- 无新增 message type

## Boundary Self-Check

- [x] TUI 改动不引入 engine/combat/simulation/llm 导入
- [x] 属性标签来自 `ContentPool.itemPropertyLabels`（经 `state_update` 下发 `client.itemPropertyLabels()`）
- [x] 引擎改动仅读取 entity 已有字段，不新增 ContentPool 读取

## Impact

- 物品交互弹窗：从「类型标签 + 描述 + 操作」升级为「类型标签 + 描述 + 属性 + 操作」
- 背包详情（InventoryDetail）不受影响，继续展示全部属性
- `RoomEntity` 协议向后兼容：`properties?` 为可选字段，旧客户端忽略即可

## Test Impact

| Test File | Coverage |
|-----------|----------|
| `src/__tests__/entity-detail-popup.test.tsx` | 更新：验证带 properties 的实体渲染属性行；无 properties 回退正常 |
| `src/__tests__/engine.test.ts` | 更新：验证 `getRoomEntitiesInfo` 对 item 实体返回 properties |
