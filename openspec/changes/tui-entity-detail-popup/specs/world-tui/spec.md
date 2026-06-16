## ADDED Requirements

### Requirement: EntityDetailPopup renders entity info + actions in a split layout

The `EntityDetailPopup` SHALL use a lightweight target popup to display entity metadata (typeLabel, description) and available actions in separate areas divided by a border.

The popup SHALL remain a target context menu, not an independent full modal flow.

#### Scenario: Item entity with typeLabel and description

- **GIVEN** a `RoomEntity` with `type: "item"`, `typeLabel: "物品"`, `description: "一块干硬的面包"`
- **WHEN** `EntityDetailPopup` renders with this entity
- **THEN** the content area SHALL contain `typeLabel` and `description`
- **AND** the interaction area SHALL contain the action list from `getEntityActions`
- **AND** the two areas SHALL be separated by a border-top divider
- **AND** the popup SHALL NOT use full modal sizing reserved for independent flows
- **VERIFY** `src/__tests__/entity-detail-popup.test.tsx`

#### Scenario: Item entity missing typeLabel

- **GIVEN** a `RoomEntity` with `type: "item"`, `typeLabel: undefined`, `description: "一块干硬的面包"`
- **WHEN** `EntityDetailPopup` renders with this entity
- **THEN** the content area SHALL show description without crashing
- **AND** no typeLabel text is rendered
- **VERIFY** `src/__tests__/entity-detail-popup.test.tsx`

#### Scenario: Entity with both typeLabel and description missing

- **GIVEN** a `RoomEntity` with `type: "item"`, `typeLabel: undefined`, `description: undefined`
- **WHEN** `EntityDetailPopup` renders with this entity
- **THEN** the content area SHALL render without error (empty or minimal)
- **AND** the interaction area SHALL still show available actions
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

The TUI project SHALL provide an explicit runnable entry for `.test.tsx` rendering tests because the default Node Vitest config only includes `.test.ts` files.

#### Scenario: Existing rendering test runs through the rendering test entry

- **GIVEN** an existing rendering test such as `src/__tests__/event-log.test.tsx`
- **WHEN** the rendering test command documented by this change is run
- **THEN** the test SHALL execute instead of being skipped by the default Vitest include pattern
- **AND** it SHALL not fail on JSX runtime loading
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

When the client has an active request, `EntityDetailPopup` SHALL display a loading hint in the content area and SHALL NOT render action list in the interaction area.

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
- **VERIFY** `src/__tests__/room-panel.test.tsx` or `src/__tests__/target-action-popup.test.tsx`
