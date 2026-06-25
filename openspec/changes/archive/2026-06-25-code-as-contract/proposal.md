# Proposal: code-as-contract

## Why

`docs/` 目录有 34 个 .md 文件，其中 26% 是手动检查清单（trap-tokens、common-pitfalls、modification-workflow 等），74% 是架构教学文档。这两类知识各有问题：

1. **手动检查清单**：开发者必须读文档 → 手动跑 grep → 对照表格检查。当前已有 8 个 grit 插件 + 30+ depcruise 规则自动化了约 60% 的检查，但剩余模式仍靠人工。
2. **架构教学文档**：代码中零个 `@module` 注释，文件开头直接从 `import` 开始。知识离代码太远→文档腐烂。改代码的人大概率忘了改 `docs/` 里的 doc。

目标：**把能自动化的全部自动化掉，把剩下来的融入代码注释。最终 docs 只保留不可编码的设计资产。**

## Change Type

**refactor** — 将文档中的约束和知识迁移到 lint 规则与 JSDoc 注释。

## Modules Touched

| File | Change Type | Description |
|------|-------------|-------------|
| `plugins/no-array-constant-labels.grit` | new-file | 检测硬编码数组常量 `["str1", "str2"]` |
| `plugins/no-chinese-template-string.grit` | new-file | 检测中文模板字符串 `` `模板${name}` `` |
| `plugins/no-id-format-assumption.grit` | new-file | 检测 `roomId: "字面量"` ID 格式假设 |
| `plugins/no-switch-without-contentpool.grit` | new-file | 检测 `switch(action)` 不含 contentPool 读取 |
| `biome.json` | modify | 注册 4 个新 grit 插件 |
| `src/core/types.ts` | modify-comments | ContentPool 接口 JSDoc + 字段说明 |
| `src/core/world.ts` | modify-comments | `@module` 头部：World 状态生命周期、核心约束 |
| `src/core/content-pool-loader.ts` | modify-comments | `@module` 头部：三层加载流程、持久化路由 |
| `src/core/world-loader.ts` | modify-comments | `@module` 头部：world 加载与组装 |
| `src/core/round-engine.ts` | modify-comments | `@module` 头部：回合引擎流程 |
| `src/engine/command-executor.ts` | modify-comments | `@module` 头部：命令执行链路 |
| `src/engine/player-actions.ts` | modify-comments | `@module` 头部：玩家动作注册 |
| `src/engine/capability-provider.ts` | modify-comments | `@module` 头部：能力推断 |
| `src/simulation/content-pool-materializer.ts` | modify-comments | `@module` 头部：演化闭环、mutation handler |
| `src/simulation/npc-simulator.ts` | modify-comments | `@module` 头部：NPC 分层激活 |
| `src/combat/pulse.ts` | modify-comments | `@module` 头部：战斗心跳 |
| `src/llm/dialogue-generator.ts` | modify-comments | `@module` 头部：对话生成全链路 |
| `src/llm/tools/content-pool-evolve.ts` | modify-comments | `@module` 头部：LLM tool → ContentPool 字段 |
| `src/tui/key-layer.ts` | modify-comments | `@module` 头部：键位处理层级 |
| `docs/` (17 files) | delete | trap-tokens, common-pitfalls, add-command, modification-workflow, interaction, command-chain, key-bindings, config, logging, 02-simulation-details, 05-player-flow, 06-content-pool, 01-concepts, content-pool-dao, content-pool-yaml, tui-architecture, mud-interaction |
| `docs/` (3 files) | modify | AGENTS.md, add-contentpool-field.md, README.md 精简为 1 页 |
| `AGENTS.md` | modify | 删除步骤 2-3 的手动检查指令和"陷阱 Token 速查"表，改为 "跑 `npm run lint`" |
| `docs/dev-guide/add-contentpool-field.md` | modify | 删除步骤 2a/2c/3b 的手动 grep 命令，保留 checklist 表作为 schema 参考 |

## ContentPool Reads

不新增 ContentPool 读取。仅在代码注释中记录现有 `world.contentPool.xxx` 字段的用途。

## Trap Token Self-Check

| Trap | Applies? | How Addressed |
|------|:--:|---------------|
| no-hardcoded-labels (new Record<string,string>) | no | 不新增硬编码映射表 |
| no-direct-world-mutation (push/assign to state) | no | 不改动运行时逻辑 |
| no-create-default-outside-world | no | 不改动 ContentPool 构造 |
| no-hardcoded-description-text (Chinese in engine/combat) | no | JSDoc 用中文，不新增运行时中文 |
| no-empty-catch | no | 不改动运行时逻辑 |

## Impact

- **lint 覆盖率提升**：4 个新 grit 插件覆盖 trap-tokens.md 中目前未自动化的剩余 50% 模式
- **架构知识就近**：11 个核心模块加装 `@module` JSDoc，改代码时看到边界定义
- **docs 精简**：34 个文件 → ~17 个，手动检查步骤从 20+ 条 → 0

## Test Impact

| Test File | Coverage |
|-----------|----------|
| `src/__tests__/plugins.test.ts` (新增) | 4 个 grit 插件的 false positive/false negative 测试 |
| 现有测试 | `npm test` 全部通过即无回归（无运行时逻辑变更） |
