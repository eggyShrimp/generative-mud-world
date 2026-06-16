# Design: day-night-season-weather

## Data Flow

### Environment computation

```
advanceDay(world)
  -> world.time.hour/day/month/year updates through the existing calendar path
  -> computeDayPeriod(world.time.hour, world.contentPool.dayNightConfig)
  -> computeSeason(world.time.month, world.contentPool.seasonConfig)
  -> computeWeatherByRegion(world.regions, season, world.contentPool.weatherConfig, rng)
  -> world.time.period / world.time.season / world.weatherByRegion
```

`computeWeatherByRegion()` MUST return a `Map<RegionId, WeatherState>` with one entry for every region in `world.regions`. The first implementation may use one selected weather value for every region, but the Map must still be fully populated so region consumers never need local fallback weather.

The weather selector accepts an injectable random source. Production uses `Math.random`; tests pass deterministic values to verify weight boundaries without flaky sampling assertions.

Current command execution does not call `advanceTime()`, so normal player operations do not advance `world.time.hour`. The initial implementation updates `period`, `season`, and `weatherByRegion` during day settlement through `advanceDay()`. If a later change connects player actions or combat pulses to `advanceTime()`, `advanceTime()` must refresh `world.time.period` after changing `world.time.hour`; weather must still only reroll when the calendar day changes.

### Combat visibility

```
executeCombatPulse()
  -> attacker room -> regionId
  -> periodDef from world.contentPool.dayNightConfig.periods
  -> weatherState from world.weatherByRegion.get(regionId)
  -> hitChance * periodDef.visibilityModifier * weatherState.visibilityMultiplier
```

If a required period or weather value is missing, the implementation should surface the configuration error in the test path instead of silently inventing replacement data in combat code.

### Schedule and need decay

```
executeSchedule(world, npc, currentHour)
  -> normal range: startHour <= currentHour < endHour
  -> overnight range: currentHour >= startHour OR currentHour < endHour

decayNeeds(world, npcId, npc)
  -> seasonDef from world.contentPool.seasonConfig.seasons
  -> effectiveWarmth = sum of properties.warmth from all equipment slots
  -> config = world.contentPool.warmthComfortConfig
  -> idealWarmth = clamp(config.baselineTemp - seasonDef.comfortTemp, config.minIdealWarmth, config.maxIdealWarmth)
  -> discomfort = |idealWarmth - effectiveWarmth|
  -> delta = -decayRate * seasonDef.needDecayMultiplier * (1 + discomfort * config.penaltyPerWarmthPoint)
```

Changing `decayNeeds()` to receive `world` is deliberate: the season multiplier must come from the loaded ContentPool instance, not from a local default.

### Equipment expansion

```
equipment: {
  weapon: ItemEntity | null;     // existing - 唐刀等
  armor: ItemEntity | null;      // existing - 皮甲等
  cloak: ItemEntity | null;      // new - 斗篷、披风（主要保暖来源）
  accessory: ItemEntity | null;  // new - 毡帽、护符
}
```

`cloak` 和 `accessory` 不参与战斗公式（`combat/formulas.ts` 只读 `weapon`/`armor`），仅影响保暖计算。保暖值 = 四个槽位 `properties.warmth` 的 sum。

衣物在 `ItemTemplate.properties` 中定义 `warmth` 属性（与 `lightSource`、`restRecovery` 等同级），无需新增 `ItemTemplate` 接口字段。

### Clothing items (YAML companion)

| id | 名 | 槽位 | warmth | 其他属性 |
|----|-----|------|--------|---------|
| `hemp_cloak` | 麻布披风 | cloak | 5 | — |
| `felt_hat` | 毡帽 | accessory | 5 | — |
| `leather_armor` | 皮甲 | armor | 10 | defBonus +3 |
| `leather_coat` | 皮袄 | armor | 15 | — |
| `cotton_robe` | 棉袍 | armor | 20 | — |
| `fur_cloak` | 毛皮斗篷 | cloak | 25 | — |

冬季示例：毛皮斗篷(+25) 接近冬季 idealWarmth(30)，再叠加棉袍(+20) 和毡帽(+5) 会过热并产生反向惩罚。
夏季：全卸。

### Exit conditions and movement cost

```
checkFeasibility(world, entityId, "move", params)
  -> existing checkExitConditions(world, entity, params)
  -> room exit conditions
  -> time condition compares world.time.period
  -> season condition compares world.time.season

calcMoveRestCost(world, entity, direction)
  -> terrain cost * exit distance
  -> weatherState.movementMultiplier for current region
```

No new parallel exit-check module is introduced. The implementation fills the existing `checkExitConditions()` extension point so preflight checks and movement behavior stay aligned.

### Narrative context

```
settleDay()
  -> read period label from dayNightConfig
  -> read season label / narrativePrefix from seasonConfig
  -> read weather label / narrativeDesc from world.weatherByRegion
  -> append environment context to settlement prompt
```

All display wording comes from ContentPool fields owned by the companion YAML change.

## ContentPool Integration

This change consumes ContentPool fields introduced by `day-night-season-weather-yaml`.

| Field | Read Points | Notes |
|-------|-------------|-------|
| `dayNightConfig` | `world.ts`, `combat/pulse.ts`, `round-engine.ts`, `command-executor.ts` | Period IDs and labels come from ContentPool |
| `seasonConfig` | `world.ts`, `simulation/index.ts`, `round-engine.ts`, `storyline-engine.ts`, `command-executor.ts` | Season IDs, labels, and `comfortTemp` come from ContentPool |
| `weatherConfig` | `world.ts` | Weather selection source; consumers read selected state |
| `warmthComfortConfig` | `simulation/index.ts` | Warmth formula balance values come from ContentPool |
| `itemTemplates[].properties.warmth` | `simulation/index.ts` | 从装备槽位的 ItemEntity 读取保暖值 |

The engine must not create duplicate default datasets, label maps, or prompt-only copies of these values.

## State Mutation Path

| State | Write Path | Reason |
|-------|------------|--------|
| `world.time.period` | `advanceDay()` | Existing engine-owned time progression path |
| `world.time.season` | `advanceDay()` | Existing engine-owned time progression path |
| `world.weatherByRegion` | `advanceDay()` | Daily environment state is derived during the same time progression |

Command execution continues to produce `SimulationDelta` for player-visible state changes. Exit checks and movement cost calculation read environment state but do not mutate world state directly.

## Persistence

`world.weatherByRegion` is random daily runtime state, so it must be captured and restored through SaveData. Saving only `world.tick` and `world.round` is not enough: reloading must preserve the generated weather for the current day instead of rerolling it.

| File | Required change |
|------|-----------------|
| `src/core/types.ts` | Add a SaveData section for environment runtime state |
| `src/core/schemas/save-data.ts` | Validate serialized weather-by-region data |
| `src/core/save-manager.ts` | `capture(world)` stores current environment state; `restore(world)` applies it |
| `src/__tests__/save-manager.test.ts` | Save and restore keep weather unchanged |

## Trap Token Verification

| File | Trap Checked | Status |
|------|-------------|--------|
| `src/core/world.ts` | no-hardcoded-labels | OK: labels come from ContentPool |
| `src/core/world.ts` | no-create-default-outside-world | OK: no `createDefaultXxx()` in compute functions |
| `src/engine/command-executor.ts` | no-direct-world-mutation | OK: exit checks are read-only; movement still uses existing path |
| `src/combat/pulse.ts` | no-hardcoded-description-text | OK: no display text added |
| `src/core/round-engine.ts` | no-hardcoded-description-text | OK: prompt text uses ContentPool descriptions |

## Test Plan

| Test File | Scenario | Assertions |
|-----------|----------|------------|
| `src/__tests__/day-night-season.test.ts` | `computeDayPeriod` boundaries | Hours map to configured period IDs, including wrap to night before dawn |
| `src/__tests__/day-night-season.test.ts` | `computeSeason` mappings | Months map through `seasonConfig.seasons[].months` |
| `src/__tests__/day-night-season.test.ts` | deterministic weather selection | Injected random values select expected weather by weight and season filter |
| `src/__tests__/day-night-season.test.ts` | `advanceDay` integration | Time period, season, and every-region weather state are populated |
| `src/__tests__/day-night-season.test.ts` | `advanceTime` period sync | If hourly time is advanced, period is refreshed without rerolling weather |
| `src/__tests__/combat-visibility.test.ts` | combat visibility modifiers | Hit chance includes period and weather multipliers |
| `src/__tests__/simulation.test.ts` | overnight schedule | Entry with `startHour > endHour` triggers before and after midnight |
| `src/__tests__/simulation.test.ts` | seasonal need decay | Need delta is multiplied by current season config |
| `src/__tests__/simulation.test.ts` | warmth bidirectional penalty | Winter without warmth increases decay; summer with heavy clothing increases decay; exact warmth match has no extra penalty |
| `src/__tests__/engine.test.ts` | time/season exit conditions | `checkFeasibility()` blocks and allows movement based on current period/season |
| `src/__tests__/engine.test.ts` | equip/unequip new slots | `equip("cloak", item)` and `equip("accessory", item)` work correctly |
| `src/__tests__/storyline-engine.test.ts` | storyline time matching | `period` and `season` trigger conditions match world time |
| `src/__tests__/round-engine.test.ts` | settlement prompt context | Prompt contains ContentPool-provided period, season, and weather text |
| `src/__tests__/save-manager.test.ts` | weather persistence | Save/restore preserves generated daily weather |

## Manual Checks

None. The engine behavior is covered by automated tests.
