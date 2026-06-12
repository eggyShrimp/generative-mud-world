---
name: world-propose
description: Propose a change for World Framework — auto-classifies the change type and routes to the correct OpenSpec schema (world-yaml / world-engine / world-tui), then delegates to openspec-propose for artifact generation.
license: MIT
metadata:
  author: yuan
  version: "1.1"
---

Classify a change for World Framework and route it to the correct OpenSpec schema.
This skill is a **wrapper** around `openspec-propose` — it only handles classification + schema selection,
then delegates artifact creation to the standard `openspec-propose` skill.

The World Framework has three change types, each backed by a custom OpenSpec schema:

| Schema | When to use | Key constraints |
|--------|-------------|----------------|
| `world-yaml` | ContentPool fields, YAML data, labels, schemas | 12-step checklist, no engine/TUI changes |
| `world-engine` | engine/, combat/, simulation/, llm/, core/ logic | No hardcoded labels, no direct world mutation, read from ContentPool |
| `world-tui` | client-tui/ components, UI, panels, display | No engine imports, Chinese text from server labels |

---

**Input**: The user's request should include a change name (kebab-case) OR a description of what they want to build.

**Steps**

1. **If no clear input provided, ask what they want to build**

   Use the **AskUserQuestion tool** (open-ended, no preset options) to ask:
   > "What change do you want to work on? Describe what you want to build or fix."

   From their description, derive a kebab-case name.

2. **Classify the change type**

   **→ world-yaml** if the change is ONLY about:
   - ContentPool fields (adding, modifying, removing)
   - YAML data files (`worlds/content-pool/*.yaml`)
   - Labels, mappings, definitions (needLabels, traitLabels, emotionLabels, entityActionLabels)
   - Schemas (zod, ContentPool interface)
   - Narrative templates, calendar config, combat config values
   - Keywords: ContentPool, YAML, label, schema, template, config, field, definition, pool, 标签, 字段

   **→ world-tui** if the change is ONLY about:
   - TUI components (src/client-tui/components/)
   - Game client (src/client-tui/game-client.ts)
   - UI panels, display, rendering, styling
   - Keywords: TUI, 界面, 弹窗, 面板, 显示, 渲染, 组件, panel, dialog, popup, display, render, component, UI, 按钮

   **→ world-engine** (default) if:
   - It touches engine/, combat/, simulation/, llm/, core/ logic
   - It's not purely ContentPool/YAML and not purely TUI
   - Keywords: engine, combat, simulation, round, delta, dialogue, command, act-loop, pathfinding, memory, ai, llm, dispatcher
   - Or if cross-cutting — default to world-engine, and the proposal template will flag ContentPool changes for separate tracking

3. **Create the change with the correct schema**

   ```bash
   openspec new change "<name>" --schema <schema>
   ```

4. **Delegate to openspec-propose**

   Immediately invoke the **openspec-propose** skill to generate all planning artifacts (proposal.md, design.md, tasks.md).
   Pass the change name and the chosen schema as context.

   The `openspec-propose` skill will handle: querying artifact status, creating artifacts in dependency order,
   and reporting completion. Do NOT duplicate its artifact creation logic here.

**Output**

Briefly report:
- Change name and schema chosen
- Classification rationale (one sentence)
- "Delegating artifact creation to openspec-propose..."

Then immediately hand off to the openspec-propose skill.

**Guardrails**
- Never mix schema types in one change — if cross-cutting, default to world-engine and the schema's proposal template will flag ContentPool changes for separate tracking
- If a change with that name already exists, ask if user wants to continue it or create a new one
- This skill does NOT create artifacts — openspec-propose does that
- After `openspec update` regenerates openspec-propose, this wrapper continues working without modification
