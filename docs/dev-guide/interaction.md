---
name: interaction-model
description: >
  两层交互模型：键盘处理层级与事件传播。
  Use for: keyboard handling, event propagation, input layer design.
---

# 两层交互模型

## 键盘处理层级

```
Layer 0: 对话模式 → 数字键选选项，Esc 关闭
Layer 1: 物件选中 → 数字键执行操作，Esc 回退，其他键穿透
Layer 2: 基础层   → 方向 / 房间动作 / 全局操作
Layer 3: 数字键   → 选中物件
```

实际键位层定义在 `src/client-tui/key-layer.ts`。修改交互时先看 layer 顺序和 `passthrough` 设置，避免新键位盖住对话、背包、任务等临时面板。

## 选中物件后的子菜单

由 `src/client-tui/app.tsx` 渲染：

```
选中前：                            选中 [1] 旅店老板：
可交互:                            ▸ 选中: 旅店老板
  [1] 旅店老板                       [1] 交谈  [2] 观察
  [2] 铜币                           [Esc] 返回
出口: [N]北 [S]南                    出口: [N]北 [S]南
```

## 添加新的物件操作

- `src/client-tui/key-layer.ts` 的 `getEntityActions()` 加操作
- 服务端如果需要新动作，按 `docs/dev-guide/command-chain.md` 同步命令链路
- 操作执行后必须有事件反馈，不要只改变状态
