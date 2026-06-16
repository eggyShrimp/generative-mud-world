# Design: tui-entity-detail-popup

## Component Hierarchy

```
RoomPanel (modified)
├── EntityDetailPopup (new)           ← entity.type === "item"
│   └── PopupPanel                    ← title=entity.name, borderColor=THEME.focus
│       ├── box / scrollbox           ← typeLabel + description
│       ├── divider                   ← border-top
│       └── box                       ← KeyHint action list
├── TargetActionPopup (unchanged)    ← entity.type !== "item"
│   └── PopupPanel
│       └── KeyHint action list
└── EntityList / ExitList / RoomActionList (unchanged)
```

`EntityDetailPopup` 与 `TargetActionPopup` 的 props 接口完全一致（`{ client: GameClient; entity: RoomEntity | null }`），RoomPanel 在渲染时按 `entity.type` 选择组件。

`EntityDetailPopup` 是目标上下文菜单，不是背包/对话这类独立流程。它 MUST 保持小型弹窗形态，不使用全局 `getModalMetrics` 尺寸，也不覆盖事件日志或出口区域。

## Verification Harness

Current `vitest.config.ts` intentionally includes only `src/**/*.test.ts`; `.test.tsx` rendering tests require a separate executable entry. The implementation MUST make that entry explicit before relying on new component tests.

Acceptable options:

- add `vitest.bun.config.ts` and run rendering tests with `bunx vitest run --config vitest.bun.config.ts`
- or update the existing Bun test setup so `bun test src/__tests__/*.test.tsx` works

The chosen path MUST be proven by running one pre-existing rendering test (for example `src/__tests__/event-log.test.tsx`) and the new rendering tests. `npm test` alone is not sufficient verification for this change.

## Protocol Messages

无变化。现有 `RoomEntity` 的 `type` / `typeLabel` / `description` 字段已满足需求。

## depcruise Boundary Verification

| Rule | Status | Notes |
|------|:--:|-------|
| tui-no-direct-engine-import | ✅ | 不引入 engine/combat/simulation/llm 导入 |
| combat-config-only-via-contentpool | ✅ | N/A — TUI 变更不涉及 combat config |

## Display Text

| UI Element | Source | Notes |
|------------|--------|-------|
| `entity.typeLabel` | `RoomEntity.typeLabel` (server ContentPool → capability-provider) | "物品"/"人物" 等 |
| `entity.description` | `RoomEntity.description` (server engine → ws-server) | 实体描述文本 |
| "加载中..." | 硬编码（与 TargetActionPopup 一致） | structural UI text |

## Test Plan

### Test toolkit

使用 `testRender` from `@opentui/solid` 测组件渲染，Mock `GameClient` 参考 `src/__tests__/key-layer.test.ts` 的模式。

### Test files

| Test File | Scenario | Assertions |
|-----------|----------|------------|
| `src/__tests__/entity-detail-popup.test.tsx` | 正常渲染物品实体 | content 区包含 typeLabel + description；interaction 区包含操作列表 |
| `src/__tests__/entity-detail-popup.test.tsx` | 实体为 null | 弹窗不渲染 |
| `src/__tests__/entity-detail-popup.test.tsx` | 加载态 | 显示 LoadingHint |
| `src/__tests__/entity-detail-popup.test.tsx` | 无 typeLabel / 无 description | 回退正常，不崩溃 |
| `src/__tests__/entity-detail-popup.test.tsx` | 点击动作 | 触发 action.run，调用 `client.execute(...)`，并清除 `selectedEntityId` |
| `src/__tests__/room-panel.test.tsx` (new) | item 实体选中 | 渲染 EntityDetailPopup |
| `src/__tests__/room-panel.test.tsx` (new) | npc 实体选中（无 talk 能力） | 渲染 TargetActionPopup |

## Manual Checks

- [ ] `npm run dev:tui` — 在房间中选择物品（如干面包），确认弹出 EntityDetailPopup，显示类型标签+描述+操作
- [ ] 选择 NPC（无对话能力的简单 NPC），确认仍弹出 TargetActionPopup
