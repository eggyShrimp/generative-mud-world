// ── Tone 色值判定 ──
// 根据数值范围返回 THEME 中的颜色键。
// 阈值定义：
//   needColor:    ≥70 高 · ≥30 中 · <30 低
//   relationColor: ≥50 正 · ≥0 中 · <0 负
//   traitColor:   ≥50 高 · ≥0 中 · ≥-50 中 · <-50 低
//   hpColor:      >60% 高 · >30% 中 · ≤30% 低

import { percentToneColor, ratioToneColor, signedToneColor } from "./progress-format.ts";
import { THEME } from "./theme.ts";

export function needColor(value: number): string {
  return percentToneColor(value, {
    high: THEME.success,
    medium: THEME.dialogue,
    low: THEME.danger,
  });
}

export function relationColor(level: number): string {
  if (level >= 50) return THEME.success;
  if (level >= 0) return THEME.dialogue;
  return THEME.danger;
}

export function traitColor(value: number): string {
  return signedToneColor(value, {
    high: THEME.success,
    neutral: THEME.muted,
    medium: THEME.dialogue,
    low: THEME.danger,
  });
}

export function hpColor(hp: number, max: number): string {
  return ratioToneColor(hp, max, {
    high: THEME.combatHpHigh,
    medium: THEME.combatHpMedium,
    low: THEME.combatHpLow,
  });
}
