# Tasks: fix-talk-narrative-and-dialogue-format

## Module: `src/llm/dialogue/prompt-builders.ts`

- [ ] 在 `buildIdleChatPrompt()` 的 system prompt 末尾添加 JSON 输出格式要求：`{"reply": "NPC的对话回复文本"}`；要求不用 markdown 代码块包裹
- [ ] 确保格式指令在现有指令之后、不要覆盖或删减已有指令

## Module: `src/llm/dialogue/functional-dialogue.ts`

- [ ] 在 `executeFunctional()` 的 system prompt 中添加 JSON 输出格式要求：`{"reply": "NPC的对话回复文本"}`；要求不用 markdown 代码块包裹

## Module: `src/llm/dialogue/internal-helpers.ts`

- [ ] 修改 `extractReplyText(text, npcName)`：参数 `_npcName` 改为 `npcName`（去除下划线前缀）
- [ ] 添加 fallback 逻辑：当 JSON 解析失败时，用 `npcName` 剥离文本开头的 `角色名：` 或 `角色名: ` 前缀（支持全角半角冒号）
- [ ] 保留现有 JSON 解析逻辑不变（优先走 `parsed.reply` 提取）

## Module: `src/__tests__/fixtures/llm-responses.ts`

- [ ] 新增 `IDLE_CHAT_REPLY_JSON` mock 常量：`'{"reply": "这里的天很蓝"}'`（符合新 JSON 格式）
- [ ] 新增 `IDLE_CHAT_REPLY_WITH_NPC_PREFIX` mock 常量：`'法显：这里的天很蓝'`（带名称前缀的原始文本，用于测试 fallback）

## Tests

### extractReplyText 名称前缀剥离

- [ ] `src/__tests__/dialogue-generator.test.ts`：新增 test
  - 输入 `"法显：这里的天很蓝"`，`npcName = "法显"` → 期望返回 `"这里的天很蓝"`
  - 输入 `"法显: 这里的天很蓝"` (半角冒号)，`npcName = "法显"` → 期望返回 `"这里的天很蓝"`
  - 输入 `"这里的天很蓝"` (无前缀)，`npcName = "法显"` → 期望返回 `"这里的天很蓝"`（不变）

- [ ] `src/__tests__/dialogue-generator.test.ts`：新增 test `extractReplyText JSON 解析优先于前缀剥离`
  - 输入 `'{"reply": "这里的天很蓝"}'`，`npcName = "法显"` → 期望返回 `"这里的天很蓝"`（走 JSON 路径）

### prompt JSON 格式

- [ ] `src/__tests__/dialogue-generator.test.ts`：新增 test `idle chat handler 解析 JSON 格式回复`
  - mock LLM adapter 返回 `{ text: '{"reply": "这里的天很蓝"}' }`
  - 调用 `generateIdleChatReply()` → 验证 `delta.dialogues[0].content` 为 `"这里的天很蓝"`

### 集成验证

- [ ] `src/__tests__/integration/dialogue-pipeline.test.ts`：新增 test `talk idle_chat → dialogue 事件不含双重名称前缀`
  - mock LLM 返回 JSON 格式回复
  - 验证 `dialogueEvents[0].description` 为 `"NPC名：对话内容"` 而非 `"NPC名：NPC名：对话内容"`

### 回归测试

- [ ] 运行现有 `src/__tests__/integration/dialogue-pipeline.test.ts` 全量 test，全部通过
- [ ] 运行现有 `src/__tests__/dialogue-generator.test.ts` 全量 test，全部通过

## Verification

- [ ] Run `npm run lint` — biome check + tsc --noEmit 无错误
- [ ] Run `npx vitest run` — 全部测试通过
- [ ] Run `npx depcruise src` — 无边界违规
- [ ] Trap token re-check: no-hardcoded-labels, no-direct-world-mutation, no-create-default-outside-world, no-hardcoded-description-text, no-empty-catch
