# Design: {{CHANGE_NAME}}

## LLM-Evolvable?

<!-- yes: this field can be modified by LLM at runtime → need mutation + materializer + write-back -->
<!-- no: static content data only → skip steps 7-9 -->

## 12-Step ContentPool Checklist

| Step | File | Change Description | Applies? |
|------|------|--------------------|:--:|
| 1. ContentPool interface | `src/core/types.ts` | | |
| 2. ContentPoolMutation type | `src/core/types.ts` | | |
| 3. Zod schema | `src/core/schemas/content-pool.ts` | | |
| 4. Schema export | `src/core/schemas/index.ts` | | |
| 5. DOMAIN_FIELDS route | `src/core/content-pool-loader.ts` | | |
| 6. DOMAIN_SCHEMAS validator | `src/core/content-pool-loader.ts` | | |
| 7. Materializer handler | `src/simulation/content-pool-materializer.ts` | | only if evolvable |
| 8. writeEvolveDeltas route | `src/core/content-pool-loader.ts` | | only if evolvable |
| 9. LLM prompt JSON schema | `src/llm/prompts/content-pool-evolve.ts` | | only if evolvable |
| 10. Default value | `src/core/world.ts` createDefaultContentPool() | | |
| 11. YAML base data | `worlds/content-pool/<domain>.yaml` | | |
| 12. Consumer updates | (from consumer analysis) | | |

## Data Flow

```
YAML → loader (step 5) → ContentPool (step 1) → consumer (step 12)
                          ↓ (if evolvable)
                   mutation → materializer (step 7) → write-back (step 8)
```
