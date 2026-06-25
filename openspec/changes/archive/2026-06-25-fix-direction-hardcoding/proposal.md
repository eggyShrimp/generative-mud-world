# Proposal: fix-direction-hardcoding

## Why

`src/shared/directions.ts` 的 `REVERSE_MAP` 硬编码中文方向名 `{北: "南", 南: "北", ...}`。方向显示名属于语言/世界数据，应从 `ContentPool.narrativeTemplates.directionNames` 读取。反向映射用英文协议 ID（north↔south）保持在引擎代码中。

## Change Type

**refactor** — 将方向反向映射从中文硬编码改为基于英文协议 ID，读 ContentPool 获取中文显示。

## Modules Touched

| File | Change |
|------|--------|
| `src/shared/directions.ts` | `REVERSE_MAP` 改为 `{north: "south", south: "north", ...}` |
| `src/core/world-loader.ts` | 方向名从 ContentPool 标准化后再调用 `getReverseDirection` |

## Trap Token Self-Check

| Trap | Applies? |
|------|:--:|
| no-hardcoded-labels | yes — direction labels move to ContentPool |
| no-direct-world-mutation | no |
