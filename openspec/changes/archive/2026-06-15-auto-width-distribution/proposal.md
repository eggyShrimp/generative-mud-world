# Proposal: auto-width-distribution

## Why

`SIDEBAR_WIDTH = 52` is hardcoded in `metrics.ts`. When the terminal is 80 columns wide, EventLog takes 52 and RoomPanel gets only 25 — far below the ~51 columns needed for the entity list layout. Columns truncate severely and the UI becomes unreadable. When the terminal is 120 columns, RoomPanel gets 65 which is fine, but EventLog is wider than necessary. There is no mechanism to redistribute horizontal space based on actual terminal width.

## Change Type

**tui-only** — Client-side TUI layout change. No ContentPool. No engine logic.

## Components Touched

| File | Change Type | Description |
|------|-------------|-------------|
| `src/tui/layout/metrics.ts` | modify | `getLayoutMetrics` accepts `terminalWidth`, computes `sidebarWidth` dynamically with RoomPanel min=52, EventLog min=30, excess split 40/60 |
| `src/tui/app.tsx` | modify | Pass `dimensions().width` to `getLayoutMetrics` |

## Protocol Surface

No changes to `shared/protocol.ts`. Width distribution is purely a rendering concern.

## Boundary Self-Check

- [x] No imports from `src/engine/`
- [x] No imports from `src/combat/`
- [x] No imports from `src/simulation/`
- [x] No imports from `src/llm/`
- [x] No imports from `src/core/` (except `src/shared/` which is allowed)
- [x] Business/world display text comes from server ContentPool label fields
- [x] Structural UI text that remains hardcoded is listed in design.md

## Impact

- EventLog and RoomPanel now adapt to terminal width instead of using a fixed 52-column allocation
- At 80 columns: EventLog 31 / RoomPanel 46 (previously 52/25)
- At 120 columns: EventLog 44 / RoomPanel 73 (previously 52/65)
- No visual regression at 100 columns: EventLog 36 / RoomPanel 61

## Test Impact

| Test File | Coverage |
|-----------|----------|
| `src/__tests__/layout-metrics.test.ts` | Update all `getLayoutMetrics` calls to accept width param. Replace fixed `sidebarWidth=52` test with proportional split tests at 120, 80, 60 column widths |
