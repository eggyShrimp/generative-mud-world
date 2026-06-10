---
name: add-contentpool-field
description: >
  ContentPool 新增字段的 12 步 checklist。
  Use for: adding new ContentPool fields, schema changes, mutation pipeline.
---

# ContentPool 新增字段 checklist

给 ContentPool 添加任何新字段时，必须触达以下 **12 个位置**。跳过任何一步都会导致"字段存在但 LLM 产出不生效"或"重启后丢失"。

## 强制执行

在开始修改前，先运行此命令找到所有已有消费者：

```bash
rg "你要加的字段名" src/ --type ts | grep -v __tests__ | grep -v "\.d\.ts"
```

## Checklist

| # | 文件 | 改动 | 说明 |
|---|------|------|------|
| 1 | `core/types.ts` `ContentPool` | 新增字段 | 接口定义 |
| 2 | `core/types.ts` `ContentPoolMutation` | `replaceXxx` | 如果 LLM 可写 |
| 3 | `core/schemas/content-pool.ts` | zod schema | 校验器 |
| 4 | `core/schemas/index.ts` | 导出新 schema | 模块导出 |
| 5 | `core/content-pool-loader.ts` `DOMAIN_FIELDS` | 字段→domain 路由 | 决定从哪个 YAML 文件加载 |
| 6 | `core/content-pool-loader.ts` `DOMAIN_SCHEMAS` | schema 验证器 | 加载时校验。如果 domain 未注册，新字段加载时无校验 |
| 7 | `simulation/content-pool-materializer.ts` | mutation handler | LLM 产出的合并逻辑。缺此 handler，LLM 产出被静默丢弃 |
| 8 | `core/content-pool-loader.ts` `writeEvolveDeltas()` | 持久化路由 | 缺此路由，重启后 LLM 产出丢失 |
| 9 | `llm/prompts/content-pool-evolve.ts` | Prompt JSON schema | LLM 才知道可以写这个字段 |
| 10 | `core/world.ts` `createDefaultContentPool()` | 默认值 | 硬编码兜底 |
| 11 | `worlds/content-pool/<domain>.yaml` | YAML 基值 | 设计师可维护的数据文件 |
| 12 | 所有消费者代码 | 从 `pool.xxx` 读取 | 不再硬编码 |

## 字段命名约定

- `Record<string, string>` 标签映射 → 字段名以 `Labels` 结尾（`needLabels`, `traitLabels`）
- Mutation 中使用 `replaceXxxLabels` 前缀（直接替换整个对象）
- 路由到 `social-dialogue` domain（标签属于社交/文化数据）

## 演化闭环自检

新增字段后，问自己：

- LLM 可以通过 prompt 知道可以生成这个字段吗？（步骤 9）
- LLM 产出这个字段后，materializer 会实际应用它吗？（步骤 7）
- 重启后这个 LLM 产出会被保留吗？（步骤 8）
