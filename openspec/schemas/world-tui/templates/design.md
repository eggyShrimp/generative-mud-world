# Design: {{CHANGE_NAME}}

## Component Hierarchy

```
<!-- Show the component tree affected by this change -->
App
└── SomePanel
    └── SomeComponent  ← changed
```

## Protocol Messages

<!-- Which protocol message types are read/written? -->
<!-- src/shared/protocol.ts -->

## depcruise Boundary Verification

| Rule | Status | Notes |
|------|:--:|-------|
| tui-no-direct-engine-import | ✅ | No engine/combat imports |
| combat-config-only-via-contentpool | ✅ | N/A for TUI |

## Display Text

| UI Element | Server ContentPool Field | Fallback |
|------------|--------------------------|----------|
| | pool.xxx | |
