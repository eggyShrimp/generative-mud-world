# Design: coin-name-from-contentpool

## Data Flow

```
createPlayer(contentPool)
  → 查找 contentPool.itemTemplates 中 templateId === "copper_coin" 的项
  → 取该模板的 name 字段
  → 回退：ContentPool 无匹配时使用 "铜币"
```

纯数据源替换。创建玩家物品的流程不变，只有 `name` 字段的来源改变。

## ContentPool Integration

| pool.xxx field | Used in (file) | Purpose |
|----------------|----------------|---------|
| `pool.itemTemplates` | `src/core/world.ts` | 查找 `templateId === "copper_coin"` 模板的 `name` |

**查找逻辑**（与 `dialogue-generator.ts` 的 `countCurrency()` 保持一致）：

```typescript
const coinTemplate = contentPool.itemTemplates.find(t => t.id === "copper_coin");
const coinName = coinTemplate?.name ?? "铜币";
```

使用 `t.id === "copper_coin"` 精确匹配 template ID，而非 `currency: true` 模糊匹配。避免未来有 `silver_coin`、`gold_coin` 时取错名称。

## State Mutation Path

不修改游戏运行时的状态。只在 `createWorld()` 创建玩家实体时影响初始物品的名称。没有 delta 写入。

## Trap Token Verification

| File | Trap Checked | Status |
|------|-------------|--------|
| `src/core/world.ts` | no-hardcoded-labels | ✅ 原硬编码 `"铜币"` 已被替换；无新 Record<string,string> |
| `src/core/world.ts` | no-create-default-outside-world | ✅ `createPlayer` 在 `createDefaultContentPool` 范围内调用 |
| `src/core/world.ts` | no-hardcoded-description-text | ✅ `"铜币"` 回退值仅作为 fallback，主路径从 ContentPool 读取 |

## Test Plan

### Test files

| Test File | Scenario | Assertions |
|-----------|----------|------------|
| `src/__tests__/world.test.ts` | 玩家初始铜币名称来自 ContentPool | `createPlayer` 返回的 inventory 中铜币 `name` 等于 ContentPool 定义的模板名 |
| `src/__tests__/world.test.ts` | ContentPool 无货币模板时回退 | 清空 itemTemplates 后创建玩家，铜币 `name` 为 `"铜币"` |
