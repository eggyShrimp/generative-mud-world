# Proposal: coin-name-from-contentpool

## Why

`createPlayer()` 在 `src/core/world.ts` 中创建玩家初始铜币时，物品名称硬编码为 `"铜币"`。但 ContentPool YAML（`worlds/content-pool/needs-actions.yaml`）将货币模板名称定义为 `"开元通宝"`。商人系统通过 `dialogue-generator.ts` 的 `getCurrencyName()` 从 ContentPool 读取名称显示为 `"开元通宝"`，造成背包显示与交易窗口显示的货币名称不一致。

## Change Type

**bug-fix** — 引擎逻辑修改，从 ContentPool 读取货币名称而非硬编码。

## What Changes

- `createPlayer()` 创建初始铜币时，使用 `contentPool.itemTemplates` 中 `id === "copper_coin"` 的模板名。
- 如果 ContentPool 没有 `copper_coin` 模板，继续回退为 `"铜币"`。
- 不改变玩家创建流程、物品数量、`templateId` 或货币属性。

## Modules Touched

| File | Change Type | Description |
|------|-------------|-------------|
| `src/core/world.ts` | modify-function | `createPlayer()` 中 5 枚初始铜币的 `name` 从 `contentPool.itemTemplates` 读取 |

## ContentPool Reads

| pool.xxx field | Used in (file) | Purpose |
|----------------|----------------|---------|
| `pool.itemTemplates` | `src/core/world.ts:createPlayer()` | 查找 `templateId === "copper_coin"` 的模板名作为货币名称 |

## Trap Token Self-Check

| Trap | Applies? | How Addressed |
|------|:--:|---------------|
| no-hardcoded-labels (new Record<string,string>) | no | 无新增常量映射 |
| no-direct-world-mutation (push/assign to state) | no | 不修改游戏状态 |
| no-create-default-outside-world | no | `createPlayer` 是 createWorld 的一部分，不走 createDefaultXxx |
| no-hardcoded-description-text (Chinese in engine/combat) | yes | 原硬编码 `"铜币"` 替换为从 ContentPool 读取，无新硬编码文本 |
| no-empty-catch | no | 无新增 catch |

## Impact

- 玩家背包和交易窗口的货币名称统一（均为 ContentPool 定义的 "开元通宝"）
- 回退机制：ContentPool 无匹配时仍用 `"铜币"` 保证兼容
