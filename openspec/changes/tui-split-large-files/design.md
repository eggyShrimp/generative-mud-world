# Design: tui-split-large-files

## Component Hierarchy

No user-visible layout changes. The existing component tree in `app.tsx` remains semantically identical to the current rebuilt TUI: RoomPanel and Sidebar are in the left column, EventLog is in the right column, and overlays remain mounted after the main layout. All import paths are updated via barrel re-exports, and the `GameClient` interface is unchanged.

```
<!-- Unchanged -->
App
├── KeyboardController
├── Main row
│   ├── Left column
│   │   ├── RoomPanel
│   │   └── Sidebar
│   └── EventLog
├── StatusPanel
├── QuestsPanel
├── TraveloguePanel
├── EndDayPanel
├── InventoryPanel
├── DialoguePanel
│   ├── ChatDialoguePanel  ← extracted to own file
│   ├── TradeDialoguePanel  ← extracted to own file
│   └── TradeDetail
├── MapPanel
├── SavePanel
├── BookReaderPanel
├── CombatPanel
├── QuestNotificationOverlay
└── ItemChangeNotificationOverlay
```

## Protocol Messages

No protocol changes. This refactoring touches only client-side file organization.

## File Structure — After Split

### game-client.ts → Phase 1 files

```
src/tui/client/
├── types.ts                  All interfaces (LogEntry, DialogueState, CombatLogEntry,
│                              MapCursor, SavePanelState, BookReaderState, GameClient, …)
├── dialogue-state.ts         Pure dialogue state transition functions
└── game-client.ts            Factory, closure-heavy request/combat/connection logic,
                               and re-exports for existing import paths
```

Dependency graph:
```
types ←── dialogue-state
types ←── game-client ←── dialogue-state

key-layer/index.ts  → imports from dialogue-state (getDialogueVisibleOptions)
panels/*             → import type { GameClient, LogEntry, etc. } from client/types
```

Do not extract WebSocket lifecycle, combat timers, or dialogue request methods in Phase 1. Those functions close over Solid signals, WebSocket state, active request state, combat timer state, and layer operations. Moving them without introducing a clear state container would turn a structural refactor into a behavior change.

If a later phase extracts them, first introduce an explicit internal context object and prove behavior with focused tests. Until then, `createGameClient` remains the owner of request, combat, save/book/travelogue, and connection lifecycles.

### key-layer/index.ts → 5 files

```
src/tui/key-layer/
├── direction.ts              DIRECTION_KEYS, findDirectionValue, directionEnabled helpers
├── handlers.ts               All handler functions (handleRoomAction, handleEntitySelect,
│                              handleInventoryKey, handleDialogueOption, etc.)
├── actions.ts                getEntityActions, getInventoryActions (with capabilityLabel, actionColor)
├── layers.ts                 All 14 KeyLayer constants (BASE_LAYER through COMBAT_LAYER)
└── index.ts                  — Types (KeyBinding, KeyLayer) + stack management (pushLayer,
                               popLayer, hasLayer, activeLayer) + dispatchKey + re-exports
```

Dependency graph:
```
direction.ts ←── layers (via directionEnabled, makeDirectionHandler)
handlers.ts   ←── direction (for direction lookups)
actions.ts    ←── direction, event-style
layers.ts     ←── direction, handlers, actions (imports helpers, defines layer constants)
index.ts      ←── layers (imports all layer definitions, registers them, exports stack mgmt)
```

### Sidebar → 3 files (was 1)

```
src/tui/panels/sidebar/
├── role-card.tsx              RoleCard — connection indicator, character name, date,
│                              weapon, and armor
├── status-card.tsx            StatusCard — needs and top traits
├── action-bar.tsx             ActionBar — wrapped global action key hints
├── sidebar-format.ts          displayWidth/isWideCharacter and sizing helpers if shared
├── sidebar.tsx                Composition root — owns layout sizing and disabled state
└── status-bar.tsx             (already separate, unchanged)
```

### DialoguePanel → 3 files (was 1 + TradeDetail)

```
src/tui/panels/dialogue/
├── chat-dialogue.tsx          ChatDialoguePanel
├── trade-dialogue.tsx         TradeDialoguePanel
├── dialogue-panel.tsx         Main panel — tab switch, delegates to chat/trade
└── trade-detail.tsx           (already separate, unchanged)
```

### RoomPanel → 4 files (was 1)

```
src/tui/panels/room/
├── room-action-list.tsx       RoomActionList
├── exit-list.tsx              ExitList
├── entity-list.tsx            EntityList
└── room-panel.tsx             Main panel — composes above
```

## depcruise Boundary Verification

| Rule | Status | Notes |
|------|:--:|-------|
| tui-no-direct-engine-import | ✅ | All splits stay within `src/tui/` — no engine imports |
| combat-config-only-via-contentpool | ✅ | N/A for TUI |
| no-hardcoded-labels | ✅ | No new Record<string,string> constants added |

## Display Text

| UI Element | Source | Notes |
|------------|--------|-------|
| All existing display text | Unchanged | No text moved or modified |
| Structural UI text | Hardcoded where already present | e.g., `"正在处理..."`, `"关闭"`, tab labels — no change in policy |

## Test Plan

This is a pure structural refactoring with zero behavior change. The existing test suite should pass without behavior changes.

No new tests are required because:
- All exports are preserved via re-exports — tests that import from existing paths continue to work
- No new logic introduced
- Component rendering output is unchanged

### Verification

```
npm run lint         # typecheck + biome + dependency-cruiser
npm test             # vitest — all existing tests pass
npm run dev:tui      # manual smoke test at typical terminal sizes
```

## Manual Checks

- [ ] `npm run lint` passes
- [ ] `npm test` passes
- [ ] `npm run dev:tui` — no visual regressions at 80x24 and 120x40
