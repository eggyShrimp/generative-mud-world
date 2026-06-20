# world-yaml Specification

## Purpose
Defines ContentPool data requirements for YAML-backed world content.

## Requirements
### Requirement: ContentPool stores readable book content

ContentPool MUST define, validate, load, and persist book content for readable item templates.

#### Scenario: Load shipped book content

- **GIVEN** `worlds/content-pool/books.yaml` contains `bookContents`
- **WHEN** the ContentPool is loaded
- **THEN** each book entry is validated with required `id`, `itemTemplateId`, `title`, and non-empty `pages`
- **AND** the content is available through `world.contentPool.bookContents`

#### Scenario: Reject readable item without book content

- **GIVEN** an `itemTemplates` entry has `properties.readable === true`
- **AND** no `bookContents` entry has a matching `itemTemplateId`
- **WHEN** the ContentPool is loaded
- **THEN** loading fails with a content consistency error

### Requirement: LLM can write book content

LLM ContentPool evolution MUST provide a structured `add_book_content` tool and persist accepted book content to the book YAML domain.

#### Scenario: Parse and persist generated book content

- **GIVEN** the LLM returns an `add_book_content` tool call with `id`, `itemTemplateId`, `title`, and `pages`
- **WHEN** the tool call is parsed and materialized
- **THEN** `ContentPoolMutation.addBookContents` is populated
- **AND** the current ContentPool `bookContents` is updated
- **AND** `writeEvolveDeltas()` writes the result to `content-pool/evolve/books.yaml`

### Requirement: Time environment configs are ContentPool data

The ContentPool MUST define and load day/night, season, weather, and warmth comfort configuration through the YAML ContentPool path.

#### Scenario: Load time environment YAML

- **GIVEN** `worlds/content-pool/time-environment.yaml` contains `dayNightConfig`, `seasonConfig`, `weatherConfig`, and `warmthComfortConfig`
- **WHEN** the ContentPool is loaded
- **THEN** all four fields are validated by Zod schemas
- **AND** the values are available on `world.contentPool`
- **TEST** `src/__tests__/content-pool-loader.test.ts`: time environment YAML loads

#### Scenario: Reject malformed time environment data

- **GIVEN** the YAML contains an invalid hour, invalid month, non-positive weight, non-positive multiplier, or invalid warmth comfort bounds
- **WHEN** the ContentPool is loaded
- **THEN** loading fails with a schema validation error
- **TEST** `src/__tests__/content-pool-loader.test.ts`: malformed configs are rejected

#### Scenario: Engine does not own duplicate config data

- **GIVEN** runtime code needs period, season, or weather definitions
- **WHEN** implementation is complete
- **THEN** consumers read from `world.contentPool.dayNightConfig`, `world.contentPool.seasonConfig`, `world.contentPool.weatherConfig`, or `world.contentPool.warmthComfortConfig`
- **AND** no duplicate hardcoded mapping table or runtime fallback dataset is introduced
- **TEST** trap-token check and companion engine tests

### Requirement: Action durations are ContentPool data

The ContentPool MUST allow action effects to declare elapsed action time in minutes so the engine does not hardcode fixed per-action durations.

#### Scenario: Load action duration minutes

- **GIVEN** `worlds/content-pool/needs-actions.yaml` contains `actionEffects[].durationMinutes`
- **WHEN** the ContentPool is loaded
- **THEN** each provided duration is validated as a non-negative integer minute count
- **AND** the values are available on `world.contentPool.actionEffects`
- **TEST** `src/__tests__/content-pool-loader.test.ts`: action duration minutes load

#### Scenario: Baseline durations cover existing time-consuming actions

- **GIVEN** the baseline `needs-actions.yaml` defines existing time-consuming actions
- **WHEN** the ContentPool is loaded
- **THEN** short social actions such as `talk` use minute-scale durations
- **AND** movement uses a base duration per distance unit
- **AND** work, gathering, crafting, training, hunting, and exploration actions use longer configured durations
- **AND** the baseline does not infer duration from `needDeltas.rest`
- **TEST** `src/__tests__/content-pool-loader.test.ts`: baseline action durations match spec

#### Scenario: End-day and informational actions do not define normal duration

- **GIVEN** an action ends the day or only returns information/UI state
- **WHEN** the baseline action data is loaded
- **THEN** end-day actions are represented by `endsDay` or the explicit end-day command path
- **AND** informational commands do not define `durationMinutes`
- **TEST** `src/__tests__/content-pool-loader.test.ts`: end-day and informational actions omit normal duration

#### Scenario: Reject malformed action durations

- **GIVEN** an action effect has negative, fractional, or non-numeric `durationMinutes`
- **WHEN** the ContentPool is loaded
- **THEN** loading fails with a schema validation error
- **TEST** `src/__tests__/content-pool-loader.test.ts`: malformed action duration is rejected

#### Scenario: Engine does not own duplicate action duration tables

- **GIVEN** runtime code needs to know how long an action takes
- **WHEN** implementation is complete
- **THEN** normal action durations are read from `world.contentPool.actionEffects[].durationMinutes`
- **AND** movement duration derives from the configured move duration plus exit distance, terrain speed, and weather movement multiplier
- **AND** no hardcoded action-duration mapping table is introduced in engine code
- **TEST** trap-token check and companion engine tests

### Requirement: Time environment configs are LLM-evolvable

The LLM MUST update these configs through structured ContentPool mutations and persisted evolve YAML.

#### Scenario: Parse replacement tool calls

- **GIVEN** the LLM calls a `replace_day_night_config`, `replace_season_config`, `replace_weather_config`, or `replace_warmth_comfort_config` tool
- **WHEN** tool calls are converted to `ContentPoolMutation`
- **THEN** the mutation contains the matching `replaceDayNightConfig`, `replaceSeasonConfig`, `replaceWeatherConfig`, or `replaceWarmthComfortConfig` field
- **AND** invalid tool arguments are rejected
- **TEST** `src/__tests__/llm-tool-mutations.test.ts`: time environment tool parsing

#### Scenario: Materialize and persist replacement configs

- **GIVEN** a `ContentPoolMutation` contains a replacement time environment config
- **WHEN** the mutation is materialized and evolve deltas are written
- **THEN** the in-memory ContentPool is updated
- **AND** `evolve/time-environment.yaml` stores the replacement
- **AND** a later reload preserves the replacement
- **TEST** `src/__tests__/content-pool-loader.test.ts`: materialize, write-back, and reload
