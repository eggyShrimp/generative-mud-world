## ADDED Requirements

### Requirement: 背包层有正确两级 ESC 行为

背包 MUST 使用单一 `inventory` key layer 支持两级 ESC 行为：有选中物品时 ESC 清除选中项并回到列表态；无选中物品时 ESC 关闭背包。

#### Scenario: 无选中项时 ESC 关闭背包

- **GIVEN** `selectedInventoryItemId` 为 `null`（无选中项）
- **AND** `inventory` 层处于活跃状态
- **WHEN** 用户按 ESC
- **THEN** `inventory` 层被弹出（`popLayer("inventory")`）
- **AND** 背包弹窗关闭
- **TEST** `src/__tests__/key-layer.test.ts`: `mockClient` + `dispatchKey` → 验证 `closeInventory()` 被调用

#### Scenario: 有选中项时 ESC 回到物品列表

- **GIVEN** `selectedInventoryItemId` 不为 `null`（有选中物品）
- **AND** `inventory` 层处于活跃状态
- **WHEN** 用户按 ESC
- **THEN** `selectedInventoryItemId` 被设为 `null`
- **AND** `inventory` 层保持活跃（背包仍在）
- **TEST** `src/__tests__/key-layer.test.ts`: `mockClient` + `dispatchKey` → 验证 `selectedInventoryItemId` 变 null，`inventory` 层保留

#### Scenario: 列表态 → 选中物品 → 详情态 → ESC → 列表态 → ESC → 关闭

- **GIVEN** 背包打开，无选中项
- **WHEN** 用户依次操作：按 `1`（选中物品）→ 按 ESC（回到列表）→ 按 ESC（关闭）
- **THEN** 最终背包关闭，`inventory` 层不活跃
- **TEST** `src/__tests__/key-layer.test.ts`: 完整链条验证

### Requirement: 箭头键切换选中物品

`↑` 和 `↓` 键 MUST 在单一背包层中切换选中物品，支持无选中项时首次选中和有选中项时切换。

#### Scenario: 无选中项时 `↓` 选中第一个物品

- **GIVEN** `inventory` 层活跃，`selectedInventoryItemId` 为 `null`
- **AND** 玩家有至少 2 种物品
- **WHEN** 用户按 `↓`
- **THEN** 第一个物品被选中（`selectedInventoryItemId` 设为 groups[0].items[0].id）
- **AND** `inventory` 仍是唯一背包 key layer
- **TEST** `src/__tests__/key-layer.test.ts`: `handleInventoryArrow(client, "down")` → 验证选中项，且不会新增 `inventory-detail` layer

#### Scenario: 有选中项时 `↑` 切换到前一个物品

- **GIVEN** `inventory` 层活跃，第二个物品被选中
- **WHEN** 用户按 `↑`
- **THEN** 选中项切换到第一个物品
- **AND** `inventory` 层保持活跃
- **TEST** `src/__tests__/key-layer.test.ts`: 验证选中项变化，`inventory` 仍在

#### Scenario: 到达列表边界时 wrap

- **GIVEN** 第一个物品被选中
- **WHEN** 用户按 `↑`
- **THEN** 选中项切换到最后一个物品
- **TEST** `src/__tests__/key-layer.test.ts`: 边界 wrap 逻辑

#### Scenario: 空背包时箭头键无操作

- **GIVEN** 背包为空（groups.length === 0）
- **WHEN** 用户按 `↑` 或 `↓`
- **THEN** `selectedInventoryItemId` 保持 `null`
- **AND** `inventory` 层保持活跃
- **TEST** `src/__tests__/key-layer.test.ts`: 空 inventory 时 handleInventoryArrow 直接 return

### Requirement: 鼠标点击选中物品显示详情

鼠标点击物品 MUST 通过统一入口设置 `selectedInventoryItemId`，使右侧详情列显示该物品，并使后续 ESC 能正确回退到列表态。

#### Scenario: 鼠标点击物品显示右侧详情

- **GIVEN** 背包打开，无选中项
- **WHEN** 用户鼠标点击物品列表的某一行
- **THEN** `selectInventoryItem(id)` 被调用
- **AND** `selectedInventoryItemId` 设为被点物品的 ID
- **AND** 不新增 `inventory-detail` key layer
- **TEST** `src/__tests__/inventory-panel.test.tsx`: 模拟点击物品行 → 验证调用 `selectInventoryItem`

#### Scenario: 有选中项时点击其他物品切换详情

- **GIVEN** `inventory` 层活跃，物品 A 被选中
- **WHEN** 用户鼠标点击物品 B
- **THEN** 选中项切换到 B
- **AND** `inventory` 层保持活跃
- **TEST** `src/__tests__/inventory-panel.test.tsx`: 两次点击验证

### Requirement: 有选中项时数字键执行动作

在背包已有选中项时，数字键 `1-9` MUST 执行对应操作（使用/观察/丢下等），执行后关闭背包。

#### Scenario: 在详情态按 `1` 执行使用

- **GIVEN** `inventory` 层活跃，某物品被选中
- **AND** 该物品有 `use` 能力
- **WHEN** 用户按 `1`
- **THEN** 对应动作 `run()` 被调用
- **AND** 背包随后关闭（`closeInventory()`）
- **TEST** `src/__tests__/key-layer.test.ts`: mock `getInventoryActions` → 验证 action.run 和 closeInventory

### Requirement: 冗余快捷键删除后失效

已删除的冗余键位绑定 MUST 不再触发对应的操作。

#### Scenario: 在地图层按 `h` 不再导航

- **GIVEN** `map` 层活跃
- **WHEN** 用户按 `h`
- **THEN** 不触发地图光标移动
- **TEST** `src/__tests__/key-layer.test.ts`: 验证 map cursor 未变化

#### Scenario: 在游记层按 `k` 不再导航

- **GIVEN** `travelogue` 层活跃
- **WHEN** 用户按 `k`
- **THEN** 不触发游记选中项切换
- **TEST** `src/__tests__/key-layer.test.ts`: 验证 `selectedTravelogueIndex` 未变化

#### Scenario: 在书阅读器按 `pageup` 不再滚动

- **GIVEN** `book-reader` 层活跃
- **WHEN** 用户按 `pageup`
- **THEN** 不触发滚动
- **TEST** `src/__tests__/key-layer.test.ts`: 验证 scrollTop 未变化

#### Scenario: 一次性通知只响应 `space`

- **GIVEN** `quest-notification` 或 `item-change-notification` 层活跃
- **WHEN** 用户按 `enter`
- **THEN** 通知不被关闭
- **WHEN** 用户按 `escape`
- **THEN** 通知不被关闭
- **WHEN** 用户按 `space`
- **THEN** 通知被关闭
- **TEST** `src/__tests__/key-layer.test.ts`: `dispatchKey` 三种按键 → 验证 dismiss 仅被 space 触发

### Requirement: 背包 footer 文字随层级变化

背包 footer 文字 MUST 根据是否有选中项显示不同的操作提示。

#### Scenario: 列表态 footer 显示正确

- **GIVEN** 背包无选中项
- **WHEN** 背包渲染
- **THEN** footer 文本包含 `"选择物品编号，↑↓ 切换，Esc 关闭"`
- **TEST** `src/__tests__/inventory-panel.test.tsx`: `testRender` → captureCharFrame → toContain

#### Scenario: 详情态 footer 显示正确

- **GIVEN** 背包有选中项
- **WHEN** 背包渲染
- **THEN** footer 文本包含 `"↑↓ 切换物品，1-9 操作，Esc 返回"`
- **TEST** `src/__tests__/inventory-panel.test.tsx`: `testRender` → captureCharFrame → toContain
