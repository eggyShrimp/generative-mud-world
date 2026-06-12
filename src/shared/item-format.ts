export function formatItemProperties(
  properties: Record<string, unknown>,
  labels: Record<string, string>,
): string {
  return Object.entries(properties)
    .map(([key, value]) => {
      const label = labels[key];
      if (!label) return null;
      return formatPropertyValue(label, value);
    })
    .filter((line): line is string => Boolean(line))
    .join("，");
}

function formatPropertyValue(label: string, value: unknown): string | null {
  if (value === false || value === null || value === undefined) return null;
  if (typeof value === "boolean") return label;
  if (typeof value === "number" || typeof value === "string") return `${label}：${value}`;
  return null;
}
