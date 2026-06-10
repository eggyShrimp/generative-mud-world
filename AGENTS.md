# AGENTS.md

## 你是谁

你在开发 **World Framework** — 用 LLM 作为规则引擎的 MUD 游戏框架。

**核心架构约束（一句话）**：数据在 `ContentPool`，逻辑在引擎。数据与代码之间有硬边界。

---

## 任何修改前，必须执行这三步

### 1. 确定你改的是什么

| 类型 | 判断 | 后续操作 |
|------|------|----------|
| 数据结构 | 改了 types/schema/ContentPool 字段 | → 执行步骤 2 |
| 引擎逻辑 | 改了 simulation/engine/combat 中的逻辑 | → 执行步骤 3 |
| 内容数据 | 改了 YAML/Prompt 示例/标签 | → 改数据文件，不写代码 |

### 2. 如果接触了 ContentPool 字段

```bash
# 第一步：找到所有消费者（复制执行）
rg "字段名" src/ --type ts | grep -v __tests__ | grep -v "\.d\.ts"
```

然后对照完整 checklist：**`docs/dev-guide/add-contentpool-field.md`**（12 项）。

### 3. 如果你写了常量/映射表/中文标签

对照 **`docs/dev-guide/trap-tokens.md`**。如果代码匹配表中任何 pattern → 停止硬编码，走 ContentPool 路径。

详细工作流：**`docs/dev-guide/modification-workflow.md`**

---

## 决策树：这个值应该放 ContentPool 还是代码

当你需要添加一个映射表 (`key → value`) 时，问自己：

```
1. 这个映射可以被 LLM 演化吗？
   → 是 → 必须在 ContentPool
   → 否 → 继续问 2

2. 这个映射是"游戏世界观"还是"引擎约定"？
   → 世界观 → ContentPool
     例: actionLabel("talk") → "对话" (语言/文化)
   → 引擎约定 → 代码中
     例: directionKeys["n"] → ["north", "北"] (键盘绑定)

3. mod 作者需要修改这个值吗？
   → 需要 → ContentPool
   → 不需要 → 代码中

4. 这个值和 LLM prompt 有关联吗？
   → 有关联 → ContentPool
   → 无关联 → 代码中
```

**快速判断**：看到 `const MAP = { key: "中文标签" }` — 停下，检查 ContentPool。

---

## 陷阱 Token 速查

代码中出现以下 pattern 时硬拦截：

| Pattern | 应改为 |
|---------|--------|
| `createDefaultCombatConfig()` (非 world.ts) | `world.contentPool.combatConfig` |
| `createDefaultXxx()` (任何) | 检查 ContentPool 是否已有对应字段 |
| `const X: Record<string, string> = {` | ContentPool 的 `xxxLabels` 字段 |
| `["str1", "str2", ...]` (常量数组) | 来自 ContentPool 的数据 |
| `` `中文模板 ${name}...` `` | `ContentPool.narrativeTemplates` |
| `catch { }` (空块) | 至少写一行错误处理代码（注释不算） |

完整表：**`docs/dev-guide/trap-tokens.md`**

---

## 文档索引

| 文件 | 何时阅读 |
|------|----------|
| `docs/dev-guide/modification-workflow.md` | **任何修改前** |
| `docs/dev-guide/trap-tokens.md` | **写了常量/映射表后** |
| `docs/dev-guide/add-contentpool-field.md` | **新增 ContentPool 字段** |
| `docs/dev-guide/add-command.md` | **新增玩家命令** |
| `docs/dev-guide/common-pitfalls.md` | **提交前自查** |
| `docs/dev-guide/design-errors.md` | **不确定是否在踩已知坑时** |
| `docs/dev-guide/mud-interaction.md` | **修改 TUI/交互逻辑** |
| `docs/dev-guide/testing.md` | **写测试** |
| `docs/dev-guide/logging.md` | **加日志** |
| `docs/08-code-quality-review.md` | **了解当前代码质量状态** |

### 文档发现

所有 `docs/` 下的 `.md` 文件都包含 YAML frontmatter（`name` + `description`）。当上表不够精确时，用以下命令搜索全部文档的元数据：

```bash
grep -r --include="*.md" -A 2 "^name:" docs/
```

根据任务关键词匹配 `description` 字段，然后 `Read` 匹配到的文档全文。

## 技术栈

TypeScript · Node.js (服务端) · Bun (客户端) · ws + YAML + zod · Solid.js (TUI) · OpenAI 兼容 API · Vitest · Biome · Lefthook
