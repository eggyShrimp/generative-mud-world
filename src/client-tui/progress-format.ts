export type ToneColors = {
  high: string;
  medium: string;
  low: string;
};

export function percentBar(value: number, width = 10): string {
  const normalized = Math.max(0, Math.min(100, value));
  const filled = Math.round((normalized / 100) * width);
  return `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
}

export function signedPercentBar(value: number, width = 10): string {
  const normalized = Math.max(-100, Math.min(100, value));
  const filled = Math.round((Math.abs(normalized) / 100) * width);
  const empty = width - filled;
  return `${normalized >= 0 ? "+" : "-"}${"█".repeat(filled)}${"░".repeat(empty)}`;
}

export function ratioBar(current: number, max: number, width = 16): string {
  const safeMax = max > 0 ? max : 1;
  const ratio = Math.max(0, Math.min(1, current / safeMax));
  const filled = Math.round(ratio * width);
  return "\u2588".repeat(filled) + "\u2591".repeat(width - filled);
}

export function percentToneColor(value: number, colors: ToneColors): string {
  if (value >= 70) return colors.high;
  if (value >= 30) return colors.medium;
  return colors.low;
}

export function signedToneColor(value: number, colors: ToneColors & { neutral: string }): string {
  if (value >= 50) return colors.high;
  if (value >= 0) return colors.neutral;
  if (value >= -50) return colors.medium;
  return colors.low;
}

export function ratioToneColor(current: number, max: number, colors: ToneColors): string {
  const safeMax = max > 0 ? max : 1;
  const ratio = current / safeMax;
  if (ratio > 0.6) return colors.high;
  if (ratio > 0.3) return colors.medium;
  return colors.low;
}
