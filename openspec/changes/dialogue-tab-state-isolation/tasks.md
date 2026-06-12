# Tasks: dialogue-tab-state-isolation

## Component: `src/tui/client/game-client.ts`

- [x] Add tab-owned list types: `DialogueTabList`, `ChatTab`, and `TradeTab`.
- [x] Change `DialogueState` so `tabs.chat` owns chat options/history/loading and `tabs.trade` owns trade options/selected/loading.
- [x] Remove `savedTabOptions` as the source of truth; keep a temporary compatibility helper only if needed during migration.
- [x] Replace `computeTabSwitch` so tab switching only changes `activeTab`.
- [x] Replace `applyDialogueOptionsToTab` so incoming options update `tabs[targetTab]` without touching the active tab's options.
- [x] Update `buildLoadingDialogueState` so it marks only the target tab as loading.
- [x] Update `buildTalkHandlers` to preserve local `targetTab` request context until `dialogue_options` is handled.
- [x] Update queued trade request state so queued work records both `npcId` and `targetTab`, then rechecks the popup is still open for that NPC before sending.
- [x] Move trade selection into `tabs.trade.selected`; do not store a copied full-options list for restore.
- [x] Derive the trade detail `[1] 购买` action from `tabs.trade.selected.option` instead of replacing `tabs.trade.options`.
- [x] Keep the existing single-active-request rule; do not add fallback requests or timing-based retries.

## Component: `src/tui/panels/dialogue/dialogue-panel.tsx`

- [x] Read active options through the active tab state instead of `dialogue.options`.
- [x] Render chat history from `dialogue.tabs.chat.history`.
- [x] Render trade list, loading state, empty state, and selected detail from `dialogue.tabs.trade`.
- [x] Keep the trade list in state while detail is open; show the purchase action as derived UI.
- [x] Keep `TabBar` usage display-only; do not let the component mutate or mirror tab state.
- [x] Preserve current visual behavior unless required by the new state shape.

## Component: `src/tui/panels/dialogue/trade-detail.tsx`

- [x] Keep the component pure: receive selected trade data, player copper, and NPC name by props.
- [x] Adjust prop type only if the new `TradeTab.selected` type changes the call site.

## Component: `src/tui/key-layer/index.ts`

- [x] Keep number keys mapped to visible actions derived from the active tab state.
- [x] In trade detail, map `[1]` to the selected trade option without replacing the trade list.
- [x] Keep left/right keys mapped to tab switching.
- [x] Keep Esc behavior: clear trade detail first, otherwise close the popup.
- [x] Do not add tab-specific state logic to the key layer.

## Component: `src/__tests__/game-client.test.ts`

- [x] Move imports from deprecated `src/client-tui/game-client.ts` to active `src/tui/client/game-client.ts` as part of the refactor.
- [x] Update existing tests from `options`/`savedTabOptions` expectations to `tabs.chat` and `tabs.trade` expectations.
- [x] Add a test that chat options returning while trade is active update only `tabs.chat`.
- [x] Add a test that trade options returning while chat is active update only `tabs.trade`.
- [x] Add a test that switching tabs does not copy or overwrite option lists.
- [x] Add a test that opening and closing trade detail does not replace or copy the trade list.
- [x] Add a test that queued trade request is dropped if the popup closes or changes NPC before the queued request sends.

## Component: `src/client-tui`

- [x] Do not implement the refactor in deprecated `src/client-tui`.
- [x] Use `src/client-tui` only as a reference when checking historical behavior.

## Verification

- [x] Run `npm run lint && npx vitest run && npx depcruise src`.
