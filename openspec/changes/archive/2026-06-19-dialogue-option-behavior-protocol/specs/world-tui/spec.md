## ADDED Requirements

### Requirement: TUI uses dialogue option behavior as the popup contract

The TUI MUST use explicit dialogue option behavior as the primary source of truth for popup state changes.

#### Scenario: Continue behavior waits for returned options

- **GIVEN** a dialogue popup is open
- **AND** the selected option has continue behavior expecting chat options
- **WHEN** the player selects the option
- **THEN** the client sends the existing talk request
- **AND** the popup remains open
- **AND** the visible chat options are cleared
- **AND** the chat tab enters loading state
- **AND** returned `chat_options` replace the visible options
- **TEST** `src/__tests__/game-client.test.ts`: continue behavior waits for and applies returned chat options

#### Scenario: Close behavior closes after sending talk

- **GIVEN** a dialogue popup is open
- **AND** the selected option has close behavior
- **WHEN** the player selects the option
- **THEN** the client sends the existing talk request
- **AND** the popup closes locally
- **AND** the client does not wait for returned chat options
- **TEST** `src/__tests__/game-client.test.ts`: close behavior sends talk and closes popup

#### Scenario: Business type does not drive normal popup behavior when behavior exists

- **GIVEN** a dialogue option has explicit behavior
- **AND** its business type is task-specific
- **WHEN** the player selects the option
- **THEN** popup behavior follows the explicit behavior
- **AND** the TUI does not branch on the task-specific business type for loading or close behavior
- **TEST** `src/__tests__/game-client.test.ts`: explicit behavior overrides type-name inference

### Requirement: Legacy dialogue options are classified through one compatibility helper

The TUI MUST support options that do not yet include behavior, but type-name inference MUST be centralized in one compatibility helper.

#### Scenario: Legacy select option still waits for options

- **GIVEN** a dialogue option has no behavior metadata
- **AND** its type is an existing select type that returns post-select options
- **WHEN** the player selects the option
- **THEN** the compatibility helper classifies it as continue behavior
- **AND** the popup waits for returned chat options
- **TEST** `src/__tests__/game-client.test.ts`: legacy select option maps to continue behavior

#### Scenario: Legacy close and defer options close

- **GIVEN** a dialogue option has no behavior metadata
- **AND** its type is `close` or `quest_defer`
- **WHEN** the player selects the option
- **THEN** the compatibility helper classifies it as close behavior
- **AND** the popup closes after sending talk
- **TEST** `src/__tests__/game-client.test.ts`: legacy close-style options map to close behavior

### Requirement: Quest dialogue is a specialization of base dialogue behavior

Quest negotiation options MUST behave through the same TUI behavior contract as ordinary dialogue options.

#### Scenario: Quest accept refreshes through base continue behavior

- **GIVEN** a quest negotiation popup is open
- **AND** the accept option has continue behavior expecting chat options
- **WHEN** the player selects accept
- **THEN** the client sends the existing talk request
- **AND** the popup enters loading state
- **AND** returned NPC reply and chat options update the same dialogue popup
- **TEST** `src/__tests__/game-client.test.ts`: quest accept refreshes through continue behavior

#### Scenario: Quest defer closes through base close behavior

- **GIVEN** a quest negotiation popup is open
- **AND** the defer option has close behavior
- **WHEN** the player selects defer
- **THEN** the client sends the existing talk request
- **AND** the popup closes locally
- **TEST** `src/__tests__/game-client.test.ts`: quest defer closes through close behavior

### Requirement: TUI boundary remains client-only

The TUI MUST interpret protocol behavior without importing engine, core, simulation, or LLM modules.

#### Scenario: Client behavior helpers depend only on shared protocol types

- **GIVEN** the TUI implements dialogue behavior helpers
- **WHEN** dependency rules are checked
- **THEN** the helper code imports only TUI modules and shared protocol types
- **AND** no engine/core/simulation/LLM imports are introduced
- **TEST** `npm run lint`: dependency-cruiser passes TUI boundary rules

