## ADDED Requirements

### Requirement: TUI displays book content in a paged reader

The TUI MUST open a paged reader panel when a command result includes `bookDisplay`.

#### Scenario: Open reader from command result

- **GIVEN** the server sends a command result with `bookDisplay`
- **WHEN** the TUI client handles the result
- **THEN** it opens the book reader on page 1
- **AND** preserves normal command feedback

#### Scenario: Navigate reader pages

- **GIVEN** the book reader is open with multiple pages
- **WHEN** the user presses next-page keys
- **THEN** the reader advances until the last page
- **WHEN** the user presses previous-page keys
- **THEN** the reader moves back until the first page

#### Scenario: Close reader

- **GIVEN** the book reader is open
- **WHEN** the user presses close keys
- **THEN** the reader closes and clears its reader state
