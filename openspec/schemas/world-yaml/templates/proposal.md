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

## ContentPool Maintenance Path

<!-- For new fields, do not stop at type/schema/YAML. State the full path. -->

| Area | Applies? | Notes |
|------|:--:|-------|
| Type + mutation type | yes/no | `ContentPool.xxx`, `ContentPoolMutation.add/replaceXxx` |
| Zod schema + export | yes/no | Runtime validation source |
| YAML domain + loader schema | yes/no | Which `worlds/content-pool/*.yaml` file owns it |
| LLM tool | yes/no | Required when LLM can create/update this data |
| Tool-call parser | yes/no | Converts tool calls to `ContentPoolMutation` |
| Evolve prompt | yes/no | Tells the LLM when to emit the field |
| Materializer | yes/no | Applies mutations to in-memory ContentPool |
| Evolve write-back | yes/no | Persists mutations under `content-pool/evolve/` |
| Boundary constraints | yes/no | dependency-cruiser / plugin constraints |
| Chain tests | yes/no | Loader, schema, tool, materializer, write-back, reload |

## Impact

- ContentPool interface: yes/no
- Zod schemas: yes/no
- ContentPool loader: yes/no
- LLM tool definitions: yes/no (only if LLM-evolvable)
- LLM tool-call parser: yes/no (only if LLM-evolvable)
- ContentPool materializer: yes/no (only if LLM-evolvable)
- Evolve write-back: yes/no (only if LLM-evolvable)
- YAML data files: yes/no
- LLM prompts: yes/no (only if LLM-evolvable)
- dependency-cruiser constraints: yes/no
- Consumer code: yes/no
