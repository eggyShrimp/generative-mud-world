# world-tui Spec Delta

## ADDED Requirements

### Requirement: EventLog displayed in right sidebar in wide mode

The TUI MUST render the EventLog component in the right sidebar column when the terminal width is >= 100 columns.

#### Scenario: Wide mode displays EventLog in sidebar

- **GIVEN** the terminal width is >= 100 columns
- **WHEN** the TUI renders the layout
- **THEN** the EventLog is in the right sidebar column with width 38
- **AND** the EventLog height equals the RoomPanel height

#### Scenario: EventLog receives new events in sidebar

- **GIVEN** the EventLog is displayed in the right sidebar
- **WHEN** a new event arrives
- **THEN** the event appears in the sidebar with auto-scroll to bottom
- **AND** the event prefix and color match the event type

### Requirement: Character needs and global actions displayed in bottom bar in wide mode

The TUI MUST render character needs and global action buttons in a fixed 2-row horizontal bar at the bottom when the terminal width is >= 100 columns.

#### Scenario: Bottom bar displays character needs

- **GIVEN** the terminal width is >= 100 columns
- **AND** the player entity has needs (e.g., hunger, thirst)
- **WHEN** the TUI renders the layout
- **THEN** row 1 of the bottom bar displays needs in horizontal compact format
- **AND** each need shows label, percent bar, and numeric value

#### Scenario: Bottom bar hides needs row when empty

- **GIVEN** the terminal width is >= 100 columns
- **AND** the player entity has no needs
- **WHEN** the TUI renders the layout
- **THEN** row 1 of the bottom bar is empty
- **AND** the bottom bar height remains 2 rows

#### Scenario: Bottom bar displays global action buttons

- **GIVEN** the terminal width is >= 100 columns
- **WHEN** the TUI renders the layout
- **THEN** row 2 of the bottom bar displays global action buttons with key hints
- **AND** button labels come from ContentPool via `bindingLabel()`

#### Scenario: Bottom bar buttons disabled during request

- **GIVEN** the terminal width is >= 100 columns
- **AND** a request is pending or a non-passthrough layer is active
- **WHEN** the TUI renders the layout
- **THEN** all global action buttons are rendered as disabled

### Requirement: Sidebar action buttons before EventLog in narrow mode

The TUI MUST render action buttons above the EventLog in narrow mode (terminal width < 100 columns).

#### Scenario: Narrow mode action buttons before EventLog

- **GIVEN** the terminal width is < 100 columns
- **WHEN** the TUI renders the layout
- **THEN** the Sidebar (action buttons, 1 row) appears before the EventLog
- **AND** no character needs are displayed

#### Scenario: Narrow mode layout ordering

- **GIVEN** the terminal width is < 100 columns
- **WHEN** the TUI renders the layout
- **THEN** components are ordered: RoomPanel → Sidebar → EventLog (top to bottom)

### Requirement: Sidebar has no "角色状态" title or border in wide mode

The TUI MUST NOT display the "角色状态" title or a border box around the Sidebar when rendered as a bottom bar in wide mode.

#### Scenario: Bottom bar has no title or border

- **GIVEN** the terminal width is >= 100 columns
- **WHEN** the TUI renders the Sidebar as a bottom bar
- **THEN** the rendered frame does NOT contain "角色状态"
- **AND** the rendered frame does NOT contain border-drawing characters around the Sidebar

#### Scenario: Bottom bar has no "暂无状态" fallback text

- **GIVEN** the terminal width is >= 100 columns
- **AND** the player entity has no needs
- **WHEN** the TUI renders the Sidebar as a bottom bar
- **THEN** the rendered frame does NOT contain "暂无状态"

### Requirement: EventLog width propagates in sidebar mode

The TUI MUST support a configurable width for the EventLog when displayed as a sidebar.

#### Scenario: EventLog receives and applies width prop

- **GIVEN** the EventLog is rendered in sidebar mode
- **WHEN** the parent passes width=38
- **THEN** the rendered EventLog reflects a 38-column width
