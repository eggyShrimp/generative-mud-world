# Design: fix-talk-narrative-and-dialogue-format

## Data Flow

### Fix 1: extractReplyText 名称前缀剥离

```
[LLM 生成回复文本]
  → extractReplyText(text, npcName)
  → 1. 尝试 JSON 解析 → 若有 parsed.reply，返回之
  → 2. [NEW] Fallback: 用 npcName 剥离文本开头的 "角色名：" 或 "角色名: " 前缀
  → 3. 清理 markdown 代码块包裹
  → 返回干净文本
  → deltaToEvents() 用 {speaker}：{content} 模板包装
```

### Fix 2: prompt JSON 输出格式

```
[buildIdleChatPrompt() / executeFunctional() prompt]
  → system prompt 末尾添加输出格式要求:
    "回复用 JSON 格式输出，不要用 markdown 代码块包裹
     {"reply": "NPC的对话回复文本"}"
  → LLM 生成 response.text = '{"reply": "这里的天很蓝..."}'
  → extractReplyText() 解析 JSON → 提取 "reply" 字段（走 JSON 路径）
```

## ContentPool Integration

无新增 ContentPool 读取。所有改动不涉及 ContentPool。

## State Mutation Path

所有修改均为**纯文本处理 + prompt 字符串拼接**，不直接修改 world state：

| 修改 | Mutation? | 路径 |
|------|:---:|------|
| Fix 1: 名称前缀剥离 | 否 | 纯文本 strip，不操作 state |
| Fix 2: prompt 格式 | 否 | 纯字符串拼接，不操作 state |

## Trap Token Verification

| File | Trap Checked | Status |
|------|-------------|--------|
| `src/llm/dialogue/prompt-builders.ts` | no-hardcoded-labels | ✅ 只添加 prompt 指令字符串，非映射表 |
| `src/llm/dialogue/prompt-builders.ts` | no-hardcoded-description-text | ✅ prompt 文本是 LLM 指令，非用户可见描述 |
| `src/llm/dialogue/functional-dialogue.ts` | no-hardcoded-labels | ✅ 同上 |
| `src/llm/dialogue/internal-helpers.ts` | no-hardcoded-labels | ✅ 纯文本 strip 逻辑 |
| `src/llm/dialogue/internal-helpers.ts` | no-direct-world-mutation | ✅ 只操作字符串 |
| All | no-empty-catch | ✅ 无新增 catch 块；现有 catch 均有 fallback |

## Test Plan

### Fix 1: extractReplyText 名称前缀剥离

| Test File | Scenario | Assertions |
|-----------|----------|------------|
| `src/__tests__/dialogue-generator.test.ts` | `extractReplyText("法显：这里的天很蓝", "法显")` | 返回 `"这里的天很蓝"` |
| `src/__tests__/dialogue-generator.test.ts` | `extractReplyText("法显: 这里的天很蓝", "法显")` (半角冒号) | 返回 `"这里的天很蓝"` |
| `src/__tests__/dialogue-generator.test.ts` | `extractReplyText("这里的天很蓝", "法显")` (无前缀) | 返回 `"这里的天很蓝"`（不变） |
| `src/__tests__/dialogue-generator.test.ts` | `extractReplyText('{"reply": "这里的天很蓝"}', "法显")` | 返回 `"这里的天很蓝"`（JSON 路径优先） |

### Fix 2: prompt JSON 格式

| Test File | Scenario | Assertions |
|-----------|----------|------------|
| `src/__tests__/dialogue-generator.test.ts` | mock LLM 返回 `'{"reply": "这里的天很蓝"}'`，调用 `generateIdleChatReply()` | `delta.dialogues[0].content` 为 `"这里的天很蓝"`（不包含名称前缀） |

### 集成验证

| Test File | Scenario | Assertions |
|-----------|----------|------------|
| `src/__tests__/integration/dialogue-pipeline.test.ts` | talk idle_chat → dialogue 事件不含双重名称前缀 | `dialogueEvents[0].description` 为 `"NPC名：对话内容"` 而非 `"NPC名：NPC名：对话内容"` |

### 回归测试

| Test File | Scenario |
|-----------|----------|
| `src/__tests__/integration/dialogue-pipeline.test.ts` | 现有 19 个 test 全部保持通过 |
| `src/__tests__/dialogue-generator.test.ts` | 现有 test 全部保持通过 |

## Manual Checks

无需手动检查。所有行为变更均可通过单元测试和集成测试自动验证。
