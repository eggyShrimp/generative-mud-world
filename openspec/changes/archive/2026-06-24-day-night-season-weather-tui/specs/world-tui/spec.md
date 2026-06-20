## ADDED Requirements

### Requirement: Status message carries time environment labels

The server MUST send current period, season, and weather labels in the existing status message so the TUI can render environment state without importing engine modules.

#### Scenario: Status includes environment labels

- **GIVEN** the world has current period, season, and weather state
- **AND** ContentPool contains matching labels
- **WHEN** the server sends a `status` message
- **THEN** the message includes `period`, `season`, and `weatherLabel`
- **TEST** `src/__tests__/ws-server.test.ts`: status message includes environment labels

#### Scenario: TUI does not import engine modules

- **GIVEN** the TUI renders status information
- **WHEN** environment labels are displayed
- **THEN** TUI components read only `StatusMessage` fields
- **AND** they do not import from engine, combat, simulation, llm, or core modules
- **TEST** `npx depcruise src`: boundary rules stay green

### Requirement: Visible status area displays environment labels without hiding existing status

The TUI visible status area MUST show season and weather while preserving existing status information (date, connection state).

#### Scenario: Wide status area renders environment labels

- **GIVEN** the TUI is rendered at a wide terminal width
- **AND** the latest status message includes `season` and `weatherLabel`
- **WHEN** the status area renders
- **THEN** date, season, weather, and connection state are visible
- **TEST** `src/__tests__/role-card.test.ts`: wide status render

#### Scenario: Narrow status area avoids overlap

- **GIVEN** the TUI is rendered at a narrow terminal width
- **AND** the latest status message includes `season` and `weatherLabel`
- **WHEN** the status area renders
- **THEN** text does not overlap
- **AND** existing critical status (name, date, connection) remains visible
- **TEST** `src/__tests__/role-card.test.ts`: narrow status render
