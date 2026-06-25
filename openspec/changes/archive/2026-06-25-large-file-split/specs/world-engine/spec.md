## ADDED Requirements

### Requirement: Large files MUST be split by responsibility with shell re-export

Each engine source file exceeding 1000 lines MUST be split into sub-modules grouped by responsibility.
The original file MUST remain as a shell that re-exports all public APIs so consumers do not need to change.

#### Scenario: world.ts is split

- **GIVEN** `src/core/world.ts` is 1765 lines with mixed responsibilities
- **WHEN** the split is implemented
- **THEN** sub-modules exist under `src/core/world/` (defaults.ts, entity-ops.ts, room-region.ts, event-log.ts, time-weather.ts, delta-application.ts, factories.ts)
- **AND** `src/core/world.ts` re-exports all original public exports
- **AND** `import { getEntity } from "../core/world.ts"` still works for all consumers

#### Scenario: command-executor.ts is split

- **GIVEN** `src/engine/command-executor.ts` is 1685 lines with 20 commands in a single switch
- **WHEN** the split is implemented
- **THEN** command implementation files exist under `src/engine/commands/`
- **AND** `src/engine/command-executor.ts` contains `executeCommand` with a forwarding switch
- **AND** all 20 command behavior tests pass unchanged

#### Scenario: dialogue-generator.ts is split

- **GIVEN** `src/llm/dialogue-generator.ts` is 2359 lines with ~40 private methods in a single class
- **WHEN** the split is implemented
- **THEN** private method bodies are extracted to free functions under `src/llm/dialogue/`
- **AND** the `DialogueGenerator` class shell retains its 6 public method signatures
- **AND** all dialogue tests pass unchanged

#### Scenario: ws-server.ts is split

- **GIVEN** `src/server/ws-server.ts` is 1085 lines
- **WHEN** the split is implemented
- **THEN** helper modules exist under `src/server/ws/`
- **AND** the `GameServer` class retains its public API
- **AND** all WS tests pass unchanged

#### Scenario: types.ts is split

- **GIVEN** `src/core/types.ts` is 1040 lines with ~95 type definitions
- **WHEN** the split is implemented
- **THEN** type files exist under `src/core/types/` grouped by domain
- **AND** `src/core/types/index.ts` re-exports all types
- **AND** `tsc --noEmit` reports zero errors
- **AND** no consumer import paths change

### Requirement: Split extraction order MUST follow dependency hierarchy

Shared utility functions that are imported by multiple sub-modules MUST be extracted first.
No extraction step MAY introduce circular dependencies between new sub-modules.

#### Scenario: command helpers extracted first

- **GIVEN** `src/engine/command-executor.ts` is being split
- **WHEN** extraction begins
- **THEN** `commands/helpers.ts` is created first (buildDelta, resolveActionEffect, fail, etc.)
- **AND** all subsequent execute* extractions import from helpers.ts without circular dependencies

#### Scenario: dialogue context builders extracted early

- **GIVEN** `src/llm/dialogue-generator.ts` is being split
- **WHEN** extraction begins
- **THEN** `dialogue/helpers.ts` and `dialogue/context-builders.ts` are created first
- **AND** subsequent sub-modules import from these without circular dependencies

### Requirement: Verification MUST run after each file split

Every individual file split MUST run full build, lint, depcruise, and test verification before proceeding.

#### Scenario: Verification after each split step

- **GIVEN** a sub-module has been extracted from a large file
- **WHEN** the shell file has been updated to import and re-export
- **THEN** `npm test` passes
- **AND** `npm run build -- --noEmit` passes
- **AND** `npx depcruise src` reports zero violations
