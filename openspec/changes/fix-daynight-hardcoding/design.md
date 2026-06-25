# Design: fix-daynight-hardcoding

## Data Flow

此变更不改变数据流。仅将 `runDay` 中硬编码数值替换为 ContentPool 读取。

```
[runDay 调用] → [读取 calendar.hourStart 和 dayNightConfig] → [用读取值替代 6 和 22] → [行为不变]
```

## 具体替换

### 硬编码 `6` → `world.contentPool.calendar.hourStart`

`calendar.hourStart` 默认值为 `6`（定义在 `defaults.ts:499`）。替换后行为等价。

### 硬编码 `22` → 从 `dayNightConfig.periods` 计算

`dayNightConfig.periods` 中查找 `id === "night"` 的周期，读取其 `startHour`（当前为 `21`），加 1 得到 `22`。

```
const nightPeriod = world.contentPool.dayNightConfig.periods.find(p => p.id === "night");
const activityEndHour = (nightPeriod?.startHour ?? 21) + 1;
```

`?? 21` 是兜底：如果 `dayNightConfig` 中没有 `night` 周期（配置错误），回退到 22。注意此兜底值仍在 ContentPool 的 `night` 周期默认 startHour 范围（21），不是随机硬编码。

### 硬编码 `e.schedule ?? []` 

`NPCEntity.schedule` 的默认值在 `createNPC` 中由 `ContentPool.scheduleTemplates` 查找并赋值。若未找到匹配模板（非标准角色），`createNPC` 返回的是 `[]`。因此 `e.schedule ?? []` 是无意义的运行时兜底——要么 `createNPC` 给它赋值了数组，要么 NPC 未被正确创建。

移除 `?? []`，直接使用 `e.schedule`。类型上 `NPCEntity.schedule` 定义为 `ScheduleEntry[]`，无需兜底。

如果调用方想确保空数组安全，应在 `createNPC` 中处理，而非在消费方加运行时兜底。

## ContentPool Integration

| pool field | Read point | Purpose |
|------------|-----------|---------|
| `calendar.hourStart` | `src/index.ts runDay` | NPC 活动起始小时 |
| `dayNightConfig.periods` | `src/index.ts runDay` | 读取 night 周期 startHour 计算活动结束小时 |

无新增 ContentPool 字段。若后续需要将 `schedule ?? []` 回退迁移到 ContentPool，应由独立的 `world-yaml` change 处理。

## State Mutation Path

无变更。`runDay` 内部的状态写入路径（`executeEntityAction` → `applyDelta`）不变。

## Trap Token Verification

| File | Trap Checked | Status |
|------|-------------|--------|
| `src/index.ts` | no-hardcoded-labels | ✅ 不新增映射表 |
| `src/index.ts` | no-direct-world-mutation | ✅ 不新增写入路径 |
| `src/index.ts` | no-create-default-outside-world | ✅ 读取 world.contentPool |
| `src/index.ts` | no-hardcoded-description-text | ✅ 不新增中文字符串 |

## Test Plan

| Test File | Scenario | Assertions |
|-----------|----------|------------|
| `src/__tests__/simulation.test.ts` | NPC 每日模拟 | runDay 后 NPC 行为与替换前一致 |
| `src/__tests__/round-engine.test.ts` | day 结算 | day 结算产物不变 |

## Manual Checks

无。
