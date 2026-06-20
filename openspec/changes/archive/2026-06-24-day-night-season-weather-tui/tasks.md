# Tasks: day-night-season-weather-tui

## Module: server/ws-server.ts

- [x] In `sendStatus()`, derive the current player's region when available.
- [x] Read matching period and season labels from ContentPool.
- [x] Read the selected weather label from `world.weatherByRegion`.
- [x] Send display-ready labels in the status message.

## Module: tui/panels/sidebar/role-card.tsx

- [x] Render `season` and `weatherLabel` from `StatusMessage` in the existing status bar line.
- [x] Keep existing date, connection state, and exit hint visible.
- [x] Handle narrow width without overlapping text.

## Tests

- [x] Add or extend `src/__tests__/role-card.test.ts` for wide and narrow rendering.

## Verification

- [x] Run `openspec validate day-night-season-weather-tui`.
- [x] Run `openspec show day-night-season-weather-tui --json --deltas-only`.
- [x] Run `npm run lint`.
- [x] Run `npx vitest run`.
