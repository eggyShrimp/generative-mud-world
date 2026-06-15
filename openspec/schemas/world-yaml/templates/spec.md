## ADDED Requirements

### Requirement: ContentPool field is loadable and validated

`{{FIELD_NAME}}` MUST be defined, validated, and loaded through the ContentPool YAML path.

#### Scenario: Load field from YAML

- **GIVEN** `worlds/content-pool/{{DOMAIN}}.yaml` contains `{{FIELD_NAME}}`
- **WHEN** the ContentPool is loaded
- **THEN** the field is validated by its Zod schema
- **AND** the value is available at `world.contentPool.{{FIELD_NAME}}`

#### Scenario: Reject malformed field data

- **GIVEN** `worlds/content-pool/{{DOMAIN}}.yaml` contains invalid `{{FIELD_NAME}}` data
- **WHEN** the ContentPool is loaded
- **THEN** loading fails with a schema validation error

### Requirement: ContentPool field is evolvable when enabled

If `{{FIELD_NAME}}` is LLM-evolvable, the LLM MUST update it through tools and `ContentPoolMutation`, not through engine fallback code.

#### Scenario: Parse LLM tool call

- **GIVEN** the LLM calls the field-specific ContentPool tool
- **WHEN** tool calls are converted to a `ContentPoolMutation`
- **THEN** the tool arguments are schema-validated
- **AND** the mutation contains the field update

#### Scenario: Materialize and persist field update

- **GIVEN** a `ContentPoolMutation` contains a `{{FIELD_NAME}}` update
- **WHEN** the mutation is materialized and evolve deltas are written
- **THEN** `world.contentPool.{{FIELD_NAME}}` is updated
- **AND** `content-pool/evolve/{{DOMAIN}}.yaml` stores the updated field
- **AND** a later ContentPool reload preserves the update

### Requirement: Consumers use ContentPool as the source of truth

Runtime code MUST consume `{{FIELD_NAME}}` from `world.contentPool` or an approved ContentPool DAO/helper.

#### Scenario: No duplicate hardcoded source

- **GIVEN** runtime code needs `{{FIELD_NAME}}`
- **WHEN** the implementation is complete
- **THEN** consumers read from `world.contentPool.{{FIELD_NAME}}` or an approved helper
- **AND** no duplicate local mapping table, fallback dataset, or prompt-only copy remains

#### Scenario: ContentPool boundaries remain enforced

- **GIVEN** the field is implemented
- **WHEN** lint and dependency checks run
- **THEN** dependency-cruiser reports no boundary violations
- **AND** trap-token checks report no direct ContentPool writes or hardcoded duplicate data
