import { describe, expect, it } from "vitest";
import type { ItemEntity } from "../core/types.ts";
import {
  addEntity,
  addRegion,
  addRoom,
  applyDelta,
  createPlayer,
  createRoom,
  createWorld,
} from "../core/world.ts";
import { executeCommand } from "../engine/command-executor.ts";

function makeReadableBook(id = "book_1"): ItemEntity {
  return {
    id,
    type: "item",
    name: "佛经抄本",
    description: "一册旧抄本。",
    roomId: null,
    ownerId: "p1",
    containerId: "p1",
    templateId: "sutra_copy",
    properties: {
      readable: true,
      needDeltas: { achievement: 5, rest: -1 },
      traitModifiers: [{ trait: "学识", delta: 2 }],
    },
  };
}

function setupWorld() {
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
  if (!player.needs.some((need) => need.type === "achievement")) {
    player.needs.push({ type: "achievement", value: 70, baseUrgency: 0.3, decayRate: 3 });
  }
  addEntity(world, player);
  world.contentPool.bookContents = [
    {
      id: "sutra_copy",
      itemTemplateId: "sutra_copy",
      title: "佛经抄本",
      pages: ["第一页", "第二页"],
    },
  ];
  return { world, player };
}

describe("book reading command", () => {
  it("需要指定物品", () => {
    const { world } = setupWorld();

    const result = executeCommand(world, "p1", "read", {});

    expect(result.events[0]).toMatchObject({
      type: "error",
      description: "请指定要阅读的物品",
    });
  });

  it("找不到物品时失败", () => {
    const { world } = setupWorld();

    const result = executeCommand(world, "p1", "read", { itemId: "missing" });

    expect(result.events[0]).toMatchObject({
      type: "error",
      description: "找不到要阅读的物品",
    });
  });

  it("不可读物品不能阅读", () => {
    const { world, player } = setupWorld();
    player.inventory.push({ ...makeReadableBook(), properties: {} });

    const result = executeCommand(world, "p1", "read", { itemId: "book_1" });

    expect(result.events[0]).toMatchObject({
      type: "error",
      description: "佛经抄本 不可阅读",
    });
  });

  it("可读物品缺少书籍内容时失败", () => {
    const { world, player } = setupWorld();
    player.inventory.push(makeReadableBook());
    world.contentPool.bookContents = [];

    const result = executeCommand(world, "p1", "read", { itemId: "book_1" });

    expect(result.events[0]).toMatchObject({
      type: "error",
      description: "佛经抄本 标记为可阅读，但没有对应的书籍内容。",
    });
    expect(result.bookDisplay).toBeUndefined();
    expect(result.delta).toEqual({});
  });

  it("阅读背包中的书会打开分页内容并产生效果，但不消耗书", () => {
    const { world, player } = setupWorld();
    const book = makeReadableBook();
    player.inventory.push(book);

    const result = executeCommand(world, "p1", "read", { itemId: book.id });

    expect(result.events[0].type).toBe("book_read");
    expect(result.bookDisplay).toEqual({ title: "佛经抄本", pages: ["第一页", "第二页"] });
    expect(result.delta.needChanges).toEqual([
      { targetId: "p1", needType: "achievement", delta: 5 },
      { targetId: "p1", needType: "rest", delta: -1 },
    ]);
    expect(result.delta.traitModifiers).toEqual([{ targetId: "p1", trait: "学识", delta: 2 }]);

    applyDelta(world, result.delta);

    expect(player.inventory.some((item) => item.id === book.id)).toBe(true);
    expect(player.needs.find((need) => need.type === "achievement")?.value).toBe(75);
    expect(player.needs.find((need) => need.type === "rest")?.value).toBe(69);
    expect(player.traits.find((trait) => trait.name === "学识")?.value).toBe(2);
  });

  it("可以阅读房间里的可读物品", () => {
    const { world } = setupWorld();
    const book = {
      ...makeReadableBook("room_book"),
      roomId: "study",
      ownerId: null,
      containerId: "study",
    };
    addEntity(world, book);
    world.rooms.get("study")?.entities.add(book.id);

    const result = executeCommand(world, "p1", "read", { itemId: book.id });

    expect(result.events[0].type).toBe("book_read");
    expect(result.bookDisplay?.pages).toEqual(["第一页", "第二页"]);
  });
});
