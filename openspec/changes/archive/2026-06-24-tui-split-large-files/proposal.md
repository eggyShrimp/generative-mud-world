# Proposal: tui-split-large-files

## Why

Two TUI files are over 900 lines each — too large to navigate and maintain:

- `src/tui/client/game-client.ts` (1,364 lines) — monolithic "god object" mixing types, dialogue state machine, WebSocket handling, combat, save/book/travelogue logic, and the factory function
- `src/tui/key-layer/index.ts` (969 lines) — mixing direction keys, handler functions, 14 key layer definitions, stack management, and dispatch logic

A few panels in the 200-270 line range also have internal sub-components defined inline instead of separate files.

This refactoring splits these files into domain-focused modules without changing the external API, making the codebase easier to navigate and maintain.

The current TUI layout has already been rebuilt: EventLog is the right-side log, Sidebar is the left control area under RoomPanel, and the old top StatusBar is no longer part of `App`. This proposal must preserve that current layout. It is not a layout change.

## Change Type

**tui-only** — Client-side TUI refactoring. No ContentPool. No engine logic.

## Components Touched

| File | Change Type | Description |
|------|-------------|-------------|
| `src/tui/client/game-client.ts` | split | Phase 1 extracts types and pure dialogue-state helpers; closure-heavy request, combat, and connection logic stays in the factory unless a later phase proves a safe extraction path |
| `src/tui/key-layer/index.ts` | split | Extract direction, handlers, actions, layers into 5 files |
| `src/tui/panels/sidebar/sidebar.tsx` | split | Extract role card, status card, and action bar components that match the current control-area layout |
| `src/tui/panels/dialogue/dialogue-panel.tsx` | split | Extract ChatDialoguePanel and TradeDialoguePanel as separate files |
| `src/tui/panels/room/room-panel.tsx` | split | Extract RoomActionList, ExitList, EntityList as separate components |

## Protocol Surface

No protocol changes. The `shared/protocol.ts` file is not touched.

## Boundary Self-Check

- [x] No imports from `src/engine/`
- [x] No imports from `src/combat/`
- [x] No imports from `src/simulation/`
- [x] No imports from `src/llm/`
- [x] No imports from `src/core/` (except `src/shared/` which is allowed)
- [x] Business/world display text comes from server ContentPool label fields
- [x] Structural UI text that remains hardcoded is listed in design.md

## Impact

All existing imports from `game-client.ts` and `key-layer/index.ts` must continue to work unchanged because:

- `game-client.ts` becomes a re-export barrel that exports all types and `createGameClient` from their new locations
- `key-layer/index.ts` becomes a re-export barrel that exports all public symbols from their new locations
- The `GameClient` interface stays identical — no method signature changes

This is a pure structural refactoring with zero behavior changes.

## Test Impact

The TUI now has rendering and utility tests. This refactoring should not require new behavior tests, but existing TUI tests must continue to pass. Verification is `npm run lint` and `npm test`, plus a TUI smoke check if the component split touches rendered output.
