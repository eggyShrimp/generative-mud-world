// ── Combat Formatting ──
// 战斗相关格式化纯函数。不依赖 GameClient，不依赖 UI 框架。

import { getEventStyle } from "../../theme/event-style.ts";
import { ratioBar, ratioToneColor } from "../../theme/progress-format.ts";

/**
 * 战斗 HP 颜色：>60% 绿 · >30% 橙 · ≤30% 红。
 * 与 tone.ts 的 hpColor 使用不同色值（战斗专用暖色系）。
 */
export function combatHpColor(hp: number, max: number): string {
  return ratioToneColor(hp, max, {
    high: "#6bdb6b",
    medium: "#d39746",
    low: "#ff6b44",
  });
}

/**
 * 战斗事件文字颜色，委托给 event-style。
 */
export function combatEventColor(type: string): string {
  return getEventStyle(type).color;
}

/**
 * HP 条 + 数值文本。
 */
export function combatHpText(hp: number, max: number): string {
  return `${ratioBar(hp, max)} ${hp}/${max}`;
}
