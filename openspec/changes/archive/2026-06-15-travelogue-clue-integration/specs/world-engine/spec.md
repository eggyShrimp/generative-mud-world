## ADDED Requirements

### Requirement: Travelogue includes newly learned clues

The travelogue generator MUST include player-known clues learned after the player's previous travelogue entry when building the end-of-day travelogue prompt and key events.

#### Scenario: Include clues learned since previous travelogue

- **GIVEN** a player has a previous travelogue entry with `createdAt`
- **AND** the player has known clues learned both before and after that `createdAt`
- **AND** ContentPool has definitions for the newer clues
- **WHEN** a new travelogue entry is generated
- **THEN** the prompt includes a "今日获悉的线索" section for the newer clues
- **AND** the returned `TravelogueEntry.keyEvents` includes the newer clue descriptions
- **AND** older clues are not repeated

#### Scenario: Include first-day clues

- **GIVEN** a player has no previous travelogue entries
- **AND** the player has known clues with `learnedAt <= world.tick`
- **AND** ContentPool has matching clue definitions
- **WHEN** a travelogue entry is generated
- **THEN** the prompt includes those clues
- **AND** the returned `TravelogueEntry.keyEvents` includes those clue descriptions

#### Scenario: Skip missing clue definitions

- **GIVEN** a player has a known clue whose `clueId` is missing from `world.contentPool.clueDefinitions`
- **WHEN** a travelogue entry is generated
- **THEN** that clue is omitted from the prompt and `keyEvents`
- **AND** no fallback clue text is generated

### Requirement: Travelogue clue source is displayed when available

The travelogue prompt MUST include the source NPC name for a clue when the source NPC still exists in the world.

#### Scenario: Display source NPC

- **GIVEN** a known clue has `sourceNpcId`
- **AND** `world.entities` contains that NPC
- **WHEN** the travelogue prompt is built
- **THEN** the clue line includes the NPC name as the source

#### Scenario: Missing source NPC does not hide the clue

- **GIVEN** a known clue has a valid clue definition
- **AND** `world.entities` does not contain the source NPC
- **WHEN** the travelogue prompt is built
- **THEN** the clue is still included
- **AND** no fallback NPC name is required
