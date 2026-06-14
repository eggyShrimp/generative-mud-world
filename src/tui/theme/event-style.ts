export interface EventStyleConfig {
  prefix: string;
  color: string;
}

const STYLES: Record<string, EventStyleConfig> = {
  move: { prefix: "→", color: "#5fa8d4" },
  take: { prefix: "✓", color: "#6bdb6b" },
  drop: { prefix: "✓", color: "#6bdb6b" },
  use: { prefix: "✓", color: "#a46bdb" },
  look: { prefix: "?", color: "#d5dde5" },
  rest: { prefix: "~", color: "#45c4c4" },
  wait: { prefix: "~", color: "#45c4c4" },
  status: { prefix: "●", color: "#d5dde5" },
  inventory: { prefix: "■", color: "#d5dde5" },
  say: { prefix: "✦", color: "#ffffff" },
  dialogue: { prefix: "✦", color: "#f0c674" },
  error: { prefix: "!", color: "#ff6b6b" },
  system: { prefix: "·", color: "#78899e" },
  end_day: { prefix: "◆", color: "#d39746" },
  daily_report: { prefix: "◆", color: "#45c4c4" },
  relation: { prefix: "◆", color: "#c489d4" },
  need: { prefix: "◆", color: "#45c4c4" },
  information: { prefix: "·", color: "#c7d0d9" },
  observer_reaction: { prefix: "·", color: "#c7d0d9" },
  attack: { prefix: "⚔", color: "#d76b5d" },
  combat_hit: { prefix: "\u2694", color: "#ff9944" },
  combat_crit: { prefix: "\u2605", color: "#ff4444" },
  combat_miss: { prefix: "\u2014", color: "#667788" },
  combat_flee_success: { prefix: "\u2197", color: "#44c4c4" },
  combat_flee_fail: { prefix: "\u2198", color: "#cc8844" },
  combat_victory: { prefix: "\u2713", color: "#6bdb6b" },
  combat_defeat: { prefix: "\u2717", color: "#ff6b6b" },
  combat_target_changed: { prefix: "\u21BA", color: "#d39746" },
  defend: { prefix: "\u25C7", color: "#6fc3bd" },
  equip: { prefix: "\u2713", color: "#a46bdb" },
  unequip: { prefix: "\u2713", color: "#a46bdb" },
  operate: { prefix: "⚙", color: "#a46bdb" },
  read: { prefix: "◆", color: "#d4a574" },
};

const FALLBACK: EventStyleConfig = { prefix: "·", color: "#c7d0d9" };

export function getEventStyle(type: string): EventStyleConfig {
  return STYLES[type] ?? FALLBACK;
}
