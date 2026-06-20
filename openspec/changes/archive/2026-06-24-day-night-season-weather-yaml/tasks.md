# Tasks: day-night-season-weather-yaml

## Module: core/types.ts

- [x] Add `DayPeriod` and `Season` type aliases.
- [x] Add `DayNightPeriodDef`, `DayNightConfig`, `SeasonDef`, `SeasonConfig`, `WeatherType`, `WeatherConfig`, `WarmthComfortConfig`, and `WeatherState`.
- [x] Extend `ContentPool` with `dayNightConfig`, `seasonConfig`, `weatherConfig`, and `warmthComfortConfig`.
- [x] Extend `ContentPoolMutation` with `replaceDayNightConfig`, `replaceSeasonConfig`, `replaceWeatherConfig`, and `replaceWarmthComfortConfig`.
- [x] Extend `ActionEffect` with optional `durationMinutes`.

## Module: core/schemas/content-pool.ts

- [x] Add Zod schemas for the new config types.
- [x] Register all four configs in content-pool schemas.
- [x] Validate hour, month, comfort temperature, weight, and multiplier bounds.
- [x] Validate `actionEffects[].durationMinutes` as a non-negative integer when present.

## Module: core/schemas/index.ts

- [x] Export new schemas or inferred types used by tests and tools.

## Module: core/content-pool-loader.ts

- [x] Add `dayNightConfig`, `seasonConfig`, `weatherConfig`, and `warmthComfortConfig` to `DOMAIN_FIELDS` under `time-environment`.
- [x] Add a domain schema for `time-environment`.
- [x] Add write-back routing for the four replace mutations.

## Module: core/world.ts

- [x] Add baseline defaults for the four configs in `createDefaultContentPool()`.
- [x] Keep defaults as ContentPool baseline data only; do not create runtime fallback datasets in engine consumers.

## Module: worlds/content-pool/

- [x] Add `worlds/content-pool/time-environment.yaml`.
- [x] Include baseline day periods with labels and visibility modifiers.
- [x] Include baseline seasons with labels, month mappings, need decay multipliers, comfort temperatures, and narrative prefixes.
- [x] Include baseline weather types with labels, season availability, weights, movement multipliers, visibility multipliers, and narrative descriptions.
- [x] Include baseline warmth comfort formula parameters.
- [x] Add `durationMinutes` to baseline `actionEffects` using the baseline table in `design.md`.
- [x] Convert `sleep_at_home` to end-day handling instead of assigning it a normal minute duration.
- [x] Keep informational commands out of time-consuming action duration data.

## Module: llm/tools/content-pool-evolve.ts

- [x] Add `replace_day_night_config` tool.
- [x] Add `replace_season_config` tool.
- [x] Add `replace_weather_config` tool.
- [x] Add `replace_warmth_comfort_config` tool.

## Module: llm/tool-mutations.ts

- [x] Parse the four replace tool calls into `ContentPoolMutation`.
- [x] Validate parsed arguments through the same schema shape used by the loader.

## Module: llm/prompts/content-pool-evolve.ts

- [x] Add rules explaining when the LLM may adjust day/night, season, and weather config.
- [x] Explicitly require preserving valid hour/month/weight ranges.

## Module: simulation/content-pool-materializer.ts

- [x] Apply `replaceDayNightConfig`.
- [x] Apply `replaceSeasonConfig`.
- [x] Apply `replaceWeatherConfig`.
- [x] Apply `replaceWarmthComfortConfig`.

## Tests

- [x] Extend `src/__tests__/content-pool-loader.test.ts` for YAML load and schema rejection.
- [x] Extend `src/__tests__/content-pool-loader.test.ts` for action duration load, malformed duration rejection, and baseline duration values.
- [x] Extend `src/__tests__/llm-tool-mutations.test.ts` for the four tool-call parsers.
- [x] Extend materializer/write-back/reload tests for the four replace mutations.

## Verification

- [x] Run `openspec validate day-night-season-weather-yaml`.
- [x] Run `openspec show day-night-season-weather-yaml --json --deltas-only`.
- [x] Run `npm run lint`.
- [x] Run `npx vitest run`.
