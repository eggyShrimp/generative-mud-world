# Tasks: {{CHANGE_NAME}}

<!-- Generated from design.md — grouped by module -->

## Module: <!-- e.g. engine/command-executor.ts -->

- [ ] <!-- task description → `src/file/path.ts` -->

## Module: <!-- e.g. combat/resolver.ts -->

- [ ] <!-- task description → `src/file/path.ts` -->

## Tests

Every changed behavior above MUST have a matching test task here. Use exact test file paths and
state the behavior assertion. If a behavior cannot be automated, move it to Manual Checks and state why.

- [ ] Add/update `src/__tests__/...test.ts`: <!-- behavior and assertion -->
- [ ] Add/update `src/__tests__/integration/...test.ts`: <!-- cross-module behavior and assertion -->

## Manual Checks

Only include checks that are not practical to automate.

- [ ] <!-- command / scenario / expected result / why manual -->

## Verification
- [ ] Run `npm run lint` (biome check + tsc --noEmit)
- [ ] Run `npx vitest run`
- [ ] Run `npx depcruise src` — confirm no boundary violations
- [ ] Trap token re-check: [re-verify each trap from proposal]
