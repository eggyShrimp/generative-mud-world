/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    {
      name: "tui-no-direct-engine-import",
      comment: "TUI should not import from engine/combat/simulation/llm/core (use shared/protocol)",
      severity: "error",
      from: { path: "src/client-tui" },
      to: { path: "src/(engine|combat|simulation|llm|core)", pathNot: "src/shared" },
    },
    {
      name: "prompts-no-engine-import",
      comment: "LLM prompts should not import from engine/combat",
      severity: "error",
      from: { path: "src/llm/prompts" },
      to: { path: "src/(engine|combat)" },
    },
    {
      name: "combat-config-only-via-contentpool",
      comment: "combat/config.ts should only be imported from core (ContentPool) or combat itself",
      severity: "error",
      from: { pathNot: "src/(core|combat|__tests__)" },
      to: { path: "src/combat/config\\.ts" },
    },
    {
      name: "delta-registry-no-runtime-import",
      comment:
        "delta-registry owns field metadata and testable consistency helpers; runtime world writes should go through the canonical world apply path so returned state stays complete.",
      severity: "error",
      from: { path: "src", pathNot: "src/(__tests__|engine/delta-registry\\.ts)" },
      to: { path: "src/engine/delta-registry\\.ts" },
    },
  ],
};
