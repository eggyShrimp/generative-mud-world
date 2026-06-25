# Proposal: fix-daynight-hardcoding

## Why

`src/index.ts:46` 中 NPC 每日结算循环硬编码了白天范围 `for (let hour = 6; hour <= 22; hour++)` 和日程回退逻辑 `e.schedule ?? []`。这违反了 AGENTS.md 的 ContentPool 优先原则：mod 作者无法通过配置文件修改 NPC 活跃时间范围。

这是 `docs/08-code-quality-review.md` 中标注为 CRITICAL 的遗留问题 #1，在 P0-P2 清理中漏掉了。

## Change Type

**engine-logic** — Core simulation logic change.

refactor

## What Changes

- `src/index.ts:46` — `6` 改为读取 `world.contentPool.calendar.hourStart`
- `src/index.ts:46` — `22` 改为读取 `world.contentPool.dayNightConfig.periods` 中 `night` 周期的 `startHour + 1`
- `src/index.ts:47` — `e.schedule ?? []` 改为 `e.schedule`（schedule 字段始终可赋默认值，空数组回退应在上层定义时完成而非运行时兜底；若确实需要兜底，使用 ContentPool 的 `narrativeTemplates` 字段）
- `docs/08-code-quality-review.md` — 更新当前基线数据，标记 #1 已修复，同步文件尺寸和拆分状态

## Modules Touched

| File | Change Type | Description |
|------|-------------|-------------|
| `src/index.ts` | modify-function | `runDay` 中白天循环范围改为 ContentPool 读取 |
| `docs/08-code-quality-review.md` | modify-doc | 同步当前代码状态，标记遗留问题修复 |

## ContentPool Reads

| pool.xxx field | Used in (file) | Purpose |
|----------------|----------------|---------|
| `calendar.hourStart` | `src/index.ts` | NPC 每日活动起始小时 |
| `dayNightConfig.periods` | `src/index.ts` | 读取 `night` 周期的 `startHour` 计算活动结束小时 |

## Trap Token Self-Check

| Trap | Applies? | How Addressed |
|------|:--:|---------------|
| no-hardcoded-labels (new Record<string,string>) | no | 不新增映射表 |
| no-direct-world-mutation (push/assign to state) | no | 不修改世界状态 |
| no-create-default-outside-world | no | 不新建 default 构造调用 |
| no-hardcoded-description-text (Chinese in engine/combat) | no | 不新增/修改硬编码字符串 |
| no-empty-catch | no | 不修改 catch 块 |

## Impact

- NPC 活跃时间范围从硬编码迁移到 ContentPool 可配置项
- `e.schedule ?? []` 回退逻辑归一化处理
- `docs/08-code-quality-review.md` 关键遗留问题 #1 标记已修复

## Test Impact

| Test File | Coverage |
|-----------|----------|
| `src/__tests__/simulation.test.ts` | 拆分后 NPC 模拟行为不变 |
| `src/__tests__/round-engine.test.ts` | 拆分后 round 引擎行为不变 |
