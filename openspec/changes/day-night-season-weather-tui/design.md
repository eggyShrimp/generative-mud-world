# Design: day-night-season-weather-tui

## Component Hierarchy

```
App
└── Sidebar
    └── RoleCard
    └── environment label group
```

The change should not introduce a new panel or interaction layer. The old top `StatusBar` is not part of the current rebuilt TUI, so this updates the visible role/status surface in the existing sidebar.

## Protocol Messages

`src/shared/protocol.ts`

`StatusMessage` includes:

| Field | Meaning |
|-------|---------|
| `period` | Current day period display label |
| `season` | Current season display label |
| `weatherLabel` | Current weather display label for the player's region |

`src/server/ws-server.ts`

`sendStatus()` reads world state and ContentPool labels, then sends only display-ready strings. TUI components render those strings and do not import engine or ContentPool modules.

## depcruise Boundary Verification

| Rule | Status | Notes |
|------|:--:|-------|
| tui-no-direct-engine-import | OK | TUI reads `StatusMessage` only |
| combat-config-only-via-contentpool | OK | N/A for TUI |

## Display Text

| UI Element | Source | Notes |
|------------|--------|-------|
| Season label | `StatusMessage.season` | Server-provided ContentPool label |
| Weather label | `StatusMessage.weatherLabel` | Server-provided selected weather label |
| Separators | TUI structural text | May be hardcoded as layout punctuation |

## Test Plan

| Test File | Scenario | Assertions |
|-----------|----------|------------|
| `src/__tests__/role-card.test.ts` | wide status render | Date, season, weather, and connection state render |
| `src/__tests__/role-card.test.ts` | narrow status render | Environment labels do not overlap or hide existing critical status |

## Manual Checks

- [x] Automated narrow/wide checks cover date, connection, season, period, and weather in the visible status area.
