# Design: {{CHANGE_NAME}}

## LLM-Evolvable?

<!-- yes: this field can be modified by LLM at runtime → need tool + parser + prompt + materializer + write-back -->
<!-- no: static content data only → explicitly mark evolution steps as not applicable -->

## ContentPool Field Checklist

| Step | File | Change Description | Applies? |
|------|------|--------------------|:--:|
| 1. ContentPool interface | `src/core/types.ts` | | |
| 2. ContentPoolMutation type | `src/core/types.ts` | | |
| 3. Zod schema | `src/core/schemas/content-pool.ts` | | |
| 4. Schema export | `src/core/schemas/index.ts` | | |
| 5. DOMAIN_FIELDS route | `src/core/content-pool-loader.ts` | | |
| 6. DOMAIN_SCHEMAS validator | `src/core/content-pool-loader.ts` | | |
| 7. LLM tool definition | `src/llm/tools/content-pool-evolve.ts` | | only if evolvable |
| 8. Tool-call parser | `src/llm/tool-mutations.ts` | | only if evolvable |
| 9. LLM prompt JSON schema | `src/llm/prompts/content-pool-evolve.ts` | | only if evolvable |
| 10. Materializer handler | `src/simulation/content-pool-materializer.ts` | | only if evolvable |
| 11. writeEvolveDeltas route | `src/core/content-pool-loader.ts` | | only if evolvable |
| 12. Default value | `src/core/world.ts` createDefaultContentPool() | | |
| 13. YAML base data | `worlds/content-pool/<domain>.yaml` | | |
| 14. Consumer updates | (from consumer analysis) | | |
| 15. Boundary constraints | `.dependency-cruiser.js`, `plugins/*.grit` | | |
| 16. Chain tests | `src/__tests__/*.test.ts` | | |

## Data Flow

```
YAML → loader (step 5) → ContentPool (step 1) → consumer (step 14)
                          ↓ (if evolvable)
                   LLM tool → parser → mutation → materializer → write-back → reload
```

## Tests Required

| Test Area | Required Coverage | Test File |
|-----------|-------------------|-----------|
| Loader | YAML domain loads the field | |
| Schema rejection | Malformed YAML fails validation | |
| Tool exposure | LLM evolution includes the tool | |
| Tool parser | Tool call becomes `ContentPoolMutation` | |
| Materializer | Mutation adds and updates by stable key | |
| Write-back | Evolve YAML contains the field | |
| Reload | Written evolve YAML survives reload | |
| Consumer | All consumers read `world.contentPool.xxx` | |
| Boundary | `depcruise` and plugin checks stay green | |
