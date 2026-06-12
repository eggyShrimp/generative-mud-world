# Proposal: {{CHANGE_NAME}}

## Why

<!-- What ContentPool data is missing or wrong? Why is this change needed? -->

## Change Type

**yaml-data** — ContentPool field / YAML data change. No engine logic. No TUI.

## ContentPool Fields

### Added

| Field | Type | Domain | LLM-Evolvable? | Reason |
|-------|------|--------|----------------|--------|
| | | | yes/no | |

### Modified

| Field | Reason | Breaking? |
|-------|--------|:--:|
| | | yes/no |

## Consumer Analysis

<!-- Run: rg "<field>" src/ --type ts | grep -v __tests__ -->
<!-- Paste the output here, then list each consumer file that needs updating -->

## Impact

- ContentPool interface: yes/no
- Zod schemas: yes/no
- ContentPool loader: yes/no
- ContentPool materializer: yes/no (only if LLM-evolvable)
- YAML data files: yes/no
- LLM prompts: yes/no (only if LLM-evolvable)
- Consumer code: yes/no
