## ADDED Requirements

### Requirement: EventLog and RoomPanel widths are auto-distributed based on terminal width

The layout metrics function MUST compute `sidebarWidth` dynamically using proportional distribution with minimum guarantees, replacing the hardcoded `SIDEBAR_WIDTH = 52` constant.

#### Scenario: proportional split at 120-wide terminal

- **GIVEN** a terminal of 120 columns × 40 rows
- **WHEN** `getLayoutMetrics(120, 40)` is called
- **THEN** `sidebarWidth` is 44 (30 + round(35 × 0.4))
- **AND** `roomHeight` is 24 (clamped by vertical constraints)

#### Scenario: tight terminal fallback at 80-wide

- **GIVEN** a terminal of 80 columns × 40 rows
- **WHEN** `getLayoutMetrics(80, 40)` is called
- **THEN** `sidebarWidth` is 31 (fallback: max(20, round(77 × 0.4)))
- **AND** EventLog gets at least 20 columns even when space is tight

#### Scenario: extreme narrow 60-wide

- **GIVEN** a terminal of 60 columns × 40 rows
- **WHEN** `getLayoutMetrics(60, 40)` is called
- **THEN** `sidebarWidth` is 23 (fallback: max(20, round(57 × 0.4)))

#### Scenario: wide terminal 160-wide

- **GIVEN** a terminal of 160 columns × 40 rows
- **WHEN** `getLayoutMetrics(160, 40)` is called
- **THEN** `sidebarWidth` is 61 (30 + round(75 × 0.4))

### Requirement: getLayoutMetrics accepts both terminal width and height

The function signature MUST change from `(terminalHeight)` to `(terminalWidth, terminalHeight)` to support width-dependent calculations.

#### Scenario: app.tsx passes width to getLayoutMetrics

- **GIVEN** the TUI app is rendered
- **WHEN** layout metrics are computed
- **THEN** `getLayoutMetrics` receives `dimensions().width` as first argument
- **AND** `dimensions().height` as second argument

### Requirement: existing vertical layout behavior is preserved

The vertical layout computation (roomHeight, eventLogHeight, bottomBarHeight) MUST remain unchanged. Only the horizontal sidebarWidth computation is affected.

#### Scenario: vertical metrics unchanged at any width

- **GIVEN** any terminal width
- **WHEN** `getLayoutMetrics` is called
- **THEN** `bottomBarHeight` remains 2
- **AND** `eventLogHeight` equals `roomHeight`
- **AND** `roomHeight` depends only on `terminalHeight`, not `terminalWidth`
