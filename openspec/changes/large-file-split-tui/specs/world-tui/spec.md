## ADDED Requirements

### Requirement: TUI game-client MUST be split by responsibility with factory shell

`src/tui/client/game-client.ts` (876 lines) MUST be split into sub-modules grouped by responsibility.
The `createGameClient` factory function MUST remain as a shell that composes the sub-modules.

#### Scenario: game-client.ts is split

- **GIVEN** `src/tui/client/game-client.ts` is 876 lines with 5 mixed responsibilities
- **WHEN** the split is implemented
- **THEN** sub-modules exist: signals.ts, transport.ts, request-pipeline.ts, dialogue-orchestrator.ts, entity-interaction.ts
- **AND** `createGameClient` assembles them and returns a `GameClient` object
- **AND** all 30+ consumer files still import without path changes
- **AND** `game-client.test.ts` and `tui-app.test.ts` pass unchanged
