# Design: clue-system

## Scope

This document describes the umbrella design for clue-driven interaction. Implementation must split the work into a `world-yaml` change and a `world-engine` change.

This design does not implement public reveal. Public reveal means that one player's action changes the shared world for every player. This design only implements personal discovery: a player can discover a hidden entity for themselves.

## Terms

| Term | Definition |
|------|------------|
| `ClueDefinition` | A ContentPool record that describes a hidden fact in the world and which NPCs know it. |
| `KnownClue` | A player-owned runtime record that says the player has learned a clue. |
| `DiscoverableCondition` | An entity or exit condition that requires a clue before the player can find or use it. |
| `DiscoverableChange` | A SimulationDelta entry that records personal discovery of a hidden entity. |

## Data Flow

### Flow A: ContentPool data

```text
worlds/content-pool/social-dialogue.yaml
  -> content-pool-loader.ts validates clueDefinitions
  -> world.contentPool.clueDefinitions
  -> dialogue-generator.ts and command-executor.ts read clueDefinitions
```

`clueDefinitions` is world data. Engine code must not construct fallback clue data.

### Flow B: Clue acquisition

```text
Player selects an idle_chat option
  -> dialogue-generator.ts builds prompt with NPC known clues
  -> LLM may call share_information({ clue_id })
  -> dialogue-generator.ts validates:
       1. clue_id exists in world.contentPool.clueDefinitions
       2. clue.knownByNpcIds includes current NPC id
  -> processToolCalls returns SimulationDelta.knownClueChanges
  -> act-loop.ts composes deltas
  -> world.ts applyDelta writes PlayerEntity.knownClues
  -> deltaToEvents / logEvent reports "获得线索"
```

`share_information` without `clue_id` keeps the current behavior. It creates an information `WorldEvent` but does not create a `KnownClue`.

### Flow C: Personal discovery

```text
Player executes a search-like room action
  -> command-executor.ts runs the normal room action
  -> command-executor.ts scans current room entities
  -> for each entity with discoverable.requiredClueId:
       check player.knownClues contains requiredClueId
       check player.discoveredEntities does not already contain entityId
  -> matching entities produce SimulationDelta.discoverableChanges
  -> world.ts applyDelta writes PlayerEntity.discoveredEntities
  -> command result includes discovery event text
```

This flow does not remove `ItemEntity.discoverable`. The item still carries the rule that says the item is normally hidden.

### Flow D: Interaction gate

```text
deriveCapabilities(world, playerId)
  -> filter move directions:
       hidden exit with clue condition is visible only when player has the clue
  -> filter look/take targets:
       discoverable entity is visible only when player.discoveredEntities contains entityId

getRoomEntitiesInfo(world, roomId, playerId)
  -> hide discoverable entities that player has not discovered

executeMove(world, playerId, direction)
  -> if exit.hidden has clue condition:
       allow only when player.knownClues contains clueId
  -> otherwise keep existing behavior
```

Room state becomes player-specific at read time. `src/server/ws-server.ts` must pass the active player ID into `getRoomEntitiesInfo`.

### Flow E: Persistence

```text
PlayerEntity.knownClues and PlayerEntity.discoveredEntities
  -> must survive manual save and reload
```

If entity state is not currently captured by SaveData, the engine change must extend SaveData through `SaveManager.capture()` and `SaveManager.restore()`. The implementation must not rely on in-memory player fields only.

## ContentPool Integration

### New field

`ContentPool.clueDefinitions: ClueDefinition[]`

Suggested shape:

```ts
interface ClueDefinition {
  id: string;
  summary: string;
  description: string;
  knownByNpcIds: EntityId[];
  relatedRoomId?: RoomId;
  relatedEntityIds?: EntityId[];
  tags?: string[];
}
```

`summary` is short text for prompt injection and event display. `description` is the full internal content fact. Engine code should use `id` for checks, not compare text.

### YAML domain

Use `social-dialogue` for the first version because NPC dialogue consumes the field directly. If lore grows beyond dialogue, a later change can move it to a dedicated `lore` or `world-knowledge` domain.

### LLM-evolvable?

Yes, but implementation can phase this:

| Phase | Requirement |
|-------|-------------|
| Phase 1 | Load static `clueDefinitions` from YAML. |
| Phase 2 | Add `addClueDefinitions` mutation, materializer support, and evolve write-back. |

If Phase 1 skips LLM evolution, the `world-yaml` tasks must mark mutation, materializer, and write-back as deferred instead of half-implementing them.

## State Mutation Path

### knownClueChanges

```ts
interface KnownClueChange {
  playerId: EntityId;
  clueId: string;
  sourceNpcId?: EntityId;
}
```

`applyDelta` behavior:

1. Find `playerId`.
2. Reject the change if the entity is not a player.
3. Skip duplicates when `player.knownClues` already contains `clueId`.
4. Push `{ clueId, sourceNpcId, learnedAt: world.tick }`.
5. Emit or preserve an event that reports the new clue.

### discoverableChanges

```ts
interface DiscoverableChange {
  playerId: EntityId;
  entityId: EntityId;
  operation: "discover";
}
```

`applyDelta` behavior:

1. Find `playerId`.
2. Reject the change if the entity is not a player.
3. Find `entityId`.
4. Reject the change if the entity does not exist or does not have `discoverable`.
5. Skip duplicates when `player.discoveredEntities` already contains `entityId`.
6. Push `entityId` into `player.discoveredEntities`.

Do not implement this through `itemChanges`. `itemChanges` currently targets inventory owners and only supports quantity changes. Discoverability targets an entity's visibility for one player.

## Discovery Rules

Search-like room actions should use ContentPool data to decide which actions count as search. The first implementation can use an explicit `properties.discoveryAction === true` or action effect metadata if such metadata already exists. Do not hardcode a list such as `["search", "explore"]` in engine code.

Discovery succeeds when all conditions are true:

- The actor is a player.
- The entity is in the player's current room.
- The entity has `discoverable.requiredClueId`.
- The player has a matching `KnownClue`.
- The player has not already discovered that entity.

Discovery should not consume the clue.

## Hidden Exit Rules

An exit can use an existing `conditions` entry with `type: "clue"` and `value: clueId`.

Read-time behavior:

- `deriveCapabilities` hides the direction until the player knows the clue.
- Room exit details sent to the client hide the exit until the player knows the clue.

Execution behavior:

- `executeMove` rejects movement when the player lacks the clue.
- `executeMove` allows movement when the player knows the clue.

The move check must exist even if the UI hides the direction. Server-side execution remains authoritative.

## Trap Token Verification

| File | Trap Checked | Status |
|------|-------------|--------|
| `src/llm/dialogue-generator.ts` | no-direct-world-mutation | Must return `knownClueChanges`; must not push to player directly |
| `src/engine/command-executor.ts` | no-direct-world-mutation | Must return `discoverableChanges`; must not mutate player directly |
| `src/engine/command-executor.ts` | no-hardcoded-description-text | Must use ContentPool templates or existing command messages |
| `src/engine/command-executor.ts` | no hardcoded action list | Must use ContentPool metadata to identify discovery actions |
| `src/core/world.ts` | no-create-default-outside-world | Defaults only in `createPlayer` and `createDefaultContentPool` |
| `src/engine/capability-provider.ts` | no-direct-world-mutation | Read-only filtering |

## Test Plan

Add focused tests before or with implementation:

| Test file | Coverage |
|-----------|----------|
| `src/__tests__/dialogue-generator.test.ts` | `share_information` with valid `clue_id` creates `knownClueChanges`; unknown clue is ignored; clue known by another NPC is ignored; missing `clue_id` keeps existing behavior |
| `src/__tests__/world.test.ts` | `applyDelta` writes `knownClues`; skips duplicates; writes `discoveredEntities`; rejects non-player targets and invalid hidden entities |
| `src/__tests__/round-engine.test.ts` or `src/__tests__/integration/dialogue-pipeline.test.ts` | Conversation delta flows through act-loop into player state |
| `src/__tests__/integration/room-actions.test.ts` | Search-like action discovers matching hidden entity and leaves nonmatching hidden entity invisible |
| `src/__tests__/capability-provider.test.ts` | Hidden entities are excluded from look/take/entity list until discovered; clue-gated exits are hidden until known |
| `src/__tests__/integration/multiplayer-ws.test.ts` | Two players in the same room can see different hidden-entity visibility |
| `src/__tests__/integration/multi-day-persistence.test.ts` | Known clues and discovered entities survive save and reload if SaveData owns runtime persistence |

Existing tests for `share_information`, entity list layout, room actions, move, and quest discovery must continue to pass when no clue data exists.
