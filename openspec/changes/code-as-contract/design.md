# Design: code-as-contract

## Data Flow

三条并行路径，彼此独立：

```
路径 A: 自动化 lint 覆盖
[Grit 插件扫描 AST] → [匹配反模式 pattern] → [biome check 报错] → [开发者修正]

路径 B: JSDoc 知识注入
[@module 描述 + @see 交叉引用 + 字段 @property 说明] → [IDE hover/跳转] → [开发者理解边界]

路径 C: 文档精简
[识别可替代的 doc 段落] → [确认已被 A 或 B 覆盖] → [删除 doc 文件] → [精简残留 docs]
```

三条路径无运行时数据依赖，不改动任何 world state。

## ContentPool Integration

不新增 ContentPool 字段。不改动任何 `world.contentPool.xxx` 读取逻辑。

JSDoc 注释中会记录现有 ContentPool 字段的读点（如 `@see world.contentPool.needLabels`），这是文档级的引用，不影响运行时。

## State Mutation Path

**无运行时状态变更。** 此次改动仅触及：
- 文件系统：新增 4 个 `.grit` 文件，修改 `biome.json`
- 代码注释：11 个 `.ts` 文件的 `@module` 块
- 文件系统：删除 17 个 `.md` 文件，修改 3 个 `.md` 文件

`npm test` 全部通过即无回归。

## Trap Token Verification

| File | Trap Checked | Status |
|------|-------------|--------|
| `plugins/no-array-constant-labels.grit` | no-hardcoded-labels (数组版) | ✅ 新增插件自动检测 |
| `plugins/no-chinese-template-string.grit` | no-hardcoded-description-text | ✅ 新增插件自动检测 |
| `plugins/no-id-format-assumption.grit` | ID 格式假设 | ✅ 新增插件自动检测 |
| `plugins/no-switch-without-contentpool.grit` | switch 无 contentPool | ✅ 新增插件自动检测 |
| `src/core/types.ts` | no-hardcoded-labels | ✅ 仅加 JSDoc，不新增映射表 |
| `src/core/world.ts` | no-create-default-outside-world | ✅ 仅加 JSDoc，不改构造逻辑 |
| 全部 11 个 JS 文件 | no-direct-world-mutation | ✅ 仅加注释，不写状态 |

## Grit 插件设计

### 1. `no-array-constant-labels.grit`

**目标模式**：`const X = ["str1", "str2", ...]` — 硬编码的字符串数组常量，可能应与 ContentPool 中的列表数据（needTypes、traitTypes、emotionTypes）保持一致。

**检测范围**：`src/engine/**`, `src/llm/**`, `src/combat/**`, `src/simulation/**`, `src/core/**`
**排除**：`__tests__/`, `types.ts`, `schemas/`, 导入语句

**误报风险**：纯数字数组、枚举值数组（`Object.values(enum)`）、空数组。需过滤 regex 检查元素是否为中文或看起来像游戏标签。

**策略**：默认警告（warn），不阻塞。因为数组常量可能合法（如 `["n", "s", "e", "w"]` 方向列表），需要人判断。对包含中文字符的数组升级为 error。

### 2. `no-chinese-template-string.grit`

**目标模式**：`` `中文模板 ${name}` `` — 包含中文的模板字符串，应来自 `ContentPool.narrativeTemplates`。

**检测范围**：同插件 1
**排除**：`__tests__/`, `types.ts`, `schemas/`, JSDoc/注释（仅检测 runtime code）

**检测方式**：模板字符串中包含 `\p{Script=Han}` Unicode 属性。

**策略**：error。中文叙事模板硬编码是确定的 ContentPool 违规。

### 3. `no-id-format-assumption.grit`

**目标模式**：`roomId: "字面量内容"` 或 `npcId: "字面量内容"` — 在代码中直接拼接假想的 ID 名字。

**检测方式**：赋值 `xxxId: "..."` 或 `xxxId = "..."` ，排除生成函数调用。

**策略**：error。ID 格式假设是已验证的 bug 来源（common-pitfalls 真实案例）。

### 4. `no-switch-without-contentpool.grit`

**目标模式**：`switch (action)` 函数体中未出现 `contentPool` 或 `pool.` 引用。

**检测方式**：找到 `switch` 语句所在的函数，检查函数体内是否有 contentPool 读取。

**策略**：warn。脚本级别的启发式，可能误报。适合作为提醒，不阻塞。

## JSDoc 规范

每个 `@module` 块位于文件头部、import 之前，格式：

```ts
/**
 * @module 模块中文名
 *
 * 一句话职责描述。
 *
 * ## 核心边界
 * - 可 import 自：src/xxx
 * - 不可 import 自：src/yyy
 *
 * ## 数据依赖
 * - 读取 world.contentPool.xxx
 * - 写入通过 delta pipeline
 *
 * @see docs/00-architecture.md — 架构全景
 * @see src/engine/command-executor.ts — 调用方
 */
```

内容来源：对应被删除的 doc 文件中的关键段落。一个知识点只保留一份。

## 文档迁移映射

| 被删除 doc | 知识迁移到 |
|-----------|-----------|
| `docs/dev-guide/trap-tokens.md` | 4 个新 grit 插件 + AGENTS.md 一行 `npm run lint` |
| `docs/dev-guide/common-pitfalls.md` | grit 插件 patterns + pre-commit script |
| `docs/dev-guide/add-command.md` | `src/engine/player-actions.ts` JSDoc + `src/engine/command-executor.ts` JSDoc |
| `docs/dev-guide/modification-workflow.md` | AGENTS.md (缩减版) |
| `docs/dev-guide/interaction.md` | `src/tui/key-layer.ts` @module |
| `docs/dev-guide/command-chain.md` | `src/engine/command-executor.ts` @module |
| `docs/dev-guide/key-bindings.md` | `src/tui/key-layer.ts` @module |
| `docs/dev-guide/config.md` | 各配置文件的 @module 注释 |
| `docs/dev-guide/logging.md` | 日志埋点规范 → `src/shared/logWrite.ts` @module |
| `docs/dev-guide/content-pool-dao.md` | `src/core/types.ts` ContentPool 接口 JSDoc |
| `docs/dev-guide/tui-architecture.md` | 各 TUI 子目录的 @module 注释 + depcruise rules |
| `docs/06-content-pool.md` | `src/core/types.ts` ContentPool 接口 @property 注释 |
| `docs/02-simulation-details.md` | `src/simulation/npc-simulator.ts` @module |
| `docs/05-player-flow.md` | `src/core/world.ts` @module |
| `docs/01-concepts-and-references.md` | `src/core/types.ts` 类型 JSDoc (概念/术语表) |
| `docs/dev-guide/content-pool-yaml.md` | 删除（schema 校验已覆盖格式规范） |
| `docs/dev-guide/mud-interaction.md` | 精简后合并到 `docs/00-architecture.md` |

## Test Plan

| Test File | Scenario | Assertions |
|-----------|----------|------------|
| `src/__tests__/plugins/no-array-constant-labels.test.ts` | 输入正确代码（数组来自 ContentPool） | 0 diagnostics |
| | 输入违规代码（中文硬编码数组） | 1+ error diagnostic |
| | 输入误报代码（纯数字数组 `[1,2,3]`） | 0 diagnostics |
| | 输入误报代码（`Object.values(Enum)`） | 0 diagnostics |
| `src/__tests__/plugins/no-chinese-template-string.test.ts` | 输入正确代码（英文模板） | 0 diagnostics |
| | 输入违规代码（中文模板） | 1+ error diagnostic |
| | 输入注释中的中文模板 | 0 diagnostics (JSDoc) |
| `src/__tests__/plugins/no-id-format-assumption.test.ts` | `roomId: generateRoomId(...)` | 0 diagnostics |
| | `roomId: "小村庄"` | 1+ error diagnostic |
| | `npcId: "铁匠"` | 1+ error diagnostic |
| | `const name = "小村庄"` (不是 ID) | 0 diagnostics |
| `src/__tests__/plugins/no-switch-without-contentpool.test.ts` | switch 函数体内无 contentPool | 1+ warn diagnostic |
| | switch 函数体内有 `pool.xxx` | 0 diagnostics |
| | 文件无 switch | 0 diagnostics |
| `npm test` (全量) | 现有 500+ 测试 | 全部通过，无回归 |

## Manual Checks

- [ ] `cd plugins && ls *.grit | wc -l` — 确认 11 个 grit 插件都在（新增 4 个）
- [ ] 目视检查一个核心文件的 JSDoc，确认 IDE hover 显示 `@module` 信息
- [ ] 故意写一段中文模板字符串，运行 `npm run lint` — 确认被拦截
- [ ] `find docs -name '*.md' | wc -l` — 确认文件数从 34 减少到 ~12
