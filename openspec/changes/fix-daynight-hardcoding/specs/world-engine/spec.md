## ADDED Requirements

### Requirement: runDay MUST read NPC activity hours from ContentPool

The `runDay` function in `src/index.ts` MUST use `world.contentPool.calendar.hourStart` for the activity start hour and compute the end hour from `world.contentPool.dayNightConfig.periods` (the `night` period's `startHour + 1`) instead of hardcoded literals `6` and `22`.

#### Scenario: Activity hours from ContentPool

- **GIVEN** the default ContentPool has `calendar.hourStart = 6` and `dayNightConfig` has `night` period at `startHour = 21`
- **WHEN** `runDay` iterates NPC schedules
- **THEN** the loop runs from hour 6 through hour 22 (inclusive)
- **AND** no hardcoded numeric literal appears in the loop bounds

#### Scenario: Custom day/night config

- **GIVEN** a mod content pool with `calendar.hourStart = 5` and `night` period at `startHour = 23`
- **WHEN** `runDay` iterates NPC schedules
- **THEN** the loop runs from hour 5 through hour 24 (inclusive)
- **AND** mod authors can control NPC activity hours without engine code changes

### Requirement: runDay MUST not use runtime fallback for NPC schedule

The `runDay` function MUST use `e.schedule` directly without the `?? []` fallback, since `NPCEntity.schedule` is initialized by `createNPC` from `ContentPool.scheduleTemplates`.

#### Scenario: NPC schedule exists

- **GIVEN** an NPC entity created by `createNPC` with a matching schedule template
- **WHEN** `runDay` processes the NPC
- **THEN** `e.schedule` is a non-empty `ScheduleEntry[]`
- **AND** the engine does not fall back to `[]` at runtime

#### Scenario: NPC schedule is empty

- **GIVEN** an NPC entity created by `createNPC` without a matching template
- **WHEN** `runDay` processes the NPC
- **THEN** `e.schedule` is `[]` (set by `createNPC`)
- **AND** the engine still does not need `?? []` fallback
