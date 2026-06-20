# Proposal: tui-popup-interaction

## Why

修复弹出层交互的 3 个问题 + 简化键盘绑定：

1. **背包 ESC 只能关闭无法回退** — 选中物品、右侧显示详情后，ESC 直接关闭整个弹窗，无法先清除详情选择回到列表态。对话/交易弹窗已有正确两级 ESC 行为。
2. **背包缺少箭头键导航** — 只能按数字键 `1-9` 选择物品，无法用 `↑/↓` 切换。
3. **键盘键位冗余** — 多个弹窗的同个操作绑定 2–3 个键位（详见下文），增加学习成本。
4. **鼠标点击物品后 ESC 行为不一致** — 点击选中物品后只是设置选中项，ESC 仍走关闭背包路径，没有先回到列表态。

## Change Type

**tui-only** — Client-side TUI change. No ContentPool. No engine logic.

## What Changes

- 保留单一 `inventory` key layer；不新增 `inventory-detail` layer。
- 背包内部继续使用双列布局：左侧物品列表，右侧当前选中物品详情。
- `selectedInventoryItemId` 仅表示右侧详情显示状态，不映射为新的 key layer。
- `inventory` 层内统一处理 ESC、数字键、`↑/↓` 和鼠标点击：有选中项时 ESC 清除选择，无选中项时关闭背包。
- 精简弹窗中的冗余键位绑定。

## Components Touched

| File | Change Type | Description |
|------|-------------|-------------|
| `src/tui/key-layer/layers.ts` | modify | 删除冗余绑定；`inventory` 层内处理背包列表/详情状态 |
| `src/tui/key-layer/handlers.ts` | new-function | `handleInventoryEscape`、`handleInventoryArrow` |
| `src/tui/client/game-client.ts` | modify-function | 新增 `selectInventoryItem(id)` 统一入口；`closeInventory()` 保持关闭整个背包 |
| `src/tui/client/types.ts` | modify-interface | 新增 `selectInventoryItem` 方法签名 |
| `src/tui/panels/inventory/inventory-panel.tsx` | modify-display | footer 文字；mouse click handler 使用新统一入口 |
| `src/tui/panels/dialogue/trade-detail.tsx` | modify-display | footer 文字微调 |

## Protocol Surface

无变化。所有状态通过现有 `selectedInventoryItemId` 和 `inventory` key layer 管理。

## Boundary Self-Check

- [x] No imports from `src/engine/`
- [x] No imports from `src/combat/`
- [x] No imports from `src/simulation/`
- [x] No imports from `src/llm/`
- [x] No imports from `src/core/` (except `src/shared/` which is allowed)
- [x] Business/world display text comes from server ContentPool label fields
- [x] Structural UI text that remains hardcoded is listed in design.md

## Impact

- 背包 ESC 与对话/交易弹窗一致：有选中物品 → 回到列表态，无选中物品 → 关闭
- 背包支持 `↑/↓` 键切换物品，`1-9` 键行为不变
- 鼠标点击物品显示右侧详情，ESC 能正确回退到列表态
- 减少约 10+ 个冗余键位绑定，各弹窗口键位统一：
  - `ESC` → 唯一关闭/返回键
  - `↑/↓` → 唯一导航键
  - `Space` → 一次性通知确认
  - 同字母 toggle 保留

## Test Impact

| Test File | Coverage |
|-----------|----------|
| `src/__tests__/key-layer.test.ts` | 更新已存在的 inventory/entity-selected ESC 测试 |
| `src/__tests__/inventory-panel.test.tsx` | 新增：背包两层 ESC、箭头键、鼠标点击 |
| `src/__tests__/key-layer.test.ts` | 新增：冗余快捷键失效验证 |
