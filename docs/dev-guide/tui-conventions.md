---
name: tui-conventions
description: >
  TUI 组件约定：文本渲染、组件复用、Solid.js 模式。
  Use for: TUI components, Solid.js patterns, text rendering.
---

# TUI 组件约定

## 文本渲染

用 JSX 子节点语法，不用 `content` prop（不响应式）：

```tsx
// ✓ 正确
<text>{needBar(type, value)}</text>
<text><strong>{name}</strong></text>

// ✗ 错误（content 不响应式）
<text content={needBar(type, value)} />
```

## 鼠标交互

`onMouseDown` 在 OpenTUI 中可用于 `<text>`，但 `selectable` 默认为 true（文字可选中），会消费鼠标事件。交互按钮需要同时设置：

```tsx
<text onMouseDown={() => doSomething()}>
  [R] 休息
</text>
```

键盘是主要交互方式，鼠标为辅。

## 文本选择与复制

`selectable` 默认为 `true`，允许鼠标拖选文字。选中后按 `Cmd+C` 通过 OSC 52 协议复制到系统剪切板。

**规则：**

- 包含 `onMouseDown` 的 `<text>` 或其父 `<box>` 有 `onMouseDown` → 必须设置 `selectable={false}`（否则鼠标事件被选中逻辑消费，点击失效）
- 非交互的信息文本（房间名、房间描述、对话选项、物品详情、事件日志）→ 保持默认（可选中）
- 装饰性文字（箭头、前缀、分隔线）→ 保持 `selectable={false}`

**OSC 52 兼容性：** iTerm2 默认启用，Terminal.app 需在 设置 → 描述文件 → 高级 中启用 "Allow clipboard access"。

## 布局

```
宽屏（≥80列）:                      窄屏（<80列）:
┌──────────┬──────┐               ┌──────────┐
│ RoomPanel│Side- │               │StatusBar │
│          │bar   │               │RoomPanel │
│ EventLog │      │               │EventLog  │
│          │      │               │Sidebar   │
├──────────┴──────┤               ├──────────┤
│ DialoguePanel   │               │Dialogue  │
└─────────────────┘               └──────────┘
```
