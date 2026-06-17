# Proposal: day-night-season-weather

## Why

当前时间系统只维护 `GameTime` 的 tick/hour/day/month/year，但引擎没有“时段、季节、天气”这些可被规则读取的环境状态。NPC 日程、战斗命中、出口开放条件和每日结算叙事都只能看到粗粒度日期，导致同一个场景在白天和夜晚没有规则差异。

本变更只负责引擎读取和使用这些环境状态。ContentPool 字段、YAML 基础数据和 TUI 展示由配套变更负责：

- `day-night-season-weather-yaml`: 定义并加载 `dayNightConfig`、`seasonConfig`、`weatherConfig`
- `day-night-season-weather-tui`: 展示时段、季节、天气标签

## Change Type

**new-feature** — 引擎逻辑变更。读取已经加载到 `world.contentPool` 的时段、季节、天气配置，计算环境状态，并让现有系统消费这些状态。

## What Changes

- `advanceDay()` 在每日推进后计算 `world.time.period`、`world.time.season` 和 `world.weatherByRegion`。
- 成功的耗时玩家行动会通过已有时间推进入口按分钟推进 `world.time`，并同步刷新 `world.time.period`；失败命令、信息查看和结束当天不额外推进时间。
- 行动耗时不是代码里的固定 1 小时：普通动作从 ContentPool 的 `actionEffects[].durationMinutes` 读取；移动在该基础上按出口距离、地形速度和天气移动系数计算。
- 当行动推进跨过午夜时，当前玩家当天自然结束；后续日结算不能再次重复推进日期。
- 战斗命中率读取当前房间所在区域的天气和当前时段可见度修正。
- NPC 夜间日程使用现有 `executeSchedule()` 入口支持跨午夜时间段。
- 剧情时间触发条件支持按 `period` 和 `season` 匹配。
- 移动可行性使用现有 `checkFeasibility()` / `checkExitConditions()` 入口检查 `time` 和 `season` 出口条件。
- 移动精力消耗在现有 `calcMoveRestCost()` 中叠加天气移动系数。
- 每日需求衰减通过显式传入 `world` 的方式读取当前季节系数，并叠加角色装备保暖值与 ContentPool 保暖规则的偏差惩罚。
- 装备系统从 2 槽（weapon/armor）扩展为 4 槽（+cloak/accessory），为保暖衣物提供装备位置。
- 结算叙事 prompt 注入时段、季节、天气描述，但描述文本只来自 ContentPool。
- 随机生成的每日天气必须随存档保存和恢复，读档不能重新随机天气。

## Dependencies

本引擎变更依赖 `day-night-season-weather-yaml` 先完成以下字段和类型：

| Field | Purpose |
|-------|---------|
| `dayNightConfig` | 时段边界、标签、可见度系数 |
| `seasonConfig` | 月份到季节的映射、需求衰减系数、`comfortTemp`（舒适温度）、叙事前缀 |
| `weatherConfig` | 天气类型、季节过滤、权重、移动和可见度系数 |
| `warmthComfortConfig` | 保暖舒适公式参数：基准温度、最大理想保暖值、每点偏差惩罚 |
| `actionEffects[].durationMinutes` | 行动默认耗时，允许短对话是几分钟、工作/采集是更长时间 |
| `itemTemplates[].properties.warmth` | 物品保暖值（衣物/装备），用于季节舒适温度计算 |

本变更不在引擎代码里创建默认数据、标签映射或运行时兜底数据。缺失配置应由 ContentPool 加载和 schema 校验暴露。

## Modules Touched

| File | Change Type | Description |
|------|-------------|-------------|
| `src/core/types.ts` | modify-interface | 使用配套 YAML 变更提供的 `DayPeriod`、`Season`、`WeatherState`，扩展 `GameTime`、`WorldState`、`TriggerCondition`、`ActionEffect.durationMinutes`；扩展 `equipment` 接口为 4 槽 |
| `src/core/world.ts` | new-function + modify-function | 新增 `computeDayPeriod()`、`computeSeason()`、`computeWeatherByRegion()`；修改 `advanceTime(world, durationMinutes)`/`advanceDay()` 统一写入时间相关环境状态 |
| `src/core/world.ts` | modify-function | `createNPC()`/`createPlayer()` 默认装备包含新槽位 |
| `src/combat/pulse.ts` | modify-function | 命中率读取当前时段和天气可见度系数 |
| `src/simulation/index.ts` | modify-function | `executeSchedule()` 支持跨午夜日程；`decayNeeds()` 显式接收 `world`，读取季节系数并叠加保暖偏差惩罚 |
| `src/simulation/storyline-engine.ts` | modify-function | `matchTime()` 支持 `period`、`season` 条件 |
| `src/core/round-engine.ts` | modify-function | 玩家耗时行动完成后按计算出的分钟数调用已有时间推进入口；结算叙事 prompt 注入当前环境描述 |
| `src/engine/command-executor.ts` | modify-function | 复用现有出口条件检查入口；移动消耗和移动耗时叠加天气系数；equip/unequip 支持 `cloak`/`accessory` |
| `src/server/ws-server.ts` | modify-function | 实体状态序列化包含新装备槽位 |
| `src/index.ts` | modify-callsite | 更新 `decayNeeds()` 调用签名 |
| `src/__tests__/*.test.ts` | modify-callsite | 更新测试中的 `decayNeeds()` 调用签名、装备槽位断言 |

## ContentPool Reads

| pool.xxx field | Used in (file) | Purpose |
|----------------|----------------|---------|
| `dayNightConfig` | `world.ts`, `combat/pulse.ts`, `round-engine.ts`, `command-executor.ts` | 计算和展示时段；提供可见度修正 |
| `seasonConfig` | `world.ts`, `simulation/index.ts`, `round-engine.ts`, `storyline-engine.ts`, `command-executor.ts` | 计算季节；提供需求衰减和条件匹配 |
| `weatherConfig` | `world.ts` | 按季节过滤并选择天气 |
| `warmthComfortConfig` | `simulation/index.ts` | 保暖舒适公式参数，避免在引擎里硬编码平衡数值 |
| `itemTemplates[].properties.equipmentSlot` / `warmth` | `command-executor.ts`, `simulation/index.ts` | 装备槽位声明和保暖计算的数据来源 |

## Trap Token Self-Check

| Trap | Applies? | How Addressed |
|------|:--:|---------------|
| no-hardcoded-labels (new `Record<string,string>`) | no | 标签全部由配套 YAML 变更放入 ContentPool |
| no-direct-world-mutation (push/assign to state) | yes | 只通过 `advanceTime(world, durationMinutes)`/`advanceDay()` 这些现有时间推进入口写入时间状态；命令执行仍走现有 delta 流程 |
| no-create-default-outside-world | no | 引擎代码不调用 `createDefaultXxx()` |
| no-hardcoded-description-text (Chinese in engine/combat) | no | 叙事文本来自 `seasonConfig` 和 `weatherConfig` |
| no-empty-catch | no | 不新增 catch |

## Impact

- 战斗在夜间或恶劣天气下更难命中。
- 跨午夜 NPC 日程可以正常触发。
- 时间和季节出口条件从"只记录日志"变成真正阻止通行。
- 每日需求衰减受季节影响，穿戴保暖衣物可减少冬季惩罚，但夏天穿太厚会反受惩罚。
- 装备系统扩展为 4 槽，新增 `cloak`（斗篷）和 `accessory`（饰物）槽位。
- 玩家需要根据季节调整装备搭配：冬季穿毛皮斗篷保暖，夏季卸下厚衣物避免过热。
- 结算叙事可以感知当前环境。
- 玩家普通耗时行动会推进分钟级时间，NPC 日程、时段出口、战斗可见度等规则可以在同一天内随行动变化。
- 行动跨午夜会自然进入当天收尾，不会出现玩家继续在新日期行动后又被日结算多跳一天。

## Test Impact

| Test File | Coverage |
|-----------|----------|
| `src/__tests__/day-night-season.test.ts` | 时段、季节、天气选择、每日推进集成 |
| `src/__tests__/round-engine.test.ts` | 成功耗时行动按配置推进分钟；失败命令、信息查看、结束当天不推进时间 |
| `src/__tests__/combat-visibility.test.ts` | 时段和天气对命中率的影响 |
| `src/__tests__/engine.test.ts` | `checkFeasibility()` 和移动命令的时间/季节出口条件；装备穿戴支持新槽位 |
| `src/__tests__/simulation.test.ts` | 跨午夜日程、季节需求衰减、保暖偏差惩罚（双向：过热/过冷） |
| `src/__tests__/storyline-engine.test.ts` | `period`、`season` 剧情触发条件 |
| `src/__tests__/round-engine.test.ts` | 结算叙事 prompt 注入环境描述 |
