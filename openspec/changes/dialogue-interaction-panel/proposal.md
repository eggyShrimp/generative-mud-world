# Proposal: dialogue-interaction-panel

## Why

当前对话弹窗存在三个体验问题：

1. **无对话历史**：只展示最新一句 NPC 回复，玩家无法回顾之前的对话
2. **NPC 与玩家区分度低**：NPC 回复和玩家选项共用同一金色（`THEME.dialogue`）
3. **交互分散**：交易、任务、观察等 NPC 交互分散在不同弹窗/菜单中，缺乏统一范式

## Change Type

**tui-only** — Client-side TUI change. No ContentPool. No engine logic.

## Components Touched

| File | Change Type | Description |
|------|-------------|-------------|
| `src/client-tui/app.tsx` | modify | 新增 `InteractionPanel`；重构 `DialoguePanel` 为 Tab 式（闲聊/交易/观察） |
| `src/client-tui/game-client.ts` | modify | `DialogueState` 新增 `history`/`activeTab`/`availableTabs`/`npcInfo` |
| `src/client-tui/key-layer.ts` | modify | `DIALOGUE_LAYER` 新增 `←` `→` 箭头键用于 Tab 切换 |

## Protocol Surface

无需改动 `src/shared/protocol.ts`。新增的 `DialogueTab`、`NpcObserveInfo` 等为客户端内部类型，不通过 WebSocket 传输。

## Boundary Self-Check

- [x] No imports from `src/engine/`
- [x] No imports from `src/combat/`
- [x] No imports from `src/simulation/`
- [x] No imports from `src/llm/`
- [x] No imports from `src/core/` (except `src/shared/` which is allowed)
- [x] All Chinese display text comes from server ContentPool label fields (never hardcoded in TUI)

    说话人前缀 `"你："` 和 `"{npcName}："` 为 UI 结构性文本（角色自指代词）；Tab 名称（"闲聊"/"交易"/"观察"）沿用现有协议中已有的标签或 `entityActionLabels` 约定；加载/空状态文字沿用现有硬编码模式。

## Impact

- 对话弹窗从"单条回复"升级为"滚动对话历史 + Tab 式交互"
- 闲聊 Tab 自动判断情景（有任务时 LLM 融入任务叙事，无任务时纯闲聊）
- 交易/观察 Tab 整合到同一弹窗，`←` `→` 切换
- 提取 `InteractionPanel` 通用布局，为后续面板统一范式打基础
- 不影响主事件日志（`EventLog` 的 `say`/`dialogue` 事件照常发出）
- 不影响现有按键绑定（`DIALOGUE_LAYER` 仅新增 `left`/`right`）
