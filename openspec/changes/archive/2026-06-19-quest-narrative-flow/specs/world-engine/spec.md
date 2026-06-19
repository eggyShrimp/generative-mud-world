## ADDED Requirements

### Requirement: Quest trigger menus enter a narrative negotiation turn

When the player selects a quest trigger menu option, the engine MUST return an NPC narrative plus generated decision options instead of exposing raw quest titles as the next menu.

#### Scenario: Eligible quest trigger creates negotiation options

- **GIVEN** an NPC has an eligible quest trigger for the player
- **WHEN** the player selects a `quest_trigger_menu` option for that NPC
- **THEN** the command result includes an NPC dialogue narrative
- **AND** the returned chat sub-options include an accept option with `type: "quest_trigger_select"`
- **AND** they include a defer option with `type: "quest_defer"`
- **AND** they include a goodbye option
- **AND** quest state is not changed
- **TEST** `src/__tests__/dialogue-generator.test.ts`: quest trigger menu starts narrative negotiation without accepting the quest

#### Scenario: LLM failure returns a valid minimal negotiation menu

- **GIVEN** the LLM response for the quest negotiation cannot be parsed or validated
- **WHEN** the player selects a `quest_trigger_menu` option
- **THEN** the engine still returns a valid NPC dialogue
- **AND** the returned chat sub-options include non-empty accept and defer options
- **AND** no `questChanges` are returned
- **TEST** `src/__tests__/dialogue-generator.test.ts`: invalid quest menu generation falls back without quest state changes

### Requirement: Quest negotiation state is private generator state

The engine MUST track an in-progress quest negotiation without writing it to WorldState and without requiring the client to echo option metadata.

#### Scenario: Pending negotiation is stored by player and NPC

- **GIVEN** a player starts a quest negotiation with an NPC
- **WHEN** the negotiation menu is generated
- **THEN** the pending negotiation is associated with that player and NPC
- **AND** player quests, inventory, relations, storylines, needs, and traits are unchanged
- **TEST** `src/__tests__/dialogue-generator.test.ts`: quest negotiation menu generation stores pending menu without mutating world state

#### Scenario: Task-scene first menu trims ordinary options

- **GIVEN** an NPC dialogue has at least one task option
- **WHEN** first-round dialogue options are generated
- **THEN** fixed decision options are preserved
- **AND** ordinary options are trimmed so the total stays near four when fixed options allow it
- **TEST** `src/__tests__/dialogue-generator.test.ts`: task-scene first dialogue options trim ordinary options while preserving fixed options

### Requirement: Ordinary follow-up preserves the quest decision

Ordinary follow-up questions in a quest negotiation MUST reuse idle chat while preserving the accept/defer decision until the player resolves the negotiation.

#### Scenario: Follow-up reply reinserts quest decision options

- **GIVEN** a pending quest negotiation exists
- **AND** the player selects one ordinary follow-up question
- **WHEN** the idle-chat reply is generated
- **THEN** the returned sub-options still include the accept option
- **AND** they still include the defer option
- **AND** they include at most one ordinary non-quest follow-up option
- **AND** they include the goodbye option
- **TEST** `src/__tests__/dialogue-generator.test.ts`: quest follow-up preserves accept and defer options

#### Scenario: Ordinary idle chat remains unchanged

- **GIVEN** no pending quest negotiation exists for the player and NPC
- **WHEN** the player selects an `idle_chat` option
- **THEN** the returned sub-options follow the existing ordinary idle-chat behavior
- **AND** no quest accept or defer options are injected
- **TEST** `src/__tests__/dialogue-generator.test.ts`: idle chat without pending negotiation does not inject quest options

### Requirement: Quest negotiation resolves explicitly

The engine MUST clear pending quest negotiation state when the player accepts, defers, or explicitly chooses goodbye.

#### Scenario: Accept clears pending negotiation and uses existing quest acceptance path

- **GIVEN** a pending quest negotiation exists
- **WHEN** the player selects the accept option
- **THEN** the pending negotiation is cleared
- **AND** quest acceptance is represented through `SimulationDelta.questChanges`
- **AND** world state is applied by the existing delta application path
- **TEST** `src/__tests__/dialogue-generator.test.ts`: quest accept clears pending negotiation and returns existing accept delta

#### Scenario: Defer clears pending negotiation without accepting

- **GIVEN** a pending quest negotiation exists
- **WHEN** the player selects the defer option
- **THEN** the pending negotiation is cleared
- **AND** the command result includes an NPC acknowledgement dialogue
- **AND** no `questChanges` are returned
- **TEST** `src/__tests__/dialogue-generator.test.ts`: quest defer clears pending negotiation without quest changes

#### Scenario: Explicit goodbye clears pending negotiation

- **GIVEN** a pending quest negotiation exists
- **WHEN** the player selects the goodbye or close option
- **THEN** the pending negotiation is cleared
- **AND** existing close behavior, including conversation summary scheduling, still runs
- **TEST** `src/__tests__/dialogue-generator.test.ts`: close clears pending negotiation
