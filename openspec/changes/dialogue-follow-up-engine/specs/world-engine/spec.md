## ADDED Requirements

### Requirement: Server generates follow-up dialogue options from selected NPC text

The server MUST accept a request to generate follow-up options for selected NPC text and MUST return existing `DialogueOption` objects that can be selected through the normal `talk` flow.

#### Scenario: Generate follow-up options

- **GIVEN** a connected player is in dialogue with an NPC
- **AND** the client sends `request_follow_up_options` with the NPC id and selected NPC text
- **WHEN** the server handles the request
- **THEN** it calls the dialogue generator with the player id, NPC id, and selected text
- **AND** it sends `follow_up_options`
- **AND** each option has `type: "idle_chat"`
- **TEST** `src/__tests__/ws-server.test.ts`: request message returns `follow_up_options`

#### Scenario: Invalid selected text is rejected

- **GIVEN** a connected player sends `request_follow_up_options`
- **AND** `context` is empty or only whitespace
- **WHEN** the server validates the message
- **THEN** it sends an error
- **AND** it does not call the dialogue generator
- **TEST** `src/__tests__/ws-server.test.ts`: invalid context returns error

#### Scenario: Selected player text still produces usable follow-ups

- **GIVEN** the selected text appears to be the player's own dialogue line
- **WHEN** the server generates follow-up options
- **THEN** generated options stay usable as player questions
- **AND** they do not treat the selected player sentence as NPC knowledge
- **TEST** `src/__tests__/dialogue-generator.test.ts`: player-line context remains usable

#### Scenario: Empty generator result is allowed

- **GIVEN** the LLM response cannot be parsed into valid follow-up labels
- **WHEN** follow-up options are generated
- **THEN** the generator returns an empty option list
- **AND** it does not invent replacement world facts
- **TEST** `src/__tests__/dialogue-generator.test.ts`: malformed output returns empty list

### Requirement: Follow-up generation does not create a parallel dialogue execution path

Generated follow-up options MUST reuse the existing dialogue option and `talk` execution path.

#### Scenario: Choosing a generated follow-up uses normal talk

- **GIVEN** the server has returned follow-up options
- **WHEN** the player chooses one option
- **THEN** the client sends the existing `talk` message
- **AND** the engine handles it through the existing `handleChatOption` path
- **AND** any world state changes go through `SimulationDelta`
- **TEST** `src/__tests__/integration/dialogue-pipeline.test.ts`: generated follow-up option applies normal dialogue delta

### Requirement: NPC relationship feedback affects detail level, not basic answer availability

NPC replies MUST use relationship context to adjust detail and tone without turning poor relationship into default refusal.

#### Scenario: Normal relationship receives a normal answer

- **GIVEN** the player asks an NPC a normal follow-up question
- **AND** the relationship is ordinary
- **WHEN** follow-up options are generated and one is selected
- **THEN** the options remain normal player questions
- **AND** the reply flow uses the normal `talk` path
- **TEST** `src/__tests__/dialogue-generator.test.ts`: ordinary relationship produces usable follow-up options

#### Scenario: Good relationship receives more detail

- **GIVEN** the player asks an NPC a normal follow-up question
- **AND** the relationship is good
- **WHEN** follow-up options are generated
- **THEN** detail-oriented follow-up options are allowed
- **AND** known clues may be surfaced only through existing known-clue context
- **TEST** `src/__tests__/dialogue-generator.test.ts`: good relationship can produce detail-oriented follow-up options

#### Scenario: Poor relationship does not block basic answers

- **GIVEN** the player asks an NPC a normal follow-up question
- **AND** the relationship is poor
- **WHEN** follow-up options are generated and then one is selected
- **THEN** the options remain usable player questions
- **AND** the reply flow still uses the normal `talk` path
- **AND** no refusal-only option set is forced by relationship alone
- **TEST** `src/__tests__/dialogue-generator.test.ts`: poor relationship does not force refusal-only options

### Requirement: Follow-up topic tool describes relationship depth without changing schema

The `suggest_followup_topics` tool MUST keep its existing schema while describing the same relationship feedback behavior used by follow-up option generation.

#### Scenario: Tool description guides depth by relationship

- **GIVEN** dialogue tools are built from ContentPool
- **WHEN** the `suggest_followup_topics` tool is inspected
- **THEN** its description says topics are player-facing follow-up questions
- **AND** it says good relationship may allow deeper or more detailed follow-ups
- **AND** it says poor relationship should still keep options usable
- **AND** the tool parameter schema is unchanged
- **TEST** `src/__tests__/dialogue-tools.test.ts`: description and schema are verified
