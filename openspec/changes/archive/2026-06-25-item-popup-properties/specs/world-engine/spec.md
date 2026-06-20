## MODIFIED Requirements

### Requirement: Room entities include item properties

The `getRoomEntitiesInfo` function SHALL include `properties` in the returned entity info for item-type entities.

#### Scenario: Item entity in room carries properties

- **GIVEN** a room contains an item entity with `type: "item"` and `properties: { weapon: true, atkBonus: 5 }`
- **WHEN** `getRoomEntitiesInfo(world, roomId)` is called
- **THEN** the returned entry for that item SHALL include `properties` field matching the entity's `ItemEntity.properties`
- **VERIFY** `src/__tests__/engine.test.ts`

#### Scenario: Non-item entity does not carry properties

- **GIVEN** a room contains an NPC entity with `type: "npc"`
- **WHEN** `getRoomEntitiesInfo(world, roomId)` is called
- **THEN** the returned entry for that NPC SHALL NOT include a `properties` field (or be `undefined`)
- **VERIFY** `src/__tests__/engine.test.ts`

#### Scenario: Item entity with empty properties

- **GIVEN** a room contains an item entity with `type: "item"` and `properties: {}`
- **WHEN** `getRoomEntitiesInfo(world, roomId)` is called
- **THEN** the returned entry SHALL include `properties: {}`
- **VERIFY** `src/__tests__/engine.test.ts`
