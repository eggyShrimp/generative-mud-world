## ADDED Requirements

### Requirement: Clue definitions have a complete ContentPool maintenance chain

`clueDefinitions` MUST be maintained through the full ContentPool path before engine features depend on it.

#### Scenario: Load shipped clue definitions

- **GIVEN** `worlds/content-pool/social-dialogue.yaml` contains `clueDefinitions`
- **WHEN** the ContentPool is loaded
- **THEN** each clue definition is validated by `ClueDefinitionSchema`
- **AND** the loaded clues are available at `world.contentPool.clueDefinitions`

#### Scenario: Reject malformed clue definitions

- **GIVEN** a ContentPool YAML file contains an invalid clue definition
- **WHEN** the ContentPool is loaded
- **THEN** loading fails with a schema validation error

#### Scenario: LLM can add clue definitions through tools

- **GIVEN** ContentPool evolution runs with tool calling enabled
- **WHEN** the LLM calls `add_clue_definition`
- **THEN** the tool arguments are validated by `ClueDefinitionSchema`
- **AND** `ContentPoolMutation.addClueDefinitions` is populated

#### Scenario: Persist evolved clue definitions

- **GIVEN** `ContentPoolMutation.addClueDefinitions` contains new or updated clues
- **WHEN** the mutation is materialized and evolve deltas are written
- **THEN** `world.contentPool.clueDefinitions` is updated by clue `id`
- **AND** `content-pool/evolve/social-dialogue.yaml` stores the resulting clue definitions
- **AND** a later ContentPool reload preserves them

#### Scenario: ContentPool boundaries remain enforced

- **GIVEN** engine and LLM runtime code consumes `world.contentPool.clueDefinitions`
- **WHEN** dependency-cruiser runs
- **THEN** runtime modules do not import raw ContentPool loader, schema, or tooling modules outside approved boundary files
