# Tasks: {{CHANGE_NAME}}

<!-- Generated from design.md — one task per applicable checklist step -->



## Verification
- [ ] Run `npm run lint` (biome check + tsc --noEmit)
- [ ] Run `npx vitest run`
- [ ] Run `rg "<field>" src/ --type ts | grep -v __tests__` — confirm all consumers updated
- [ ] Run `rg "<old-hardcoded-value>" src/ --type ts | grep -v __tests__` — must return zero results
