# Proposal: engineering-quality-p3-p4

## Why

P0-P2 quality work has left a smaller set of P3-P4 issues that still block clean maintenance:

- `npm run lint` fails on 10 hardcoded Chinese fallback values caught by the custom Biome Grit rules.
- One ESM test file still uses `require("yaml")` even though the project is `"type": "module"` and the same file already imports YAML helpers.
- `simulation/index.ts` still uses inline type references even though the file already has top-level `import type` declarations.
- Quest registry migration is partially complete; the remaining engineering-quality scope must describe current code state, not re-open completed migration phases.
- Several edge behaviors are either untested or mix "test gap" with "behavior contract change".
- Large files still concentrate unrelated responsibilities, making later feature work harder to review.

This change tracks the remaining quality work as a formal OpenSpec change instead of a free-form docs note.

## Change Type

**engine-logic** — Core/engine/simulation/llm testability and maintainability work.

refactor

## What Changes

- Remove ESM/CJS mixing in `src/__tests__/content-pool-loader.test.ts`.
- Clean type-only inline imports in `src/simulation/index.ts`.
- Remove the 10 hardcoded Chinese fallback values by routing through existing mechanisms or explicit null/skip behavior.
- Add missing boundary tests for existing behavior before changing behavior.
- Separate behavior-contract changes from pure test additions:
  - `applyDelta` missing target observability
  - empty `NamePool` behavior
- Record current QuestObjective registry status and only track concrete unfinished items.
- Track large-file decomposition as staged refactors with verification after each split.
- Keep the already-completed quest utility migration out of the implementation scope.

## Modules Touched

| File | Change Type | Description |
|------|-------------|-------------|
| `src/__tests__/content-pool-loader.test.ts` | modify-test-helper | Replace local `require("yaml")` with existing ESM import |
| `src/simulation/index.ts` | refactor-types | Replace inline type imports with top-level `import type` references |
| `src/core/round-engine.ts` | modify-parser | Remove hardcoded generic NPC name fallback matching |
| `src/core/world.ts` | modify-formatting / tests / possible-contract | Remove hardcoded month fallback, add delta boundary coverage, and decide whether `applyDelta()` remains `void` before extracting delta application |
| `src/engine/command-executor.ts` | modify-command | Remove hardcoded room target fallback |
| `src/llm/dialogue-generator.ts` | modify-context | Remove hardcoded empty context text in prompt assembly |
| `src/llm/plan-parser.ts` | modify-context | Remove hardcoded unknown room fallback |
| `src/llm/prompts/dialogue.ts` | modify-context | Remove hardcoded empty list prompt fallbacks |
| `src/llm/room-generator.ts` | modify-generation | Remove hardcoded reverse direction fallback |
| `src/simulation/materializer.ts` | modify-materialization | Remove hardcoded faction economic fallback |
| `src/simulation/name-generator.ts` | modify-naming | Replace hardcoded empty name fallback with explicit behavior |
| `src/simulation/social-ripple.ts` | modify-context | Remove hardcoded unnamed target fallback |
| `src/combat/*` | add-tests / possible guard | Cover `maxHp === 0` behavior without inventing fallback numbers |
| `src/core/content-pool-loader.ts` | add-tests | Cover invalid YAML and empty-array behavior |
| `docs/specs/quest-evaluator-registry.md` | reference-status | Use its phase list as the source for remaining quest registry work |

## ContentPool Reads

No new ContentPool fields are planned in this change.

If any hardcoded fallback cannot be removed using existing ContentPool fields or null/skip behavior, that item MUST be split into a separate `world-yaml` change and follow `docs/dev-guide/add-contentpool-field.md`.

| pool.xxx field | Used in (file) | Purpose |
|----------------|----------------|---------|
| existing fields only | hardcoded fallback cleanup files | Replace existing fallback text when a matching field already exists |

## Trap Token Self-Check

| Trap | Applies? | How Addressed |
|------|:--:|---------------|
| no-hardcoded-labels (new Record<string,string>) | yes | Do not add new local label maps; use existing ContentPool fields or explicit null/skip behavior |
| no-direct-world-mutation (push/assign to state) | yes | Boundary fixes that change state must still use existing delta/applyDelta paths |
| no-create-default-outside-world | yes | No cleanup may call `createDefaultXxx()` to fetch fallback data at runtime |
| no-hardcoded-description-text (Chinese in engine/combat) | yes | The 10 current lint failures are the first cleanup target |
| no-empty-catch | no | No catch changes are planned; any new catch must report or propagate failure |

## Impact

- `npm run lint` should pass once the 10 fallback violations are removed.
- Existing quest utility core migration remains complete and is not reimplemented here.
- Boundary behavior changes are not bundled silently with tests; tests first document the current behavior, then behavior changes are made only after their contract is explicit.
- Large-file splits must preserve public imports and runtime behavior.

## Test Impact

| Test File | Coverage |
|-----------|----------|
| `src/__tests__/content-pool-loader.test.ts` | ESM helper cleanup, invalid YAML, empty-array behavior |
| `src/__tests__/simulation.test.ts` | Type cleanup should be behavior-neutral |
| `src/__tests__/world.test.ts` | Need clamp and possible `applyDelta` missing-target observability |
| `src/__tests__/combat-*.test.ts` | `maxHp === 0` behavior |
| `src/__tests__/name-generator.test.ts` | Empty name pool behavior |
