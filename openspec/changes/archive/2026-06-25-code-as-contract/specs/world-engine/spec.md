## ADDED Requirements

### Requirement: New grit plugins MUST detect remaining hardcoded patterns

Four new Biome grit plugins MUST be created to automate the checks currently documented in `docs/dev-guide/trap-tokens.md`:

- `no-array-constant-labels.grit` — detects hardcoded string array constants `["str1", "str2"]`
- `no-chinese-template-string.grit` — detects Chinese template strings `` `模板${name}` ``
- `no-id-format-assumption.grit` — detects ID format assumptions like `roomId: "字面量"`
- `no-switch-without-contentpool.grit` — detects switch statements lacking ContentPool reads

#### Scenario: All plugins registered

- **GIVEN** the 4 new grit plugin files exist in `plugins/`
- **AND** `biome.json` registers them in the `plugins` array
- **WHEN** `npm run lint` is run
- **THEN** biome loads all plugins without errors
- **AND** existing codebase passes without false positives

#### Scenario: Hardcoded array detection

- **GIVEN** a source file contains `const LABELS = ["中文标签1", "中文标签2"]`
- **WHEN** biome runs `no-array-constant-labels` plugin
- **THEN** an error is reported for Chinese elements
- **AND** `const DIRS = ["north", "south"]` (non-Chinese) passes

### Requirement: Core modules MUST have @module JSDoc

11 core module files MUST provide a `@module` JSDoc header summarizing their responsibility, data flow, and key constraints.

#### Scenario: Module JSDoc exists

- **GIVEN** a developer opens `src/core/world.ts`
- **WHEN** reading the file header
- **THEN** a `@module` JSDoc block explains World lifecycle, core constraints, and player flow
- **AND** the documentation is visible in IDE hover

### Requirement: docs/ MUST be reduced to design-only assets

Redundant documentation files whose knowledge is fully encoded in lint rules or JSDoc MUST be deleted. The remaining docs/ MUST contain only unencodable design assets (architecture overviews, spec proposals, style guides, design error patterns).

#### Scenario: Post-cleanup file count

- **GIVEN** all deletions, modifications, and retentions are applied
- **WHEN** `find docs -name '*.md' | wc -l` is run
- **THEN** the count is approximately 17 (14 preserved + 3 modified)
- **AND** `ls plugins/*.grit | wc -l` equals 12 (8 existing + 4 new)

### Requirement: AGENTS.md MUST reference lint commands instead of manual checks

`AGENTS.md` MUST remove manual grep/checklist instructions (steps 2-3, trap token table) and replace them with `npm run lint` commands that run automated grit plugins.

#### Scenario: AGENTS.md updated

- **GIVEN** the code-as-contract change is implemented
- **WHEN** reading `AGENTS.md`
- **THEN** it no longer contains step-by-step manual grep instructions
- **AND** it no longer contains the "陷阱 Token 速查" table
- **AND** it directs developers to run `npm run lint` instead
