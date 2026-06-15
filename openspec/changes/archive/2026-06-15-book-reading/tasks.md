# Tasks: book-reading

## Scope

This directory is an umbrella plan. Before implementation, split or apply work in this order:

1. `world-yaml`: define, load, validate, and persist `ContentPool.bookContents`.
2. `world-engine`: implement the `read` command after the field exists.
3. `world-tui`: render `bookDisplay` in a paged reader panel.

Do not implement this as an engine-only change while `bookContents` and the reader panel are still undefined.

## Module: ContentPool book data (`world-yaml`)

- [x] 0.1 Add `BookContent` type and `bookContents: BookContent[]` to `src/core/types.ts`
- [x] 0.2 Add `addBookContents?: BookContent[]` to `ContentPoolMutation` → `src/core/types.ts`
- [x] 0.3 Add `BookContentSchema` and `bookContents` validation to `src/core/schemas/content-pool.ts`
- [x] 0.4 Export `BookContentSchema` from `src/core/schemas/index.ts`
- [x] 0.5 Register `bookContents` in `src/core/content-pool-loader.ts` domain routing
- [x] 0.6 Register the selected book YAML domain schema in `src/core/content-pool-loader.ts`
- [x] 0.7 Add baseline `bookContents` default in `src/core/world.ts`
- [x] 0.8 Add shipped book data for `sutra_copy` in `worlds/content-pool/<book-domain>.yaml`
- [x] 0.9 Add `ADD_BOOK_CONTENT_TOOL` with required `id`, `itemTemplateId`, `title`, `pages` → `src/llm/tools/content-pool-evolve.ts`
- [x] 0.10 Include `ADD_BOOK_CONTENT_TOOL` in `CONTENT_POOL_EVOLVE_TOOLS` → `src/llm/tools/content-pool-evolve.ts`
- [x] 0.11 Parse `add_book_content` tool calls into `mutation.addBookContents` using `BookContentSchema` → `src/llm/tool-mutations.ts`
- [x] 0.12 Apply `addBookContents` to `pool.bookContents` in `src/simulation/content-pool-materializer.ts`
- [x] 0.13 Persist `addBookContents` through `writeEvolveDeltas()` into the selected book domain → `src/core/content-pool-loader.ts`
- [x] 0.14 Update `buildContentPoolEvolvePrompt()` so LLM-generated readable items must also call `add_book_content` → `src/llm/prompts/content-pool-evolve.ts`
- [x] 0.15 Add tests proving `bookContents` validates, loads, and contains `sutra_copy`
- [x] 0.16 Add tests proving `add_book_content` tool calls parse, materialize, and write to `content-pool/evolve/<book-domain>.yaml`
- [x] 0.17 Add consistency test: every `itemTemplates[].properties.readable === true` has matching `bookContents[].itemTemplateId`
- [x] 0.18 Run consumer check: `rg "bookContents|addBookContents|add_book_content" src/ --type ts | grep -v __tests__ | grep -v "\\.d\\.ts"`

## Module: `src/engine/player-actions.ts`

- [x] 1.1 Add `"read"` to `PLAYER_ACTIONS` array → `src/engine/player-actions.ts`

## Module: `src/engine/command-executor.ts`

- [x] 2.1 Add `bookDisplay?: { title: string; pages: string[] }` to `CommandResult` interface → `src/engine/command-executor.ts:32-43`
- [x] 2.2 Add `case "read": return executeRead(world, entityId, params);` to `executeCommand()` switch → `src/engine/command-executor.ts:~270`
- [x] 2.3 Add `"read"` to the `BUILTIN_ACTIONS` set in `src/engine/command-executor.ts`
- [x] 2.4 Implement `getItemTraitModifiers(properties)` helper — extracts `{ trait, delta }[]` from `properties.traitModifiers`, validates types, returns `[]` if missing → `src/engine/command-executor.ts` (near `getItemNeedDeltas`)
- [x] 2.5 Implement `executeRead(world, entityId, params)` function:
  - Validate `itemId` param
  - Find item: check inventory first, then room entities
  - Check `item.properties.readable === true` → fail if not
  - `getItemNeedDeltas(item.properties)` → build `needChanges`
  - `getItemTraitModifiers(item.properties)` → build `traitModifiers`
  - Lookup `world.contentPool.bookContents.find(bc => bc.itemTemplateId === item.templateId)` → `bookDisplay`
  - If readable item has no matching book content, return a content error and do not apply deltas
  - Return `CommandResult` with `type: "book_read"` event, delta, `bookDisplay`
  → `src/engine/command-executor.ts`

## Module: `src/engine/capability-provider.ts`

- [x] 3.1 Add readable item filtering for inventory items: filter `i.properties?.readable === true` → add `read` capability with `actionLabel(world, "read")` → `src/engine/capability-provider.ts` (near `edible` filter, after line 133)
- [x] 3.2 Add readable item filtering for room items: same property check on room entities → `src/engine/capability-provider.ts` (near room entity handling, after line 90)

## Module: TUI paged reader (`world-tui`)

- [x] 4.1 Add `BookDisplay` type and optional `bookDisplay?: BookDisplay` to `CommandResultMessage` → `src/shared/protocol.ts`
- [x] 4.2 Add `BookReaderState` and reader methods (`bookReader`, `openBookReader`, `closeBookReader`, `nextBookPage`, `prevBookPage`) → `src/tui/client/game-client.ts`
- [x] 4.3 In `command_result` handling, open reader when `message.bookDisplay` exists → `src/tui/client/game-client.ts`
- [x] 4.4 Add `BOOK_READER_LAYER` with close/next/previous bindings → `src/tui/key-layer/index.ts`
- [x] 4.5 Add `src/tui/panels/book-reader/book-reader-panel.tsx`:
  - Render title
  - Render `pageIndex + 1 / pages.length`
  - Render only current page
  - Support wrapped text within modal bounds
  - No runtime fallback for empty pages; schema should reject them
- [x] 4.6 Mount `<BookReaderPanel />` in `src/tui/app.tsx`
- [x] 4.7 Add TUI tests for open, close, page navigation, and page bounds

## Verification

- [x] 5.1 Run `npx biome check src/core/types.ts src/core/schemas/content-pool.ts src/core/schemas/index.ts src/core/content-pool-loader.ts src/core/world.ts src/llm/tools/content-pool-evolve.ts src/llm/tool-mutations.ts src/llm/prompts/content-pool-evolve.ts src/simulation/content-pool-materializer.ts src/engine/command-executor.ts src/engine/player-actions.ts src/engine/capability-provider.ts src/shared/protocol.ts src/tui/client/game-client.ts src/tui/key-layer/index.ts src/tui/app.tsx src/tui/panels/book-reader/book-reader-panel.tsx`
- [x] 5.2 Run `npm run build -- --noEmit` — confirm no type errors
- [x] 5.3 Run `npx depcruise src --config .dependency-cruiser.js` — confirm no TUI/engine/core boundary violations
- [x] 5.4 Run `npx vitest run src/__tests__/book-command.test.ts src/__tests__/book-capability.test.ts src/__tests__/content-pool-loader.test.ts src/__tests__/llm-tool-mutations.test.ts src/__tests__/llm-dispatcher.test.ts src/__tests__/key-layer.test.ts` — all new and affected tests pass
- [x] 5.5 Run relevant TUI client/panel tests for the reader
- [x] 5.6 Run full test suite: `npm test` — confirm no regressions
- [x] 5.7 Trap token re-check:
  - Verify no `Record<string, string>` hardcoded in new code
  - Verify no direct `entity.xyz =` or `inventory.splice()` in `executeRead()` (item is NOT consumed)
  - Verify no `createDefaultXxx()` calls outside `world.ts`
  - Verify no hardcoded Chinese strings — all labels/text from ContentPool
  - Verify no book text is hardcoded in TUI
