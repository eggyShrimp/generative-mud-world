# Tasks: coin-name-from-contentpool

## Module: `src/core/world.ts`

- [ ] `createPlayer(contentPool)` 中查找 `contentPool.itemTemplates.find(t => t.id === "copper_coin")` 获取模板名
- [ ] 如果模板存在，使用 `template.name` 作为 5 枚初始铜币的 `name` 字段；不存在则回退 `"铜币"`
- [ ] 保持其他属性不变（`templateId: "copper_coin"`、`properties: { currency: true }`）

## Tests

### Pure function / utility tests (.test.ts)

- [ ] 新增 `src/__tests__/world.test.ts`: 验证 ContentPool 有 `copper_coin` 模板时，玩家初始铜币名称等于模板名
- [ ] 新增 `src/__tests__/world.test.ts`: 验证 ContentPool 无 `copper_coin` 模板时，回退名为 `"铜币"`
- [ ] 新增 `src/__tests__/world.test.ts`: 验证多个 `currency: true` 模板共存时，初始铜币仍按 `id === "copper_coin"` 精确匹配

## Verification

- [ ] Run `npm run lint` (biome check + tsc --noEmit)
- [ ] Run `npx vitest run`
- [ ] Run `npx depcruise src` — confirm no boundary violations
- [ ] Trap token re-check: `createPlayer` 不调用 `createDefaultXxx`；`"铜币"` 仅作回退值
