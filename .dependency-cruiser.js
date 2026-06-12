/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    {
      name: "tui-no-direct-engine-import",
      comment: "TUI should not import from engine/combat/simulation/llm/core (use shared/protocol)",
      severity: "error",
      from: { path: "src/(client-tui|tui)" },
      to: { path: "src/(engine|combat|simulation|llm|core)", pathNot: "src/shared" },
    },
    {
      name: "tui-panels-no-cross-import",
      comment: "src/tui/panels/ must not cross-import between subdirectories",
      severity: "error",
      from: { path: "src/tui/panels" },
      to: {
        path: "src/tui/panels",
        pathNot: [
          // trade-detail is internal to dialogue-panel
          "src/tui/panels/dialogue/trade-detail\\.tsx",
        ],
      },
    },
    {
      name: "tui-layout-no-panels",
      comment: "Layout must not import panels",
      severity: "error",
      from: { path: "src/tui/layout" },
      to: { path: "src/tui/panels" },
    },
    {
      name: "tui-theme-no-client",
      comment: "src/tui/theme/ must not import client/game-client or key-layer",
      severity: "error",
      from: { path: "src/tui/theme" },
      to: { path: "src/tui/(client|key-layer)" },
    },
    {
      name: "tui-features-no-panels",
      comment: "Features must not import panels",
      severity: "error",
      from: { path: "src/tui/features" },
      to: { path: "src/tui/panels" },
    },
    {
      name: "tui-no-old-client-tui-import",
      comment: "New TUI must not import from old client-tui",
      severity: "error",
      from: { path: "src/tui" },
      to: { path: "src/client-tui" },
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
