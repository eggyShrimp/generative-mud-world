## ADDED Requirements

### Requirement: TUI behavior is specified with testable scenarios

The TUI change MUST describe user-visible behavior with scenarios that can be mapped to automated tests or explicit manual checks.

#### Scenario: Layout behavior is testable

- **GIVEN** the TUI is rendered in the relevant terminal mode
- **WHEN** the changed layout is active
- **THEN** the expected component order, dimensions, and visibility are defined
- **AND** the scenario names the automated test or manual check that verifies it

#### Scenario: Existing behavior is preserved

- **GIVEN** existing TUI behavior outside the intended change
- **WHEN** the new TUI change is applied
- **THEN** the preserved behavior is listed as a regression scenario
- **AND** the scenario names the automated test or manual check that verifies it

### Requirement: TUI interactions remain covered

Keyboard, mouse, protocol, and reactive-state behavior affected by the change MUST have test coverage.

#### Scenario: Interaction behavior is testable

- **GIVEN** a changed control, key binding, protocol field, or reactive state path
- **WHEN** the user performs the relevant interaction or the client receives the relevant message
- **THEN** the expected state transition and visible result are defined
- **AND** the scenario names the automated test or manual check that verifies it
