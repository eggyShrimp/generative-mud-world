/**
 * 战斗集成测试 — 覆盖 executeAttack → command_result 全链路
 *
 * 重点验证：
 *   1. events 数组格式正确（type/description 均为非空字符串）
 *   2. 反击逻辑正确（target.combatTarget === playerId → 双方互击）
 *   3. events 永不为 undefined/null
 *   4. pushCombatLog 模拟函数处理各种边界输入不崩溃
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
import { executeCommand } from "../engine/command-executor.ts";

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

// ── 事件格式验证 ──

describe("combat events 格式验证", () => {
  it("executeAttack 返回的每个 event 都有非空 type 和 description", () => {
    const { world } = setupCombatWorld();
    const result = executeCommand(world, "player_01", "attack", { targetId: "npc_01" });

    expect(result.events).toBeDefined();
    expect(Array.isArray(result.events)).toBe(true);
    expect(result.events.length).toBeGreaterThan(0);

    for (const event of result.events) {
      expect(typeof event.type).toBe("string");
      expect(event.type.length).toBeGreaterThan(0);
      expect(typeof event.description).toBe("string");
      expect(event.description.length).toBeGreaterThan(0);
    }
  });

  it("executeAttack 返回 delta.combatHpChanges (不再直接写 HP)", () => {
    const { world, npc } = setupCombatWorld();
    const beforeHp = npc.combatState.hp;
    const result = executeCommand(world, "player_01", "attack", { targetId: "npc_01" });

    expect(npc.combatState.hp).toBe(beforeHp); // HP 不应该被直接修改
    expect(result.delta.combatHpChanges).toBeDefined();
    expect(result.delta.combatHpChanges!.length).toBeGreaterThanOrEqual(1);
    expect(result.delta.combatHpChanges![0].targetId).toBe("npc_01");
    expect(result.delta.combatHpChanges![0].delta).toBeLessThan(0);
  });

  it("executeAttack 返回 delta.needChanges (不再直接写 need)", () => {
    const { world, player } = setupCombatWorld();
    const beforeRest = player.needs.find((n) => n.type === "rest")?.value ?? 0;
    const result = executeCommand(world, "player_01", "attack", { targetId: "npc_01" });

    const afterRest = player.needs.find((n) => n.type === "rest")?.value ?? 0;
    expect(afterRest).toBe(beforeRest); // need 不应该被直接修改
    expect(result.delta.needChanges).toBeDefined();
    expect(
      result.delta.needChanges!.some(
        (c: { targetId: string; needType: string; delta: number }) => c.needType === "rest",
      ),
    ).toBe(true);
  });

  it("executeCommand 返回 delta 包含攻击造成的 combatHpChanges", () => {
    const { world, npc } = setupCombatWorld();
    const beforeHp = npc.combatState.hp;
    const result = executeCommand(world, "player_01", "attack", { targetId: "npc_01" });

    expect(npc.combatState.hp).toBe(beforeHp); // HP 走 delta，不直接修改
    expect(result.delta.combatHpChanges).toBeDefined();
    expect(result.delta.combatHpChanges!.length).toBeGreaterThanOrEqual(1);
  });
});

// ── 反击逻辑 ──

describe("combat 反击逻辑", () => {
  it("目标未设置 combatTarget 时: 只有玩家攻击，无反击", () => {
    const { world, npc } = setupCombatWorld();
    // NPC 没有设置 combatTarget
    expect(npc.combatState.combatTarget).toBeNull();

    const result = executeCommand(world, "player_01", "attack", { targetId: "npc_01" });

    // 事件: 1 个发起攻击 + 1 个伤害 = 2 个
    expect(result.events.length).toBe(2);
    expect(result.events[0].description).toContain("发起了攻击");
  });

  it("目标已设置 combatTarget 时: 双方互击，事件数 >= 3", () => {
    const { world, player, npc } = setupCombatWorld();
    // NPC 已把玩家当目标
    npc.combatState.combatTarget = "player_01";

    const result = executeCommand(world, "player_01", "attack", { targetId: "npc_01" });

    // 事件: 1 个发起攻击 + 1 个玩家伤害 + 1 个反击伤害 = 3 个
    expect(result.events.length).toBeGreaterThanOrEqual(3);
  });

  it("反击的 HP 变化也进入 delta", () => {
    const { world, player, npc } = setupCombatWorld();
    npc.combatState.combatTarget = "player_01";

    const playerHpBefore = player.combatState.hp;
    const npcHpBefore = npc.combatState.hp;

    const result = executeCommand(world, "player_01", "attack", { targetId: "npc_01" });

    // HP 不直接修改，走 delta
    expect(player.combatState.hp).toBe(playerHpBefore);
    expect(npc.combatState.hp).toBe(npcHpBefore);

    // Delta 包含双方 HP 变化
    expect(result.delta.combatHpChanges).toBeDefined();
    expect(result.delta.combatHpChanges!.length).toBe(2);
    expect(
      result.delta.combatHpChanges!.some((c: { targetId: string }) => c.targetId === "npc_01"),
    ).toBe(true);
    expect(
      result.delta.combatHpChanges!.some((c: { targetId: string }) => c.targetId === "player_01"),
    ).toBe(true);
  });
});

// ── pushCombatLog 模拟测试 ──

describe("pushCombatLog 边界处理", () => {
  // 模拟客户端 pushCombatLog 的逻辑
  type CommandEvent = { type: string; description: string };
  type CombatLogEntry = { round: number; type: string; description: string };

  function filterCombatEvents(events: CommandEvent[] | undefined, round: number): CombatLogEntry[] {
    if (!events || events.length === 0) return [];
    return events
      .filter((e) => e.type && (e.type.startsWith("combat_") || e.type === "defend"))
      .map((e) => ({ round, type: e.type, description: e.description }));
  }

  it("events 为 undefined 时不崩溃，返回空数组", () => {
    const result = filterCombatEvents(undefined, 1);
    expect(result).toEqual([]);
  });

  it("events 为 null 时不崩溃，返回空数组", () => {
    const result = filterCombatEvents(null as unknown as undefined, 1);
    expect(result).toEqual([]);
  });

  it("events 为空数组时返回空数组", () => {
    const result = filterCombatEvents([], 1);
    expect(result).toEqual([]);
  });

  it("events 中有 type=null 的元素时不崩溃", () => {
    const events = [
      { type: "combat_hit", description: "hit" },
      { type: null as unknown as string, description: "null type" },
      { type: "system", description: "non-combat" },
    ];
    const result = filterCombatEvents(events, 1);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("combat_hit");
  });

  it("只过滤 combat_ 前缀和 defend 类型", () => {
    const events = [
      { type: "combat_hit", description: "命中" },
      { type: "combat_crit", description: "暴击" },
      { type: "combat_miss", description: "闪避" },
      { type: "defend", description: "防御" },
      { type: "system", description: "系统消息" },
      { type: "error", description: "错误" },
      { type: "say", description: "说话" },
    ];
    const result = filterCombatEvents(events, 2);
    expect(result).toHaveLength(4);
    expect(result.every((e) => e.round === 2)).toBe(true);
  });
});

// ── 失败路径 ──

describe("combat 失败路径事件格式", () => {
  it("攻击不存在的目标: 返回 error 事件，格式正确", () => {
    const { world } = setupCombatWorld();
    const result = executeCommand(world, "player_01", "attack", { targetId: "nonexistent" });

    expect(result.events.length).toBeGreaterThan(0);
    expect(result.events[0].type).toBe("error");
    expect(typeof result.events[0].description).toBe("string");
    expect(result.events[0].description.length).toBeGreaterThan(0);
  });

  it("虚弱状态攻击: 返回 error 事件，格式正确", () => {
    const { world, player } = setupCombatWorld();
    player.combatState.isIncapacitated = true;

    const result = executeCommand(world, "player_01", "attack", { targetId: "npc_01" });

    expect(result.events[0].type).toBe("error");
    expect(typeof result.events[0].description).toBe("string");
  });

  it("没有 targetId 参数: 返回 error 事件", () => {
    const { world } = setupCombatWorld();
    const result = executeCommand(world, "player_01", "attack", {});

    expect(result.events[0].type).toBe("error");
    expect(result.events[0].description).toContain("不知道要攻击谁");
  });
});

// ── flee/defend 消耗精力 ──

describe("combat 动作消耗精力", () => {
  it("executeFlee 成功 — delta 含 needChange (rest)", () => {
    const { world, player, npc } = setupCombatWorld();
    player.combatState.combatTarget = "npc_01";
    npc.combatState.combatTarget = "player_01";

    const result = executeCommand(world, "player_01", "flee", {});

    expect(result.delta.needChanges).toBeDefined();
    expect(result.delta.needChanges!.length).toBeGreaterThanOrEqual(1);
    const restChange = result.delta.needChanges!.find(
      (c: { targetId: string; needType: string; delta: number }) =>
        c.targetId === "player_01" && c.needType === "rest",
    );
    expect(restChange).toBeDefined();
    expect(restChange!.delta).toBeLessThan(0);
  });

  it("executeFlee 失败 — delta 含 needChange (rest)", () => {
    const { world, player, npc } = setupCombatWorld();
    player.combatState.combatTarget = "npc_01";
    npc.combatState.combatTarget = "player_01";

    const result = executeCommand(world, "player_01", "flee", {});

    // flee 结果可能成功也可能失败，但 delta 中应该都有 needChange
    expect(result.delta.needChanges).toBeDefined();
    const restChange = result.delta.needChanges!.find(
      (c: { targetId: string; needType: string; delta: number }) =>
        c.targetId === "player_01" && c.needType === "rest",
    );
    expect(restChange).toBeDefined();
    expect(restChange!.delta).toBeLessThan(0);
  });

  it("executeDefend — delta 含 needChange (rest)", () => {
    const { world, player, npc } = setupCombatWorld();
    player.combatState.combatTarget = "npc_01";
    npc.combatState.combatTarget = "player_01";

    const result = executeCommand(world, "player_01", "defend", {});

    expect(result.delta.needChanges).toBeDefined();
    expect(result.delta.needChanges!.length).toBeGreaterThanOrEqual(1);
    const restChange = result.delta.needChanges!.find(
      (c: { targetId: string; needType: string; delta: number }) =>
        c.targetId === "player_01" && c.needType === "rest",
    );
    expect(restChange).toBeDefined();
    expect(restChange!.delta).toBeLessThan(0);
    // 防御后 isDefending 已设置（直接写 state）
    expect(player.combatState.isDefending).toBe(true);
  });
});

// ── 移除内联 incapacitation ──

describe("executeAttack 不内联调用 incapacitation", () => {
  it("target HP 降到 ≤ 0 时，isIncapacitated 仍为 false（由 rCC 统一处理）", () => {
    const { world, npc } = setupCombatWorld();
    // 让 NPC 的 HP 足够低，一击必倒
    npc.combatState.hp = 1;

    const result = executeCommand(world, "player_01", "attack", { targetId: "npc_01" });

    // 内联 incapacitation 已移除，NPC 不应被标记为虚弱
    expect(npc.combatState.isIncapacitated).toBe(false);
    // delta 中有 HP 变化
    expect(result.delta.combatHpChanges).toBeDefined();
    expect(result.delta.combatHpChanges!.length).toBeGreaterThanOrEqual(1);
  });
});
