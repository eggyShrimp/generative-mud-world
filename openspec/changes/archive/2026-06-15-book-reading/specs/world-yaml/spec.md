## ADDED Requirements

### Requirement: ContentPool stores readable book content

ContentPool MUST define, validate, load, and persist book content for readable item templates.

#### Scenario: Load shipped book content

- **GIVEN** `worlds/content-pool/books.yaml` contains `bookContents`
- **WHEN** the ContentPool is loaded
- **THEN** each book entry is validated with required `id`, `itemTemplateId`, `title`, and non-empty `pages`
- **AND** the content is available through `world.contentPool.bookContents`

#### Scenario: Reject readable item without book content

- **GIVEN** an `itemTemplates` entry has `properties.readable === true`
- **AND** no `bookContents` entry has a matching `itemTemplateId`
- **WHEN** the ContentPool is loaded
- **THEN** loading fails with a content consistency error

### Requirement: LLM can write book content

LLM ContentPool evolution MUST provide a structured `add_book_content` tool and persist accepted book content to the book YAML domain.

#### Scenario: Parse and persist generated book content

- **GIVEN** the LLM returns an `add_book_content` tool call with `id`, `itemTemplateId`, `title`, and `pages`
- **WHEN** the tool call is parsed and materialized
- **THEN** `ContentPoolMutation.addBookContents` is populated
- **AND** the current ContentPool `bookContents` is updated
- **AND** `writeEvolveDeltas()` writes the result to `content-pool/evolve/books.yaml`
