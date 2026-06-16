# Design: {{CHANGE_NAME}}

## Data Flow

```
[Input] → [Processing] → [Output / State Change]
```

<!-- Describe the data path: what triggers this, how data transforms, where the result goes -->

## ContentPool Integration

<!-- Which pool fields are consumed? Are any new fields needed? -->
<!-- If new ContentPool fields are needed → this should be a separate world-yaml change -->

## State Mutation Path

<!-- How does this change modify world state? -->
<!-- Must use one of: delta → delta-registry → world.applyDelta -->
<!-- Or existing write paths: combat/pulse, combat/incapacitation, content-pool-loader write-back -->

## Trap Token Verification

| File | Trap Checked | Status |
|------|-------------|--------|
| | no-hardcoded-labels | ✅/❌ |
| | no-direct-world-mutation | ✅/❌ |
| | no-create-default-outside-world | ✅/❌ |
| | no-hardcoded-description-text | ✅/❌ |

## Test Plan

Every new or changed behavior MUST map to an automated test. If a behavior cannot be automated,
state the exact manual check and why automation is not practical.

| Test File | Scenario | Assertions |
|-----------|----------|------------|
| `src/__tests__/...test.ts` | | |
| `src/__tests__/integration/...test.ts` | | |

## Manual Checks

Only include checks that cannot be reasonably automated.

- [ ] <!-- command / scenario / expected result -->
