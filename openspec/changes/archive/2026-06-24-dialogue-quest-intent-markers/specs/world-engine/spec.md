## ADDED Requirements

### Requirement: Quest-related dialogue options expose a clear quest intent marker

Dialogue options that can start or complete a quest flow MUST be marked as quest intent options by setting `DialogueOption.tag` to `"quest"`. The TUI MUST render that marker with both a `[!]` badge and quest accent color when color is available.

#### Scenario: NPC-given quest appears as marked quest intent

- **GIVEN** an NPC is the `giverNpcId` of a quest template
- **AND** the player is eligible to receive that quest
- **WHEN** dialogue options are generated for that NPC
- **THEN** the options include a quest trigger option
- **AND** that option has `type: "quest_trigger_menu"`
- **AND** that option has `tag: "quest"`
- **AND** the option label is player-facing natural dialogue, not a raw quest id
- **AND** the TUI can render it with a `[!]` badge and quest accent color from the tag
- **TEST** `src/__tests__/dialogue-generator.test.ts`: NPC-given ordinary quest appears as marked quest trigger

#### Scenario: Talk-triggered storyline remains marked quest intent

- **GIVEN** a storyline template has `autoTrigger.type` of `"player_action"`
- **AND** one trigger condition is a `talk` action targeting the NPC
- **AND** the player is eligible for the storyline
- **WHEN** dialogue options are generated for that NPC
- **THEN** the options include a quest trigger option
- **AND** that option has `tag: "quest"`
- **TEST** `src/__tests__/dialogue-generator.test.ts`: talk-triggered storyline remains marked

#### Scenario: Completable quest appears as marked delivery intent

- **GIVEN** the player has an active quest from the NPC
- **AND** all objective groups for that quest are complete
- **WHEN** dialogue options are generated for that NPC
- **THEN** the options include a quest delivery option
- **AND** that option has `type: "quest_deliver_menu"`
- **AND** that option has `tag: "quest"`
- **AND** the TUI can render it with a `[!]` badge and quest accent color from the tag
- **TEST** `src/__tests__/dialogue-generator.test.ts`: completable active quest appears as marked delivery intent

### Requirement: Quest intent marker is deterministic metadata, not LLM text

The system MUST derive quest intent markers and color from option metadata and MUST NOT require the LLM to include marker punctuation in generated labels.

#### Scenario: LLM rewrites quest option without marker text

- **GIVEN** the dialogue generator has built a quest direction
- **AND** the LLM returns a natural label without `!`
- **WHEN** the label is parsed into a dialogue option
- **THEN** the option uses the LLM label
- **AND** the option still has `tag: "quest"`
- **AND** the label itself is not modified to include `!`
- **TEST** `src/__tests__/dialogue-generator.test.ts`: quest marker is metadata, not label text

#### Scenario: LLM failure keeps quest marker

- **GIVEN** the dialogue generator has built a quest direction
- **AND** the LLM response cannot be parsed
- **WHEN** fallback options are built
- **THEN** the fallback quest option still exists
- **AND** it still has `tag: "quest"`
- **TEST** `src/__tests__/dialogue-generator.test.ts`: fallback quest intent preserves marker metadata

### Requirement: Ineligible quests are not exposed as dialogue quest intents

The generator MUST NOT expose a quest trigger option when the player cannot currently receive that quest.

#### Scenario: Already active quest is not offered again

- **GIVEN** the player already has the quest active
- **WHEN** dialogue options are generated for the giver NPC
- **THEN** the quest is not included as a quest trigger option
- **TEST** `src/__tests__/dialogue-generator.test.ts`: active quest is not offered again

#### Scenario: Completed non-repeatable quest is not offered again

- **GIVEN** the player has completed a non-repeatable quest
- **WHEN** dialogue options are generated for the giver NPC
- **THEN** the quest is not included as a quest trigger option
- **TEST** `src/__tests__/dialogue-generator.test.ts`: completed non-repeatable quest is hidden

#### Scenario: Prerequisite-blocked quest is not offered

- **GIVEN** a quest has prerequisites
- **AND** the player has not satisfied those prerequisites
- **WHEN** dialogue options are generated for the giver NPC
- **THEN** the quest is not included as a quest trigger option
- **TEST** `src/__tests__/dialogue-generator.test.ts`: unmet prerequisite blocks quest intent

#### Scenario: Relation-blocked quest is not offered

- **GIVEN** a quest has a `minRelation` requirement
- **AND** the player does not meet that relation requirement
- **WHEN** dialogue options are generated for the giver NPC
- **THEN** the quest is not included as a quest trigger option
- **TEST** `src/__tests__/dialogue-generator.test.ts`: unmet relation blocks quest intent

#### Scenario: Repeatable quest cooldown blocks option

- **GIVEN** a repeatable quest has `cooldownDays`
- **AND** the player's last completion is still within the cooldown window
- **WHEN** dialogue options are generated for the giver NPC
- **THEN** the quest is not included as a quest trigger option
- **TEST** `src/__tests__/dialogue-generator.test.ts`: cooldown blocks quest intent

#### Scenario: Storyline child quest is not offered standalone

- **GIVEN** a quest template is referenced by a storyline stage
- **WHEN** dialogue options are generated for the quest giver NPC
- **THEN** that child quest is not included as a standalone quest trigger option
- **TEST** `src/__tests__/dialogue-generator.test.ts`: storyline child quest is hidden from standalone dialogue offer

### Requirement: Selecting quest intent reuses existing quest flow

Quest intent options MUST enter the existing quest trigger or delivery flow and MUST NOT mutate quest state during menu generation.

#### Scenario: Quest trigger selection uses existing accept path

- **GIVEN** a quest trigger option is shown
- **WHEN** the player selects it
- **THEN** the dialogue handler routes through the existing quest trigger selection path
- **AND** quest state changes are represented as `SimulationDelta.questChanges`
- **AND** world state is applied by the existing delta application path
- **TEST** `src/__tests__/dialogue-generator.test.ts`: quest trigger selection returns existing quest accept delta

#### Scenario: Menu generation has no state mutation

- **GIVEN** dialogue options are generated for an NPC with eligible quest intents
- **WHEN** generation completes
- **THEN** the player's active quests, completed quests, inventory, relations, and storylines are unchanged
- **TEST** `src/__tests__/dialogue-generator.test.ts`: generating quest intent options does not mutate player state
