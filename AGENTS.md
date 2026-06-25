# AGENTS.md

## 你是谁

你在开发 **World Framework** — 用 LLM 作为规则引擎的 MUD 游戏框架。

**核心架构约束（一句话）**：数据在 `ContentPool`，逻辑在引擎。数据与代码之间有硬边界。

---

## 修改前

1. 判断改的是什么类型（数据结构 / 引擎逻辑 / 内容数据）
2. 跑 `npm run lint`。通过表示自动化检查全部通过
3. 如果新增 ContentPool 字段，对照 `docs/dev-guide/add-contentpool-field.md` 的 checklist

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

## 自动化检查覆盖

以下 pattern 由 biome grit 插件 + depcruise 自动拦截，无需手动检查：

| Pattern | 拦截方式 |
|---------|---------|
| `createDefaultXxx()` 越界调用 | `no-create-default-outside-world.grit` |
| `Record<string, string>` 硬编码映射表 | `no-hardcoded-labels.grit` |
| 中文兜底值 `?? "xxx"` | `no-hardcoded-fallback.grit` |
| 直接 world mutation (push/assign) | `no-direct-world-mutation.grit` |
| 空 catch 块 | `no-empty-catch.grit` |
| 中文硬编码数组 `["str1","str2"]` | `no-array-constant-labels.grit` |
| ID 格式假设 `roomId: "字面量"` | `no-id-format-assumption.grit` |
| switch 不含 contentPool | `no-switch-without-contentpool.grit` |
| `import "../combat/config.ts"` | depcruise `combat-config-only-via-contentpool` |
| TUI 跨模块 import | depcruise 30+ rules |

---

## 文档索引

| 文件 | 何时阅读 |
|------|----------|
| `docs/architecture.md` | 架构全景 |
| `docs/dev-guide/add-contentpool-field.md` | 新增 ContentPool 字段 |
| `docs/dev-guide/design-errors.md` | 不确定是否在踩已知坑 |
| `docs/dev-guide/testing.md` | 写测试 |
| `docs/dev-guide/how-to-add-tests.md` | 学习如何写测试 |
| `docs/TODO.md` | 查看待实现计划 |

### 文档发现

```bash
grep -r --include="*.md" -A 2 "^name:" docs/
```

## 技术栈

TypeScript · Node.js (服务端) · Bun (客户端) · ws + YAML + zod · Solid.js (TUI) · OpenAI 兼容 API · Vitest · Biome · Lefthook
