# Design: save-data-layer

## Scope

This design defines a persistence layer for runtime data. Runtime data means state produced while the game runs, such as dialogue summaries, player progress, quest state, world time, relationships, and inventories.

This design does not move ContentPool into SaveData. ContentPool remains the content database for rules, labels, templates, and LLM-evolved world content. SaveData becomes the runtime database for save slots.

## Core Model

Treat `ContentPool` and `SaveData` as two special databases:

| Database | Stores | Backing files | Main reader | Main writer |
|----------|--------|---------------|-------------|-------------|
| `ContentPool` | Content facts, rules, labels, prompts, templates | YAML under `worlds/*/content-pool/` | Engine, TUI, prompt builders | Designers and LLM evolution |
| `SaveData` | Runtime facts, player/world progress, summaries | JSON under save slots | Engine services | Runtime systems |

Both databases need stable data access objects (DAO). A DAO hides file shape and field layout behind domain methods. Callers ask domain questions instead of reading nested objects directly.

## Principles

The persistence layer follows these rules:

1. Business code must not mutate `save.data` directly.
2. Business code must not depend on JSON field layout.
3. Each SaveData section exposes a small DAO with domain methods.
4. `SaveManager` owns file I/O, schema validation, versioning, meta updates, and atomic writes.
5. `restore(world)` is the only full restore entry.
6. `capture(world)` is the only full snapshot entry.
7. Immediate feature writes, such as dialogue summaries, must use explicit section methods.
8. Tests must use an injected temporary save directory, never the real `saves/` directory.

## Proposed API

The first version keeps the API small but leaves a clear extension path.

```ts
const saves = SaveManager.load({
  slotId,
  worldId,
  rootDir: process.env.SAVE_DIR ?? "saves",
  currentTick: world.tick,
  currentRound: world.round,
});

saves.conversations.getSummary(playerId, npcId);
saves.conversations.setSummary(playerId, npcId, summary, world.tick);

saves.capture(world);
saves.save();
saves.restore(world);
```

`SaveManager` should expose section DAOs instead of raw mutable data:

```ts
class SaveManager {
  readonly conversations: ConversationSaveDao;

  static load(options: SaveLoadOptions): SaveManager;
  save(): void;
  capture(world: WorldState): void;
  restore(world: WorldState): void;
  getMeta(): SaveMeta;
}
```

The `data` getter may exist only for tests or debugging. If kept, it should return a readonly view or a deep clone.

## SaveData Shape

The first schema stores metadata and conversation summaries:

```ts
interface SaveData {
  version: 1;
  meta: {
    slotId: string;
    worldId: string;
    savedAt: number;
    gameTick: number;
    round: number;
  };
  conversations: {
    summaries: Record<string, ConversationSummaryEntry[]>;
  };
}
```

`version` is required because SaveData will grow. Future migrations should run at load time and produce the latest schema before DAOs access data.

## DAO Responsibilities

`SaveManager` owns database-level work:

- Select the save file from `rootDir`, `worldId`, and `slotId`.
- Load JSON and validate it with zod.
- Reject saves with a mismatched `worldId`.
- Migrate older SaveData versions.
- Update `meta.savedAt`, `meta.gameTick`, and `meta.round`.
- Write files atomically through a temporary file and rename.
- Provide `capture(world)` and `restore(world)` orchestration.

`ConversationSaveDao` owns conversation runtime facts:

- Build the stable key for a player-NPC pair.
- Read the latest summary for a pair.
- Store a new summary for a pair.
- Keep or prune summary history according to policy.
- Never call LLM and never write files directly.

The dialogue system owns dialogue behavior:

- Keep full multi-turn history in memory during the active conversation.
- Ask the LLM for a summary after the user closes the conversation.
- Store the summary through `saves.conversations.setSummary(...)`.
- Inject the latest saved summary into future dialogue prompts.

## Conversation Flow

### Conversation Start

```
Player selects NPC/topic
  -> RoundEngine handles talk
  -> DialogueGenerator.generateIdleChatReply()
  -> saves.conversations.getSummary(playerId, npcId)
  -> ContentPool DAO reads summary label/prompt text
  -> build prompt with summary when one exists
  -> LLM generates NPC reply
```

### Conversation Close

The close path must not wait for summary generation:

```
Player selects "告别"
  -> server returns the close result immediately
  -> client releases active request
  -> background task summarizes the in-memory conversation
  -> background task writes summary through ConversationSaveDao
  -> SaveManager.save() writes JSON
```

Background summary failure only writes a warning log. The player has already closed the dialogue, so summary failure must not block the command result or reopen UI state.

If a player immediately starts another conversation with the same NPC, the newest summary may not be ready yet. That is acceptable for the first version. If this becomes visible, add a per-pair queue keyed by `playerId:npcId` so summary writes cannot finish out of order.

## Server Lifecycle

Startup loads both databases:

```
loadWorldFromYaml(worldFile)       -> WorldState + ContentPool
resolveSaveSlot(config)            -> selected slotId
SaveManager.load(options)          -> SaveData + Save DAOs
new DialogueGenerator(adapter, saves)
```

Shutdown captures current world metadata before writing:

```
saveManager.capture(world)
saveManager.save()
process.exit(0)
```

`capture(world)` updates `gameTick` and `round` in the first version. Later versions can add world time, player state, quest state, and other sections.

## Save Slot Selection

The runtime should support save slot selection, but development should not pay an extra interaction cost on every launch.

Use these startup modes:

| Mode | Config | Behavior |
|------|--------|----------|
| Skip selection | `SAVE_SELECT=skip` or default dev config | Load `SAVE_SLOT` directly. If no file exists, create it. |
| Prompt selection | `SAVE_SELECT=prompt` | Ask the client or terminal startup flow to choose a slot before loading SaveData. |
| New slot | explicit UI action | Create a new slot for the current `worldId`. |

The first implementation may keep startup selection outside the TUI and use `SAVE_SLOT`. The TUI save panel can still list slots and save the current slot. Runtime slot switching should wait until `restore(world)` can rebuild WorldState safely.

Do not add in-game "load slot" until full restore is implemented. Showing a load option before full restore exists would imply that the whole world can be replaced, but the first version only restores metadata and conversation summaries.

## TUI Save Panel

Add a Save panel after the SaveData API is stable. The panel should support manual save and slot inspection.

The Save panel uses a two-column layout similar to the trade panel:

| Column | Content |
|--------|---------|
| Left column | Save slots, keyed actions, and current-slot marker |
| Right column | Details for the selected slot: world id, saved time, tick, round, summary counts, version, and validation status |

First-version actions:

- `保存当前进度`: call the server manual-save command for the active slot.
- `刷新列表`: request the latest slot list from the server.
- `新建存档`: create a new slot name and save current state.

Deferred actions:

- `读取存档`: wait until `restore(world)` can restore full world state.
- `切换存档`: wait until the server can rebuild world state and push a full client refresh.

The server should expose save operations through protocol messages instead of letting TUI import `SaveManager`.

Suggested protocol shape:

```ts
type SaveSlotInfo = {
  slotId: string;
  worldId: string;
  savedAt: number;
  gameTick: number;
  round: number;
  version: number;
  isCurrent: boolean;
};

// client -> server
{ type: "request_save_slots" }
{ type: "manual_save" }
{ type: "create_save_slot", slotId: string }

// server -> client
{ type: "save_slots", slots: SaveSlotInfo[] }
{ type: "save_result", ok: boolean, slot?: SaveSlotInfo, error?: string }
```

The key rule is the same as the DAO rule: TUI sees protocol DTOs, not `SaveData`.

## ContentPool DAO Integration

The dialogue feature also reads two ContentPool values:

| Field | DAO method | Purpose |
|-------|------------|---------|
| `narrativeTemplates.conversationSummaryPrompt` | `content.narrative.getConversationSummaryPrompt()` | Prompt template for generating one-sentence summaries |
| `narrativeTemplates.conversationSummaryLabel` | `content.narrative.getConversationSummaryLabel()` | Label injected into dialogue prompt before saved summary |

If a ContentPool DAO does not exist yet, the first implementation may read `world.contentPool.narrativeTemplates` directly. Do not spread fallback strings across consumers. Keep the fallback at one access point.

## Adding SaveData Fields

New SaveData fields follow one path:

1. Add the TypeScript type.
2. Add or update the zod schema.
3. Add a migration from the previous version.
4. Add a section DAO, for example `quests`, `players`, or `worldClock`.
5. Add `capture(world)` logic if the field snapshots WorldState.
6. Add `restore(world)` logic if the field restores WorldState.
7. Add focused tests for load, save, capture, restore, and malformed data.
8. Keep callers on DAO methods. Do not expose raw nested mutation.

## Storage Rules

The save root must be configurable:

```ts
type SaveLoadOptions = {
  rootDir: string;
  slotId: string;
  worldId: string;
  currentTick: number;
  currentRound: number;
};
```

Runtime defaults may use `saves/`. Tests must pass a temporary directory. This prevents the test suite from overwriting a developer's real `slot_001.json`.

`worldId` is part of the save identity. If `SaveManager.load()` reads a file whose `meta.worldId` differs from the requested `worldId`, it must reject that file for the current world and create or select a valid save.

## State Mutation Path

Conversation summaries do not go through `SimulationDelta`. They are runtime persistence facts, not world simulation deltas.

The mutation path is:

```
DialogueGenerator background summary task
  -> saves.conversations.setSummary(playerId, npcId, summary, tick)
  -> saveManager.capture(world)
  -> saveManager.save()
```

Dialogue side effects still use the existing simulation path:

```
LLM tool call
  -> SimulationDelta
  -> applyDelta(world, delta)
```

## Test Plan

Add or update tests for these cases:

- `SaveManager.load()` creates a new save when no file exists.
- `SaveManager.load()` loads valid JSON from an injected temp directory.
- `SaveManager.load()` rejects malformed JSON and logs a warning.
- `SaveManager.load()` rejects mismatched `worldId`.
- `SaveManager.save()` writes valid JSON with a trailing newline.
- `SaveManager.save()` writes through a temporary file and rename.
- `SaveManager.capture(world)` updates `gameTick` and `round`.
- `ConversationSaveDao` reads and writes summaries independently by player-NPC pair.
- Dialogue close returns without awaiting summary generation.
- Background summary failure logs a warning and does not fail the close command.
- WebSocket `manual_save` writes the current slot in a temporary save directory.
- WebSocket `request_save_slots` returns slot metadata without raw SaveData.
- TUI Save panel renders slots in the left column and selected slot details in the right column.
- Startup with `SAVE_SELECT=skip` loads `SAVE_SLOT` without prompting.

Manual smoke test:

1. Start the server with a test save directory.
2. Talk to an NPC.
3. Close the dialogue.
4. Confirm the close result returns immediately.
5. Confirm the save file receives a conversation summary.
6. Restart the server.
7. Talk to the same NPC.
8. Confirm the prompt includes the saved summary.

## Verification

Before merging, run:

```bash
npm run lint
npm test
```

Also inspect the diff for these risks:

- No test writes to the real `saves/` directory.
- No business code mutates `save.data` directly.
- No SaveData field lacks schema coverage.
- No ContentPool prompt or label is duplicated in engine code.
