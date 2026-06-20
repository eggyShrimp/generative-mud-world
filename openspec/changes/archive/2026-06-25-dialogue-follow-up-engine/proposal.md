# Proposal: dialogue-follow-up-engine

## Why

玩家在对话中看到 NPC 的某句话后，应该能直接追问这句话，而不是只能从通用闲聊方向里选择。追问选项需要由 LLM 根据选中文本生成，但生成后的选项仍然应该走现有 `talk` 流程，避免新增一套对话执行机制。

同时，NPC 回复需要体现关系反馈，但当前闲聊 prompt 只给了关系数值，没有明确约束关系如何影响回复。新规则应保持游戏体验稳定：普通关系正常回答，关系好时更愿意补充细节和线索；暂不做关系差导致拒答。

## Change Type

**engine-logic** — Engine/combat/simulation/llm/core logic change.

new-feature

## What Changes

- Add follow-up option protocol messages.
- Route follow-up option requests through the server to `DialogueGenerator`.
- Generate 3-5 follow-up `DialogueOption` values from selected NPC text.
- Keep generated options on the existing `idle_chat` and `talk` path.
- Return an empty list instead of inventing fallback facts when no valid follow-up can be parsed.
- Update NPC relationship feedback rules so relationship affects detail level, not basic answer availability.
- Update `suggest_followup_topics` wording to match the same relationship feedback rule without changing its schema.

## Modules Touched

| File | Change Type | Description |
|------|-------------|-------------|
| `src/shared/protocol.ts` | modify-interface | 新增追问选项请求和返回消息类型 |
| `src/server/ws-server.ts` | modify-schema / modify-handler | 校验并处理 `request_follow_up_options`，返回 `follow_up_options` |
| `src/index.ts` | modify-wiring | 将追问选项生成器接入 WebSocket server |
| `src/llm/dialogue-generator.ts` | new-method / modify-prompt | 新增 `generateFollowUpOptions()`；调整闲聊回复关系规则 |
| `src/llm/dialogue-tools.ts` | modify-description | 让追问话题工具遵守关系反馈规则 |
| `src/__tests__/dialogue-generator.test.ts` | add-tests | 覆盖追问选项生成和关系反馈 prompt |
| `src/__tests__/ws-server.test.ts` | add-tests | 覆盖追问协议路由 |

## ContentPool Reads

| pool.xxx field | Used in (file) | Purpose |
|----------------|----------------|---------|
| `conversationDirections` | `src/llm/dialogue-generator.ts` | 追问生成失败时不新建硬编码方向；仍以现有对话方向作为语气/范围参考 |
| `dialogueEffectMapping` | `src/llm/dialogue-generator.ts` | 闲聊回复仍通过现有 tool call 到 delta 映射影响关系 |
| `clueDefinitions` | `src/llm/dialogue-generator.ts` | 关系好时允许更愿意补充已知线索，但只使用 NPC 已知线索 |

No new ContentPool fields.

## Trap Token Self-Check

| Trap | Applies? | How Addressed |
|------|:--:|---------------|
| no-hardcoded-labels (new Record<string,string>) | no | 不新增标签映射表 |
| no-direct-world-mutation (push/assign to state) | no | 追问选项不改世界状态；后续选择仍走现有 `talk` → `SimulationDelta` |
| no-create-default-outside-world | no | 不调用 `createDefaultXxx()` |
| no-hardcoded-description-text (Chinese in engine/combat) | yes | 仅新增 LLM prompt 指令和协议错误信息；不把世界观文本写成引擎结果 |
| no-empty-catch | yes | 新增 catch 必须返回现有错误消息或可测试的失败路径 |

## Impact

- 新增客户端到服务端消息：`request_follow_up_options`
- 新增服务端到客户端消息：`follow_up_options`
- 追问选项使用现有 `DialogueOption`，类型为 `idle_chat`
- 玩家选择追问选项后仍发送现有 `talk` 消息
- NPC 回复关系规则：
  - 普通关系：正常回答
  - 关系好：更愿意补充细节和线索
  - 关系差：只影响语气，不阻断基础回答

## Test Impact

| Test File | Coverage |
|-----------|----------|
| `src/__tests__/dialogue-generator.test.ts` | 追问选项 JSON 解析、fallback、关系反馈 prompt 文本 |
| `src/__tests__/ws-server.test.ts` | `request_follow_up_options` schema、handler 成功返回、失败返回 error |
| `src/__tests__/integration/dialogue-pipeline.test.ts` | 追问选项被选择后仍走普通 `talk` 管道 |
