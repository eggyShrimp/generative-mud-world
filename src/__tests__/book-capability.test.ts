import { describe, expect, it } from "vitest";
import type { ItemEntity } from "../core/types.ts";
import {
  addEntity,
  addRegion,
  addRoom,
  createPlayer,
  createRoom,
  createWorld,
} from "../core/world.ts";
import { deriveCapabilities } from "../engine/capability-provider.ts";

function makeBook(id: string, ownerId: string | null, roomId: string | null): ItemEntity {
  return {
    id,
    type: "item",
    name: "佛经抄本",
    description: "一册旧抄本。",
    roomId,
    ownerId,
    containerId: ownerId ?? roomId,
    templateId: "sutra_copy",
    properties: { readable: true },
  };
}

describe("book reading capabilities", () => {
  it("把背包和房间里的可读物品合并成一个阅读能力", () => {
    const world = createWorld();
    addRegion(world, {
      id: "west",
      name: "西境",
      dominantCulture: "农耕",
      prosperity: 50,
      threatLevel: 10,
    });
    addRoom(world, createRoom("study", "书房", "west", "一间安静的书房。"));

    const player = createPlayer("p1", "赵行舟", "study", world.contentPool);
    const inventoryBook = makeBook("inventory_book", "p1", null);
    player.inventory.push(inventoryBook);
    addEntity(world, player);

    const roomBook = makeBook("room_book", null, "study");
    addEntity(world, roomBook);
    world.rooms.get("study")?.entities.add(roomBook.id);

    const readCap = deriveCapabilities(world, "p1").find((cap) => cap.action === "read");

    expect(readCap).toEqual({
      action: "read",
      label: "阅读",
      params: { type: "item_select", values: ["room_book", "inventory_book"] },
    });
  });
});
