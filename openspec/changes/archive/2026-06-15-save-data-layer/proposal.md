# Proposal: save-data-layer

## Why

World Framework currently has one persisted content database and no persisted runtime database. `ContentPool` persists rules, labels, templates, and LLM-evolved content through YAML. Runtime state, including NPC dialogue context, player progress, quest state, world time, relationships, and inventories, lives in memory.

This gap causes NPCs to forget prior dialogue after the conversation closes or the server restarts. The immediate feature needs one saved dialogue summary per player-NPC pair. The broader architecture needs a SaveData layer that can grow without scattering raw JSON reads and writes across engine code.

## What Changes

This change introduces `SaveData` as a JSON-backed runtime database with DAO-style access. Conversation summaries are the first SaveData section.

The design treats both persisted stores as databases:

- `ContentPool` is the content database. It stores configuration, world facts, labels, prompts, and LLM-evolved content.
- `SaveData` is the runtime database. It stores save-slot facts produced while the game runs.

Both databases should expose stable access methods. Engine code should ask a DAO for a fact instead of reading nested storage fields directly.

## Change Type

`new-feature`

Primary area: engine/core/llm runtime persistence.

## Modules Touched

| File | Change Type | Description |
|------|-------------|-------------|
| `src/core/types.ts` | new-interface | Add `SaveMeta`, `ConversationSummaryEntry`, `SaveData`, and ContentPool narrative fields |
| `src/core/schemas/save-data.ts` | new-file | Add zod schemas for SaveData validation |
| `src/core/save-manager.ts` | new-file | Add file-backed SaveData manager and section DAOs |
| `src/core/schemas/index.ts` | modify-export | Export SaveData schemas |
| `src/core/schemas/content-pool.ts` | modify-schema | Add summary prompt and label to `NarrativeTemplatesSchema` |
| `src/core/world.ts` | modify-function | Add default ContentPool values for summary prompt and label |
| `worlds/content-pool/culture-narrative.yaml` | modify-data | Add base YAML values for summary prompt and label |
| `src/llm/dialogue-generator.ts` | modify-class | Use SaveData DAO for summary reads/writes; summarize close in background |
| `src/index.ts` | modify-function | Load SaveData, pass DAOs to services, capture and save on shutdown |
| `src/shared/protocol.ts` | modify-protocol | Add save slot list and manual-save messages |
| `src/server/ws-server.ts` | modify-server | Handle save slot list, manual save, and create slot requests |
| `src/tui/client/game-client.ts` | modify-client | Add save panel state and save protocol handlers |
| `src/tui/panels/save/save-panel.tsx` | new-ui | Add two-column save slot panel |
| `src/__tests__/save-manager.test.ts` | new-test | Cover SaveManager and section DAO behavior |

## Public Design

The intended usage is:

```ts
const saveManager = SaveManager.load({
  rootDir,
  slotId,
  worldId,
  currentTick: world.tick,
  currentRound: world.round,
});

saveManager.conversations.getSummary(playerId, npcId);
saveManager.conversations.setSummary(playerId, npcId, summary, world.tick);

saveManager.capture(world);
saveManager.save();
saveManager.restore(world);
```

`SaveManager` owns file I/O, schema validation, versioning, world identity checks, meta updates, and atomic writes. Section DAOs own domain operations such as reading and writing conversation summaries.

## Behavior

NPC dialogue uses SaveData as follows:

1. During a conversation, `DialogueGenerator` keeps full multi-turn history in memory.
2. When the player closes the dialogue, the command returns immediately.
3. A background task summarizes the in-memory history.
4. The background task writes the summary through `saveManager.conversations`.
5. Future conversations with the same NPC read the latest saved summary and inject it into the prompt.

Summary generation failure logs a warning. It does not fail the close command and does not block the player.

The TUI adds a Save panel for manual saving and slot inspection. The panel uses a two-column layout similar to the trade panel: slots on the left, selected slot details on the right. The first version supports listing slots, showing metadata, creating a slot, and saving the current slot. It does not support in-game loading until full `restore(world)` exists.

Startup can skip slot selection. Development defaults should load `SAVE_SLOT` directly to avoid extra flow during local iteration. A later startup selection mode can prompt the user to pick a slot before SaveData loads.

## ContentPool Reads

The dialogue feature reads these ContentPool fields:

| Field | Purpose |
|-------|---------|
| `narrativeTemplates.conversationSummaryPrompt` | LLM prompt template for creating one-sentence summaries |
| `narrativeTemplates.conversationSummaryLabel` | Prompt label shown before saved summary context |

These fields belong in ContentPool because they are prompt text and presentation text. The generated summary belongs in SaveData because it is runtime state.

## Impact

- NPCs can reference prior conversations through saved summaries.
- SaveData creates a clear home for future runtime persistence.
- Tests no longer need to write to the real `saves/` directory.
- `DialogueGenerator` depends on a SaveData DAO instead of raw storage.
- TUI can show and manually update the current save slot without importing SaveManager.
- Development can skip save selection and use a configured default slot.
- Future save fields follow one extension path: type, schema, migration, DAO, capture, restore, tests.

## Non-Goals

This change does not implement full WorldState restore. The first version only captures metadata and conversation summaries. Later changes can add player state, quest progress, world time, inventories, relations, and other sections through new DAOs.

This change does not replace ContentPool. ContentPool remains the database for content and configuration.
