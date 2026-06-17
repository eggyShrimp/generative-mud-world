# Proposal: day-night-season-weather-tui

## Why

引擎计算出当前时段、季节和天气后，玩家需要在 TUI 状态区看到这些信息，才能感受到时间和环境变化。展示层只读取服务端协议字段，不直接导入引擎或 ContentPool。

## Change Type

**tui-only** — Client-side TUI change. No ContentPool. No engine logic.

## What Changes

- `StatusMessage` 已有服务端提供的 `period`、`season`、`weatherLabel` 字段（协议侧已完成）。
- 服务端 `sendStatus()` 已从世界状态和 ContentPool 标签中组装这些字段（已完成）。
- TUI 可见状态区显示日期、季节、天气。
- 可见状态区在窄终端下保持不重叠、不挤掉已有状态信息。

## Components Touched

| File | Change Type | Description |
|------|-------------|-------------|
| `src/tui/panels/sidebar/role-card.tsx` | modify-component | Render season and weather labels in the visible status area |

## Protocol Surface

`StatusMessage` fields (already implemented):

| Field | Source |
|-------|--------|
| `period` | `world.contentPool.dayNightConfig` matching `world.time.period` |
| `season` | `world.contentPool.seasonConfig` matching `world.time.season` |
| `weatherLabel` | `world.weatherByRegion` for the player's current region |

## Boundary Self-Check

- [x] No imports from `src/engine/`
- [x] No imports from `src/combat/`
- [x] No imports from `src/simulation/`
- [x] No imports from `src/llm/`
- [x] No imports from `src/core/` in TUI components
- [x] Business/world display text comes from server-provided labels
- [x] Structural UI separators may be hardcoded and are listed in design.md

## Impact

- Players can see current time environment in the normal status area.
- TUI still receives a single `status` message and does not need engine imports.
- Existing status fields remain visible.

## Test Impact

| Test File | Coverage |
|-----------|----------|
| `src/__tests__/role-card.test.ts` | Status area renders environment labels |
| `src/__tests__/role-card.test.ts` | Narrow width keeps fields readable without overlap |
