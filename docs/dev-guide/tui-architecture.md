---
name: tui-architecture
description: >
  TUI 新架构规范：src/tui/ 的目录职责、依赖规则、模块合约、测试要求。
  Use for: any modification to src/tui/, adding new panels, adding new features.
---

# TUI 架构规范

## 目录结构

```
src/tui/
├── index.tsx                          # 入口
├── app.tsx                            # 组装根
├── controllers/
│   └── keyboard-controller.tsx        # 唯一键盘入口
├── client/
│   └── game-client.ts                 # WebSocket 客户端 + GameClient 接口
├── key-layer/
│   └── index.ts                       # Layer 系统 + dispatchKey
├── layout/
│   ├── main-layout.tsx                # WideLayout / NarrowLayout
│   ├── metrics.ts                     # 布局计算函数
│   ├── popup-panel.tsx                # 弹窗容器
│   └── interaction-panel.tsx          # 互动面板
├── theme/
│   ├── theme.ts                       # THEME 色板对象
│   ├── tone.ts                        # 色值判定函数
│   ├── event-style.ts                 # 事件类型 → 前缀+颜色
│   └── progress-format.ts             # 色条渲染函数
├── components/
│   ├── bar-row.tsx                    # label+bar+value 行
│   ├── empty-state.tsx                # 空状态占位
│   ├── key-hint.tsx                   # 快捷键提示
│   ├── loading-hint.tsx               # 加载中提示
│   ├── section.tsx                    # 分组容器
│   ├── section-title.tsx              # 分组标题
│   ├── tab-bar.tsx                    # 通用 Tab 栏
│   ├── target-action-popup.tsx        # 目标动作弹窗
│   └── index.ts                       # barrel re-export
├── panels/
│   ├── room/room-panel.tsx            # 房间面板
│   ├── sidebar/status-bar.tsx         # 顶部状态栏
│   ├── sidebar/sidebar.tsx            # 侧栏
│   ├── event-log/event-log.tsx        # 事件日志
│   ├── inventory/inventory-panel.tsx  # 背包面板
│   ├── status/status-panel.tsx        # 角色状态
│   ├── quests/quests-panel.tsx        # 任务面板
│   ├── travelogue/travelogue-panel.tsx# 游记面板
│   ├── end-day/end-day-panel.tsx      # 结束当天
│   ├── dialogue/dialogue-panel.tsx    # 对话面板
│   ├── dialogue/trade-detail.tsx      # 交易详情（仅 dialogue 可用）
│   ├── map/map-panel.tsx              # 地图面板
│   └── combat/combat-panel.tsx        # 战斗面板
├── overlays/
│   ├── quest-notification.tsx
│   └── item-change-notification.tsx
└── features/
    ├── room/entity-list-layout.ts     # 列表行构建
    ├── room/relation-format.ts        # 关系文本格式化
    ├── inventory/grouping.ts          # 物品分组
    ├── quests/progress.ts             # 任务进度文本
    ├── quests/progress.ts             # 任务进度文本
    ├── map/rendering.ts               # 地图渲染逻辑
    └── combat/formatting.ts           # 战斗日志格式化
```

## 依赖规则

dependency-cruiser 强制执行：

| 规则 | 方向 | 说明 |
|------|------|------|
| tui-panels-no-cross-import | `panels/* → panels/*` | 面板间零依赖（同目录内允许，如 dialogue/trade-detail） |
| tui-layout-no-panels | `layout → panels` | 布局不引用面板 |
| tui-theme-no-client | `theme → client` | 主题不引用客户端 |
| tui-features-no-panels | `features → panels` | 纯逻辑不引用面板 |
| tui-no-old-client-tui-import | `src/tui → src/client-tui` | 新旧不互通 |
| tui-no-direct-engine-import | `src/tui → engine/combat/simulation/llm/core` | 经 shared/protocol 过滤 |

## 模块合约

### Panels

- 接收 `client: GameClient` + 可选 `metrics` / `height` / `narrow`
- **不调用** `useKeyboard` / `useInput`
- **不 import** 其他 panels 目录
- **可以** 自行 `createMemo` 从 `client` 推导信号
- **可以** import `theme`、`layout`、`components`、`features`、`key-layer`

### Layout

- `metrics.ts`：纯函数，输入终端尺寸，输出布局对象
- `popup-panel.tsx`：渲染型组件，不读游戏状态
- `main-layout.tsx`：组合区域，不读 `client` 信号

### Theme

- `theme.ts`：THEME 常量，全 TUI 唯一颜色源
- **不 import** `GameClient`、不 import 任何 `protocol` 类型

### Features

- 只导出纯函数（不导出组件、不调用 hook）
- **不 import** panels、client、layout
- **可以** import `shared/protocol` 类型

### KeyboardController

- 唯一调用 `useKeyboard` 的地方
- 唯一调用 `useRenderer` 的地方
- 不调用 `createMemo` / `createEffect`

## 循环依赖特例

`client/game-client.ts` ↔ `key-layer/index.ts` 存在类型级循环：

- `game-client.ts` 导入 `activeLayer`、`pushLayer` 等运行时函数
- `key-layer/index.ts` 用 `import type` 导入 `GameClient` 接口

ES 模块已处理此情况，`import type` 不产生运行时循环。

## 测试要求

- 每个纯函数（features、theme/progress-format、layout/metrics）必须有单元测试
- dependency-cruiser 规则通过 `npm run lint` 验证
- 现有测试（`src/__tests__/tui-app.test.ts`）保持不变

## 新增面板 checklist

1. 在 `panels/<name>/` 下创建文件
2. 确认不 import 其他 panels
3. 确认接收 `client: GameClient` 作为 prop
4. 确认不调用 `useKeyboard`
5. 在 `app.tsx` 中组装
6. 在 `key-layer/index.ts` 中添加对应 layer（如有）
7. 运行 `npm run build -- --noEmit && npm test && npm run lint`
