# Design: dialogue-tab-state-isolation

## Component Hierarchy

```
App
└── DialoguePanel
    ├── Chat content / options        ← reads active tab state
    ├── Trade list / TradeDetail      ← reads trade tab state
    └── TabBar                        ← display-only active tab indicator

GameClient
└── DialogueState                     ← changed
    ├── tabs.chat                     ← chat list + loading state
    ├── tabs.trade                    ← trade list + selected item + loading state
    └── activeTab                     ← render selector only

KeyLayer
└── DIALOGUE_LAYER                    ← preserves current key routing
```

`TabBar` stays stateless. The key layer should continue to call client actions; it should not know how tab state is stored.

## State Model

Replace the current "one visible options list plus saved hidden options" shape:

```ts
options: DialogueOption[];
savedTabOptions: Record<string, DialogueOption[]>;
tradeSelection?: TradeSelection;
```

with explicit per-tab lists:

```ts
type DialogueTab = "chat" | "trade";

interface DialogueTabList {
  options: DialogueOption[];
  loading: boolean;
}

interface ChatTab extends DialogueTabList {
  history: DialogueHistoryEntry[];
}

interface TradeTab extends DialogueTabList {
  selected?: {
    option: DialogueOption;
    detail?: string;
  };
}

interface DialogueState {
  npcId: string;
  npcName: string;
  npcDescription?: string;
  activeTab: DialogueTab;
  availableTabs: DialogueTab[];
  tabs: {
    chat: ChatTab;
    trade: TradeTab;
  };
}
```

This is intentionally a simple list model:

- Each tab owns one `options` list.
- Switching tabs never copies lists.
- Selecting a trade item only sets `tabs.trade.selected`.
- The purchase action is derived from the selected item in the UI/key helper; it is not stored as a replacement list.

Compatibility helper functions may expose the active tab's visible options during migration, but the source of truth should be `tabs[activeTab]`.

## State Transitions

### Open NPC popup

Create a dialogue state with `activeTab: "chat"`, empty chat options marked loading, and empty trade options not loading. Send the initial chat request with response target `"chat"`.

### Switch tab

Only update `activeTab`. Do not copy options between fields.

If switching to trade and `tabs.trade.options` is empty and `tabs.trade.loading` is false, request the trade menu with response target `"trade"`.

### Receive options

Every request that expects `dialogue_options` must carry local response context:

```ts
targetTab: DialogueTab;
```

When options arrive, update `tabs[targetTab].options` and clear that tab's loading flag. If the player has switched tabs, the response still updates its original tab.

### Choose chat option

For a normal chat option, append the player line to `tabs.chat.history`, set `tabs.chat.loading = true`, and clear only `tabs.chat.options`. Send the talk request with response target `"chat"`.

For a trade-navigation option, switch `activeTab` to `"trade"`, set `tabs.trade.loading = true`, and send the request with response target `"trade"`. Do not write trade loading or options into chat state.

### Choose trade item

Set `tabs.trade.selected` to the chosen trade option. Do not replace `tabs.trade.options`.

While `tabs.trade.selected` exists:

- The panel shows the selected item's detail.
- The visible `[1] 购买` action is derived from `tabs.trade.selected.option`.
- Esc clears `tabs.trade.selected`; the original trade list is still present, so no restore step is needed.

## Protocol Messages

No protocol changes.

| Message | Direction | Use |
|---------|-----------|-----|
| `talk` | Client → Server | Chat responses, trade menu, purchase action. |
| `dialogue_options` | Server → Client | Updates the request's `targetTab`. |
| `command_result` | Server → Client | Appends NPC dialogue to chat history or fills trade detail text. |
| `execute` | Client → Server | Existing look/detail request for selected trade item. |

The target tab is local client request context; it is not sent over the wire.

## Request Sequencing

Keep the existing single active request rule. When a trade request is attempted while another request is active, retain the queue behavior, but queue the target tab with the request:

```ts
pendingDialogueRequest = { npcId, targetTab: "trade" };
```

When the active request completes, send the queued request only if the dialogue popup is still open for the same NPC.

## depcruise Boundary Verification

| Rule | Status | Notes |
|------|:--:|-------|
| tui-no-direct-engine-import | ✅ | Only `src/tui/**` and `src/shared/protocol.ts` are involved. |
| combat-config-only-via-contentpool | ✅ | N/A for TUI. |

## Display Text

This refactor does not require new visible copy.

| UI Element | Server ContentPool Field | Fallback |
|------------|--------------------------|----------|
| Existing tab labels | Existing local labels remain unchanged for this refactor | No new labels added |
| Existing loading / empty states | Existing text remains unchanged | No new text added |
