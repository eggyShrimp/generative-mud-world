## MODIFIED Requirements

### Requirement: EntityDetailPopup renders entity info + properties + actions in a split layout

The `EntityDetailPopup` SHALL display entity metadata (typeLabel, description), formatted item properties, and available actions in a split layout. Item properties SHALL appear between the description and the action divider.

#### Scenario: Item entity with properties

- **GIVEN** a `RoomEntity` with `type: "item"`, `typeLabel: "物品"`, `description: "一把锈迹斑斑的铁剑"`, `properties: { weapon: true, atkBonus: 5 }`
- **AND** `client.itemPropertyLabels()` returns `{ weapon: "武器", atkBonus: "攻击" }`
- **WHEN** `EntityDetailPopup` renders with this entity
- **THEN** the content area SHALL contain `typeLabel`, `description`, and a properties line "武器，攻击：5"
- **AND** the properties line SHALL appear after description and before the divider
- **AND** the interaction area SHALL contain the action list from `getEntityActions`
- **VERIFY** `src/__tests__/entity-detail-popup.test.tsx`

#### Scenario: Item entity without properties

- **GIVEN** a `RoomEntity` with `type: "item"`, `properties: undefined` or `properties: {}`
- **WHEN** `EntityDetailPopup` renders with this entity
- **THEN** no properties line is rendered
- **AND** the content area SHALL display `typeLabel` and `description` as before
- **AND** no crash or empty line appears
- **VERIFY** `src/__tests__/entity-detail-popup.test.tsx`

#### Scenario: Entity is null (regression)

- **GIVEN** `entity` prop is `null`
- **WHEN** `EntityDetailPopup` renders
- **THEN** no popup is rendered
- **VERIFY** `src/__tests__/entity-detail-popup.test.tsx` (existing test preserved)
