# Proposal: enable-llm-quest-gen

## Why

LLM 无法通过 `content_pool_evolve` 流程生成任务。尽管后端的 mutation handler（`tool-mutations.ts`）、materializer（`content-pool-materializer.ts`）和持久化管线（`content-pool-loader.ts`）早已全部支持 `addQuestTemplates`，但 LLM 侧缺少三样东西：

1. **工具定义缺失**：`CONTENT_POOL_EVOLVE_TOOLS` 数组中没有 `add_quest_template`，LLM 无可用工具
2. **提示词缺失**：系统 prompt 未提及任务生成，LLM 不知道这是可做的事
3. **上下文太薄**：只传了 `era` 和 ID 列表，LLM 不知道世界有哪些 NPC、房间、已有任务——无法生成引用真实实体的任务

结果：LLM 即使被触发演化，也只会输出房间模板、命名、标签等数据，永远不会生成任务。

## Change Type

**engine-logic** — Engine/combat/simulation/llm/core logic change.

new-feature

## Modules Touched

| File | Change Type | Description |
|------|-------------|-------------|
| `src/llm/tools/content-pool-evolve.ts` | new-tool-definition | 新增 `ADD_QUEST_TEMPLATE_TOOL`，含完整 QuestTemplate JSON Schema |
| `src/llm/tools/content-pool-evolve.ts` | modify-constant | `ADD_QUEST_TEMPLATE_TOOL` 加入 `CONTENT_POOL_EVOLVE_TOOLS` 数组 |
| `src/llm/prompts/content-pool-evolve.ts` | modify-function | 重写 `buildContentPoolEvolvePrompt`：新增任务生成指南、反模式清单、优质/劣质示例，扩展 context 接口引入世界状态字段 |
| `src/llm/dispatcher.ts` | modify-function | `content_pool_evolve` 触发时构建并注入 NPC、房间、任务、物品、线索摘要到 context |

## ContentPool Reads

| pool.xxx field | Used in (file) | Purpose |
|----------------|----------------|---------|
| `pool.questTemplates` | `dispatcher.ts` | 已有任务 id/title 摘要，供 LLM 避免重复 |
| `pool.itemTemplates` | `dispatcher.ts` | 可引用物品 id/name，供 LLM 选择奖励物品 |
| `pool.clueDefinitions` | `dispatcher.ts` | 已知线索 id/description，供 LLM 引用作为任务信息锚点 |
| `pool.calendar.eraName` | `dispatcher.ts` (existing) | 时代名，已在用 |
| `pool.needDefinitions` | `dispatcher.ts` (existing) | 需求类型，已在用 |
| `pool.traitLabels` | `dispatcher.ts` (existing) | 特质标签，已在用 |
| `pool.actionEffects` | `dispatcher.ts` (existing) | 行为列表，已在用 |
| `pool.scheduleTemplates` | `dispatcher.ts` (existing) | 角色模板，已在用 |
| `pool.roomTemplates` | `dispatcher.ts` (existing) | 房间文化模板，已在用 |

无新增 ContentPool 字段。

## Trap Token Self-Check

| Trap | Applies? | How Addressed |
|------|:--:|---------------|
| no-hardcoded-labels (new Record<string,string>) | no | 无新增硬编码映射表 |
| no-direct-world-mutation (push/assign to state) | no | mutation 走 `content-pool-materializer` → `pool.questTemplates.push/Object.assign`，这是已有的 ContentPool 写入路径 |
| no-create-default-outside-world | no | 无新增 `createDefaultXxx()` 调用 |
| no-hardcoded-description-text (Chinese in engine/combat) | no | prompt 中的中文示例是给 LLM 的指令，不是引擎硬编码的描述文本 |
| no-empty-catch | no | 无新增 try/catch |

## Impact

- **新行为**：LLM 在 `content_pool_evolve` 触发时可以调用 `add_quest_template` 工具生成任务
- **任务质量**：prompt 中的反模式清单（禁止纯 talk 链、无因果描述、雷同奖励）引导 LLM 生成多步骤、有叙事深度的任务
- **世界引用准确**：LLM 收到的 context 包含真实 NPC/房间/物品 ID，减少架空任务
- **已有功能不受影响**：所有已有 YAML 手写任务、quest-tracker、materializer 逻辑不变

## Test Impact

| Test File | Coverage |
|-----------|----------|
| `src/__tests__/llm-dispatcher.test.ts` | 验证 `content_pool_evolve` 触发上下文中包含 `existingNpcs`、`existingRooms`、`existingQuests`、`existingItemTemplates`、`existingClues` 字段 |
| `src/__tests__/quest-tracker.test.ts` | 已有 `quest_mogao_cipher` 全流程测试（talk → explore → talk → complete + rewards 验证） |
| Manual | 实际运行游戏→推进到 checkDay→观察 LLM 生成的任务是否包含多步骤目标、引用真实实体、具备叙事深度 |
