# Proposal: fix-talk-narrative-and-dialogue-format

## Why

对话管线存在两个问题：

1. **NPC 回复显示双重的发言人名称**（如 `法显：法显：xxx`）。根因是 `extractReplyText()` 的 `npcName` 参数未使用——LLM 在 role-play prompt 下生成的回复文本常自带 `角色名：` 前缀，而 `deltaToEvents()` 又用 `{speaker}：{content}` 模板再包装一次。

2. **idle-chat 和 functional-dialogue 的 prompt 缺少 JSON 输出格式约束**。quest-dialogue、conversation-menu、follow-up 等其他对话 prompt 都明确要求 JSON 格式输出，唯独这两个没有，导致 LLM 输出格式不确定。

## Change Type

**bug-fix** — 修复 NPC 名称重复、prompt 格式缺失。

## Modules Touched

| File | Change Type | Description |
|------|-------------|-------------|
| `src/llm/dialogue/prompt-builders.ts` | modify-function | `buildIdleChatPrompt()` 添加 JSON 输出格式要求 |
| `src/llm/dialogue/functional-dialogue.ts` | modify-function | `executeFunctional()` 添加 JSON 输出格式要求 |
| `src/llm/dialogue/internal-helpers.ts` | modify-function | `extractReplyText()` 使用 `npcName` 剥离名称前缀作为 fallback |

## ContentPool Reads

无新增 ContentPool 读取。所有修改为纯引擎/LLM 层面改动。

## Trap Token Self-Check

| Trap | Applies? | How Addressed |
|------|:--:|---------------|
| no-hardcoded-labels (new Record<string,string>) | no | 无新增硬编码映射表 |
| no-direct-world-mutation (push/assign to state) | no | 只改 prompt 文本和字符串处理，不操作 world state |
| no-create-default-outside-world | no | 不调用 createDefaultContentPool |
| no-hardcoded-description-text (Chinese in engine/combat) | no | prompt 文本是 LLM 指令，非用户可见描述 |
| no-empty-catch | no | 现有 catch 均有 fallback 逻辑，无需新增空 catch |

## Impact

- **对话面板**：NPC 回复不再出现双重的发言人名称
- **prompt 一致性**：idle-chat 和 functional-dialogue 的 LLM prompt 现在与其他对话类型的 JSON 格式约定一致
- **fallback 鲁棒性**：即使 LLM 不遵守 JSON 格式，`extractReplyText` 也能正确剥离名称前缀

## Test Impact

| Test File | Coverage |
|-----------|----------|
| `src/__tests__/dialogue-generator.test.ts` | 新增 test：验证 extractReplyText 正确剥离 NPC 名称前缀；验证 JSON 格式解析 |
| `src/__tests__/integration/dialogue-pipeline.test.ts` | 新增 test：验证 idle-chat dialogue 事件不含双重名称前缀 |
| `src/__tests__/fixtures/llm-responses.ts` | 新增 idle-chat JSON 格式的 mock 响应数据 |
