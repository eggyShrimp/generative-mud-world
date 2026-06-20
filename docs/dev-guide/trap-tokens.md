---
name: trap-tokens
description: >
  陷阱 Token 速查表：代码中出现硬编码 pattern 时的检查与修复指引。
  Use for: detecting hardcoded values, anti-patterns, ContentPool migration.
---

# 陷阱 Token 速查表

在代码中看到以下 pattern 时，**停止硬编码，执行对应检查**。

| 看到的 Pattern | 你的风险 | 必须执行的检查 |
|---------------|---------|---------------|
| `createDefaultXxx()` | 绕过已加载的 ContentPool 实例 | `rg "world.contentPool.xxx" src/ --type ts` 看是否有已加载实例可用。此函数**仅在 `createDefaultContentPool()` 内可调用** |
| `const MAP: Record<string, string> = {` | 双源维护 | 检查 ContentPool 是否已有此映射（`needLabels`, `traitLabels`, `emotionLabels`, `entityActionLabels` 等）。grep ContentPool 接口 |
| `["str1", "str2", ...]` (数组常量) | 双源维护 | 同上。特别是 need type 列表、trait 列表、emotion 列表 |
| 中文模板字符串 `` `...${name}...` `` | 叙事模板硬编码 | 应来自 `ContentPool.narrativeTemplates`。如果不存在，先加到 ContentPool |
| `import { ... } from "../combat/config.ts"` | 绕过 ContentPool | 战斗配置应从 `world.contentPool.combatConfig` 读取，非 `createDefaultCombatConfig()` |
| `_config: CombatConfig` (未使用参数) | 被跳过的演化点 | 要么用 `config.xxx`，要么删除参数 |
| `catch {` 或 `catch (e) {` (空块) | 吞错 | 至少写一行错误处理代码（注释不算） |
| `roomId: "一些名字"` | ID 格式假定 | 实体 ID 只能由 `generateRoomId`/`generateNPCId` 等函数生成 |
| `switch(action)` (不含 `world.contentPool`) | 规则硬编码 | switch 中的标签/映射/数值应从 ContentPool 读取 |
| `needType: "hardcoded_string"` | Need 类型硬编码 | 应使用 `NeedType` 联合类型或从 `pool.needDefinitions` 读取 |
| `?? "包含中文的值"` 或 `\|\| "包含中文的值"` | 中文兜底值硬编码 | 应来自 ContentPool（`narrativeTemplates`、`relationLabels` 等）或返回 null 交给上层。由 `no-hardcoded-fallback.grit` 自动拦截 |
| `return "中文字符串"` (函数末尾) | 兜底 return 值硬编码 | 同上，特别是 `buildContext()` / `buildMinimalContext()` 这类 context builder |

## 快速自检命令

```bash
# 检查当前修改的文件中是否有陷阱 pattern
for f in $(git diff --cached --name-only | grep '\.ts$'); do
  echo "=== $f ==="
  # 检查是否直接调用了 createDefaultCombatConfig
  grep -n 'createDefaultCombatConfig' "$f" && echo "  ⚠ 请使用 world.contentPool.combatConfig"
  # 检查是否有空 catch 块
  grep -Pzo 'catch\s*(\([^)]*\))?\s*\{\s*\}' "$f" && echo "  ⚠ 空 catch 块需要 logWrite"
  # 检查是否有硬编码的中文映射表
  grep -nE '(const|let|var)\s+\w+\s*:\s*Record<string,\s*string>\s*=\s*\{' "$f" && echo "  ⚠ 检查 ContentPool 是否已有此映射"
done
```
