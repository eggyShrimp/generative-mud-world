# Design: day-night-season-weather-yaml

## LLM-Evolvable?

Yes. These configs are world data rather than engine constants, and the LLM may evolve them for a specific world or mod. Updates must be structured and persisted; engine code must not patch around missing or malformed values.

## ContentPool Field Checklist

| Step | File | Change Description | Applies? |
|------|------|--------------------|:--:|
| 1. ContentPool interface | `src/core/types.ts` | Add `DayNightConfig`, `SeasonConfig`, `WeatherConfig`, `WarmthComfortConfig`, `WeatherState`, `DayPeriod`, `Season`, fields on `ContentPool`, and `ActionEffect.durationMinutes` | yes |
| 2. ContentPoolMutation type | `src/core/types.ts` | Add `replaceDayNightConfig`, `replaceSeasonConfig`, `replaceWeatherConfig`, `replaceWarmthComfortConfig` | yes |
| 3. Zod schema | `src/core/schemas/content-pool.ts` | Add schemas for periods, seasons, weather types, configs, and non-negative `durationMinutes` on action effects | yes |
| 4. Schema export | `src/core/schemas/index.ts` | Export new schema types if needed by tests/tools | yes |
| 5. DOMAIN_FIELDS route | `src/core/content-pool-loader.ts` | Route all four fields to `time-environment` | yes |
| 6. DOMAIN_SCHEMAS validator | `src/core/content-pool-loader.ts` | Register schema validation for the domain | yes |
| 7. LLM tool definition | `src/llm/tools/content-pool-evolve.ts` | Add replace tools for the four configs | yes |
| 8. Tool-call parser | `src/llm/tool-mutations.ts` | Parse replace tool calls into `ContentPoolMutation` | yes |
| 9. LLM prompt JSON schema | `src/llm/prompts/content-pool-evolve.ts` | Add rules for when and how to modify the configs | yes |
| 10. Materializer handler | `src/simulation/content-pool-materializer.ts` | Apply replace mutations | yes |
| 11. writeEvolveDeltas route | `src/core/content-pool-loader.ts` | Persist replace mutations under `time-environment` | yes |
| 12. Default value | `src/core/world.ts` createDefaultContentPool() | Add baseline defaults only as ContentPool defaults | yes |
| 13. YAML base data | `worlds/content-pool/time-environment.yaml` | Add base YAML values | yes |
| 14. Consumer updates | companion engine change | Consumers read from `world.contentPool` | yes |
| 15. Boundary constraints | `.dependency-cruiser.js`, `plugins/*.grit` | No new rule unless duplicate constants appear during implementation | conditional |
| 16. Chain tests | `src/__tests__/content-pool-loader.test.ts`, `src/__tests__/llm-tool-mutations.test.ts`, `src/__tests__/combat-p1.test.ts` | Cover loading, rejection, tools, mutation, materializer, write-back, reload | yes |

## Data Flow

```
worlds/content-pool/time-environment.yaml
  -> loadContentPoolFromDir()
  -> ContentPool.dayNightConfig / seasonConfig / weatherConfig / warmthComfortConfig
  -> companion engine consumers

worlds/content-pool/needs-actions.yaml
  -> loadContentPoolFromDir()
  -> ContentPool.actionEffects[].durationMinutes
  -> companion engine action-duration resolver

LLM tool call
  -> tool-mutations parser
  -> ContentPoolMutation.replaceXxxConfig
  -> applyContentPoolMutation()
  -> writeEvolveDeltas()
  -> reload keeps evolved config
```

## Schema Constraints

| Config | Required validation |
|--------|---------------------|
| `dayNightConfig` | period IDs are nonempty; `startHour` is 0-23; visibility modifier is positive |
| `seasonConfig` | months are 1-12; every season has label, narrative prefix, numeric comfort temperature, and positive need decay multiplier |
| `weatherConfig` | weight is positive; movement and visibility multipliers are positive; available seasons reference valid season IDs |
| `warmthComfortConfig` | baseline temperature, min/max ideal warmth, and penalty per point are numeric; max is not lower than min |
| `actionEffects[].durationMinutes` | optional non-negative integer minutes; when present, engine uses it as the action's configured duration |

Schema validation should reject malformed config. Engine consumers should not compensate with local fallback datasets.

## Baseline Action Durations

`durationMinutes` describes elapsed world time. It is related to, but separate from, `needDeltas.rest`: a short conversation may cost some rest without taking an hour, and meditation may restore rest while still consuming time.

Baseline values for existing `needs-actions.yaml` actions:

| Action | durationMinutes | Notes |
|--------|----------------:|-------|
| `talk` | 5 | short social exchange |
| `say` | 3 | builtin command duration; add an action effect entry only if needed by implementation |
| `order_drink` | 10 | quick tavern action |
| `count_coins` | 10 | light bookkeeping |
| `examine_goods` | 15 | inspect goods without long browsing |
| `wait` | 15 | explicit short wait |
| `draw_water` | 20 | simple physical task |
| `watch_river` | 20 | short contemplative action |
| `admire_palace` | 20 | sightseeing |
| `eat_at_home` | 25 | simple meal |
| `chant_sutras` | 25 | ritual recitation |
| `browse_stalls` | 30 | market browsing |
| `wander_bazaar` | 30 | bazaar wandering |
| `tend_mount` | 30 | mount care |
| `rest` | 30 | short recovery, not full-day rest |
| `pray` | 30 | temple prayer |
| `eat_at_tavern` | 40 | paid meal and social time |
| `meditate` | 45 | longer recovery action |
| `search_debris` | 45 | focused search |
| `prospect_minerals` | 45 | survey without extraction |
| `patrol` | 60 | local patrol loop |
| `scout_ahead` | 60 | reconnaissance |
| `gather_herbs` | 60 | resource gathering |
| `fish` | 60 | light harvesting |
| `explore_ruins` | 90 | higher-risk exploration |
| `hunt_game` | 90 | hunting outing |
| `mine_ore` | 120 | extraction work |
| `craft_goods` | 120 | production work |
| `repair_equipment` | 120 | repair work |
| `train` | 120 | training session |
| `work_at_smithy` | 120 | job block |
| `serve_lunch` | 120 | service block |
| `serve_dinner` | 120 | service block |
| `prepare_tavern` | 120 | preparation block |
| `work_at_farm` | 180 | long labor block |
| `harvest_crops` | 180 | long labor block |
| `guard_post` | 180 | guard shift |
| `move` | 15 | base minutes per distance unit before terrain/weather modifiers |

End-day actions are not normal elapsed-minute actions:

| Action | durationMinutes | Handling |
|--------|----------------:|----------|
| `end_day` | omitted | ends current day through settlement path |
| `sleep_at_inn` | omitted | `endsDay: true` |
| `rest_at_camp` | omitted | `endsDay: true` |
| `sleep_at_home` | omitted | should be converted to `endsDay: true` rather than modeled as a normal minute action |

Informational commands such as `status`, `inventory`, menu discovery, and failed commands must not receive `durationMinutes`.

## Tests Required

| Test Area | Required Coverage | Test File |
|-----------|-------------------|-----------|
| Loader | `time-environment.yaml` loads all four fields | `src/__tests__/content-pool-loader.test.ts` |
| Loader | `needs-actions.yaml` loads `actionEffects[].durationMinutes` values | `src/__tests__/content-pool-loader.test.ts` |
| Schema rejection | Invalid hour, month, or negative weight fails validation | `src/__tests__/content-pool-loader.test.ts` |
| Schema rejection | Negative or fractional `durationMinutes` fails validation | `src/__tests__/content-pool-loader.test.ts` |
| Tool exposure | ContentPool evolution tools include the four replace tools | `src/__tests__/dialogue-tools.test.ts` or existing LLM tool test |
| Tool parser | Tool calls become `ContentPoolMutation` replace fields | `src/__tests__/llm-tool-mutations.test.ts` |
| Materializer | Replace mutations update in-memory ContentPool | `src/__tests__/content-pool-loader.test.ts` |
| Write-back | Evolve YAML contains the updated configs | `src/__tests__/content-pool-loader.test.ts` |
| Reload | Written evolve YAML survives reload | `src/__tests__/content-pool-loader.test.ts` |
| Consumer | Companion engine tests prove consumers read ContentPool | `src/__tests__/day-night-season.test.ts` |
| Consumer | Companion engine tests prove action durations come from `actionEffects` | `src/__tests__/round-engine.test.ts` |
| Boundary | lint and depcruise stay green | verification commands |
