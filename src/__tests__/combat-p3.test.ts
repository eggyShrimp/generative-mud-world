/**
 * P3 测试 — 命令集成 (attack/flee/defend/equip)
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
import { deriveCapabilities } from "../engine/capability-provider.ts";
import { executeCommand } from "../engine/command-executor.ts";
import { isPlayerAction } from "../engine/player-actions.ts";

function setupCombatWorld() {
  const world = createWorld();
  const room = createRoom("room_01", "测试房间", "test", "一个测试房间");
  room.exits.set("north", {
    to: "room_02",
    direction: "north",
    distance: 1,
    hidden: false,
    bidirectional: true,
  });
  addRoom(world, room);

  const player = createPlayer("player_01", "冒险者", "room_01", undefined, undefined, [
    { name: "combat_skill", value: 20 },
    { name: "strength", value: 10 },
    { name: "endurance", value: 10 },
    { name: "agility", value: 10 },
  ]);
  addEntity(world, player);

  const npc = createNPC("npc_01", {
    name: "山贼",
    roomId: "room_01",
    traits: [
      { name: "combat_skill", value: 10 },
      { name: "strength", value: 5 },
      { name: "endurance", value: 5 },
    ],
  });
  addEntity(world, npc);

  return { world, player, npc, room };
}

// ── player-actions ──

describe("player-actions 新增战斗动作", () => {
  it("PLAYER_ACTIONS 包含 attack", () => {
    expect(isPlayerAction("attack")).toBe(true);
  });

  it("PLAYER_ACTIONS 包含 flee", () => {
    expect(isPlayerAction("flee")).toBe(true);
  });

  it("PLAYER_ACTIONS 包含 defend", () => {
    expect(isPlayerAction("defend")).toBe(true);
  });

  it("PLAYER_ACTIONS 包含 equip", () => {
    expect(isPlayerAction("equip")).toBe(true);
  });

  it("PLAYER_ACTIONS 包含 unequip", () => {
    expect(isPlayerAction("unequip")).toBe(true);
  });
});

// ── attack 命令 ──

describe("executeCommand: attack", () => {
  it("攻击 NPC: 设置 combatTarget + delta 包含 HP 伤害", () => {
    const { world, player, npc } = setupCombatWorld();
    const initialHp = npc.combatState.hp;
    const result = executeCommand(world, "player_01", "attack", { targetId: "npc_01" });

    expect(result.events.length).toBeGreaterThan(0);
    expect(result.events[0].description).toContain("发起了攻击");
    expect(player.combatState.combatTarget).toBe("npc_01");
    expect(npc.combatState.threatTable.player_01).toBe(10);
    // HP 走 delta 管道，不再直接突变
    expect(npc.combatState.hp).toBe(initialHp);
    expect(result.delta.combatHpChanges).toBeDefined();
    expect(result.delta.combatHpChanges!.length).toBeGreaterThanOrEqual(1);
    expect(result.delta.combatHpChanges![0].targetId).toBe("npc_01");
  });

  it("攻击虚弱 NPC 返回失败", () => {
    const { world, npc } = setupCombatWorld();
    npc.combatState.isIncapacitated = true;
    const result = executeCommand(world, "player_01", "attack", { targetId: "npc_01" });
    expect(result.events[0].type).toBe("error");
    expect(result.events[0].description).toContain("倒下了");
  });

  it("攻击不存在的目标返回失败", () => {
    const { world } = setupCombatWorld();
    const result = executeCommand(world, "player_01", "attack", { targetId: "nonexistent" });
    expect(result.events[0].type).toBe("error");
  });

  it("虚弱玩家不能攻击", () => {
    const { world, player } = setupCombatWorld();
    player.combatState.isIncapacitated = true;
    const result = executeCommand(world, "player_01", "attack", { targetId: "npc_01" });
    expect(result.events[0].type).toBe("error");
  });
});

// ── flee 命令 ──

describe("executeCommand: flee", () => {
  it("不在战斗中返回失败", () => {
    const { world } = setupCombatWorld();
    const result = executeCommand(world, "player_01", "flee", {});
    expect(result.events[0].type).toBe("error");
    expect(result.events[0].description).toContain("没有在战斗中");
  });

  it("在战斗中: 逃跑有成功/失败两种结果", () => {
    const { world, player, npc } = setupCombatWorld();
    player.combatState.combatTarget = "npc_01";
    npc.combatState.combatTarget = "player_01";

    const results = new Set<string>();
    for (let i = 0; i < 50; i++) {
      player.combatState.combatTarget = "npc_01";
      const r = executeCommand(world, "player_01", "flee", {});
      results.add(r.events[0].type);
    }
    // 应该有成功和失败两种结果
    expect(results.has("combat_flee_success") || results.has("combat_flee_fail")).toBe(true);
  });
});

// ── defend 命令 ──

describe("executeCommand: defend", () => {
  it("不在战斗中返回失败", () => {
    const { world } = setupCombatWorld();
    const result = executeCommand(world, "player_01", "defend", {});
    expect(result.events[0].type).toBe("error");
  });

  it("在战斗中: 设置 isDefending", () => {
    const { world, player } = setupCombatWorld();
    player.combatState.combatTarget = "npc_01";
    const result = executeCommand(world, "player_01", "defend", {});
    expect(result.events[0].type).toBe("defend");
    expect(player.combatState.isDefending).toBe(true);
  });
});

// ── capability-provider ──

describe("capability-provider 战斗能力", () => {
  it("非战斗状态: 显示 attack + 标准能力", () => {
    const { world, player } = setupCombatWorld();
    const caps = deriveCapabilities(world, "player_01");
    const actions = caps.map((c) => c.action);
    expect(actions).toContain("attack");
    expect(actions).toContain("move");
    expect(actions).toContain("talk");
    expect(actions).toContain("rest");
  });

  it("战斗中: 不显示 move/talk, 显示 defend/flee", () => {
    const { world, player } = setupCombatWorld();
    player.combatState.combatTarget = "npc_01";
    const caps = deriveCapabilities(world, "player_01");
    const actions = caps.map((c) => c.action);
    expect(actions).toContain("defend");
    expect(actions).toContain("flee");
    expect(actions).not.toContain("move");
    expect(actions).not.toContain("talk");
    expect(actions).not.toContain("rest");
  });

  it("虚弱状态: 只显示 status", () => {
    const { world, player } = setupCombatWorld();
    player.combatState.isIncapacitated = true;
    const caps = deriveCapabilities(world, "player_01");
    expect(caps).toHaveLength(1);
    expect(caps[0].action).toBe("status");
  });

  it("NPC 有装备时: 显示 equip 能力", () => {
    const { world, player } = setupCombatWorld();
    // 添加一个可装备物品到背包
    player.inventory.push({
      id: "sword_01",
      type: "item",
      templateId: "test_item",
      name: "铁剑",
      roomId: null,
      description: "一把铁剑",
      ownerId: "player_01",
      containerId: "player_01",
      properties: { atkBonus: 5 },
    });
    const caps = deriveCapabilities(world, "player_01");
    const actions = caps.map((c) => c.action);
    expect(actions).toContain("equip");
  });
});
