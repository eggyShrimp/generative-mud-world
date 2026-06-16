# Tasks: item-popup-properties

## What Changes

协议 `RoomEntity` 新增 `properties` 字段，服务端透传 item 属性，客户端物品交互弹窗展示属性行。

## Prerequisite

- [ ] 先完成 `tui-entity-detail-popup`
- [ ] 确认 `.test.tsx` 渲染测试入口可执行；本变更不能只依赖 `npm test` 验证组件渲染

## Protocol: `src/shared/protocol.ts` (modify)

- [ ] `RoomEntity` 接口新增 `properties?: Record<string, unknown>` 字段

## Engine: `src/engine/capability-provider.ts` (modify)

- [ ] `getRoomEntitiesInfo()` 对 `e.type === "item"` 的实体附加 `properties`：从 `ItemEntity.properties` 透传

## TUI: `src/tui/components/entity-detail-popup.tsx` (modify)

- [ ] import `formatItemProperties` from `../../../shared/item-format.ts`
- [ ] 描述 (`entity().description`) 下方新增属性展示行：
  - 用 `formatItemProperties(entity().properties ?? {}, props.client.itemPropertyLabels())` 格式化
  - 用 `<Show when={...}>` 包裹，属性文本为空时不渲染
  - 使用与描述一致的 `fg={THEME.text}` `wrapMode="word"` 样式

## Tests

### Component rendering tests (.test.tsx)

- [ ] **更新** `src/__tests__/entity-detail-popup.test.tsx`
  - item entity with properties → 属性行出现，包含翻译后的中文标签
  - item entity with no properties → 属性行不渲染，回退到现有行为（description + actions）
  - item entity with null properties → 不崩溃

### Engine tests (.test.ts)

- [ ] **更新** `src/__tests__/engine.test.ts` 中现有 `getRoomEntitiesInfo` 覆盖
  - `getRoomEntitiesInfo` 返回 item 实体 → entry 包含 `properties` 字段，值与 `ItemEntity.properties` 一致
  - `getRoomEntitiesInfo` 返回 npc 实体 → entry 不包含 `properties`

## Manual Checks

- [ ] `npm run dev:tui` — 房间中选择有属性的物品（如武器），确认弹窗展示属性行
- [ ] 房间中选择无属性物品，确认弹窗回退正常，不崩溃
- [ ] 背包详情（`i`）属性展示不受影响

## Verification

- [ ] Run `npx tsc --noEmit`
- [ ] Run `npx vitest run`
- [ ] Run the `.test.tsx` rendering test entry against `src/__tests__/entity-detail-popup.test.tsx`
- [ ] Run `npx biome check src/`
