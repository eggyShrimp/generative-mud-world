# Tasks: {{CHANGE_NAME}}

## What Changes

<!-- Brief summary of what files change and how -->

## Component: <!-- e.g. src/tui/components/Xxx.tsx -->

- [ ] <!-- task description -->

## Tests

### Pure function / utility tests (.test.ts)

Uses vitest `describe`/`it`/`expect`. No renderer required.

- [ ] Add/update `src/__tests__/...test.ts`

### Component rendering tests (.test.tsx)

Uses `testRender` from `@opentui/solid`. Mock `GameClient` per `src/__tests__/key-layer.test.ts` pattern.

```tsx
const { captureCharFrame, flush } = await testRender(() => <Comp />, { width: 120, height: 40 });
await flush();
expect(captureCharFrame()).toContain("expected text");
```

- [ ] Add/update `src/__tests__/...test.tsx`

## Manual Checks

- [ ] Run `npm run dev:tui` at representative terminal sizes — no overlap, clipping, or hidden controls

## Verification
- [ ] Run `npm run lint` (biome check + tsc --noEmit)
- [ ] Run `npx vitest run`
- [ ] Run `npx depcruise src` — confirm no tui-no-direct-engine-import violations
