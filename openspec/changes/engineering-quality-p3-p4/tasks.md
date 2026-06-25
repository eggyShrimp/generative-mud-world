# Tasks: engineering-quality-p3-p4

## Module: `src/__tests__/content-pool-loader.test.ts`

- [x] Replace local `require("yaml")` with the existing ESM `stringifyYaml` import.
- [x] Add or adjust coverage for invalid YAML behavior.
- [x] Add or adjust coverage for empty-array YAML behavior.

## Module: `src/simulation/index.ts`

- [x] Replace inline `import("../core/types.ts").NeedType` with top-level `NeedType`.
- [x] Replace inline `import("../core/types.ts").NPCEntity` with top-level `NPCEntity`.
- [x] Add top-level `PlayerEntity` type import and use it instead of inline import.

## Module: hardcoded fallback cleanup

- [x] Fix `src/core/round-engine.ts`: remove `plugins/no-hardcoded-fallback.grit` / hardcoded fallback diagnostics through existing parsing/config behavior.
- [x] Fix `src/core/world.ts`: remove `plugins/no-hardcoded-fallback.grit` / hardcoded fallback diagnostics for month formatting.
- [x] Fix `src/engine/command-executor.ts`: remove `plugins/no-hardcoded-fallback.grit` / hardcoded fallback diagnostics for target selection.
- [x] Fix `src/llm/dialogue-generator.ts`: remove `plugins/no-hardcoded-fallback.grit` / hardcoded fallback diagnostics in context assembly.
- [x] Fix `src/llm/plan-parser.ts`: remove `plugins/no-hardcoded-fallback.grit` / hardcoded fallback diagnostics for room context.
- [x] Fix `src/llm/prompts/dialogue.ts`: remove `plugins/no-hardcoded-fallback.grit` / hardcoded fallback diagnostics for empty lists.
- [x] Fix `src/llm/room-generator.ts`: remove `plugins/no-hardcoded-fallback.grit` / hardcoded fallback diagnostics for reverse direction.
- [x] Fix `src/simulation/materializer.ts`: remove `plugins/no-hardcoded-fallback.grit` / hardcoded fallback diagnostics for materialized faction fields.
- [x] Fix `src/simulation/name-generator.ts`: replace `plugins/no-hardcoded-fallback.grit` / hardcoded name fallback with explicit contract behavior.
- [x] Fix `src/simulation/social-ripple.ts`: remove `plugins/no-hardcoded-fallback.grit` / hardcoded fallback diagnostics for target display context.
- [x] Re-run `npm run lint` and treat line numbers as diagnostic output only; do not copy them into the spec as stable identifiers.

## Module: quest registry status

- [x] Do not add "confirm QuestObjective.type" as an implementation task: current code already uses `QuestObjective.condition`, and old `QuestObjective.type` enum is absent from `src/core/types.ts` and `src/core/schemas/content-pool.ts`.
- [x] If quest registry work is reopened, copy the exact failing acceptance criterion from `docs/specs/quest-evaluator-registry.md` phase 1-5 instead of adding a vague "confirm" task.

## Module: boundary contracts and tests

- [x] Add/update `src/__tests__/world.test.ts`: verify `NeedChange` clamp behavior.
- [x] Decide and document `applyDelta` missing-target observability before changing implementation.
- [x] If `applyDelta` behavior changes, add/update `src/__tests__/world.test.ts` to assert the new observable behavior.
- [x] Add/update combat tests for `combatState.maxHp === 0`.
- [x] Decide and document empty `NamePool` behavior before changing implementation.
- [x] Add/update `src/__tests__/name-generator.test.ts` for empty `NamePool` behavior.

## Module: large file split planning

- [x] Before splitting `src/core/world.ts`, decide whether extracted delta application keeps `applyDelta(world, delta): void` warning-only behavior or introduces structured error observability.
- [x] Record that large-file splits are follow-up refactors, not part of the lint/boundary-fix implementation batch.
- [x] Record `src/core/world.ts` split order and the chosen `applyDelta` contract.
- [x] Record `src/engine/command-executor.ts` split dependency on command behavior tests.
- [x] Record `src/llm/dialogue-generator.ts` split dependency on fallback cleanup.
- [x] Record `src/server/ws-server.ts` split dependency on server tests.
- [x] Record `src/tui/client/game-client.ts` split dependency on client state tests.
- [x] Record `src/core/types.ts` split dependency on import/export compatibility.

## Tests

- [x] Add/update `src/__tests__/content-pool-loader.test.ts`: invalid YAML and empty-array behavior.
- [x] Add/update `src/__tests__/world.test.ts`: need clamp and any changed `applyDelta` observability.
- [x] Add/update `src/__tests__/combat-*.test.ts`: `maxHp === 0`.
- [x] Add/update `src/__tests__/name-generator.test.ts`: empty pool behavior.
- [x] Run existing targeted tests after type-only cleanup: `npx vitest run src/__tests__/simulation.test.ts`.

## Manual Checks

- [x] No manual check for initial cleanup. Add one only if later server/TUI split touches runtime wiring.

## Verification

- [x] Run `npm run lint` (biome check + tsc --noEmit)
- [x] Run `npx vitest run`
- [x] Run `npx depcruise src --config .dependency-cruiser.js` — confirm no boundary violations
- [x] Trap token re-check: no new hardcoded labels, no direct world mutation, no runtime `createDefaultXxx`, no swallowed catch
