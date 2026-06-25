import type { Entity, ItemEntity, NPCEntity, WorldState } from "../../../core/types.ts";

export function getItemValue(world: WorldState, item: Entity): number {
  const templateId = (item as ItemEntity).templateId;
  if (!templateId) return 0;
  const template = world.contentPool.itemTemplates.find((t) => t.id === templateId);
  return (template?.properties.value as number) ?? 0;
}

export function isTradeable(world: WorldState, item: Entity): boolean {
  const templateId = (item as ItemEntity).templateId;
  if (!templateId) return false;
  const template = world.contentPool.itemTemplates.find((t) => t.id === templateId);
  if (!template) return false;
  return template.tradeable !== false;
}

export function countCurrency(entity: Entity): number {
  const inventory =
    "inventory" in entity ? (entity as unknown as { inventory: Entity[] }).inventory : [];
  return inventory.filter((i) => {
    const props = (i as unknown as Record<string, unknown>).properties as
      | Record<string, unknown>
      | undefined;
    return props?.currency === true && (i as ItemEntity).templateId === "copper_coin";
  }).length;
}

export function findCurrencyItems(entity: Entity): Entity[] {
  const inventory =
    "inventory" in entity ? (entity as unknown as { inventory: Entity[] }).inventory : [];
  const coins: Entity[] = [];
  for (const item of inventory) {
    const props = (item as unknown as Record<string, unknown>).properties as
      | Record<string, unknown>
      | undefined;
    if (props?.currency === true && (item as ItemEntity).templateId === "copper_coin") {
      coins.push(item);
    }
  }
  return coins;
}

export function getRelation(npc: NPCEntity, player: Entity) {
  if ("relations" in player) {
    return (
      (
        player as unknown as Record<
          string,
          Array<{ targetId: string; level: number; label: string }>
        >
      ).relations.find((r) => r.targetId === npc.id) ?? null
    );
  }
  return null;
}

export function tradePriceMultiplier(npc: NPCEntity, player: Entity): number {
  const rel = getRelation(npc, player);
  const level = rel?.level ?? 0;
  return 1 - Math.max(-0.2, Math.min(0.2, level / 500));
}

export function computeBuyPrice(value: number, multiplier: number): number {
  return Math.max(1, Math.round(value * multiplier));
}

export function computeSellPrice(value: number, multiplier: number): number {
  return Math.max(1, Math.round(value * 0.6 * (2 - multiplier)));
}

export function npcHasTrait(npc: NPCEntity, traitName: string): boolean {
  return npc.traits.some((t) => t.name === traitName && t.value > 0);
}

export function getCurrencyName(world: WorldState): string {
  const template = world.contentPool.itemTemplates.find((t) => t.properties.currency === true);
  return template?.name ?? "copper_coin";
}
