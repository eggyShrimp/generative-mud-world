import type { ContentPool } from "./types.ts";

export function relationLabelForLevel(pool: ContentPool, level: number): string {
  const sorted = [...pool.narrativeTemplates.relationLabels].sort(
    (a, b) => b.threshold - a.threshold,
  );
  const found = sorted.find((label) => level >= label.threshold);
  return found?.label ?? sorted[sorted.length - 1]?.label ?? String(level);
}

export function resolveRelationLabel(
  pool: ContentPool,
  level: number,
  currentLabel?: string,
  newLabel?: string,
): string {
  const explicit = newLabel?.trim();
  if (explicit) return explicit;

  const current = currentLabel?.trim();
  if (current && !current.includes("undefined")) return current;

  return relationLabelForLevel(pool, level);
}
