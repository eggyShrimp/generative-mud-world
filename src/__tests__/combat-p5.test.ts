/**
 * P5 测试 — NPC 主动攻击
 */

import { describe, expect, it } from "vitest";
import {
  addEntity,
  addRoom,
  createNPC,
  createPlayer,
  createRoom,
  createWorld,
} from "../core/world.ts";
import { checkNpcAggression } from "../simulation/index.ts";

function setupWorld() {
  const world = createWorld();
  world.tick = 100;

  const room = createRoom("room_01", "测试房间", "test", "");
  addRoom(world, room);

  const player = createPlayer("player_01", "冒险者", "room_01");
  addEntity(world, player);

  const npc = createNPC("npc_01", {
    name: "山贼",
    roomId: "room_01",
    relations: [{ targetId: "player_01", level: -50, label: "仇敌", lastInteractionTick: 0 }],
  });
  addEntity(world, npc);

  return { world, player, npc };
}

describe("checkNpcAggression", () => {
  it("relation < threshold 触发攻击", () => {
    const { world } = setupWorld();
    const results = checkNpcAggression(world);
    expect(results).toHaveLength(1);
    expect(results[0].attackerId).toBe("npc_01");
    expect(results[0].targetId).toBe("player_01");
  });

  it("relation >= threshold 不触发", () => {
    const { world, npc } = setupWorld();
    npc.relations[0].level = 0; // 高于 -30 阈值
    const results = checkNpcAggression(world);
    expect(results).toHaveLength(0);
  });

  it("NPC 已虚弱不触发", () => {
    const { world, npc } = setupWorld();
    npc.combatState.isIncapacitated = true;
    const results = checkNpcAggression(world);
    expect(results).toHaveLength(0);
  });

  it("NPC 已在战斗中不触发", () => {
    const { world, npc } = setupWorld();
    npc.combatState.combatTarget = "player_01";
    const results = checkNpcAggression(world);
    expect(results).toHaveLength(0);
  });

  it("玩家虚弱不触发", () => {
    const { world, player } = setupWorld();
    player.combatState.isIncapacitated = true;
    const results = checkNpcAggression(world);
    expect(results).toHaveLength(0);
  });

  it("冷却期内不触发", () => {
    const { world, npc } = setupWorld();
    npc.combatState.lastAttackTick = 90; // 距离 100 只有 10 tick, 冷却 60
    const results = checkNpcAggression(world);
    expect(results).toHaveLength(0);
  });

  it("冷却期满后可再次触发", () => {
    const { world, npc } = setupWorld();
    npc.combatState.lastAttackTick = 30; // 距离 100 有 70 tick, 冷却 60
    const results = checkNpcAggression(world);
    expect(results).toHaveLength(1);
  });

  it("无 relation 时不攻击 (默认 level=0 >= threshold)", () => {
    const world = createWorld();
    world.tick = 100;
    addRoom(world, createRoom("room_01", "测试", "test", ""));
    const player = createPlayer("player_01", "冒险者", "room_01");
    const npc = createNPC("npc_01", { name: "路人", roomId: "room_01" }); // 无 relation
    addEntity(world, player);
    addEntity(world, npc);
    const results = checkNpcAggression(world);
    expect(results).toHaveLength(0);
  });

  it("不同房间的 NPC 不攻击", () => {
    const world = createWorld();
    world.tick = 100;
    addRoom(world, createRoom("room_01", "房间1", "test", ""));
    addRoom(world, createRoom("room_02", "房间2", "test", ""));
    const player = createPlayer("player_01", "冒险者", "room_01");
    const npc = createNPC("npc_01", {
      name: "山贼",
      roomId: "room_02",
      relations: [{ targetId: "player_01", level: -50, label: "", lastInteractionTick: 0 }],
    });
    addEntity(world, player);
    addEntity(world, npc);
    const results = checkNpcAggression(world);
    expect(results).toHaveLength(0);
  });
});
