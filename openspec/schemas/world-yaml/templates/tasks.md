# Tasks: {{CHANGE_NAME}}

<!-- Generated from design.md — one task per applicable ContentPool path step -->

## Type + Schema

- [ ] Update `src/core/types.ts` (`ContentPool`, mutation type if needed)
- [ ] Update `src/core/schemas/content-pool.ts`
- [ ] Update `src/core/schemas/index.ts`

## YAML Loading

- [ ] Update `src/core/content-pool-loader.ts` `DOMAIN_FIELDS`
- [ ] Update `src/core/content-pool-loader.ts` `DOMAIN_SCHEMAS`
- [ ] Update `src/core/world.ts` `createDefaultContentPool()`
- [ ] Update `worlds/content-pool/<domain>.yaml`

## LLM Evolution

<!-- Delete this section only if design.md explicitly marks the field non-evolvable. -->

- [ ] Update `src/llm/tools/content-pool-evolve.ts`
- [ ] Update `src/llm/tool-mutations.ts`
- [ ] Update `src/llm/prompts/content-pool-evolve.ts`
- [ ] Update `src/simulation/content-pool-materializer.ts`
- [ ] Update `src/core/content-pool-loader.ts` `writeEvolveDeltas()`

## Consumers

- [ ] Run `rg "<field>" src/ --type ts | grep -v __tests__`
- [ ] Update each consumer to read `world.contentPool.<field>` or a ContentPool DAO/helper
- [ ] Remove old hardcoded values, local fallback data, or duplicate mapping tables

## Boundary Checks

- [ ] Update `.dependency-cruiser.js` if a new boundary is needed
- [ ] Update `plugins/*.grit` if a new direct-access or hardcoding trap should be blocked

## Tests

Every changed ContentPool path or consumer behavior above MUST have a matching automated test task.
Use exact test file paths and state the behavior assertion. If a behavior cannot be automated, add a
manual check with the reason.

- [ ] Add loader test for YAML domain loading
- [ ] Add schema rejection test for malformed data
- [ ] Add tool exposure test if LLM-evolvable
- [ ] Add tool-call parser test if LLM-evolvable
- [ ] Add materializer add/update test if LLM-evolvable
- [ ] Add write-back and reload test if LLM-evolvable
- [ ] Add consumer behavior tests


## Verification
- [ ] Run `npm run lint` (tsc + biome + depcruise)
- [ ] Run `npx vitest run`
- [ ] Run `npx depcruise src --config .dependency-cruiser.js`
- [ ] Run `rg "<field>" src/ --type ts | grep -v __tests__` — confirm all consumers updated
- [ ] Run `rg "<old-hardcoded-value>" src/ --type ts | grep -v __tests__` — must return zero results
