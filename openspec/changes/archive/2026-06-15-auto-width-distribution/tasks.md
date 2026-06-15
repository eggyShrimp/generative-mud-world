# Tasks: auto-width-distribution

## What Changes

Replace the hardcoded `SIDEBAR_WIDTH = 52` constant with a dynamic computation in `getLayoutMetrics` that distributes horizontal space between EventLog and RoomPanel based on terminal width. The function gains a `terminalWidth` parameter; `app.tsx` passes `dimensions().width`.

## Component: `src/tui/layout/metrics.ts`

- [ ] Replace `SIDEBAR_WIDTH = 52` with `ROOM_MIN_WIDTH = 52`, `EVENT_LOG_MIN_WIDTH = 30`, `EVENT_LOG_EXCESS_RATIO = 0.4`, `HORIZONTAL_OVERHEAD = 3`
- [ ] Change `getLayoutMetrics` signature: `(terminalHeight: number)` → `(terminalWidth: number, terminalHeight: number)`
- [ ] Add sidebarWidth computation before `return`:
  ```
  availableWidth = max(1, terminalWidth - HORIZONTAL_OVERHEAD)
  if availableWidth >= ROOM_MIN_WIDTH + EVENT_LOG_MIN_WIDTH:
      sidebarWidth = EVENT_LOG_MIN_WIDTH + round((availableWidth - 82) * 0.4)
  else:
      sidebarWidth = max(20, round(availableWidth * 0.4))
  ```
- [ ] Replace `sidebarWidth: SIDEBAR_WIDTH` with `sidebarWidth` in return statement

## Component: `src/tui/app.tsx`

- [ ] Update `getLayoutMetrics` call to pass both dimensions:
  ```tsx
  const layoutMetrics = createMemo(() => getLayoutMetrics(dimensions().width, dimensions().height));
  ```

## Tests

### Pure function / utility tests (.test.ts)

Uses vitest `describe`/`it`/`expect`. No renderer required.

- [ ] Update `src/__tests__/layout-metrics.test.ts`
  - All `getLayoutMetrics(N)` calls → `getLayoutMetrics(W, N)`
  - Replace `sidebarWidth=52` test with 4 new tests:
    - "proportional split at 120-wide": `getLayoutMetrics(120, 40)` → sidebarWidth=44
    - "tight terminal fallback at 80-wide": `getLayoutMetrics(80, 40)` → sidebarWidth=31
    - "extreme narrow 60-wide": `getLayoutMetrics(60, 40)` → sidebarWidth=23
    - "wide terminal 160-wide": `getLayoutMetrics(160, 40)` → sidebarWidth=61

### Component rendering tests (.test.tsx)

No new rendering tests needed — this change only modifies a pure function. Existing rendering tests in `sidebar.test.tsx` and `tui-app.test.tsx` already pass and serve as regression.

## Manual Checks

- [ ] Run `npm run dev:tui` at 120 columns — EventLog ~44 cols, RoomPanel ~72 cols
- [ ] Run `npm run dev:tui` at 80 columns — EventLog ~31 cols, RoomPanel ~45 cols
- [ ] Run `npm run dev:tui` at 100 columns — EventLog ~36 cols, RoomPanel ~60 cols

## Verification

- [ ] Run `npm run lint` (biome check + tsc --noEmit)
- [ ] Run `npx vitest run`
- [ ] Run `npx depcruise src` — confirm no tui-no-direct-engine-import violations
