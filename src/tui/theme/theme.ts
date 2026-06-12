// ── Theme 色板 ──
// TUI 全局唯一颜色源。所有面板和组件必须从这里取颜色，不得内联 hex 值。
// 新增颜色键需同步更新 docs/dev-guide/tui-style.md 色板表。

export const THEME = {
  background: "#0f0d0a",
  panel: "#17130f",
  panelAlt: "#12171a",
  popup: "#201811",
  border: "#8a6a3f",
  borderMuted: "#4e4030",
  focus: "#d6a94f",
  title: "#f1d08a",
  text: "#e6ddc9",
  muted: "#9ba7a3",
  dim: "#6f766f",
  exit: "#6fc3bd",
  success: "#7fc27a",
  dialogue: "#e3b96f",
  danger: "#d76b5d",
  disabled: "#5c554d",
  worldEvent: "#b58bd8",
  travelogue: "#d4a574",
  combatHpHigh: "#6bdb6b",
  combatHpMedium: "#d39746",
  combatHpLow: "#ff6b44",
  enemyName: "#ff9944",
} as const;

export type ThemeColor = (typeof THEME)[keyof typeof THEME];
