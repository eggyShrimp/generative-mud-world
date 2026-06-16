# Tasks: day-night-season-weather

## Preconditions

- [ ] Implement and validate `day-night-season-weather-yaml` first so the engine can read `dayNightConfig`, `seasonConfig`, and `weatherConfig` from `world.contentPool`.
- [ ] Run `rg "dayNightConfig|seasonConfig|weatherConfig" src/ --type ts | grep -v __tests__ | grep -v "\.d\.ts"` after the YAML change lands and confirm all consumers are intentional.

## Module: core/types.ts

- [ ] Extend `GameTime` with `period: DayPeriod` and `season: Season`.
- [ ] Extend `WorldState` with `weatherByRegion: Map<RegionId, WeatherState>`.
- [ ] Extend `TriggerCondition` with `period?: DayPeriod` and `season?: Season`.
- [ ] Extend `equipment` interface: add `cloak: ItemEntity | null` and `accessory: ItemEntity | null`.

## Module: core/world.ts

- [ ] Add `computeDayPeriod(hour, config)` using configured period starts, including wraparound before the first start hour.
- [ ] Add `computeSeason(month, config)` using configured `months`.
- [ ] Add `selectWeather(season, config, random)` that filters by season and uses injected randomness for weighted selection.
- [ ] Add `computeWeatherByRegion(regions, season, config, random)` that returns one weather entry per region.
- [ ] Modify `advanceDay()` after month/year rollover to set `world.time.period`, `world.time.season`, and `world.weatherByRegion`.
- [ ] Modify `advanceTime()` to refresh `world.time.period` after hour changes, without rerolling `world.weatherByRegion`.
- [ ] Update `createNPC()` and `createPlayer()` default equipment to include `cloak: null` and `accessory: null`.

## Module: combat/pulse.ts

- [ ] In hit chance calculation, multiply by the current period visibility modifier.
- [ ] In hit chance calculation, multiply by the current region weather visibility multiplier.
- [ ] Add tests for normal visibility, night visibility, and combined night + weather visibility.

## Module: simulation/index.ts

- [ ] Modify `executeSchedule()` so ranges with `startHour > endHour` match across midnight.
- [ ] Modify `decayNeeds()` to accept `world` and multiply decay by the current season definition.
- [ ] In `decayNeeds()`: compute `effectiveWarmth` from all 4 equipment slots' `properties.warmth`.
- [ ] In `decayNeeds()`: read `warmthComfortConfig` from ContentPool.
- [ ] In `decayNeeds()`: compute `idealWarmth = clamp(baselineTemp - seasonDef.comfortTemp, minIdealWarmth, maxIdealWarmth)`.
- [ ] In `decayNeeds()`: apply bidirectional penalty: `needDecayMultiplier *= 1 + |idealWarmth - effectiveWarmth| * penaltyPerWarmthPoint`.
- [ ] Update all production and test call sites for the new `decayNeeds(world, npcId, npc)` signature.

## Module: simulation/storyline-engine.ts

- [ ] Extend `matchTime()` so `period` conditions compare `world.time.period`.
- [ ] Extend `matchTime()` so `season` conditions compare `world.time.season`.

## Module: engine/command-executor.ts

- [ ] Implement the existing `checkExitConditions()` extension point for `type: "time"` and `type: "season"` conditions.
- [ ] Keep movement preflight in `checkFeasibility()` so blocked exits are rejected before movement happens.
- [ ] Remove the current "log only, still allow movement" behavior for supported time/season conditions.
- [ ] Apply weather movement multiplier inside the existing movement rest-cost calculation.
- [ ] Extend equip/unequip commands to accept `"cloak"` and `"accessory"` slot names.
- [ ] Do not add a new parallel exit-condition module.

## Module: core/round-engine.ts

- [ ] Add current period label, season label/prefix, and weather label/description to settlement prompt context.
- [ ] Ensure all wording comes from ContentPool fields.

## Module: server/ws-server.ts

- [ ] Include `cloak` and `accessory` slot names in entity equipment serialization.

## Module: core/save-manager.ts and schemas

- [ ] Extend `SaveData` with environment runtime state for `weatherByRegion`.
- [ ] Extend `SaveDataSchema` to validate serialized weather-by-region state.
- [ ] Update `SaveManager.capture(world)` to persist current weather.
- [ ] Update `SaveManager.restore(world)` to restore current weather.
- [ ] Add save-manager tests proving read-after-write preserves weather and does not reroll it.

## Module: world-yaml (companion change: `day-night-season-weather-yaml`)

- [ ] Add `comfortTemp` to `SeasonDef` in schema and YAML data.
- [ ] Add `warmthComfortConfig` to ContentPool schema and YAML data.
- [ ] Add clothing item templates to `needs-actions.yaml`:
  - `hemp_cloak` (麻布披风, cloak, warmth 5, value 低价)
  - `felt_hat` (毡帽, accessory, warmth 5, value 低价)
  - `leather_armor` (皮甲, armor, warmth 10, defBonus 3, value 中价)
  - `leather_coat` (皮袄, armor, warmth 15, value 中价)
  - `cotton_robe` (棉袍, armor, warmth 20, value 高价)
  - `fur_cloak` (毛皮斗篷, cloak, warmth 25, value 高价)

## Tests

- [ ] Add `src/__tests__/day-night-season.test.ts`.
- [ ] Add `src/__tests__/combat-visibility.test.ts`.
- [ ] Extend `src/__tests__/simulation.test.ts` for overnight schedules, seasonal need decay, and warmth bidirectional penalty.
- [ ] Extend `src/__tests__/engine.test.ts` for time and season exit conditions through `checkFeasibility()` and `executeCommand()`.
- [ ] Extend `src/__tests__/engine.test.ts` for equip/unequip with `cloak` and `accessory` slots.
- [ ] Extend `src/__tests__/storyline-engine.test.ts` for `period` and `season` triggers.
- [ ] Extend `src/__tests__/round-engine.test.ts` for environment prompt context.
- [ ] Extend `src/__tests__/save-manager.test.ts` for weather persistence.

### Warmth penalty test cases

- [ ] Winter (comfortTemp -8, idealWarmth 30) + no equipment (warmth 0) → discomfort 30, penalty ×1.45.
- [ ] Winter + fur_cloak(+25) + cotton_robe(+20) + felt_hat(+5) = warmth 50 → discomfort 20, penalty ×1.30.
- [ ] Winter + configured exact ideal warmth 30 → discomfort 0, penalty ×1.0.
- [ ] Summer (comfortTemp 32, idealWarmth 0) + cotton_robe(+20) → discomfort 20, penalty ×1.30.
- [ ] Summer + no equipment (warmth 0) → discomfort 0, penalty ×1.0.
- [ ] Spring (comfortTemp 18, idealWarmth 7) + leather_armor(+10) → discomfort 3, penalty ×1.045.

## Verification

- [ ] Run `openspec validate day-night-season-weather`.
- [ ] Run `openspec show day-night-season-weather --json --deltas-only`.
- [ ] Run `npm run lint`.
- [ ] Run `npx vitest run`.
- [ ] Run `npx depcruise src`.
- [ ] Re-run trap token checks for modified TypeScript files.
