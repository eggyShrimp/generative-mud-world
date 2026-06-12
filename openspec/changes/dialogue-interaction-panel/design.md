# Design: dialogue-interaction-panel

## Component Hierarchy

```
App
└── DialoguePanel          ← 重构：使用 InteractionPanel
    └── InteractionPanel   ← 新增通用布局组件
        ├── content（scrollbox, stickyScroll bottom）
        │   └── ChatTab:  For each history[] → text (player #6fc3bd / npc THEME.dialogue)
        │   └── TradeTab:  NPC reply + item table
        │   └── ObserveTab: NPC info card (personality, traits, relation, rumors)
        └── interaction（box, border-top, fixed height）
            ├── Numeric options (KeyHint 1-9)
            └── Tab bar (KeyHint ← →, highlighted active tab)
```

### InteractionPanel Props

```ts
function InteractionPanel(props: {
  title: string;
  borderColor: string;
  backgroundColor?: string;
  metrics: ModalMetrics;
  interactionHeight: number;
  content: JSX.Element;
  interaction: JSX.Element;
})
```

- `contentHeight = metrics.bodyHeight - interactionHeight`
- content: `scrollbox height={contentHeight} stickyScroll stickyStart="bottom"`
- interaction: `box border={["top"]} borderColor={THEME.borderMuted} paddingTop={1}`

## Data Structure

### DialogueState (game-client.ts)

```ts
type DialogueTab = "chat" | "trade" | "observe";

interface DialogueHistoryEntry {
  speaker: "player" | "npc";
  content: string;
}

interface DialogueState {
  npcId: string;
  npcName: string;
  history: DialogueHistoryEntry[];    // 替代 lastNpcReply
  activeTab: DialogueTab;             // 当前活动 tab
  availableTabs: DialogueTab[];       // 根据 NPC 能力过滤
  options: DialogueOption[];          // 当前 tab 对应的选项（1-9 映射）
  tradeItems?: TradeItemDisplay[];    // 交易 tab 物品
  npcInfo?: NpcObserveInfo;           // 观察 tab 情报
}

// 新增导出类型
type TradeItemDisplay = {
  id: string; name: string; description: string;
  price: number; currencyName: string; mode: "buy" | "sell";
};
type NpcObserveInfo = {
  name: string; personality: string; description: string;
  traits: Array<{ name: string; value: number }>;
  relation?: { level: number; label: string };
  visibleItems: string[]; rumors?: string[];
};
```

### 新增导出纯函数

```ts
// history 操作
function appendToHistory(state: DialogueState, speaker: "player" | "npc", content: string): DialogueHistoryEntry[]

// 布局计算
function computeContentHeight(bodyHeight: number, interactionHeight: number): number
```

### 状态转换

```
选中 NPC → showDialogue({ npcId, npcName, history: [], activeTab: "chat", ... })

选选项 → chooseDialogueOption(option)
  → history.push({speaker:"player", content: option.label})
  → options: []（加载中）

收到 NPC 回复 → buildTalkHandlers.onCommandResult
  → history.push({speaker:"npc", content: npcReplyText})

收到 dialogue_options → buildTalkHandlers.onDialogueOptions
  → setDialogue({ ...dlg, options: msg.options })

← → 切换 tab → setDialogueTab(direction)
  → activeTab 变更，options 切换到对应 tab 集合

Esc → hideDialogue()
  → setDialogue(null)
```

## Protocol Messages

无需新增或修改。

| Message | Direction | Usage |
|---------|-----------|-------|
| `command_result {events}` | Server → Client | 解析 `type: "dialogue"` / `type: "look"` 事件 |
| `dialogue_options {npcId, npcName, options}` | Server → Client | 填充 `DialogueState.options` |
| `talk {npcId, optionId, ...}` | Client → Server | 闲聊/任务/交易选项 |
| `execute {action: "look", params: {target}}` | Client → Server | 观察 tab 获取 NPC 情报 |

## 按键绑定

```ts
const DIALOGUE_LAYER: KeyLayer = {
  id: "dialogue",
  priority: 60,
  bindings: [
    { key: "left",  handler: handleDialogueTabLeft },
    { key: "right", handler: handleDialogueTabRight },
    { key: "1-9",   handler: handleDialogueOption },
    { key: "escape", handler: (c) => c.closeDialogue() },
  ],
};
```

## depcruise Boundary Verification

| Rule | Status | Notes |
|------|:--:|-------|
| tui-no-direct-engine-import | ✅ | No engine/combat imports |
| combat-config-only-via-contentpool | ✅ | N/A for TUI |

## Display Text

| UI Element | Source | Notes |
|------------|--------|-------|
| `"你："` 前缀 | 客户端硬编码 | 结构性文本 |
| `"{npcName}："` 前缀 | 客户端构造 | 来自 `DialogueState.npcName` |
| Tab 名 `"闲聊"` `"交易"` `"观察"` | 客户端硬编码 | UI 结构，非游戏内容标签 |
| 标题 `"对话：{npcName}"` | 客户端构造 | 沿用现有模式 |
| 加载/空状态文字 | 现有硬编码 | 后续可扩展至 NarrativeTemplates |
