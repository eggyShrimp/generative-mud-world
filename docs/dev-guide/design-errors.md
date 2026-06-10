---
name: design-errors
description: >
  项目早期犯过的设计错误列表，每条对应一次实际 bug。
  Use for: understanding past mistakes, avoiding repeated design errors.
---

# 已发生的设计错误

这些是项目早期犯过的错误，每条都对应一次实际 bug。阅读本节以避免重复。

---

1. **先写实现后定义接口**：应该在写 simulation 代码之前先定义 ContentPool 接口。犯了"先把数据硬编码在代码里，后来才抽取到 ContentPool"的错误。

2. **文档设计到代码实现之间缺了一步"数据建模"**：文档里写了内容池、演化框架，但动手写代码时跳过了"把这些概念映射成具体 TypeScript 接口"这一步，导致实现偏离设计。

3. **MVP 占位代码变成了正式实现**：`defaultSchedules` 在 `simulation/index.ts` 里作为"暂时写死的参考数据"，很快就变成了正式代码。占位代码应该用 `// TODO: move to ContentPool` 标注。

4. **运行时行为字符串硬编码**：命令匹配正则（"结束今天" / "和老马聊天"）、方向映射（`{北: "north"}`）、房间关键词、情感标签（"愉快"/"低落"）、叙事模板（"点了点头"/"不在这里"）散落在 round-engine.ts 和 prompt 文件中。这些应该从 ContentPool 读取。

5. **Prompt 中的 type 列表重复维护**：`world-event.ts` 和 `memory-compression.ts` 的 system prompt 里手写了 need/trait 列表。应该从 `ContentPool.needDefinitions` 动态注入（**已于 P1 修复**）。

6. **类型定义中的冗余字面量联合**：`types.ts` 的 `NeedType = "hunger" | "safety" | ...` 与 ContentPool 内容重复——应该唯一数据源是 ContentPool，类型只是为了编译提示。

7. **自然语言输入导致边界问题无穷**：已移除自然语言输入，改为经典 MUD 命令 + 按钮模式。

8. **Social Ripple 硬编码**：`actionLabel()` 在 social-ripple.ts 中硬编码了 12 个行为的中文标签；`SOCIAL_ACTIONS` 在 delta-composer.ts 中硬编码了社交行为集合；`emotionTranslate()` 在 dialogue-generator.ts 中硬编码了 10 个情绪标签。这些全部应从 ContentPool 读取。（**已修复**）

9. **LLM prompt JSON 示例与运行时 schema 不同步**：prompt 示例的 exits 写成 `"南": "room_id"` 但物化时期望完整对象。LLM 照示例返回 → 运行时产出坏数据。

10. **ID 生成逻辑分散**：fallback NPC 用房间名作 roomId，但实际 ID 由 `generateRoomId` 生成，格式不同。各模块不应自行假定 ID 格式。

11. **catch 块为空吞错**：YAML 解析失败无日志。坏文件被静默吞掉，表象是不明原因的默认值行为。（**已于 P0 修复**）

12. **同构常量多份拷贝**：玩家动作名在三处各维护一份列表，增改动作容易漏一处。（**已修复**：抽取到 `player-actions.ts`）

---

**新发现（2026-06-08）**：

13. **双源维护**：新增 ContentPool 字段时，消费者代码不读取 ContentPool 而是各自维护拷贝。如：`dialogue-tools.ts` 中 need/emotion 枚举、`command-executor.ts` 中 `createDefaultCombatConfig()` 绕过 YAML 配置。（**已于 P1 修复**）

14. **Prompts 中固定枚举 prompt 未从 ContentPool 动态读取**：`world-event.ts`、`memory-compression.ts` 中手写 need/trait 列表，与 ContentPool 不同步。（**已于 P1 修复**）
