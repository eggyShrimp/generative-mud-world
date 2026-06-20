# world-tui Specification

## Purpose
Defines TUI behavior for player-facing world interactions.

## Requirements
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

### Requirement: Status message carries time environment labels

The server MUST send current period, season, and weather labels in the existing status message so the TUI can render environment state without importing engine modules.

#### Scenario: Status includes environment labels

- **GIVEN** the world has current period, season, and weather state
- **AND** ContentPool contains matching labels
- **WHEN** the server sends a `status` message
- **THEN** the message includes `period`, `season`, and `weatherLabel`
- **TEST** `src/__tests__/ws-server.test.ts`: status message includes environment labels

#### Scenario: TUI does not import engine modules

- **GIVEN** the TUI renders status information
- **WHEN** environment labels are displayed
- **THEN** TUI components read only `StatusMessage` fields
- **AND** they do not import from engine, combat, simulation, llm, or core modules
- **TEST** `npx depcruise src`: boundary rules stay green

### Requirement: Visible status area displays environment labels without hiding existing status

The TUI visible status area MUST show season and weather while preserving existing status information (date, connection state).

#### Scenario: Wide status area renders environment labels

- **GIVEN** the TUI is rendered at a wide terminal width
- **AND** the latest status message includes `season` and `weatherLabel`
- **WHEN** the status area renders
- **THEN** date, season, weather, and connection state are visible
- **TEST** `src/__tests__/role-card.test.ts`: wide status render

#### Scenario: Narrow status area avoids overlap

- **GIVEN** the TUI is rendered at narrow terminal width
- **AND** the latest status message includes `season` and `weatherLabel`
- **WHEN** the status area renders
- **THEN** text does not overlap
- **AND** existing critical status (name, date, connection) remains visible
- **TEST** `src/__tests__/role-card.test.ts`: narrow status render

### Requirement: All public symbols remain importable

The refactoring is purely structural — every type, function, and component exported by `game-client.ts` and `key-layer/index.ts` must remain importable from the original paths.

#### Scenario: Existing imports compile without errors

- **GIVEN** a file that imports `{ GameClient, createGameClient, LogEntry, DialogueState }` from `./client/game-client`
- **WHEN** the refactoring is applied
- **THEN** the import resolves correctly at compile time
- **AND** `npm run lint` passes with no import-related errors

#### Scenario: Key-layer exports compile without errors

- **GIVEN** a file that imports `{ dispatchKey, pushLayer, popLayer, hasLayer, getEntityActions, DIRECTION_KEYS }` from `../key-layer`
- **WHEN** the refactoring is applied
- **THEN** the import resolves correctly at compile time

### Requirement: GameClient interface is unchanged

The `GameClient` interface is the contract between panels and the state machine. It must not change.

#### Scenario: Interface contract preserved

- **GIVEN** the `GameClient` interface definition
- **WHEN** the refactoring is applied
- **THEN** all method signatures, signal types, and property names remain identical
- **AND** all 22 consumers continue to type-check without changes

### Requirement: Component rendering output is unchanged

Components split into sub-components must produce identical terminal output.

#### Scenario: RoomPanel sub-components render identically

- **GIVEN** the same `client` and `entities` props
- **WHEN** the old inline sub-components are replaced with extracted files
- **THEN** the rendered output of `RoomPanel` is identical

#### Scenario: DialoguePanel sub-components render identically

- **GIVEN** the same `client` and `metrics` props
- **WHEN** the old inline `ChatDialoguePanel` and `TradeDialoguePanel` are extracted to separate files
- **THEN** the rendered output of `DialoguePanel` is identical

#### Scenario: Sidebar sub-components render identically

- **GIVEN** the same `client`, `width`, and `height` props
- **WHEN** the old inline character info and action bar sections are extracted to separate files
- **THEN** the rendered output of `Sidebar` is identical

### Requirement: Existing verification passes

The existing test suite must continue to pass.

#### Scenario: Lint and tests pass

- **GIVEN** the existing test suite
- **WHEN** `npm run lint` and `npm test` are executed
- **THEN** both commands pass
- **AND** dependency-cruiser reports no `tui-no-direct-engine-import` violation

### Requirement: Player can request follow-up options from selected NPC text

The TUI MUST let the player select NPC dialogue text and press `F` to request follow-up options.

#### Scenario: Press F with selected text

- **GIVEN** a dialogue panel is open
- **AND** the user has selected non-empty NPC text
- **WHEN** the user presses `F`
- **THEN** `KeyboardController` stashes the selected text on the client
- **AND** the dialogue key handler pops that stashed text
- **AND** the client sends `request_follow_up_options`
- **AND** the message includes the current NPC id and selected text
- **TEST** `src/__tests__/game-client.test.ts`: request sends the correct protocol message

#### Scenario: Press F without selected text

- **GIVEN** a dialogue panel is open
- **AND** no text is selected
- **WHEN** the user presses `F`
- **THEN** the client does not send `request_follow_up_options`
- **AND** no follow-up mode is entered
- **AND** existing dialogue options remain unchanged
- **AND** the event log shows `"请先选中一句 NPC 的话。"`
- **TEST** `src/__tests__/game-client.test.ts`: no websocket send and no option replacement

#### Scenario: Press F while another request is active

- **GIVEN** a dialogue panel is open
- **AND** another request is active
- **WHEN** the user presses `F` with selected text
- **THEN** no follow-up request is sent
- **AND** existing dialogue options remain unchanged
- **AND** the event log shows the existing active-request feedback
- **TEST** `src/__tests__/game-client.test.ts`: active request blocks follow-up request

### Requirement: Follow-up options reuse the existing dialogue option UI

The TUI MUST display returned follow-up options in the existing dialogue option area using existing numbered option controls.

#### Scenario: Follow-up request enters loading state

- **GIVEN** the user requests follow-up options
- **WHEN** the request is sent
- **THEN** the chat tab enters loading state
- **AND** the existing loading hint is shown
- **TEST** `src/__tests__/dialogue-panel.test.tsx`: loading hint appears

#### Scenario: Returned options render as normal numbered options

- **GIVEN** the server returns `follow_up_options`
- **WHEN** the client handles the message
- **THEN** the chat tab loading state clears
- **AND** the returned options replace current chat options
- **AND** the panel shows `追问："{context}"` above the returned options
- **AND** the panel renders the options through existing numbered `KeyHint` UI
- **TEST** `src/__tests__/dialogue-panel.test.tsx`: returned labels appear with numeric hints

#### Scenario: Empty returned options restore previous choices

- **GIVEN** the user requests follow-up options from selected text
- **AND** the previous chat options are captured
- **WHEN** the server returns `follow_up_options` with no options
- **THEN** chat loading clears
- **AND** previous chat options are restored
- **AND** the event log shows `"没有合适的追问方向。"`
- **TEST** `src/__tests__/game-client.test.ts`: empty follow-up response restores previous options

#### Scenario: Stale returned options are ignored

- **GIVEN** a follow-up request is pending
- **WHEN** the user closes dialogue or switches to a different NPC before the response arrives
- **THEN** the returned `follow_up_options` are ignored
- **AND** no options are applied to the current dialogue
- **TEST** `src/__tests__/game-client.test.ts`: stale response does not replace current options

#### Scenario: Choosing a follow-up option uses existing number keys

- **GIVEN** follow-up options are visible
- **WHEN** the user presses `1`
- **THEN** the client calls existing `chooseDialogueOption()` for the first option
- **AND** no follow-up-specific choose path is used
- **TEST** `src/__tests__/key-layer.test.ts`: dialogue `1-9` behavior is unchanged

### Requirement: The TUI does not add follow-up selection mode

The follow-up interaction MUST NOT add a separate mode for selecting historical messages by number.

#### Scenario: History remains normal text

- **GIVEN** the dialogue panel contains prior messages
- **WHEN** the panel renders before, during, or after a follow-up request
- **THEN** history messages do not show `[1]`, `[2]`, or other selection numbers
- **AND** numeric keys continue to select current dialogue options
- **TEST** `src/__tests__/dialogue-panel.test.tsx`: history has no selection markers

#### Scenario: F never toggles a persistent mode

- **GIVEN** a dialogue panel is open
- **WHEN** the user presses `F`
- **THEN** the client either sends a follow-up request from selected text or shows no-selection feedback
- **AND** it does not store persistent `followUpMode`
- **TEST** `src/__tests__/game-client.test.ts`: dialogue state has no follow-up mode transition

### Requirement: EntityDetailPopup renders entity info + actions in a split layout

The `EntityDetailPopup` SHALL use a lightweight target popup to display entity metadata (typeLabel, description) and available actions in separate areas divided by a border.

#### Scenario: Item entity with typeLabel and description

- **GIVEN** a `RoomEntity` with `type: "item"`, `typeLabel: "物品"`, `description: "一块干硬的面包"`
- **WHEN** `EntityDetailPopup` renders with this entity
- **THEN** the content area SHALL contain `typeLabel` and `description`
- **AND** the interaction area SHALL contain the action list from `getEntityActions`
- **AND** the two areas SHALL be separated by a border-top divider
- **VERIFY** `src/__tests__/entity-detail-popup.test.tsx`

#### Scenario: Item entity with properties

- **GIVEN** a `RoomEntity` with `type: "item"`, `properties: { weapon: true, atkBonus: 5 }`
- **AND** `client.itemPropertyLabels()` returns `{ weapon: "武器", atkBonus: "攻击" }`
- **WHEN** `EntityDetailPopup` renders with this entity
- **THEN** the content area SHALL contain a properties line "武器，攻击：5"
- **AND** the properties line SHALL appear after description and before the divider
- **VERIFY** `src/__tests__/entity-detail-popup.test.tsx`

#### Scenario: Item entity without properties

- **GIVEN** a `RoomEntity` with `type: "item"`, `properties: undefined` or `properties: {}`
- **WHEN** `EntityDetailPopup` renders with this entity
- **THEN** no properties line is rendered
- **AND** no crash or empty line appears
- **VERIFY** `src/__tests__/entity-detail-popup.test.tsx`

#### Scenario: Entity is null

- **GIVEN** `entity` prop is `null`
- **WHEN** `EntityDetailPopup` renders
- **THEN** no popup is rendered
- **VERIFY** `src/__tests__/entity-detail-popup.test.tsx`

#### Scenario: Action click executes and closes selected target

- **GIVEN** a `RoomEntity` with an available action rendered as a `KeyHint`
- **WHEN** the player clicks that action
- **THEN** the action SHALL execute through the same `action.run` path as keyboard selection
- **AND** `selectedEntityId` SHALL be cleared
- **VERIFY** `src/__tests__/entity-detail-popup.test.tsx`

### Requirement: Rendering tests are executable

The TUI project SHALL provide an explicit runnable entry for `.test.tsx` rendering tests.

#### Scenario: Existing rendering test runs through the rendering test entry

- **GIVEN** an existing rendering test such as `src/__tests__/event-log.test.tsx`
- **WHEN** the rendering test command documented by this change is run
- **THEN** the test SHALL execute instead of being skipped by the default Vitest include pattern
- **VERIFY** command output from the chosen rendering test entry

### Requirement: RoomPanel routes item entities to EntityDetailPopup

When `RoomPanel` renders and `selectedEntity.type === "item"`, it SHALL render `EntityDetailPopup` instead of `TargetActionPopup`.

#### Scenario: Item entity selected

- **GIVEN** the player selects an entity with `type: "item"` in the room
- **WHEN** `RoomPanel` renders with `selectedEntity` set to that item entity
- **THEN** `EntityDetailPopup` SHALL be rendered
- **AND** `TargetActionPopup` SHALL NOT be rendered
- **VERIFY** `src/__tests__/room-panel.test.tsx`

#### Scenario: Non-item entity selected

- **GIVEN** the player selects an entity with `type: "npc"` (without talk capability) in the room
- **WHEN** `RoomPanel` renders with `selectedEntity` set to that entity
- **THEN** `TargetActionPopup` SHALL be rendered
- **AND** `EntityDetailPopup` SHALL NOT be rendered
- **VERIFY** `src/__tests__/room-panel.test.tsx`

### Requirement: EntityDetailPopup handles loading state

When the client has an active request, `EntityDetailPopup` SHALL display a loading hint and SHALL NOT render action list.

#### Scenario: Loading state active

- **GIVEN** the client `hasActiveRequest()` returns `true`
- **WHEN** `EntityDetailPopup` renders with a valid entity
- **THEN** the content area SHALL display `LoadingHint`
- **AND** the interaction area SHALL be empty or hidden
- **VERIFY** `src/__tests__/entity-detail-popup.test.tsx`

### Requirement: TargetActionPopup behavior is preserved

Existing `TargetActionPopup` SHALL remain unchanged in rendering and behavior for non-item entities.

#### Scenario: NPC entity (no talk capability) still uses TargetActionPopup

- **GIVEN** a selected NPC entity without `talk` capability
- **WHEN** the player interacts with it through `TargetActionPopup`
- **THEN** the component SHALL render with entity name as title
- **AND** actions SHALL be listed as flat `KeyHint` items
- **AND** clicking an action SHALL execute it and clear `selectedEntityId`
- **VERIFY** `src/__tests__/room-panel.test.tsx`
