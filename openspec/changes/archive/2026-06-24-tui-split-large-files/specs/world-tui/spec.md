# Spec: tui-split-large-files

## ADDED Requirements

### Requirement: All public symbols remain importable

The refactoring is purely structural — every type, function, and component exported by `game-client.ts` and `key-layer/index.ts` must remain importable from the original paths.

#### Scenario: Existing imports compile without errors

- **GIVEN** a file that imports `{ GameClient, createGameClient, LogEntry, DialogueState }` from `./client/game-client`
- **WHEN** the refactoring is applied
- **THEN** the import resolves correctly at compile time
- **AND** `npm run lint` passes with no import-related errors

#### Scenario: Key-layer exports compile without errors

- **GIVEN** a file that imports `{ dispatchKey, pushLayer, popLayer, hasLayer, getEntityActions, DIRECTION_KEYS }` from `../key-layer`
- **WHEN** the refactoring is applied
- **THEN** the import resolves correctly at compile time

### Requirement: GameClient interface is unchanged

The `GameClient` interface is the contract between panels and the state machine. It must not change.

#### Scenario: Interface contract preserved

- **GIVEN** the `GameClient` interface definition
- **WHEN** the refactoring is applied
- **THEN** all method signatures, signal types, and property names remain identical
- **AND** all 22 consumers continue to type-check without changes

### Requirement: Component rendering output is unchanged

Components split into sub-components must produce identical terminal output.

#### Scenario: RoomPanel sub-components render identically

- **GIVEN** the same `client` and `entities` props
- **WHEN** the old inline sub-components are replaced with extracted files
- **THEN** the rendered output of `RoomPanel` is identical

#### Scenario: DialoguePanel sub-components render identically

- **GIVEN** the same `client` and `metrics` props
- **WHEN** the old inline `ChatDialoguePanel` and `TradeDialoguePanel` are extracted to separate files
- **THEN** the rendered output of `DialoguePanel` is identical

#### Scenario: Sidebar sub-components render identically

- **GIVEN** the same `client`, `width`, and `height` props
- **WHEN** the old inline character info and action bar sections are extracted to separate files
- **THEN** the rendered output of `Sidebar` is identical

### Requirement: Existing verification passes

The existing test suite must continue to pass.

#### Scenario: Lint and tests pass

- **GIVEN** the existing test suite
- **WHEN** `npm run lint` and `npm test` are executed
- **THEN** both commands pass
- **AND** dependency-cruiser reports no `tui-no-direct-engine-import` violation
