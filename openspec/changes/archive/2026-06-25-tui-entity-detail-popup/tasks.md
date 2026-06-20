# Tasks: tui-entity-detail-popup

## What Changes

新增 `EntityDetailPopup` 组件（轻量 `PopupPanel` 布局），在 `components/index.ts` 导出，在 `RoomPanel` 按 `entity.type` 分流渲染。`TargetActionPopup` 不受影响。

## Test Harness

- [x] 修复/补齐 `.test.tsx` 渲染测试入口，使组件测试可被实际运行：
  - 当前 `vitest.config.ts` 只包含 `src/**/*.test.ts`，`npm test` 不会运行 `.test.tsx`
  - 选择并落地一个入口：`bunx vitest run --config vitest.bun.config.ts` 或 `bun test src/__tests__/*.test.tsx`
  - 用一个已有渲染测试（如 `src/__tests__/event-log.test.tsx`）验证入口确实可用

## Component: `src/tui/components/entity-detail-popup.tsx` (new)

- [x] 创建 `EntityDetailPopup` 组件，props: `{ client: GameClient; entity: RoomEntity | null }`
- [x] 使用 `PopupPanel` 作为布局基座，保持小型目标上下文弹窗形态
  - `title`: `entity().name`
  - `borderColor`: `THEME.focus`
  - `width`: 使用固定或内容约束宽度，避免覆盖事件日志或出口区域
- [x] 内容区：显示 `entity().typeLabel`（如果有）和 `entity().description`（如果有）；描述较长时使用 `wrapMode="word"` 或局部滚动
- [x] 操作区：用顶部分隔线与内容区分开，展示 `getEntityActions` 返回的操作列表，用 `KeyHint` 展示，点击执行 `action.run` 并清除 `selectedEntityId`
- [x] 加 `hasActiveRequest()` 加载态：显示 `LoadingHint` ，隐藏操作列表

## Component: `src/tui/components/index.ts` (modify)

- [x] 新增导出 `EntityDetailPopup` from `./entity-detail-popup.tsx`

## Component: `src/tui/panels/room/room-panel.tsx` (modify)

- [x] import `EntityDetailPopup` from `../../components/index.ts`
- [x] 将当前 `<TargetActionPopup client={...} entity={...} />` 替换为按类型分流：
  - `entity.type === "item"` → `<EntityDetailPopup>`
  - 其他 → `<TargetActionPopup>`

## Tests

### Component rendering tests (.test.tsx)

- [x] **新增** `src/__tests__/entity-detail-popup.test.tsx`
  - 渲染物品实体：content 区包含 `typeLabel` + `description`；interaction 区包含操作列表
  - 实体为 null：弹窗不渲染
  - 加载态：`hasActiveRequest()` 返回 true 时显示 `LoadingHint`
  - 无 `typeLabel` / 无 `description`：回退正常，不崩溃，操作列表仍然显示
  - 点击动作：真实触发 `KeyHint` 的点击处理，断言执行对应 action 并调用 `setSelectedEntityId(null)`；不能只断言按钮文字存在

- [x] **新增** `src/__tests__/room-panel.test.tsx`
  - item 实体选中 → 渲染 `EntityDetailPopup`
  - non-item 实体选中（npc 无 talk 能力）→ 渲染 `TargetActionPopup`

## Manual Checks

- [x] `npm run dev:tui` — 房间中选择物品确认弹出 `EntityDetailPopup`，显示"物品"标签+描述+操作
- [x] 选择 NPC（无 talk 能力）确认仍弹出 `TargetActionPopup`

## Verification

- [x] Run `npm run lint` (biome check + tsc --noEmit)
- [x] Run `npm test`
- [x] Run the `.test.tsx` rendering test entry chosen above against:
  - one existing rendering test, such as `src/__tests__/event-log.test.tsx`
  - `src/__tests__/entity-detail-popup.test.tsx`
  - `src/__tests__/room-panel.test.tsx`
- [x] Run `npm run lint` covers depcruise — confirm no tui-no-direct-engine-import violations
