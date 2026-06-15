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

| UI Element | Source | Notes |
|------------|--------|-------|
| | pool.xxx | |

## Test Plan

Tests are part of the design, not an afterthought. Every layout or interaction change needs a matching test scenario.

### Test toolkit

For component rendering tests, use `testRender` from `@opentui/solid`:

```tsx
import { testRender } from "@opentui/solid";

const { captureCharFrame, flush, resize, mockInput } = await testRender(
  () => <YourComponent props={...} />,
  { width: 120, height: 40 }
);
await flush();
const frame = captureCharFrame(); // string snapshot of terminal output
```

| API | Purpose |
|-----|---------|
| `testRender(component, options)` | Mount Solid.js component in a virtual terminal |
| `captureCharFrame()` | Snapshot rendered output as string → use `toContain` / `not.toContain` |
| `flush()` | Wait for render to settle |
| `resize(w, h)` | Simulate terminal resize (test wide/narrow modes) |
| `mockInput.pressKey(k)` | Simulate keyboard input |
| `mockInput.typeText(t)` | Type text character by character |

**Test file conventions:**
- Pure function/utility tests: `src/__tests__/*.test.ts` (vitest, no renderer)
- Component rendering tests: `src/__tests__/*.test.tsx` (uses `testRender`)
- Mock `GameClient` following the pattern in `src/__tests__/key-layer.test.ts`

### Test files

| Test File | Scenario | Assertions |
|-----------|----------|------------|
| `src/__tests__/...test.ts` | wide layout computation | |
| `src/__tests__/...test.tsx` | wide mode rendering order | |
| `src/__tests__/...test.tsx` | narrow mode rendering order | |
| `src/__tests__/...test.tsx` | interaction / key handling | |
| `src/__tests__/...test.ts` | regression for existing behavior | |

## Manual Checks

Only include checks that are hard to automate. Keep them concrete.

- [ ] `npm run dev:tui` at representative terminal sizes — no overlap, clipping, or hidden controls
