# Tasks: tui-popup-interaction

## What Changes

6 个源文件改动，涉及 key layer 配置、键盘 handler、client 方法、面板组件。

## Component: `src/tui/key-layer/layers.ts`

- [x] `STATUS_LAYER`: 保持不变，保留 `q` toggle 关闭
- [x] `QUESTS_LAYER`: 保持不变，保留 `j` toggle 关闭
- [x] `MAP_LAYER`: 去除 `h/j/k/l` 四个 vim 键绑定，只保留箭头键 + `g` 切换粒度 + `escape/m` 关闭
- [x] `TRAVELOGUE_LAYER`: 导航从 `["k", "up"]` / `["j", "down"]` 简化为 `"up"` / `"down"`
- [x] `BOOK_READER_LAYER`: 翻页从 `["left", "h"]` 简化为 `"left"`，`["right", "l"]` 简化为 `"right"`；滚动从 `["up", "k", "pageup"]` 简化为 `"up"`，`["down", "j", "pagedown"]` 简化为 `"down"`
- [x] `QUEST_NOTIFICATION_LAYER`: 从 `["escape", "enter", " "]` 简化为 `" "`
- [x] `ITEM_CHANGE_NOTIFICATION_LAYER`: 从 `["escape", "enter", " "]` 简化为 `" "`
- [x] `CONFIRM_END_DAY_LAYER`: 保持不变，保留 `0` toggle 取消
- [x] 不新增 `inventory-detail` layer；背包详情是 `inventory` 弹窗内部的右列状态
- [x] `INVENTORY_LAYER`: 保留 `i` toggle 关闭背包；替换 ESC handler 为 `handleInventoryEscape`；新增 `up`/`down` 绑定 `handleInventoryArrow`

## Component: `src/tui/key-layer/handlers.ts`

- [x] 新增 `handleInventoryEscape(client)`:
  - 如果 `selectedInventoryItemId` 不为 null → `client.clearInventorySelection()`
  - 如果为 null → `client.closeInventory()`
- [x] 新增 `handleInventoryArrow(client, keyName)`:
  - 读取 `client.entity()?.inventory` → `groupInventory` 获取分组列表
  - 若 `groups.length === 0` 直接 return
  - 若 `selectedInventoryItemId` 有值，在 groups 中定位索引
  - 若没值，从 0 或最后一个开始
  - `keyName === "up"` 索引 -1；`"down"` 索引 +1；边界 wrap
  - 调用 `client.selectInventoryItem(groups[newIndex].items[0].id)`

## Component: `src/tui/client/game-client.ts`

- [x] 新增 `selectInventoryItem(id: string)` 方法：包装 `setSelectedInventoryItemId(id)`
- [x] 新增 `clearInventorySelection()` 方法：包装 `setSelectedInventoryItemId(null)`
- [x] 修改 `closeInventory()`：`setSelectedInventoryItemId(null)` + `popLayer("inventory")`
- [x] 在返回对象中导出新方法；从 GameClient 接口移除裸 signal setter

## Component: `src/tui/client/types.ts`

- [x] 在 `GameClient` 接口中移除 `setSelectedInventoryItemId` 签名
- [x] 添加 `selectInventoryItem(id: string): void`
- [x] 添加 `clearInventorySelection(): void`

## Component: `src/tui/panels/inventory/inventory-panel.tsx`

- [x] `onSelect` 回调改为调用 `props.client.selectInventoryItem(group.items[0].id)` 而非 `setSelectedInventoryItemId`
- [x] footer 文字调整：列表态 → `"选择物品编号，↑↓ 切换，Esc 关闭"`；详情态 → `"↑↓ 切换物品，1-9 操作，Esc 返回"`

## Component: `src/tui/panels/dialogue/trade-detail.tsx`

- [x] footer 文字 `[Esc] 返回` → `[Esc] 返回`（不变或酌情调整）

## Tests

### Pure function / utility tests (.test.ts)

- [ ] 更新 `src/__tests__/key-layer.test.ts`: 修改已存在的 inventory ESC 测试用例，适配两层行为
- [ ] 新增 `src/__tests__/key-layer.test.ts`: 无选中项时 ESC 关闭背包
- [ ] 新增 `src/__tests__/key-layer.test.ts`: 有选中项时 ESC 回到列表态
- [ ] 新增 `src/__tests__/key-layer.test.ts`: 箭头键无选中项时选中物品，有选中项时切换
- [ ] 新增 `src/__tests__/inventory-panel.test.tsx`: 鼠标点击调用 `selectInventoryItem`
- [ ] 新增 `src/__tests__/key-layer.test.ts`: 数字键有选中项时执行动作后关闭
- [ ] 新增 `src/__tests__/key-layer.test.ts`: 删除的旧快捷键失效（map h/j/k/l、travelogue k/j、book-reader k/j/pageup/pagedown）
- [ ] 新增 `src/__tests__/key-layer.test.ts`: notifications 只响应 `space`
- [ ] 新增 `src/__tests__/key-layer.test.ts`: 全链条验证（1 → ESC → ESC 三连操作）
- [ ] 新增 `src/__tests__/key-layer.test.ts`: 空背包时箭头键无操作

### Component rendering tests (.test.tsx)

- [ ] 新增 `src/__tests__/inventory-panel.test.tsx`: 列表态 footer 文字
- [ ] 新增 `src/__tests__/inventory-panel.test.tsx`: 详情态 footer 文字

## Manual Checks

- [ ] Run `npm run dev:tui` — 背包打开/ESC/箭头键行为验证
- [ ] Run `npm run dev:tui` — 交易对话 ESC 回归（不应受影响）
- [ ] Run `npm run dev:tui` — 实体选择 ESC 回归（不应受影响）
- [ ] Run `npm run dev:tui` — notifications 仅 `space` 关闭

## Verification

- [ ] Run `npm run lint` (biome check + tsc --noEmit)
- [ ] Run `npx vitest run`
- [ ] Run `npx depcruise src` — confirm no tui-no-direct-engine-import violations
