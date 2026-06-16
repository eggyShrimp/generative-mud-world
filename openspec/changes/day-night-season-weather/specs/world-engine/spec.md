## ADDED Requirements

### Requirement: Engine computes daily environment state from ContentPool

The engine MUST compute the current day period, season, and per-region weather from the loaded ContentPool configuration during the existing day-advance path.

#### Scenario: Day period is computed from configured hour starts

- **GIVEN** `world.contentPool.dayNightConfig.periods` defines ordered period start hours
- **WHEN** `computeDayPeriod(hour, config)` is called
- **THEN** it returns the configured period whose start hour is the latest start not greater than `hour`
- **AND** hours before the first configured start wrap to the last period
- **TEST** `src/__tests__/day-night-season.test.ts`: period boundary and wraparound cases

#### Scenario: Season is computed from configured month groups

- **GIVEN** `world.contentPool.seasonConfig.seasons` defines month lists
- **WHEN** `computeSeason(month, config)` is called
- **THEN** it returns the configured season whose `months` includes `month`
- **TEST** `src/__tests__/day-night-season.test.ts`: all configured season mappings

#### Scenario: Weather state is populated for every region

- **GIVEN** a world has multiple regions
- **AND** `world.contentPool.weatherConfig.weatherTypes` contains weather available for the current season
- **WHEN** `advanceDay(world)` completes
- **THEN** `world.weatherByRegion` has an entry for every region
- **AND** each selected weather is available in `world.time.season`
- **TEST** `src/__tests__/day-night-season.test.ts`: every-region weather state after day advance

#### Scenario: Weather selection is deterministic in tests

- **GIVEN** `selectWeather(season, config, random)` receives an injected random source
- **WHEN** tests pass fixed random values at weight boundaries
- **THEN** the selected weather matches the weighted range
- **AND** tests do not rely on repeated random sampling thresholds
- **TEST** `src/__tests__/day-night-season.test.ts`: deterministic weighted selection

#### Scenario: Hourly time advancement refreshes period without rerolling weather

- **GIVEN** `advanceTime(world)` changes `world.time.hour`
- **WHEN** the hour crosses a configured day-period boundary
- **THEN** `world.time.period` is refreshed from `dayNightConfig`
- **AND** `world.weatherByRegion` is not rerolled unless the calendar day changes through the daily environment path
- **TEST** `src/__tests__/day-night-season.test.ts`: hourly period sync

#### Scenario: Player commands do not advance hour in the current model

- **GIVEN** a player executes a normal command through the current command path
- **WHEN** the command completes
- **THEN** `world.time.hour` is unchanged
- **AND** period changes are driven by day settlement unless a future change explicitly connects commands to `advanceTime()`
- **TEST** `src/__tests__/engine.test.ts`: normal command does not advance hour

### Requirement: Environment state affects existing engine behavior through existing paths

The engine MUST consume computed environment state through existing command, simulation, combat, and storyline paths without introducing parallel mechanisms.

#### Scenario: Combat hit chance includes visibility modifiers

- **GIVEN** an attacker is in a room whose region has weather state
- **AND** `world.time.period` has a configured visibility modifier
- **WHEN** combat hit chance is calculated
- **THEN** hit chance is multiplied by the period visibility modifier and weather visibility multiplier
- **TEST** `src/__tests__/combat-visibility.test.ts`: period and weather visibility stack

#### Scenario: Overnight NPC schedules match across midnight

- **GIVEN** an NPC schedule entry has `startHour > endHour`
- **WHEN** `executeSchedule(world, npc, currentHour)` runs at an hour after `startHour` or before `endHour`
- **THEN** the schedule entry is active
- **TEST** `src/__tests__/simulation.test.ts`: overnight schedule matching

#### Scenario: Seasonal need decay uses loaded season config

- **GIVEN** `world.time.season` matches a season with `needDecayMultiplier`
- **WHEN** `decayNeeds(world, npcId, npc)` runs
- **THEN** each need decay delta is multiplied by that season multiplier
- **TEST** `src/__tests__/simulation.test.ts`: seasonal decay multiplier

#### Scenario: Storyline time triggers support period and season

- **GIVEN** a storyline trigger condition includes `period` or `season`
- **WHEN** trigger matching runs
- **THEN** `period` compares against `world.time.period`
- **AND** `season` compares against `world.time.season`
- **TEST** `src/__tests__/storyline-engine.test.ts`: period and season conditions

### Requirement: Seasonal need decay accounts for equipped warmth

The engine MUST adjust seasonal need decay by comparing equipped item warmth against the current season's comfort target using ContentPool-owned formula parameters.

#### Scenario: Equipped warmth is summed from all equipment slots

- **GIVEN** an entity has equipment in `weapon`, `armor`, `cloak`, and `accessory` slots
- **AND** some equipped items have numeric `properties.warmth`
- **WHEN** `decayNeeds(world, npcId, npc)` runs
- **THEN** effective warmth is the sum of numeric warmth values across all equipped items
- **AND** missing or non-numeric warmth values contribute `0`
- **TEST** `src/__tests__/simulation.test.ts`: warmth sum across equipment slots

#### Scenario: Warmth formula parameters come from ContentPool

- **GIVEN** `world.contentPool.warmthComfortConfig` defines baseline temperature, ideal warmth bounds, and per-point penalty
- **WHEN** `decayNeeds(world, npcId, npc)` computes discomfort
- **THEN** the formula uses those ContentPool values
- **AND** no local hardcoded formula constants are used in the engine
- **TEST** `src/__tests__/simulation.test.ts`: configurable warmth formula parameters

#### Scenario: Cold weather without enough warmth increases decay

- **GIVEN** `world.time.season` has a low `comfortTemp`
- **AND** the entity's equipped warmth is lower than the season's ideal warmth
- **WHEN** `decayNeeds(world, npcId, npc)` runs
- **THEN** need decay is increased by the configured discomfort formula
- **TEST** `src/__tests__/simulation.test.ts`: winter no-equipment penalty

#### Scenario: Hot weather with too much warmth increases decay

- **GIVEN** `world.time.season` has a high `comfortTemp`
- **AND** the entity wears high-warmth clothing
- **WHEN** `decayNeeds(world, npcId, npc)` runs
- **THEN** need decay is increased by the same discomfort formula
- **TEST** `src/__tests__/simulation.test.ts`: summer over-warmth penalty

#### Scenario: Exact comfort match avoids extra decay

- **GIVEN** equipped warmth equals the season's ideal warmth
- **WHEN** `decayNeeds(world, npcId, npc)` runs
- **THEN** no extra discomfort penalty is added beyond the season's base need decay multiplier
- **TEST** `src/__tests__/simulation.test.ts`: exact warmth match has no extra penalty

### Requirement: Movement reuses existing feasibility and cost paths

Time, season, and weather movement behavior MUST use existing movement feasibility and rest-cost paths.

#### Scenario: Time and season exits block movement through feasibility

- **GIVEN** the current room has an exit with `time` or `season` conditions
- **WHEN** `checkFeasibility(world, playerId, "move", params)` runs
- **THEN** unsupported current period or season returns a blocker
- **AND** matching current period or season allows the move to proceed
- **TEST** `src/__tests__/engine.test.ts`: movement feasibility for time and season exits

#### Scenario: Movement command does not bypass supported exit conditions

- **GIVEN** an exit has a failing `time` or `season` condition
- **WHEN** `executeCommand(world, playerId, "move", params)` is called through the normal command path
- **THEN** the player is not moved
- **AND** no separate exit-condition module is required
- **TEST** `src/__tests__/engine.test.ts`: move command respects supported exit conditions

#### Scenario: Weather modifies movement rest cost

- **GIVEN** the player's current region has weather with `movementMultiplier`
- **WHEN** movement rest cost is calculated
- **THEN** the existing terrain and distance cost is multiplied by the weather movement multiplier
- **TEST** `src/__tests__/engine.test.ts`: weather movement cost

### Requirement: Equipment supports clothing slots for warmth

The engine MUST extend equipment handling with clothing-oriented slots used by warmth calculations.

#### Scenario: Entities initialize all equipment slots

- **GIVEN** a player or NPC is created
- **WHEN** its equipment object is initialized
- **THEN** it contains `weapon`, `armor`, `cloak`, and `accessory` slots
- **AND** missing equipment is represented as `null`
- **TEST** `src/__tests__/world.test.ts`: default equipment slots

#### Scenario: Equip uses item-declared equipment slot

- **GIVEN** an inventory item has `properties.equipmentSlot: "cloak"` or `"accessory"`
- **WHEN** the entity equips that item
- **THEN** the item is placed in the matching equipment slot
- **AND** any previous item in that slot returns to inventory
- **TEST** `src/__tests__/engine.test.ts`: equip cloak and accessory items

#### Scenario: Legacy weapon and armor inference remains compatible

- **GIVEN** an inventory item has no explicit `equipmentSlot`
- **WHEN** the entity equips that item
- **THEN** existing weapon/armor inference remains compatible for current items
- **AND** new clothing items SHOULD declare `equipmentSlot` instead of relying on inference
- **TEST** `src/__tests__/engine.test.ts`: existing weapon and armor equip behavior still works

#### Scenario: Unequip accepts all equipment slots

- **GIVEN** an entity has an item equipped in `weapon`, `armor`, `cloak`, or `accessory`
- **WHEN** `unequip` is called with that slot name
- **THEN** the item returns to inventory
- **AND** the slot becomes `null`
- **TEST** `src/__tests__/engine.test.ts`: unequip all supported slots

### Requirement: Settlement narrative receives environment context from ContentPool

Settlement narrative prompt context MUST include the current period, season, and weather text from ContentPool-backed state.

#### Scenario: Settlement prompt includes environment text

- **GIVEN** the world has current period, season, and weather state
- **WHEN** settlement prompt context is built
- **THEN** the prompt includes the configured period label
- **AND** it includes the configured season label and narrative prefix
- **AND** it includes the selected weather label and narrative description
- **TEST** `src/__tests__/round-engine.test.ts`: environment context in settlement prompt

### Requirement: Daily weather persists across saves

Generated weather MUST be saved and restored as runtime state, not regenerated on load.

#### Scenario: Save captures generated weather

- **GIVEN** `world.weatherByRegion` contains generated weather for the current day
- **WHEN** `SaveManager.capture(world)` and `save()` run
- **THEN** SaveData stores the current per-region weather
- **TEST** `src/__tests__/save-manager.test.ts`: capture includes weather

#### Scenario: Restore keeps weather stable

- **GIVEN** a save file contains per-region weather
- **WHEN** the save is loaded and restored into a world
- **THEN** `world.weatherByRegion` matches the saved weather
- **AND** loading does not reroll weather for the same day
- **TEST** `src/__tests__/save-manager.test.ts`: restore preserves weather
