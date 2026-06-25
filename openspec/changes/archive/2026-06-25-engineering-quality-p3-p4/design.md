# Design: engineering-quality-p3-p4

## Data Flow

This change is a set of quality repairs rather than one new player feature.

```
current quality issue
  -> classify as cleanup / test gap / behavior contract
  -> fix through existing mechanism
  -> verify build, lint, tests, dependency boundaries
```

The central rule is that missing data must not be hidden by new local fallback text. A cleanup either uses an existing ContentPool value, returns null/empty so the caller can skip output, or is split into a separate ContentPool schema/YAML change.

## Scope Boundaries

In scope:

- ESM/CJS cleanup in tests.
- Type-only import cleanup in simulation.
- Removing the 10 current hardcoded Chinese fallback lint violations.
- Adding boundary tests for current behavior.
- Making behavior changes only when the contract is explicit in this change.
- Recording concrete remaining QuestObjective registry work from `docs/specs/quest-evaluator-registry.md`.
- Planning large-file splits as behavior-preserving refactors.

Out of scope:

- Re-migrating quest utility functions from `engine/quest-tracker` to `core/quest-utils`; this is already done.
- Adding new ContentPool fields inside this `world-engine` change.
- TUI layout or protocol changes.
- Broad rewrites that are not needed to remove the listed quality issues.

## ContentPool Integration

No new ContentPool fields are introduced here.

For each hardcoded fallback:

1. Check whether an existing ContentPool field already represents the value.
2. If yes, read from `world.contentPool.xxx` through the relevant existing path.
3. If no, prefer returning null/empty and skipping the line at assembly time.
4. If neither works without losing behavior, split that item into a separate `world-yaml` change.

## State Mutation Path

Most items are behavior-neutral cleanup.

If an item changes world state or error observability:

```
command / simulation result
  -> SimulationDelta
  -> existing applyDelta path
  -> observable result / warning / test assertion
```

Do not add a parallel write path for relations, inventory, quests, needs, known rooms, traits, or combat state.

## Boundary Test Strategy

### Direct test additions

These can be tested without changing the public contract first:

| Scenario | Expected handling |
|----------|-------------------|
| Need value beyond `[0, 100]` | Existing apply path clamps to legal range |
| Invalid YAML file | Current loader behavior is asserted for test and non-test modes |
| Empty ContentPool YAML arrays | Test documents whether empty array overrides or is rejected |
| `combatState.maxHp === 0` | No invalid numeric result is produced |

### Contract-first items

These need a written contract before implementation:

| Scenario | Contract question |
|----------|-------------------|
| `applyDelta` missing `targetId` | Should `applyDelta` remain `void` with warnings, or return/report structured errors? |
| Empty `NamePool` | Should generation fail, skip, or use configured ContentPool naming text? |

## Quest Registry Status

Use `docs/specs/quest-evaluator-registry.md` as the source of truth for quest registry scope. Current code state:

| Phase | Status | Evidence |
|-------|--------|----------|
| Phase 1: registry and objective data format migration | Complete | `QuestObjective` has `condition: QuestObjectiveCondition`; content schema validates `condition` through `validateQuestObjectiveCondition()`; `QuestObjective.type` old enum is not present in `src/core/types.ts` or `src/core/schemas/content-pool.ts` |
| Phase 2: task event input replaces command parameters | Complete | `evaluateQuestImpacts(world, actorId, delta)` reads `questObjectiveEvents`; command/dialogue paths produce task objective events |
| Phase 3: core query API and cross-layer dependency fix | Complete | `checkPrerequisites()`, `collectSubQuestIds()`, `resolveQuestAccept()`, and `getQuestInteractionsForEntity()` live in `src/core/quest-utils.ts`; `llm/` and `simulation/` import core instead of `engine/quest-tracker` |
| Phase 4: intermediate quest NPC dialogue entry | Complete enough for current scope | `getQuestInteractionsForEntity()` and `quest_talk_menu` are implemented and covered by dialogue/quest tests; remaining work belongs to `quest-evaluator-registry.md` only if new failing evidence appears |
| Phase 5: LLM quest generation uses new format | Complete enough for current scope | `src/llm/tools/content-pool-evolve.ts` and `src/llm/prompts/content-pool-evolve.ts` derive objective condition types from `listQuestObjectiveDefinitions()` |

Therefore this change MUST NOT contain a vague "confirm quest remaining items" task. If a future check finds a concrete regression against one of the phase acceptance criteria above, add that exact failing criterion as a task.

## Large File Refactor Strategy

Large files are split only after lint-critical cleanup and boundary tests.

Each file split must:

- Move one responsibility at a time.
- Preserve the old public import surface where practical.
- Avoid changing behavior while moving code.
- Run build and targeted tests before moving to the next file.

Initial split targets:

| Source file | First extraction target |
|-------------|-------------------------|
| `src/core/world.ts` | delta application, time helpers, discovery helpers. Note: `applyDelta()` currently returns `void`; before extracting `delta-application.ts`, decide whether missing-target/error observability remains warning-only or becomes a structured return/reporting contract |
| `src/engine/command-executor.ts` | command category handlers |
| `src/llm/dialogue-generator.ts` | menu generation, quest dialogue, trade dialogue, idle chat |
| `src/server/ws-server.ts` | session management, state push, minimap |
| `src/tui/client/game-client.ts` | WebSocket transport, state handlers |
| `src/core/types.ts` | entity, quest, delta, ContentPool type groups |

## Trap Token Verification

| File group | Trap Checked | Status |
|------------|--------------|--------|
| fallback cleanup files | `plugins/no-hardcoded-fallback.grit` | Must remove current 10 violations; target files are stable, line numbers are diagnostic snapshots only |
| fallback cleanup files | no-hardcoded-description-text | Re-check because related hardcoded Chinese text can still appear outside `??` / `||` fallback syntax |
| fallback cleanup files | no-hardcoded-labels | No new local maps |
| state behavior files | no-direct-world-mutation | Use existing delta path |
| all touched files | no-create-default-outside-world | No runtime default construction |
| all touched files | no-empty-catch | No swallowed errors |

## Test Plan

| Test File | Scenario | Assertions |
|-----------|----------|------------|
| `src/__tests__/content-pool-loader.test.ts` | ESM helper cleanup | Tests still write YAML using ESM import |
| `src/__tests__/content-pool-loader.test.ts` | invalid YAML | Loader behavior is explicit and stable |
| `src/__tests__/content-pool-loader.test.ts` | empty arrays | Empty array behavior is explicit |
| `src/__tests__/simulation.test.ts` | type import cleanup | Existing simulation behavior is unchanged |
| `src/__tests__/world.test.ts` | need clamp | Values stay within `[0, 100]` |
| `src/__tests__/world.test.ts` | missing target contract if changed | Observable result matches chosen contract |
| `src/__tests__/combat-*.test.ts` | `maxHp === 0` | No invalid numeric result |
| `src/__tests__/name-generator.test.ts` | empty name pool | Behavior matches chosen contract |

## Manual Checks

No manual game-flow check is required for the initial cleanup items. If later large-file splits touch server or TUI runtime wiring, add a targeted manual launch check to that implementation step.
