export function formatRelationText(relation: { level: number; label?: string | null }): string {
  const level = `${relation.level > 0 ? "+" : ""}${relation.level}`;
  const label = relation.label?.trim();
  return label ? ` · ${label}${level}` : ` · ${level}`;
}
