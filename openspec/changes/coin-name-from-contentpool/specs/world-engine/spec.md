## ADDED Requirements

### Requirement: 玩家初始铜币名称来自 ContentPool

`createPlayer()` MUST 从 `contentPool.itemTemplates` 中查找 `templateId === "copper_coin"` 的模板名作为初始铜币的名称，而非硬编码 `"铜币"`。

#### Scenario: ContentPool 有 copper_coin 模板

- **GIVEN** ContentPool 的 `itemTemplates` 包含 `{ id: "copper_coin", name: "开元通宝", properties: { currency: true } }`
- **WHEN** `createPlayer(contentPool, id)` 被调用
- **THEN** 创建的玩家 inventory 中 5 枚铜币的 `name` 均为 `"开元通宝"`
- **TEST** `src/__tests__/world.test.ts`: 验证 `createPlayer` 输出的货币名称

#### Scenario: ContentPool 无 copper_coin 模板时回退

- **GIVEN** ContentPool 的 `itemTemplates` 为空或不包含 `copper_coin`
- **WHEN** `createPlayer(contentPool, id)` 被调用
- **THEN** 创建的玩家 inventory 中铜币的 `name` 为 `"铜币"`
- **TEST** `src/__tests__/world.test.ts`: 验证回退值

#### Scenario: 查找条件使用精确模板 ID 而非 currency 属性

- **GIVEN** ContentPool 包含多个 `currency: true` 的模板（如 `silver_coin`, `gold_coin`）
- **WHEN** `createPlayer(contentPool, id)` 被调用
- **THEN** 初始铜币名称使用模板 `id === "copper_coin"` 的名称，而非第一个 `currency: true` 的名称
- **TEST** `src/__tests__/world.test.ts`: 验证使用正确的模板 ID 查找
