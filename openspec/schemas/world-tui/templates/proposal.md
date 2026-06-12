# Proposal: {{CHANGE_NAME}}

## Why

<!-- What TUI experience is missing or broken? -->

## Change Type

**tui-only** — Client-side TUI change. No ContentPool. No engine logic.

## Components Touched

| File | Change Type | Description |
|------|-------------|-------------|
| `src/client-tui/components/Xxx.tsx` | modify / new | |

## Protocol Surface

<!-- Does shared/protocol.ts need new message types or field changes? -->

## Boundary Self-Check

- [ ] No imports from `src/engine/`
- [ ] No imports from `src/combat/`
- [ ] No imports from `src/simulation/`
- [ ] No imports from `src/llm/`
- [ ] No imports from `src/core/` (except `src/shared/` which is allowed)
- [ ] All Chinese display text comes from server ContentPool label fields (never hardcoded in TUI)

## Impact

<!-- UX change, affected components, tests -->
