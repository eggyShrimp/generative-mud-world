/**
 * 装备命令执行器 (equip, unequip)
 */

import { renderTemplate } from "../../core/template.ts";
import type { EntityId, NPCEntity, PlayerEntity, WorldState } from "../../core/types.ts";
import { getEntity } from "../../core/world.ts";
import { commandMessages, fail } from "./helpers.ts";

export function executeEquip(
  world: WorldState,
  entityId: EntityId,
  params: Record<string, unknown>,
): ReturnType<typeof fail> {
  const entity = getEntity(world, entityId) as PlayerEntity | NPCEntity | undefined;
  if (!entity) return fail("找不到自己");
  if (!("inventory" in entity) || !("equipment" in entity)) return fail("当前角色无法装备物品");

  const itemId = params.itemId as string | undefined;
  if (!itemId) return fail("不知道要装备什么");

  const itemIndex = entity.inventory.findIndex((i) => i.id === itemId);
  if (itemIndex < 0) return fail("背包里没有这个物品");

  const item = entity.inventory[itemIndex];

  // Determine slot: weapon if atkBonus, else armor; also check equipmentSlot property
  const equipmentSlot = item.properties?.equipmentSlot as string | undefined;
  let slot: "weapon" | "armor" | "cloak" | "accessory";
  if (
    equipmentSlot &&
    (equipmentSlot === "weapon" ||
      equipmentSlot === "armor" ||
      equipmentSlot === "cloak" ||
      equipmentSlot === "accessory")
  ) {
    slot = equipmentSlot;
  } else if (item.properties?.atkBonus) {
    slot = "weapon";
  } else {
    slot = "armor";
  }

  // Unequip existing item in that slot
  const existing = entity.equipment[slot];
  if (existing) {
    entity.inventory.push(existing);
  }

  // Equip new item
  entity.inventory.splice(itemIndex, 1);
  entity.equipment[slot] = item;

  return {
    events: [
      {
        type: "equip",
        description: existing
          ? renderTemplate(commandMessages(world).equipWithSwap, {
              item: item.name,
              previous: existing.name,
            })
          : renderTemplate(commandMessages(world).equip, { item: item.name }),
      },
    ],
    delta: {},
    ended: false,
  };
}

export function executeUnequip(
  world: WorldState,
  entityId: EntityId,
  params: Record<string, unknown>,
): ReturnType<typeof fail> {
  const entity = getEntity(world, entityId) as PlayerEntity | NPCEntity | undefined;
  if (!entity) return fail("找不到自己");
  if (!("inventory" in entity) || !("equipment" in entity)) return fail("当前角色无法操作装备");

  const slot = params.slot as string | undefined;
  if (!slot || (slot !== "weapon" && slot !== "armor" && slot !== "cloak" && slot !== "accessory"))
    return fail("不知道要卸下哪个装备");

  const item = entity.equipment[slot as keyof typeof entity.equipment];
  if (!item)
    return fail(
      `${slot === "weapon" ? "武器" : slot === "armor" ? "防具" : slot === "cloak" ? "斗篷" : "饰物"}槽没有装备`,
    );

  entity.equipment[slot] = null;
  entity.inventory.push(item);

  return {
    events: [
      {
        type: "unequip",
        description: renderTemplate(commandMessages(world).unequip, { item: item.name }),
      },
    ],
    delta: {},
    ended: false,
  };
}
