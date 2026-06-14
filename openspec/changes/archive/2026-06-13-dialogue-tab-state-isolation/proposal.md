# Proposal: dialogue-tab-state-isolation

## Why

NPC dialogue popup currently relies on one visible `options` list plus `savedTabOptions` to preserve hidden tab options. This makes tab switching fragile because chat and trade state are coupled through the same top-level option field.

The next refactor should make each tab own its own display options and in-tab state. The active tab should only select which tab state is rendered. Responses from chat or trade requests must update the target tab, even if the player switches tabs before the response arrives.

`src/client-tui` is deprecated and reference-only. This proposal targets the active TUI under `src/tui`.

## Change Type

**tui-only** — Client-side TUI change. No ContentPool. No engine logic.

## Components Touched

| File | Change Type | Description |
|------|-------------|-------------|
| `src/tui/client/game-client.ts` | refactor | Replace shared `options`/`savedTabOptions` coupling with per-tab dialogue state and target-tab response updates. |
| `src/tui/panels/dialogue/dialogue-panel.tsx` | refactor | Render from the active tab model instead of reading tab-specific meaning from the shared `options` list. |
| `src/tui/panels/dialogue/trade-detail.tsx` | keep / adjust imports if needed | Keep trade detail as a pure detail renderer. |
| `src/tui/key-layer/index.ts` | keep / narrow changes | Preserve current key behavior: numbers choose active-tab options, arrows switch tabs, Esc clears trade detail before closing popup. |
| `src/tui/components/tab-bar.tsx` | keep | Pure display component remains stateless. |
| `src/__tests__/game-client.test.ts` | modify | Add focused state-transition coverage for tab switching and late responses. |

## Protocol Surface

No `src/shared/protocol.ts` changes are required.

Existing messages are enough:

- `talk` requests carry the selected option type.
- `dialogue_options` responses carry the options returned by the server.
- `command_result` continues to provide dialogue text and look/detail events.

The client must keep enough local request context to know which tab should receive each response.

## Boundary Self-Check

- [x] No imports from `src/engine/`
- [x] No imports from `src/combat/`
- [x] No imports from `src/simulation/`
- [x] No imports from `src/llm/`
- [x] No imports from `src/core/` (except `src/shared/` which is allowed)
- [x] No new Chinese display text is needed for the state refactor. Existing labels remain unchanged.

## Impact

- Chat options and trade options are preserved independently.
- A response updates the tab it belongs to, not whichever tab is active when the response arrives.
- Switching tabs no longer needs to snapshot the active tab into `savedTabOptions`.
- Trade detail selection becomes trade-tab state, so it does not leak into chat rendering.
- This change narrows the refactor to the popup state model before any larger UI reshaping.
