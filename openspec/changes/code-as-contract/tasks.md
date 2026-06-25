# Tasks: code-as-contract

## Module: plugins/ (新增 4 个 grit 插件)

- [ ] 创建 `plugins/no-array-constant-labels.grit`：检测硬编码字符串数组常量 `[...]`，中文元素→error，非中文→warn
- [ ] 创建 `plugins/no-chinese-template-string.grit`：检测中文模板字符串，error
- [ ] 创建 `plugins/no-id-format-assumption.grit`：检测 `xxxId: "字面量"` ID 格式假设，error
- [ ] 创建 `plugins/no-switch-without-contentpool.grit`：检测 switch 语句所在函数是否无 contentPool 读取，warn

## Module: biome.json

- [ ] 编辑 `biome.json`：在 `plugins` 数组中注册 4 个新 grit 插件路径

## Module: JSDoc 核心模块（11 个文件）

- [ ] 编辑 `src/core/types.ts`：在 ContentPool 接口前添加 `@module` JSDoc，字段级 `@property` 说明
- [ ] 编辑 `src/core/world.ts`：添加 `@module` JSDoc：World 生命周期、核心约束、玩家流程
- [ ] 编辑 `src/core/content-pool-loader.ts`：添加 `@module` JSDoc：三层加载、持久化路由
- [ ] 编辑 `src/core/world-loader.ts`：添加 `@module` JSDoc：world 组装、依赖注入
- [ ] 编辑 `src/core/round-engine.ts`：添加 `@module` JSDoc：回合引擎、act-loop
- [ ] 编辑 `src/engine/command-executor.ts`：添加 `@module` JSDoc：命令链路、三处同步
- [ ] 编辑 `src/engine/player-actions.ts`：添加 `@module` JSDoc：动作注册、PLAYER_ACTIONS
- [ ] 编辑 `src/engine/capability-provider.ts`：添加 `@module` JSDoc：能力推断、按钮显示
- [ ] 编辑 `src/simulation/content-pool-materializer.ts`：添加 `@module` JSDoc：演化闭环、mutation handler
- [ ] 编辑 `src/simulation/npc-simulator.ts`：添加 `@module` JSDoc：NPC 分层激活、记忆系统
- [ ] 编辑 `src/llm/dialogue-generator.ts`：添加 `@module` JSDoc：对话生成全链路
- [ ] 编辑 `src/llm/tools/content-pool-evolve.ts`：添加 `@module` JSDoc：LLM tool → ContentPool 字段映射
- [ ] 编辑 `src/combat/pulse.ts`：添加 `@module` JSDoc：战斗心跳、回合制
- [ ] 编辑 `src/tui/key-layer.ts`：添加 `@module` JSDoc：键位处理层级、事件传播

## Module: docs/ 删除（17 个文件）

- [ ] 删除 `docs/dev-guide/trap-tokens.md`
- [ ] 删除 `docs/dev-guide/common-pitfalls.md`
- [ ] 删除 `docs/dev-guide/add-command.md`
- [ ] 删除 `docs/dev-guide/modification-workflow.md`
- [ ] 删除 `docs/dev-guide/interaction.md`
- [ ] 删除 `docs/dev-guide/command-chain.md`
- [ ] 删除 `docs/dev-guide/key-bindings.md`
- [ ] 删除 `docs/dev-guide/config.md`
- [ ] 删除 `docs/dev-guide/logging.md`
- [ ] 删除 `docs/dev-guide/content-pool-dao.md`
- [ ] 删除 `docs/dev-guide/tui-architecture.md`
- [ ] 删除 `docs/dev-guide/content-pool-yaml.md`
- [ ] 删除 `docs/dev-guide/mud-interaction.md`
- [ ] 删除 `docs/01-concepts-and-references.md`
- [ ] 删除 `docs/02-simulation-details.md`
- [ ] 删除 `docs/05-player-flow.md`
- [ ] 删除 `docs/06-content-pool.md`

## Module: docs/ 修改（3 个文件）

- [ ] 编辑 `AGENTS.md`：删除步骤 2-3 的手动检查指令和"陷阱 Token 速查"表，保留决策树和文档索引，改为"跑 `npm run lint`"
- [ ] 编辑 `docs/dev-guide/add-contentpool-field.md`：删除步骤 2a/2c/3b 的 grep 命令，保留 16 步 checklist 表作为 ContentPool schema 参考
- [ ] 编辑 `docs/README.md`：更新文档索引导航，反映新文件结构

## Module: docs/ 保留（~13 个文件，无需修改）

以下文件保留不动：
- `docs/00-architecture.md` — 跨系统架构全景
- `docs/03-llm-interactions.md` — 14 种交互模式设计论文
- `docs/04-auto-research.md` — 组织/语言演化设计
- `docs/07-quest-storyline.md` — 任务剧情设计哲学
- `docs/08-code-quality-review.md` — 代码审计报告
- `docs/specs/prompt-pipeline.md` — prompt 管道前瞻 spec
- `docs/specs/quest-evaluator-registry.md` — quest 注册表前瞻 spec
- `docs/dev-guide/how-to-add-tests.md` — 测试教程
- `docs/dev-guide/testing.md` — 测试规范
- `docs/dev-guide/tui-style.md` — 视觉设计 spec
- `docs/dev-guide/tui-typography.md` — 文本排版 spec
- `docs/dev-guide/tui-conventions.md` — 组件约定
- `docs/dev-guide/design-errors.md` — 已知设计错误模式（静态检测无法覆盖的模式级反例）
- `docs/dev-guide/tui-interaction.md` — TUI 交互 UX spec
- `docs/TODO.md` — 待实现计划

## Tests

- [ ] 创建 `src/__tests__/plugins/no-array-constant-labels.test.ts`：验证中文硬编码数组→error、纯数字数组→pass、方向数组→warn、Object.values→pass
- [ ] 创建 `src/__tests__/plugins/no-chinese-template-string.test.ts`：验证中文模板→error、英文模板→pass、注释中中文→pass
- [ ] 创建 `src/__tests__/plugins/no-id-format-assumption.test.ts`：验证 `roomId: "xxx"`→error、`generateRoomId(...)`→pass、普通变量名→pass
- [ ] 创建 `src/__tests__/plugins/no-switch-without-contentpool.test.ts`：验证无 contentPool 的 switch→warn、有 pool.xxx 的 switch→pass、无 switch 文件→pass

## Verification

- [ ] 运行 `npm run lint`（biome check + tsc --noEmit + depcruise）全部通过
- [ ] 运行 `npx vitest run` — 全量测试无回归
- [ ] 手动确认 `find docs -name '*.md' | wc -l` ≈ 18（含 AGENTS.md）
- [ ] 手动确认 `ls plugins/*.grit | wc -l` = 12（8 现有 + 4 新增）
- [ ] Trap token re-check: 4 个新插件覆盖 trap-tokens.md 剩余 50% 模式
