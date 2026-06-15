# Proposal: book-reading

## Why

Current item `sutra_copy` (佛经抄本) has `readable: true` property but no code path to act on it. The `readable` label "可阅读" is displayed in item properties but is dead data — items cannot be read. This adds the `read` command following the same engine pattern as `eat` for `edible` items.

## Change Type

**cross-cutting feature** — new-feature

This feature crosses three OpenSpec schemas:

| Schema | Owns | Why it is separate |
|--------|------|--------------------|
| `world-yaml` | `ContentPool.bookContents`, Zod schema, YAML data, loader routing | Book text is data. It must be validated, loaded, and maintained through the ContentPool path before engine code depends on it. |
| `world-engine` | `read` command, readable-item capability, deltas | Engine code decides whether an item can be read and what reading does to state. |
| `world-tui` | protocol surface and paged reader panel | TUI code decides how returned book content is displayed and paged. |

The current `.openspec.yaml` declares `schema: world-engine`, so this change should not be applied as a single engine-only change. Either split it into three changes (`book-content-pool`, `book-reading-engine`, `book-reader-tui`) or treat this directory as an umbrella plan and create schema-specific OpenSpec changes before implementation.

### Why the engine-only declaration is insufficient

`world-engine` explicitly forbids ContentPool schema changes and TUI changes. This proposal depends on both:

- `bookContents` does not exist yet in `ContentPool`, `src/core/types.ts`, or `src/core/schemas/content-pool.ts`. Without the `world-yaml` work, the engine cannot type-check a direct read of `world.contentPool.bookContents`.
- `bookDisplay` is a new server-to-client payload. Without the `world-tui` work in `src/shared/protocol.ts`, `src/tui/client/game-client.ts`, `src/tui/key-layer/index.ts`, `src/tui/app.tsx`, and a reader panel, the command can return content but the player cannot read it.
- A fallback message for missing book content would hide the real gap: the book data is not maintainable yet. The correct first step is to define and validate the data path.

## Modules Touched

| File | Change Type | Description |
|------|-------------|-------------|
| `src/engine/player-actions.ts` | modify-constant | Add `"read"` to `PLAYER_ACTIONS` array |
| `src/engine/command-executor.ts` | new-function | Add `executeRead()` function + `getItemTraitModifiers()` helper |
| `src/engine/command-executor.ts` | modify-type | Add `bookDisplay?` to `CommandResult` interface |
| `src/engine/command-executor.ts` | modify-switch | Add `case "read"` to `executeCommand()` dispatch |
| `src/engine/capability-provider.ts` | modify-function | Filter `readable` items → `read` capability for inventory items |

## ContentPool Reads

| pool.xxx field | Used in (file) | Purpose |
|----------------|----------------|---------|
| `narrativeTemplates.eventTitles` | `capability-provider.ts` | Label for `read` capability (via existing `actionLabel()`) |
| `narrativeTemplates.commandMessages` | `command-executor.ts` | Command result message for read events |
| `needLabels` | `command-executor.ts` | Format need delta text in read result |
| `bookContents` | `command-executor.ts` | Look up book text (title + pages) by item `itemTemplateId` |

> **Dependency**: `bookContents` is a new ContentPool field. It must be introduced by a `world-yaml` change before the engine change is implemented. Missing book content should be treated as invalid content for a readable item in tests, not hidden by engine fallback text.

## ContentPool Maintenance

`bookContents` must follow the ContentPool field checklist:

| Area | Required work |
|------|---------------|
| Type | Add `BookContent`, `bookContents: BookContent[]`, and `addBookContents?: BookContent[]` to `src/core/types.ts`. |
| Zod | Add `BookContentSchema` and include `bookContents` in `ContentPoolSchema` in `src/core/schemas/content-pool.ts`. |
| Loader | Route `bookContents` to a YAML domain in `src/core/content-pool-loader.ts`. Suggested domain: `books.yaml` or `lore-books.yaml`. |
| Default data | Add a default `bookContents: []` or seed entry in `createDefaultContentPool()` only as the repo's baseline default, not as a runtime fallback. |
| YAML data | Add the actual `sutra_copy` content in `worlds/content-pool/<domain>.yaml`. |
| LLM tool | Add `add_book_content` so LLM-generated readable items can write matching book content. |
| Materializer | Merge `addBookContents` into `pool.bookContents`, replacing by `id` or `itemTemplateId` when already present. |
| Evolve write-back | Persist LLM-generated book content to `content-pool/evolve/<domain>.yaml`. |
| Validation | Tests must prove the YAML data loads, validates, and can be found by `itemTemplateId`. |

Initial shape:

```ts
interface BookContent {
  id: string;
  itemTemplateId: string;
  title: string;
  pages: string[];
}
```

LLM tool shape:

```ts
{
  id: string;
  itemTemplateId: string;
  title: string;
  pages: string[];
}
```

If the LLM creates or marks an item as `readable: true`, it must also create matching `bookContents` through `add_book_content`. A readable item without matching book content is invalid content.

## Trap Token Self-Check

| Trap | Applies? | How Addressed |
|------|:--:|---------------|
| no-hardcoded-labels (`Record<string,string>`) | no | All labels come from ContentPool via `actionLabel()`, `commandMessages()`, `needLabels` |
| no-direct-world-mutation (push/assign to state) | no | `executeRead()` builds `SimulationDelta`, does not mutate `world` directly |
| no-create-default-outside-world | no | No `createDefaultXxx()` calls |
| no-hardcoded-description-text (Chinese in engine) | no | All Chinese text from ContentPool: `eventTitles.read` for label, `commandMessages` for event text, `needLabels` for effect formatting |
| no-empty-catch | no | `executeRead()` uses early-return `fail()` for error paths; missing book content is an explicit content error |

## Impact

- **New command**: `read { itemId }` — reads a `readable` item. Returns need/trait deltas (from `item.properties`) and book display content (from `ContentPool.bookContents`).
- **Does NOT consume items** — unlike `eat`, `executeRead()` does not remove the item from inventory.
- **Capability**: inventory items with `properties.readable === true` gain a `read` action in the UI.
- **Content requirement**: every shipped or LLM-generated readable item should have matching `bookContents` by `itemTemplateId`.
- **Dependent changes**: Requires `world-yaml` change for `bookContents` ContentPool field + YAML data, and `world-tui` change for a paged BookReader panel.
