---
name: common-pitfalls
description: >
  常见反模式与预防规则：基于实际 bug 的检查清单，每条带可执行检查命令。
  Use for: pre-commit checks, anti-patterns, known pitfalls, debugging recurring bugs.
---

# 常见反模式与预防规则

基于实际 bug 的预防检查清单。每条规则包含**可复制执行的检查命令**。

---

## 如果修改了数据结构 (zod schema)

### 检查 LLM prompt JSON 示例是否同步

```bash
# 找出所有引用了被修改字段的 prompt 文件
FIELD="你新增的字段名"
rg "$FIELD" src/llm/prompts/ src/llm/tools/
```

确认 prompt 中 JSON 示例的字段格式与 schema 一致。

> **真实案例**：LLM prompt 中 exits 写成 `"南": "room_id"`（字符串），
> 但 materialize() 期望完整 Exit 对象。LLM 照示例返回 → exit.to 为 undefined。

---

## 如果新增或修改了实体 ID 的使用

### 检查是否假定了 ID 格式

```bash
# 搜索可能假定了 ID 格式的地方
rg 'roomId:\s*"[^"]*"' src/ --type ts | grep -v generateRoomId
```

实体 ID 只能由 `generateRoomId`/`generateNPCId` 等函数生成，
或来自 `world.entities.get()`/`world.rooms.get()` 的返回值。
永远不假设 ID = name 或 name + 前缀。

> **真实案例**：fallback NPC 用 `roomId: "小村庄"`，
> 但实际 room ID 由 `generateRoomId` 生成为 `room_小村庄`。
> addEntity 查房失败，NPC 成为孤魂。

---

## 新增/修改命令系统时

### 三处同步检查

```bash
NEW_ACTION="your_action_name"
for file in src/engine/player-actions.ts src/engine/command-executor.ts src/engine/capability-provider.ts; do
  echo "--- $file ---"
  rg "\"$NEW_ACTION\"" "$file" || echo "  ❌ NOT FOUND"
done
```

新增玩家命令必须同时更新：
1. `src/engine/player-actions.ts` — `PLAYER_ACTIONS` 数组
2. `src/engine/command-executor.ts` — switch case（缺 case 编译报错，无 default 分支）
3. `src/engine/capability-provider.ts` — `deriveCapabilities`（决定是否显示按钮）

> 详细说明：`docs/dev-guide/add-command.md`

---

## 每次提交前

### 检查空 catch 块

```bash
# 检查 staged 文件中的空 catch 块
git diff --cached --name-only | grep '\.ts$' | xargs grep -Pzo 'catch\s*(\([^)]*\))?\s*\{\s*\}' 2>/dev/null
```

每个 catch 块都应有 `logWrite` 或 `console.error`。

> **真实案例**：YAML 解析 catch 块为空 → 坏文件被静默吞掉，
> 表象是不明原因的默认值行为。

### 检查是否有 ≥2 处存在同样的常量集合

```bash
# 在 pending changes 中搜索重复的常量列表
git diff --cached --unified=0 | grep '^+' | grep -oP '\["[^"]*"(?:,\s*"[^"]*")*\]' | sort | uniq -c | sort -rn | awk '$1 > 1'
```

搜索相同的字符串列表是否在 ≥2 个文件中出现。如果有，抽取到 ContentPool 或共享文件。

> **真实案例**：玩家动作名在 command-registry、executor、capability-provider 三处各维护一份列表。

### 检查陷阱 token

```bash
# 对 staged 文件执行陷阱检查
git diff --cached --name-only | grep '\.ts$' | grep -v __tests__ | while read f; do
  if grep -q 'createDefaultCombatConfig' "$f"; then
    echo "  ❌ $f: createDefaultCombatConfig — 请使用 world.contentPool.combatConfig"
  fi
  if grep -q 'const\s\+\w\+\s*:\s*Record<string,\s*string>\s*=\s*{' "$f"; then
    echo "  ⚠ $f: Record<string, string> — 检查 ContentPool 是否已有此映射"
  fi
done
```

完整陷阱表：`docs/dev-guide/trap-tokens.md`
