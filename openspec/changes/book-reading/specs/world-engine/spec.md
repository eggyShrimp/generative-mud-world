## ADDED Requirements

### Requirement: Player can read readable items

The engine MUST expose and execute a `read` command for readable items without consuming the item.

#### Scenario: Read a book from inventory

- **GIVEN** the player has an inventory item with `properties.readable === true`
- **AND** ContentPool has matching `bookContents` for the item's `templateId`
- **WHEN** the player executes `read` with that `itemId`
- **THEN** the command returns a `book_read` event
- **AND** returns `bookDisplay` with the book title and pages
- **AND** returns need and trait changes through `SimulationDelta`
- **AND** the item remains in inventory

#### Scenario: Read a book in the room

- **GIVEN** the current room contains an item with `properties.readable === true`
- **AND** ContentPool has matching `bookContents` for the item's `templateId`
- **WHEN** the player executes `read` with that room item id
- **THEN** the command returns `bookDisplay` for that item

#### Scenario: Missing readable content

- **GIVEN** an item is marked readable
- **AND** ContentPool has no matching book content
- **WHEN** the player executes `read`
- **THEN** the command returns an error
- **AND** no read effects are applied

### Requirement: Read capability is discoverable

The engine MUST include a `read` capability for readable room and inventory items.

#### Scenario: Derive read capability

- **GIVEN** the player can access readable items in inventory or the current room
- **WHEN** capabilities are derived
- **THEN** the `read` capability includes those item ids
- **AND** the label comes from ContentPool event titles
