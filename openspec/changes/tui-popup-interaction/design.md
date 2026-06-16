# Design: tui-popup-interaction

## Component Hierarchy

```
App
├── KeyboardController (unchanged)
├── InventoryPanel
│   ├── PopupPanel (wrapper, unchanged)
│   ├── InventoryList (left column)     ← 点击调用 selectInventoryItem()
│   └── InventoryDetail (right column)  ← 由 selectedInventoryItemId 控制显示
└── DialoguePanel (trade-detail.tsx, footer text only) ← 微调

KeyLayer stack:
  "inventory"             单一背包层：列表、详情、动作都在此层内按选中态分派
```

## Key Layer Design

### INVENTORY_LAYER (priority: 50, existing, modified)

| Key | Handler | Behavior |
|-----|---------|----------|
| `escape` | `handleInventoryEscape` | 有选中项 → 清除选中项；无选中项 → `closeInventory()` |
| `i` | `closeInventory` | 关闭背包（toggle） |
| `1-9` | `handleInventoryKey` | 无选中项 → 选中列表物品；有选中项 → 执行动作，执行后关闭背包 |
| `up` | `handleInventoryArrow("up")` | 无选中项 → 选中最后一个物品；有选中项 → 切换到前一个物品 |
| `down` | `handleInventoryArrow("down")` | 无选中项 → 选中第一个物品；有选中项 → 切换到后一个物品 |

### Keybinding Simplification (across all layers)

| Layer | Action | Before | After |
|-------|--------|--------|-------|
| MAP | nav | `h, left` / `l, right` / `k, up` / `j, down` | `left` / `right` / `up` / `down` |
| TRAVELOGUE | nav | `k, up` / `j, down` | `up` / `down` |
| BOOK_READER | prev page | `left, h` | `left` |
| BOOK_READER | next page | `right, l` | `right` |
| BOOK_READER | scroll up | `up, k, pageup` | `up` |
| BOOK_READER | scroll down | `down, j, pagedown` | `down` |
| QUEST_NOTIFICATION | dismiss | `escape, enter, space` | `space` |
| ITEM_CHANGE_NOTIFICATION | dismiss | `escape, enter, space` | `space` |

保留 toggle 模式（同字母开/关）：`i`(背包) · `q`(状态/书) · `j`(任务) · `m`(地图) · `t`(游记) · `v`(存档) · `0`(结束今天)

## Client API Design

### New method: `selectInventoryItem(id: string)`

```typescript
// 统一入口：键盘 1-9、鼠标点击、↑/↓ 箭头都调用此方法
const selectInventoryItem = (id: string) => {
  setSelectedInventoryItemId(id);
};
```

### Modified: `closeInventory()`

```typescript
// 关闭整个背包：清选中项 + 弹掉 inventory 层
const closeInventory = () => {
  setSelectedInventoryItemId(null);
  popLayer("inventory");
};
```

### New method: `clearInventorySelection()`

```typescript
// 详情态 → 列表态：只清选中项，不关闭背包
const clearInventorySelection = () => {
  setSelectedInventoryItemId(null);
};
```

### `handleInventoryArrow(client, keyName)`

```
input: keyName = "up" | "down"
current: selectedInventoryItemId
output: 更新 selectedInventoryItemId

1. 获取 groupedInventory (client.entity().inventory → groupInventory)
2. 若 groups 为空（groups.length === 0），直接 return
3. 找到当前选中项在 groups 中的索引
4. direction ±1，wrap 处理边界
5. 调用 selectInventoryItem(groups[newIndex].items[0].id)
6. 不改变 key layer 栈；详情只是同一个背包弹窗里的右列状态
```

## Protocol Messages

无变化。所有状态通过现有 `selectedInventoryItemId` signal + 单一 `inventory` layer 管理。

## depcruise Boundary Verification

| Rule | Status | Notes |
|------|:--:|-------|
| tui-no-direct-engine-import | ✅ | 所有改动在 `src/tui/` 内，无 engine/combat/simulation/llm import |
| combat-config-only-via-contentpool | ✅ | N/A |

## Display Text

| UI Element | Source | Notes |
|------------|--------|-------|
| Inventory footer (no selected) | hardcoded | `"选择物品编号，↑↓ 切换，Esc 关闭"` |
| Inventory footer (selected) | hardcoded | `"↑↓ 切换物品，1-9 操作，Esc 返回"` |
| Trade detail footer | hardcoded | `"[1] 购买 [Esc] 返回"` — 微调 |

## Test Plan

### Test files

| Test File | Scenario | Assertions |
|-----------|----------|------------|
| `src/__tests__/key-layer.test.ts` | ESC 无选中项关闭背包 | 原有测试更新：确认 closeInventory 触发 |
| `src/__tests__/key-layer.test.ts` | ESC 有选中项回到列表态 | `selectedInventoryItemId` 变 null，`inventory` 层仍在 |
| `src/__tests__/key-layer.test.ts` | ↑/↓ 无选中项时选中物品 | 调用 `selectInventoryItem()`，不改变 layer 栈 |
| `src/__tests__/key-layer.test.ts` | ↑/↓ 有选中项时切换物品 | 更新选中项，`inventory` 层仍在 |
| `src/__tests__/inventory-panel.test.tsx` | 鼠标点击选中物品 | `selectInventoryItem()` 被调用 |
| `src/__tests__/key-layer.test.ts` | 数字键在详情态执行动作 | 执行后关闭背包 |
| `src/__tests__/key-layer.test.ts` | 旧冗余快捷键失效 | `j` 不再关闭 quests；`q` 不再关闭 status |
| `src/__tests__/inventory-panel.test.tsx` | 背包 footer 文字 | 列表态和详情态的 footer 内容 |

## Manual Checks

- [ ] `npm run dev:tui` — 背包打开/关闭/ESC/箭头键行为验证
- [ ] `npm run dev:tui` — 交易对话 ESC 回归（不应受影响）
- [ ] `npm run dev:tui` — 实体选择 ESC 回归（不应受影响）
