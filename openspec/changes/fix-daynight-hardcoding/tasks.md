# Tasks: fix-daynight-hardcoding

## Module: `src/index.ts`

- [ ] `runDay` 中 `for (let hour = 6; hour <= 22; hour++)` → 改为读取 `world.contentPool.calendar.hourStart` 和 `world.contentPool.dayNightConfig.periods`
- [ ] `e.schedule ?? []` → 改为 `e.schedule`（NPCEntity.schedule 已有默认值，无需运行时兜底）
- [ ] 确保 `night` 周期查找有合理 fallback（`startHour ?? 21`）

## Module: `docs/08-code-quality-review.md`

- [ ] 更新"当前基线"数据：源文件数 161，测试文件数 56，tests 969
- [ ] 更新 6 个大文件的尺寸（拆分后实际值）
- [ ] 标记错误 #1 (`runDay` 硬编码) 为 **已修复**
- [ ] 标记空 catch 块条目：重新分类为"LLM 降级模式（合法）"
- [ ] 更新"修复优先级总览"中全部已完成项的状态

## Tests

- [ ] Run `npm test -- src/__tests__/simulation.test.ts` — 确认 NPC 模拟行为不变
- [ ] Run `npm test -- src/__tests__/round-engine.test.ts` — 确认 round 引擎行为不变

## Verification

- [ ] Run `npm run lint` (biome check + tsc --noEmit)
- [ ] Run `npx vitest run`
- [ ] Run `npx depcruise src`
- [ ] Trap token re-check: no-hardcoded-labels, no-direct-world-mutation, no-create-default-outside-world, no-hardcoded-description-text
