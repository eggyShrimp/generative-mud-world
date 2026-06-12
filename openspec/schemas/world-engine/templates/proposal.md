# Proposal: {{CHANGE_NAME}}

## Why

<!-- What problem does this solve? -->

## Change Type

**engine-logic** — Engine/combat/simulation/llm/core logic change.

<!-- Pick one: new-feature | bug-fix | refactor | config-migration -->

## Modules Touched

| File | Change Type | Description |
|------|-------------|-------------|
| `src/engine/xxx.ts` | modify-function / new-function / modify-constant | |

## ContentPool Reads

<!-- Does this change read any world.contentPool.xxx fields? -->
<!-- Must use world.contentPool.xxx, never createDefaultXxx() -->

| pool.xxx field | Used in (file) | Purpose |
|----------------|----------------|---------|
| | | |

## Trap Token Self-Check

<!-- Check each trap from docs/dev-guide/trap-tokens.md -->

| Trap | Applies? | How Addressed |
|------|:--:|---------------|
| no-hardcoded-labels (new Record<string,string>) | yes/no | |
| no-direct-world-mutation (push/assign to state) | yes/no | |
| no-create-default-outside-world | yes/no | |
| no-hardcoded-description-text (Chinese in engine/combat) | yes/no | |
| no-empty-catch | yes/no | |

## Impact

<!-- Affected behavior, APIs, tests -->
