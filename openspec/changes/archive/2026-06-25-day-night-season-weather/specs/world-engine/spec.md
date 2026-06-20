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

#### Scenario: Action-level time advancement refreshes period without rerolling weather

- **GIVEN** `advanceTime(world, durationMinutes)` changes `world.time.minute` and `world.time.hour`
- **WHEN** the resulting time crosses a configured day-period boundary
- **THEN** `world.time.period` is refreshed from `dayNightConfig`
- **AND** `world.weatherByRegion` is not rerolled unless the calendar day changes through the daily environment path
- **TEST** `src/__tests__/day-night-season.test.ts`: action-level period sync

#### Scenario: Successful time-consuming player actions advance by configured duration

- **GIVEN** a player executes a successful time-consuming action through the structured command path
- **AND** the action has a configured or rule-calculated duration in minutes
- **WHEN** the command completes
- **THEN** `advanceTime(world, durationMinutes)` is called once by the command orchestration layer
- **AND** `world.time.minute` and `world.time.hour` advance by the calculated duration
- **AND** `world.time.period` is recomputed from `dayNightConfig`
- **AND** `world.weatherByRegion` is not rerolled
- **TEST** `src/__tests__/round-engine.test.ts`: successful action advances by configured minutes and refreshes period

#### Scenario: Short actions do not consume a fixed hour

- **GIVEN** `actionEffects` configures a short social action such as `say` or `talk` with a small `durationMinutes`
- **WHEN** the player executes that action successfully
- **THEN** time advances by that configured number of minutes
- **AND** it does not force `world.time.hour` to increase when the minute total stays within the same hour
- **TEST** `src/__tests__/round-engine.test.ts`: short action advances minutes without fixed-hour jump

#### Scenario: Move duration uses distance, terrain, and weather

- **GIVEN** the player moves through an exit with `distance`
- **AND** the terrain has a `speedMod`
- **AND** the current region has weather with `movementMultiplier`
- **WHEN** move duration is calculated
- **THEN** the duration is based on `actionEffects["move"].durationMinutes`, exit distance, terrain speed, and weather movement multiplier
- **AND** no hardcoded per-direction or per-terrain duration table is introduced
- **TEST** `src/__tests__/round-engine.test.ts`: move duration responds to distance, terrain, and weather

#### Scenario: Duration is not inferred from rest changes

- **GIVEN** an action has `needDeltas.rest`
- **AND** the same action has `durationMinutes`
- **WHEN** action duration is resolved
- **THEN** elapsed time uses `durationMinutes` and movement rules
- **AND** it does not derive minutes from the rest delta
- **TEST** `src/__tests__/round-engine.test.ts`: rest delta does not control elapsed duration

#### Scenario: Non-time-consuming command outcomes do not advance time

- **GIVEN** a player command fails, returns only information, opens a menu, or ends the day
- **WHEN** the command completes
- **THEN** `world.time.minute` and `world.time.hour` are unchanged
- **AND** `end_day` continues to mark the player ended for the existing day-settlement path
- **TEST** `src/__tests__/round-engine.test.ts`: failed, informational, menu, and end-day commands do not advance time

#### Scenario: Action crossing midnight ends the player day without double date advancement

- **GIVEN** `world.time.hour` and `world.time.minute` are near midnight
- **WHEN** a successful time-consuming player action advances past midnight
- **THEN** `world.time.hour` wraps to the next day according to `advanceTime(world, durationMinutes)`
- **AND** the acting player is marked ended for the current day
- **AND** subsequent day settlement does not call `advanceDay(world)` in a way that advances the calendar date a second time
- **TEST** `src/__tests__/round-engine.test.ts`: midnight action ends day and settlement avoids double advance

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
