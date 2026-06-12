# Tasks: dialogue-interaction-panel

## Phase 1: InteractionPanel + 数据结构

### Component: src/client-tui/game-client.ts

- [ ] 新增 `DialogueHistoryEntry` 接口：`{speaker: "player" | "npc"; content: string}`
- [ ] 新增 `DialogueTab = "chat" | "trade" | "observe"` 类型
- [ ] 新增 `TradeItemDisplay`、`NpcObserveInfo` 接口
- [ ] `DialogueState` 新增字段：`history: DialogueHistoryEntry[]`、`activeTab: DialogueTab`、`availableTabs: DialogueTab[]`、`npcInfo?: NpcObserveInfo`
- [ ] `DialogueState` 移除 `lastNpcReply`
- [ ] 导出 `appendToHistory(state, speaker, content)` 纯函数
- [ ] 导出 `computeContentHeight(bodyHeight, interactionHeight)` 纯函数
- [ ] 更新 `buildLoadingDialogueState`：保留 history，移除 lastNpcReply
- [ ] 更新 `chooseDialogueOption`：append player entry to history
- [ ] 更新 `startDialogueDirect`：同上
- [ ] 更新 `buildTalkHandlers.onCommandResult`：append npc entry to history
- [ ] 新增 `setDialogueTab(tab)` 和 handler 方法

### Component: src/client-tui/app.tsx

- [ ] 新增 `InteractionPanel` 组件
- [ ] content 区：`scrollbox height={contentHeight} stickyScroll stickyStart="bottom"`
- [ ] interaction 区：`box border={["top"]} borderColor={THEME.borderMuted} paddingTop={1}`

### Tests: src/__tests__/game-client.test.ts

- [ ] `makeDialogueState()` — 默认 `history: []`，无 `lastNpcReply`
- [ ] `buildLoadingDialogueState — 保留 history`
- [ ] `buildLoadingDialogueState — 多轮 history 不被清空`
- [ ] `appendToHistory — 空历史追加 player`
- [ ] `appendToHistory — 空历史追加 npc`
- [ ] `appendToHistory — 多轮顺序正确`
- [ ] `appendToHistory — 空 content`
- [ ] `computeContentHeight — 标准计算`
- [ ] `computeContentHeight — 最小值保护`

### Verification (Phase 1)

- [ ] Run `npm run lint`
- [ ] Run `npx vitest run`
- [ ] Run `npx depcruise src`

---

## Phase 2: 闲聊 Tab（对话历史 + 情景感知）

### Component: src/client-tui/app.tsx

- [ ] 重构 `DialoguePanel`，使用 `InteractionPanel`
- [ ] content slot：`<For>` 遍历 `history[]`
  - player：`fg="#6fc3bd"`，格式 `"你：{content}"`
  - npc：`fg={THEME.dialogue}`，格式 `"{npcName}：{content}"`
- [ ] interaction slot：选项列表（`KeyHint` 1-9）、加载提示、空状态 fallback
- [ ] 标题动态：`对话：{npcName}`（闲聊）/ `交易：{npcName}` / `观察：{npcName}`

### Verification (Phase 2)

- [ ] Run `npm run lint`
- [ ] Run `npx vitest run`
- [ ] Run `npx depcruise src`

---

## Phase 3: Tab 切换 + 观察 Tab

### Component: src/client-tui/key-layer.ts

- [ ] `DIALOGUE_LAYER` 新增 `left` → `handleDialogueTabLeft`
- [ ] `DIALOGUE_LAYER` 新增 `right` → `handleDialogueTabRight`
- [ ] 实现 `handleDialogueTabLeft` / `handleDialogueTabRight`（循环切换）

### Component: src/client-tui/game-client.ts

- [ ] 新增 `switchDialogueTab(direction)` 方法
- [ ] 新增 `refreshNpcInfo(npcId)` 方法：调用 `execute("look", {target})` 填充 `npcInfo`

### Component: src/client-tui/app.tsx

- [ ] DialoguePanel interaction 区底部 Tab 栏 UI
  - 当前 tab 高亮（`THEME.focus`），其他 dim
  - `←` `→` 端点标记
  - 仅 `availableTabs` 中存在的 tab 才显示
- [ ] 观察 Tab 的 content slot：NPC 情报卡（性格/描述/特质/关系/持有/传闻）
- [ ] 观察 Tab 进入时 lazy-load `npcInfo`（调用 `execute("look")`）

### Verification (Phase 3)

- [ ] Run `npm run lint`
- [ ] Run `npx vitest run`
- [ ] Run `npx depcruise src`

---

## Phase 4: 交易 Tab

### Component: src/client-tui/game-client.ts

- [ ] 新增 `requestTrade(npcId)` 方法：发送 `talk { optionType: "trade_menu" }`
- [ ] 在 `buildTalkHandlers` 的 `onDialogueOptions` 中，若 optionType 为 trade 相关则填充 `tradeItems`

### Component: src/client-tui/app.tsx

- [ ] 交易 Tab content slot：NPC 回复 + 物品表格（对齐布局）
- [ ] 交易 Tab interaction slot：买入选项（带价格）+ 卖出按钮
- [ ] 选手买入/卖出逻辑复用现有 `talk` flow
- [ ] 切换至交易 Tab 时 lazy-load（调用 `requestTrade`）

### Verification (Phase 4)

- [ ] Run `npm run lint`
- [ ] Run `npx vitest run`
- [ ] Run `npx depcruise src`

---

## Phase 5: 入口简化

### Component: src/client-tui/key-layer.ts

- [ ] `getEntityActions()` 修改：选中 NPC 后直接调用 `client.startDialogueDirect()` 进入 DialoguePanel
- [ ] 或：修改 `handleEntitySelect`，NPC 直接 `showDialogue` 而非 `setSelectedEntityId`

### Component: src/client-tui/game-client.ts

- [ ] 进入 DialoguePanel 时自动触发情景判断（talk idle_chat / quest_trigger）
- [ ] 预取 `npcInfo`（并行 execute look）

### Verification (Phase 5)

- [ ] Run `npm run lint`
- [ ] Run `npx vitest run`
- [ ] Run `npx depcruise src`

---

## Final Verification

- [ ] Run `npm run lint` (biome check + tsc --noEmit)
- [ ] Run `npx vitest run` — all tests pass
- [ ] Run `npx depcruise src` — no tui-no-direct-engine-import violations
