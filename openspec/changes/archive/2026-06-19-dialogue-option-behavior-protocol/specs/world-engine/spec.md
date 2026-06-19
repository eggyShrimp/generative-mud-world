## ADDED Requirements

### Requirement: Dialogue options declare UI behavior separately from business type

Every newly generated dialogue option MUST carry explicit behavior metadata that describes client popup behavior independently from the option business type.

#### Scenario: Protocol exposes dialogue option behavior

- **GIVEN** a `DialogueOption` is sent to the client
- **WHEN** the option is newly produced by the server dialogue pipeline
- **THEN** it includes behavior metadata
- **AND** the behavior metadata is separate from `type`
- **AND** `type` remains available for existing talk routing
- **TEST** `src/__tests__/dialogue-generator.test.ts`: generated dialogue options include behavior without changing business type

#### Scenario: Behavior metadata is not a write path

- **GIVEN** a player selects a behavior-bearing dialogue option
- **WHEN** the engine handles the resulting talk request
- **THEN** world state changes are still derived from `optionId` and `optionType`
- **AND** quest acceptance still returns `SimulationDelta.questChanges`
- **AND** behavior metadata is not required in the talk request
- **TEST** `src/__tests__/integration/dialogue-pipeline.test.ts`: behavior-bearing quest accept still uses normal quest delta path

### Requirement: Server-produced dialogue option categories define expected behavior

The dialogue generator MUST assign behavior according to the option's interaction contract, not according to task-specific client rules.

#### Scenario: Continue options expect returned chat options

- **GIVEN** the dialogue generator creates a menu entry, ordinary chat option, follow-up option, quest accept option, quest delivery option, or functional select option
- **WHEN** the option is returned to the client
- **THEN** the option behavior says selecting it keeps the dialogue flow open
- **AND** the option behavior says returned chat options are expected
- **TEST** `src/__tests__/dialogue-generator.test.ts`: continue-style generated options have continue behavior

#### Scenario: Close options close the popup

- **GIVEN** the dialogue generator creates a goodbye option or quest defer option
- **WHEN** the option is returned to the client
- **THEN** the option behavior says selecting it closes the dialogue popup after sending the talk request
- **AND** the business type remains `close` or `quest_defer`
- **TEST** `src/__tests__/dialogue-generator.test.ts`: close-style generated options have close behavior

#### Scenario: Post-select options are behavior-bearing

- **GIVEN** a quest accept, quest delivery, or functional select action returns post-action dialogue options
- **WHEN** those sub-options are sent back to the client
- **THEN** every sub-option includes explicit behavior
- **TEST** `src/__tests__/dialogue-generator.test.ts`: post-select options include behavior

### Requirement: Dialogue behavior remains compatible during migration

The server MAY accept legacy client talk requests that do not echo behavior metadata, but newly produced server options MUST include behavior.

#### Scenario: Talk request does not need behavior echo

- **GIVEN** the client received a behavior-bearing dialogue option
- **WHEN** the client sends the selected option as a talk request
- **THEN** the request only needs the existing `npcId`, `optionId`, `label`, and `optionType`
- **AND** the server handles the request through the existing route
- **TEST** `src/__tests__/round-engine.test.ts`: talk route handles behavior-bearing option selection without requiring behavior in params

#### Scenario: Server messages preserve behavior metadata

- **GIVEN** the generator returns behavior-bearing dialogue options
- **WHEN** the server sends `chat_options`, `dialogue_options`, or `follow_up_options`
- **THEN** behavior metadata is preserved in the sent option objects
- **TEST** `src/__tests__/ws-server.test.ts`: option messages include behavior metadata when provided by the generator

