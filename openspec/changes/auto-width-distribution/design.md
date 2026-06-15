# Design: auto-width-distribution

## Component Hierarchy

```
App  ← passes dimensions().width to getLayoutMetrics
├── StatusBar
├── [row]
│   ├── RoomPanel  (flexGrow={1}, takes remaining width)
│   └── EventLog   (width from sidebarWidth in LayoutMetrics)
└── Sidebar  (bottom bar, 2 rows)
```

## Protocol Messages

None. Width distribution is a pure rendering concern. No new message types or field changes in `shared/protocol.ts`.

## depcruise Boundary Verification

| Rule | Status | Notes |
|------|:--:|-------|
| tui-no-direct-engine-import | ✅ | Only `metrics.ts` modified, no engine imports |
| combat-config-only-via-contentpool | ✅ | N/A for TUI |

## Display Text

No display text changes. This is purely a layout calculation change.

## Test Plan

Tests are part of the design, not an afterthought. This change modifies a pure function and its integration point.

### Test toolkit

Pure function tests only. No component rendering tests needed — `getLayoutMetrics` is a pure function tested via vitest.

### Test files

| Test File | Scenario | Assertions |
|-----------|----------|------------|
| `src/__tests__/layout-metrics.test.ts` | proportional split at 120-wide | sidebarWidth=44, excess=35, 30+round(35×0.4)=44 |
| `src/__tests__/layout-metrics.test.ts` | tight terminal fallback at 80-wide | sidebarWidth=31, available=77<82, fallback=max(20,round(77×0.4)) |
| `src/__tests__/layout-metrics.test.ts` | extreme narrow 60-wide | sidebarWidth=23, available=57, fallback=max(20,round(57×0.4)) |
| `src/__tests__/layout-metrics.test.ts` | wide terminal 160-wide | sidebarWidth=61, excess=75, 30+round(75×0.4)=60, clamp to max |
| `src/__tests__/layout-metrics.test.ts` | eventLogHeight equals roomHeight | unchanged test, just add width param |
| `src/__tests__/layout-metrics.test.ts` | bottomBarHeight=2 | unchanged test, just add width param |

### Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `ROOM_MIN_WIDTH` | 52 | Entity list columns need ~51, round up |
| `EVENT_LOG_MIN_WIDTH` | 30 | Minimum for readable Chinese event descriptions |
| `EVENT_LOG_EXCESS_RATIO` | 0.4 | EventLog gets 40% of excess, RoomPanel gets 60% |
| `HORIZONTAL_OVERHEAD` | 3 | Root padding(2) + gap(1) |

### Formula

```
availableWidth = max(1, terminalWidth - HORIZONTAL_OVERHEAD)
totalMinWidth = ROOM_MIN_WIDTH + EVENT_LOG_MIN_WIDTH  (= 82)

if availableWidth >= totalMinWidth:
    sidebarWidth = EVENT_LOG_MIN_WIDTH + round((availableWidth - totalMinWidth) * EVENT_LOG_EXCESS_RATIO)
else:
    sidebarWidth = max(20, round(availableWidth * EVENT_LOG_EXCESS_RATIO))
```

### Expected outputs

| terminalWidth | availableWidth | sidebarWidth | roomPanel (flexGrow) |
|---------------|---------------|--------------|----------------------|
| 60 | 57 | 23 | 33 |
| 80 | 77 | 31 | 45 |
| 100 | 97 | 36 | 60 |
| 120 | 117 | 44 | 72 |
| 140 | 137 | 52 | 84 |
| 160 | 157 | 60 | 96 |

## Manual Checks

- [ ] `npm run dev:tui` at 120 columns — EventLog ~44 cols, RoomPanel ~72 cols, no overlap
- [ ] `npm run dev:tui` at 80 columns — EventLog ~31 cols, RoomPanel ~45 cols, no overlap
- [ ] `npm run dev:tui` at 100 columns — EventLog ~36 cols, RoomPanel ~60 cols, no overlap
