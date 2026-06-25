## ADDED Requirements

### Requirement: Quality cleanup MUST be tracked as a formal OpenSpec change

The remaining P3-P4 engineering-quality work MUST live under `openspec/changes/engineering-quality-p3-p4` and MUST be validated by OpenSpec before implementation proceeds.

#### Scenario: The change validates

- **GIVEN** the engineering-quality P3-P4 change exists
- **WHEN** `openspec validate engineering-quality-p3-p4 --strict` is run
- **THEN** validation succeeds

### Requirement: Lint-blocking hardcoded Chinese fallbacks MUST be removed without new local fallback text

The engine MUST remove the current hardcoded Chinese fallback values reported by the custom Biome Grit rules by using existing ContentPool-backed mechanisms, explicit null/empty skip behavior, or a separate ContentPool schema/YAML change.

#### Scenario: Lint no longer reports hardcoded fallback values

- **GIVEN** the fallback cleanup is implemented
- **WHEN** `npm run lint` is run
- **THEN** the 10 current hardcoded Chinese fallback errors are gone
- **AND** no replacement local fallback text has been added to bypass the rule

#### Scenario: Fallback cleanup targets are stable

- **GIVEN** `plugins/no-hardcoded-fallback.grit` reports diagnostics
- **WHEN** cleanup tasks are written
- **THEN** they reference the rule name and target file
- **AND** line numbers are treated as diagnostic snapshots, not stable spec identifiers

#### Scenario: A missing ContentPool value is required

- **GIVEN** a fallback value has no existing ContentPool field and cannot be represented by null/skip behavior
- **WHEN** the implementation reaches that item
- **THEN** the item is split into a separate `world-yaml` change
- **AND** it follows the ContentPool field checklist

### Requirement: ESM tests MUST NOT use local CommonJS require

Test helpers in this module MUST use ESM imports in the `"type": "module"` project.

#### Scenario: ContentPool loader test writes YAML

- **GIVEN** `src/__tests__/content-pool-loader.test.ts` imports YAML helpers at the file top level
- **WHEN** the test writes a YAML file
- **THEN** it uses the existing ESM import
- **AND** it does not call `require("yaml")`

### Requirement: Type-only cleanup MUST remain behavior-neutral

Simulation type cleanup MUST replace inline type imports with top-level `import type` references without introducing runtime guards or new behavior.

#### Scenario: Simulation behavior is unchanged

- **GIVEN** inline type references in `src/simulation/index.ts` are replaced with top-level type imports
- **WHEN** simulation tests run
- **THEN** behavior remains unchanged
- **AND** no new runtime type guard is added solely to hide the type cleanup

### Requirement: Boundary tests MUST separate current behavior from contract changes

Boundary coverage MUST distinguish behavior that can be tested as-is from behavior that requires a contract decision first.

#### Scenario: Existing clamp behavior is tested

- **GIVEN** a need change would move a need outside `[0, 100]`
- **WHEN** the delta is applied
- **THEN** the resulting need value stays within `[0, 100]`

#### Scenario: Missing target behavior is contract-first

- **GIVEN** a delta references a missing `targetId`
- **WHEN** the team decides whether `applyDelta` remains `void` or reports structured errors
- **THEN** tests assert that chosen observable behavior
- **AND** implementation does not add an unrelated fallback path

#### Scenario: Empty name pool behavior is contract-first

- **GIVEN** a name pool has no usable names
- **WHEN** the team decides whether generation should fail, skip, or use configured data
- **THEN** tests assert that chosen behavior
- **AND** implementation does not add hardcoded name text

### Requirement: Quest registry status MUST be stated as current code facts

The engineering-quality change MUST NOT track vague quest follow-up items when the registry migration phase is already complete in current code.

#### Scenario: Old QuestObjective type enum is absent

- **GIVEN** current `QuestObjective` type definitions and ContentPool schema
- **WHEN** the engineering-quality change describes quest registry status
- **THEN** it states that `QuestObjective.condition` is the active format
- **AND** it states that the old `QuestObjective.type` enum is absent from `src/core/types.ts` and `src/core/schemas/content-pool.ts`

#### Scenario: Future quest work references exact phase criteria

- **GIVEN** a future quest registry regression is found
- **WHEN** a task is added to this change
- **THEN** it references the exact failing phase or acceptance criterion from `docs/specs/quest-evaluator-registry.md`
- **AND** it does not use a generic "confirm remaining items" task

### Requirement: Large-file splits MUST preserve behavior

Large-file decomposition MUST move one responsibility at a time and preserve the existing external behavior of the moved code.

#### Scenario: A large file responsibility is extracted

- **GIVEN** code is moved from a large source file into a focused module
- **WHEN** build and targeted tests are run
- **THEN** existing imports still work or are intentionally updated
- **AND** behavior remains unchanged except for explicitly specified cleanup

#### Scenario: Delta application extraction handles current applyDelta contract

- **GIVEN** `src/core/world.ts` delta application is extracted
- **WHEN** `applyDelta` is moved to a focused module
- **THEN** the implementation either preserves `applyDelta(world, delta): void` warning-only behavior
- **OR** first defines and tests a structured error observability contract
