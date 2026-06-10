/**
 * 精力管理测试 — energy.ts + incapacitation.ts 中的 applyCombatExhaustion
 */

import { describe, expect, it } from "vitest";
import { getCombatRestCost, isExhausted } from "../combat/energy.ts";
import { applyCombatExhaustion, checkIncapacitation } from "../combat/incapacitation.ts";
import type { NPCEntity, PlayerEntity } from "../core/types.ts";
import {
  addEntity,
  addRoom,
  createNPC,
  createPlayer,
  createRoom,
  createWorld,
} from "../core/world.ts";

const config = createWorld().contentPool.combatConfig;

function makeNPC(rest = 50): NPCEntity {
  const world = createWorld();
  const room = createRoom("room_01", "测试", "test", "");
  addRoom(world, room);
  const npc = createNPC("npc_01", { name: "山贼", roomId: "room_01" });
  npc.needs = [{ type: "rest", value: rest, baseUrgency: 0, decayRate: 0 }];
  npc.combatState.combatTarget = "player_01";
  npc.combatState.maxHp = npc.combatState.hp;
  addEntity(world, npc);
  return npc;
}

function makePlayer(rest = 50): PlayerEntity {
  const world = createWorld();
  const room = createRoom("room_01", "测试", "test", "");
  addRoom(world, room);
  const player = createPlayer("player_01", "冒险者", "room_01", undefined, undefined, []);
  player.needs = [{ type: "rest", value: rest, baseUrgency: 0, decayRate: 0 }];
  player.combatState.combatTarget = "npc_01";
  player.combatState.maxHp = player.combatState.hp;
  addEntity(world, player);
  return player;
}

// ── isExhausted ──

describe("isExhausted", () => {
  it("rest > 0 → false", () => {
    const npc = makeNPC(50);
    expect(isExhausted(npc)).toBe(false);
  });

  it("rest = 0 → true", () => {
    const npc = makeNPC(0);
    expect(isExhausted(npc)).toBe(true);
  });

  it("rest < 0 → true", () => {
    const npc = makeNPC(-5);
    expect(isExhausted(npc)).toBe(true);
  });

  it("无 rest need → false", () => {
    const npc = makeNPC();
    npc.needs = [];
    expect(isExhausted(npc)).toBe(false);
  });
});

// ── getCombatRestCost ──

describe("getCombatRestCost", () => {
  it("返回 config.restCostPerAttack", () => {
    expect(getCombatRestCost(config)).toBe(config.restCostPerAttack);
  });
});

// ── applyCombatExhaustion ──

describe("applyCombatExhaustion", () => {
  it("hp 归零 + 虚弱 + 清除战斗状态", () => {
    const world = createWorld();
    const npc = makeNPC(0);
    addEntity(world, npc);
    const prevHp = npc.combatState.hp;
    expect(prevHp).toBeGreaterThan(0);

    applyCombatExhaustion(npc, world, config);

    expect(npc.combatState.hp).toBe(0);
    expect(npc.combatState.isIncapacitated).toBe(true);
    expect(npc.combatState.combatTarget).toBeNull();
    expect(npc.combatState.isDefending).toBe(false);
    expect(npc.combatState.incapacitatedUntil).toBeGreaterThan(0);
  });

  it("虚弱后 checkIncapacitation 返回 false（已虚弱）", () => {
    const world = createWorld();
    const npc = makeNPC(0);
    addEntity(world, npc);

    applyCombatExhaustion(npc, world, config);

    expect(checkIncapacitation(npc)).toBe(false);
  });
});
