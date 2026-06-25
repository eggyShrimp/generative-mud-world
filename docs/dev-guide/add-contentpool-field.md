---
name: add-contentpool-field
description: >
  ContentPool 新增字段的完整链路 checklist。
  Use for: adding new ContentPool fields, schema changes, mutation pipeline.
---

# ContentPool 新增字段 checklist

给 ContentPool 添加任何新字段时，必须先判断它是否可由 LLM 演化。

- 不可演化字段：至少要有类型、schema、loader、默认值、YAML、消费者和测试。
- 可演化字段：还必须有 tool、tool-call parser、prompt、materializer、write-back、reload 测试和边界约束。

跳过任何一步都会导致"字段存在但 LLM 产出不生效"、"重启后丢失"，或运行时代码重新长出一份兜底数据。

边界约束（`plugins/*.grit` + depcruise）自动拦截硬编码映射表、越界 ContentPool 读写等反模式。改完跑 `npm run lint` 即可。

## Checklist

| # | 文件 | 改动 | 说明 |
|---|------|------|------|
| 1 | `core/types.ts` `ContentPool` | 新增字段 | 接口定义 |
| 2 | `core/types.ts` `ContentPoolMutation` | `replaceXxx` | 如果 LLM 可写 |
| 3 | `core/schemas/content-pool.ts` | zod schema | 校验器 |
| 4 | `core/schemas/index.ts` | 导出新 schema | 模块导出 |
| 5 | `core/content-pool-loader.ts` `DOMAIN_FIELDS` | 字段→domain 路由 | 决定从哪个 YAML 文件加载 |
| 6 | `core/content-pool-loader.ts` `DOMAIN_SCHEMAS` | schema 验证器 | 加载时校验。如果 domain 未注册，新字段加载时无校验 |
| 7 | `llm/tools/content-pool-evolve.ts` | tool definition | LLM 可写字段必须有结构化 tool |
| 8 | `llm/tool-mutations.ts` | tool-call parser | 将 tool call 转成 `ContentPoolMutation` |
| 9 | `llm/prompts/content-pool-evolve.ts` | Prompt JSON schema / 规则 | LLM 才知道何时、如何写这个字段 |
| 10 | `simulation/content-pool-materializer.ts` | mutation handler | LLM 产出的合并逻辑。缺此 handler，LLM 产出被静默丢弃 |
| 11 | `core/content-pool-loader.ts` `writeEvolveDeltas()` | 持久化路由 | 缺此路由，重启后 LLM 产出丢失 |
| 12 | `core/world.ts` `createDefaultContentPool()` | 默认值 | baseline 默认值，不是运行时兜底数据 |
| 13 | `worlds/content-pool/<domain>.yaml` | YAML 基值 | 设计师可维护的数据文件 |
| 14 | 所有消费者代码 | 从 `pool.xxx` 读取 | 不再硬编码 |
| 15 | `.dependency-cruiser.js` / `plugins/*.grit` | 边界约束 | 阻止 runtime 绕过 ContentPool 边界或直接写字段 |
| 16 | `src/__tests__/*.test.ts` | 链路测试 | loader、schema、tool、parser、materializer、write-back、reload、consumer |

## 字段命名约定

- `Record<string, string>` 标签映射 → 字段名以 `Labels` 结尾（`needLabels`, `traitLabels`）
- Mutation 中使用 `replaceXxxLabels` 前缀（直接替换整个对象）
- 路由到 `social-dialogue` domain（标签属于社交/文化数据）

## 演化闭环自检

新增字段后，问自己：

- LLM 是否有 tool 可以结构化生成这个字段？（步骤 7）
- tool call 是否会被解析成 `ContentPoolMutation`？（步骤 8）
- LLM 可以通过 prompt 知道何时生成这个字段吗？（步骤 9）
- LLM 产出这个字段后，materializer 会实际应用它吗？（步骤 10）
- 重启后这个 LLM 产出会被保留吗？（步骤 11）
- 是否有测试覆盖加载、失败校验、写回、重载和消费者读取？（步骤 16）
