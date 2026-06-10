---
name: add-command
description: >
  新增/修改玩家命令的三处同步流程。
  Use for: adding new commands, modifying existing commands, extending command system.
---

# 新增/修改命令系统

新增玩家命令必须**三处同步**更新，缺一处编译会通过但运行时行为异常。

## 三处同步检查

| 文件 | 职责 | 缺失后果 |
|------|------|----------|
| `src/engine/player-actions.ts` | `PLAYER_ACTIONS` 数组 — 定义哪些 action 存在 | 新增 action 不在白名单中，服务端拒绝 |
| `src/engine/command-executor.ts` | switch case — 定义执行逻辑（缺 case 编译报错，无 default 分支） | 编译通过但运行时无 handler |
| `src/engine/capability-provider.ts` | `deriveCapabilities` — 决定是否显示按钮 | 界面不显示对应操作的按钮 |

三者职责：**玩家动作集合（what exists）→ 命令执行（what happens）→ 能力推导（when available）**。

## 自动检查

```bash
# 检查所有三处是否都引用了新 action
NEW_ACTION="your_action_name"
for file in src/engine/player-actions.ts src/engine/command-executor.ts src/engine/capability-provider.ts; do
  echo "--- $file ---"
  rg "\"$NEW_ACTION\"" "$file" || echo "  ❌ NOT FOUND"
done
```
