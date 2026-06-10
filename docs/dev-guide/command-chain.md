---
name: command-chain
description: >
  命令执行链路：从键盘输入到状态变更的完整流程。
  Use for: understanding command execution, debugging command flow, adding command handlers.
---

# 命令执行链路

```
键盘输入 → app.tsx useKeyboard
         → key-layer / 当前界面状态
         → conn.execute(action, params)      # WebSocket 发送
         → ws-server.ts handleMessage        # 服务端接收
         → command-executor.ts executeCommand # 执行内置命令或房间动作
         → ws-server.ts send(command_result)  # 返回结果
         → game-client.ts handleServerMessage  # 客户端处理
         → pushEvent / setRoom / setEntity    # 更新信号
```

## 两类动作

| 类型 | 来源 | 用途 | 修改入口 |
|------|------|------|----------|
| 内置玩家命令 | `src/engine/player-actions.ts` | 移动、观察、交谈、战斗、背包等稳定能力 | 代码 |
| 房间动作 | `worlds/content-pool/entity-actions.yaml` + `needs-actions.yaml` | 酒馆吃饭、铁匠铺工作、采集等场景交互 | ContentPool |

优先判断能否做成房间动作。只有稳定、跨世界、和引擎协议相关的动作才新增内置玩家命令。

## 添加内置玩家命令

必须同步：

1. `src/engine/player-actions.ts` — 加入 `PLAYER_ACTIONS`
2. `src/engine/command-executor.ts` — `executeCommand()` 增加处理分支
3. `src/engine/capability-provider.ts` — `deriveCapabilities()` 决定什么时候显示
4. `src/shared/protocol.ts` — 如果参数或返回结构变化，同步协议类型
5. `src/client-tui/` — 如果需要新的面板、按键层或显示状态，同步 TUI
6. `src/__tests__/` — 增加执行测试和能力推导测试

示例：

```ts
// src/engine/command-executor.ts
case "forage":
  return executeForage(world, entityId)

function executeForage(world, entityId): CommandResult {
  // 逻辑...
  return {
    events: [{ type: "forage", description: "你采集了一些草药。" }],
    delta: { needChanges: [{ targetId: entityId, needType: "hunger", delta: 5 }] },
    ended: false,
  }
}
```

不要只改客户端按钮。按钮能显示不代表服务端会接受，也不代表当前上下文应该显示。

## 添加房间动作

房间动作不加入 `PLAYER_ACTIONS`。它由房间 tag 决定是否可用，执行时通过 `executeRoomAction()` 读取 ContentPool：

1. `worlds/content-pool/needs-actions.yaml` — 加 `actionEffects`
2. `worlds/content-pool/entity-actions.yaml` — 把 action 挂到 room tag，并配置显示标签
3. 房间数据 — 确认目标房间有对应 `tags`
4. 测试 — 优先补 `integration/entity-actions.test.ts`

示例：

```yaml
# needs-actions.yaml
actionEffects:
  - action: forage
    needDeltas: { rest: -8 }
    itemDeltas: { herb: 1 }

# entity-actions.yaml
entityActionsByTag:
  forest: [forage]

entityActionLabels:
  forage: 采集
```

如果要让 TUI 自动展示房间动作，应从服务器下发的能力或房间状态推导，不要在客户端维护另一份动作清单。
