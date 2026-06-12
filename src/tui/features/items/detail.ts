import { formatItemProperties } from "../../../shared/item-format.ts";
import type { InventoryItem } from "../../../shared/protocol.ts";

export function buildInventoryItemDetail(
  item: InventoryItem,
  labels: Record<string, string>,
): string {
  const propertyText = formatItemProperties(item.properties, labels);
  return [item.description, propertyText ? `属性：${propertyText}` : ""].filter(Boolean).join("\n");
}
