# Proposal: tui-entity-detail-popup

## Why

当前 `TargetActionPopup` 是一个轻量弹窗，用 `PopupPanel` 平铺显示实体的操作列表（观察/拾取/攻击等），不展示实体本身的类型标签和描述。对于物品（`type: "item"`），用户需要在交互前了解"这是什么"。

新增 `EntityDetailPopup`：沿用轻量目标弹窗模型，在物品操作列表上方展示实体类型标签和描述。`TargetActionPopup` 保留不变，作为默认轻量弹窗。

## What Changes

- 修复/确认 TUI 渲染测试入口可执行，确保 `.test.tsx` 组件测试会被实际运行。
- 新增 `EntityDetailPopup`，用于物品实体选中后的轻量上下文弹窗。
- 弹窗继续使用 `PopupPanel`，在同一个小型目标菜单内展示物品类型、描述和操作列表。
- `RoomPanel` 按 `entity.type` 分流：物品使用 `EntityDetailPopup`，非物品继续使用 `TargetActionPopup`。
- 不新增 key layer，不改协议字段，不改引擎逻辑。

## Change Type

**tui-only** — Client-side TUI change. No ContentPool. No engine logic.

## Components Touched

| File | Change Type | Description |
|------|-------------|-------------|
| `vitest.bun.config.ts` or existing test config | add/modify | 提供可执行的 `.test.tsx` 渲染测试入口 |
| `src/tui/components/entity-detail-popup.tsx` | new | 新增 `EntityDetailPopup` 组件，使用轻量 `PopupPanel` 布局 |
| `src/tui/components/index.ts` | modify | 新增导出 `EntityDetailPopup` |
| `src/tui/panels/room/room-panel.tsx` | modify | 按 `entity.type` 分流：物品用 `EntityDetailPopup`，其余用 `TargetActionPopup` |

## Protocol Surface

无变化。`RoomEntity` 已有 `type`、`typeLabel`、`description` 字段，无需新增。

## Boundary Self-Check

- [x] No imports from `src/engine/`
- [x] No imports from `src/combat/`
- [x] No imports from `src/simulation/`
- [x] No imports from `src/llm/`
- [x] No imports from `src/core/` (except `src/shared/` which is allowed)
- [x] Business/world display text comes from server ContentPool label fields
- [x] Structural UI text that remains hardcoded is listed in design.md

## Impact

- 物品交互体验提升：选择物品后看到类型标签（如"物品"）和描述，再选择操作
- `TargetActionPopup` 仍可用于 NPC（无 talk 能力）、可操作对象等简单场景
- 新增组件沿用 `TargetActionPopup` 的轻量弹窗模型，保持目标菜单交互一致
- `entity-selected` key-layer 不变，两个弹窗共用同一层

## Test Impact

| Test File | Coverage |
|-----------|----------|
| `src/__tests__/entity-detail-popup.test.tsx` | 新增：弹窗渲染、内容/交互区布局、加载态、空态 |
| `src/__tests__/room-panel.test.tsx` | 新增：验证按实体类型分流渲染正确弹窗 |

Rendering tests are not covered by the default `npm test` / `npx vitest run` entry because `vitest.config.ts` includes only `.test.ts`. This change MUST include a runnable `.test.tsx` command and verify it with at least one existing rendering test plus the new tests.
