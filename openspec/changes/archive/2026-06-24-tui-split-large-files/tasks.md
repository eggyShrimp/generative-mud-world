# Tasks: tui-split-large-files

## What Changes

Structural refactoring of large TUI files into domain-focused modules. No behavior changes.

**Files to split:**
- `src/tui/client/game-client.ts` (1,364 lines → Phase 1: types + pure dialogue-state helpers + factory)
- `src/tui/key-layer/index.ts` (969 lines → 5 files)
- `src/tui/panels/sidebar/sidebar.tsx` (272 lines → 3 files)
- `src/tui/panels/dialogue/dialogue-panel.tsx` (228 lines → 3 files)
- `src/tui/panels/room/room-panel.tsx` (227 lines → 4 files)

---

## Component: src/tui/client/ (Phase 1 safe split)

### Step 1: Create types.ts

- [x] Move all interface/type definitions out of game-client.ts into `src/tui/client/types.ts`:
  - `LogEntry`, `DialogueTab`, `DialogueHistoryEntry`, `TradeItemDisplay`, `DialogueTabList`, `ChatTab`, `TradeTab`, `DialogueState`
  - `ActiveRequest`, `CombatLogEntry`, `TravelogueEntry`, `MAP_GRANULARITIES`, `MapGranularity`, `MapCursor`
  - `SavePanelState`, `BookReaderState`, `GameClient`, `RestOption`
- [x] Remove the `import type { ... } from "../key-layer/index.ts"` dependency from types.ts
- [x] Keep only `import { createSignal } from "solid-js"` and `import { logWrite } from "../../shared/log.ts"` in the factory function, not in types

### Step 2: Create dialogue-state.ts

- [x] Move pure dialogue state transition functions:
  - `shouldKeepPopupOpen`, `shouldExpectDialogueOptions`, `createDialogueState`
  - `getDialogueVisibleOptions`, `isDialogueTabLoading`, `buildLoadingDialogueState`
  - `extractNpcReply`, `appendToHistory`, `computeContentHeight`, `computeTabSwitch`
  - `applyNpcReply`, `applyDialogueOptionsToTab`, `applyTradeOptionsToTab`
  - `responseTabForOptionType`, `shouldRunPendingDialogueRequest`, `tradeOptionDetail`
- [x] Import types from `./types.ts`

### Step 3: Keep closure-heavy lifecycle logic in game-client.ts

- [x] Keep dialogue/trade request handling in `createGameClient` for this phase:
  - `buildTalkHandlers`, `handleTradeSelection`, `clearTradeSelection`
  - `requestDialogueOptions`, `chooseDialogueOption`, `chooseTradeOption`
  - `sendTradeAction`, `switchDialogueTab`, `requestTradeOptions`, `requestSellOptions`
- [x] Keep combat state machine functions in `createGameClient` for this phase:
  - `startCombat`, `endCombat`, `sendAutoAttack`, `ensureCombatTimer`, `checkCombatEnd`
- [x] Keep WebSocket lifecycle in `createGameClient` for this phase:
  - `connect`, `disconnect`, `send`, `handleMessage`, `pushEvents`, `pushBlockedEvent`
- [x] Do not introduce a fallback state path or copied state store just to make these functions movable.

### Step 4: Simplify game-client.ts exports

- [x] Re-export all public types from `./types.ts`
- [x] Re-export pure dialogue helpers from `./dialogue-state.ts`
- [x] Keep `createGameClient` factory in game-client.ts
- [x] Ensure `import { type GameClient, createGameClient } from "./client/game-client.ts"` continues to work for all 22 consumers

---

## Component: src/tui/key-layer/ (index.ts → 5 files)

### Step 5: Create direction.ts

- [x] Move `DIRECTION_KEYS`, `findDirectionValue`, `directionEnabled`, `makeDirectionHandler`, `directionKeyChar`
- [x] Re-export from index.ts

### Step 6: Create handlers.ts

- [x] Move handler functions: `handleRoomAction`, `handleEntitySelect`, `handleEntityAction`, `handleInventoryKey`, `handleQuestSelect`, `handleDialogueOption`, `handleDialogueTabLeft`, `handleDialogueTabRight`, `handleDialogueEscape`
- [x] Import `getDialogueVisibleOptions` from `../client/dialogue-state.ts` (was from `game-client.ts`)

### Step 7: Create actions.ts

- [x] Move `getEntityActions`, `getInventoryActions`, `actionColor`, `capabilityTargets`, `capabilityLabel`
- [x] Import `getEventStyle` from `../theme/event-style.ts`

### Step 8: Create layers.ts

- [x] Move all 14 KeyLayer constants: `BASE_LAYER` through `COMBAT_LAYER`
- [x] Import helper references (directionEnabled, capEnabled, handleRoomAction, etc.) from their new locations
- [x] Keep `ALL_LAYERS` registry map here

### Step 9: Simplify key-layer/index.ts

- [x] Keep: `KeyBinding`, `KeyLayer` types, stack management (`pushLayer`, `popLayer`, `hasLayer`, `activeLayer`, `getLayerStack`), `dispatchKey`, `matchKey`, `getGlobalBindings`
- [x] Re-export everything from `./direction.ts`, `./handlers.ts`, `./actions.ts`, `./layers.ts`

---

## Component: src/tui/panels/sidebar/ (sidebar.tsx → 3 files)

### Step 10: Create role-card.tsx

- [x] Extract `RoleCard` — connection indicator, character name, date, weapon, and armor
- [x] Accept props needed by current `Sidebar`, including width and height values

### Step 11: Create status-card.tsx

- [x] Extract `StatusCard` — needs and top traits
- [x] Keep need labels and trait names sourced from current entity data

### Step 12: Create action-bar.tsx

- [x] Extract `ActionBar` — wrapped global action key hints
- [x] Keep `bindingLabel()` and `getGlobalBindings()` behavior unchanged

### Step 13: Simplify sidebar.tsx

- [x] Import `RoleCard`, `StatusCard`, and `ActionBar` instead of defining them inline
- [x] Keep current layout sizing, disabled state, and composition in sidebar.tsx
- [x] If `displayWidth`/`isWideCharacter` are shared by ActionBar, move them to `sidebar-format.ts`

---

## Component: src/tui/panels/dialogue/ (dialogue-panel.tsx → 3 files)

### Step 14: Create chat-dialogue.tsx

- [x] Extract `ChatDialoguePanel` — chat tab content with history + options
- [x] Accept props: `{ state: DialogueState, metrics: ModalMetrics }`

### Step 15: Create trade-dialogue.tsx

- [x] Extract `TradeDialoguePanel` — trade tab content
- [x] Accept props: `{ state: DialogueState, metrics: ModalMetrics }`

### Step 16: Simplify dialogue-panel.tsx

- [x] Import `ChatDialoguePanel` and `TradeDialoguePanel`
- [x] Keep tab switch logic and InteractionPanel layout in dialogue-panel.tsx

---

## Component: src/tui/panels/room/ (room-panel.tsx → 4 files)

### Step 17: Create room-action-list.tsx

- [x] Extract `RoomActionList` component
- [x] Accept props: `{ actions: RoomAction[], ... }`

### Step 18: Create exit-list.tsx

- [x] Extract `ExitList` component

### Step 19: Create entity-list.tsx

- [x] Extract `EntityList` component

### Step 20: Simplify room-panel.tsx

- [x] Import extracted components instead of defining them inline
- [x] Keep main room layout (name, description, border box, scrollbox) in room-panel.tsx

---

## Tests

This is a pure structural refactoring with zero behavior change. No new behavior tests are required, but existing TUI tests must keep passing.

### Verification commands

- [x] Run `npm run lint` — typecheck, biome, and dependency-cruiser
- [x] Run `npm test` — all existing tests pass

## Manual Checks

- [ ] Run `npm run dev:tui` at 80x24 and 120x40 — no visual regressions
