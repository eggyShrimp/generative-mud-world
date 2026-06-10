---
name: key-bindings
description: >
  键位管理：所有键位层定义在 key-layer.ts，不要在组件里另维护键位表。
  Use for: key bindings, keyboard shortcuts, key layer management.
---

# 键位管理

所有键位层定义在 `src/client-tui/key-layer.ts`。不要在组件里另维护一份键位表。

```ts
// src/client-tui/key-layer.ts
const BASE_LAYER: KeyLayer = {
  id: "base",
  priority: 0,
  passthrough: true,
  bindings: [
    { key: ["n", "up"], handler: makeDirectionHandler("n"), label: "北" },
    { key: "r", action: "rest", label: "休息" },
    { key: "i", handler: (c) => c.openInventory(), label: "背包" },
    { key: "1-9", handler: handleEntitySelect, label: "" },
  ],
}
```

## 添加新键位

1. 先判断是全局键、房间动作、实体操作、背包操作，还是临时面板操作。

2. 在 `src/client-tui/key-layer.ts` 的对应 layer 或 helper 中添加绑定。

3. 如果它会发服务端命令，按 `docs/dev-guide/command-chain.md` 同步服务端动作和测试。

4. 如果只是场景交互，优先做成 `entity-actions.yaml` 中的房间动作，不要新增全局键。

## 键位冲突检查

| 键 | 用途 | 注意 |
|---|------|------|
| `1-9` | 选中物件/目标 | 物件列表可见时 |
| `N/S/E/W/U/D` | 移动 | 有出口才执行，无出口穿透 |
| `A-Z` | 房间动作 | 房间动作会先于全局键处理，新增前检查是否遮挡常用键 |
| `R/Q/I/J/M/0` | 通用操作 | 由 capability 或本地状态决定是否可用 |
| `Esc` | 关闭子菜单 | 子菜单打开时 |
| `Cmd+C` | 复制选中文字 | 选中文本后按，通过 OSC 52 复制到系统剪切板 |
| `Ctrl+C` | 退出客户端 | 始终可用 |

数字键和方向键有独立处理层，不会冲突。
