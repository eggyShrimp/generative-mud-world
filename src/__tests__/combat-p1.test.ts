/**
 * P1 测试 — 战斗数据基座
 *
 * 覆盖:
 *   1. Entity 创建时 combatState 初始化
 *   2. applyDelta 处理 combatHpChanges
 *   3. ContentPool 默认含 combatConfig
 *   4. combatConfig schema 校验
 *   5. ContentPool materializer 处理 combat mutations
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CombatConfigSchema } from "../combat/config.ts";
import type { CombatState } from "../combat/types.ts";
import { loadContentPoolFromDir } from "../core/content-pool-loader.ts";
import type { CombatConfig } from "../core/types.ts";
import {
  addEntity,
  addRoom,
  applyDelta,
  createDefaultCombatState,
  createDefaultContentPool,
  createItem,
  createNPC,
  createPlayer,
  createRoom,
  createWorld,
} from "../core/world.ts";
import { applyContentPoolMutation } from "../simulation/content-pool-materializer.ts";

const TEST_DIR = join(import.meta.dirname, "../../.test-combat-p1");

function cleanTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
}

// ── Entity 创建 ──

describe("combatState 初始化", () => {
  it("createNPC 应包含 combatState", () => {
    const npc = createNPC("npc_01", { name: "山贼" });
    expect(npc.combatState).toBeDefined();
    expect(npc.combatState.hp).toBe(50); // baseHp
    expect(npc.combatState.maxHp).toBe(50);
    expect(npc.combatState.combatTarget).toBeNull();
    expect(npc.combatState.threatTable).toEqual({});
    expect(npc.combatState.isIncapacitated).toBe(false);
    expect(npc.combatState.isDefending).toBe(false);
    expect(npc.combatState.incapacitatedUntil).toBe(0);
  });

  it("createPlayer 应包含 combatState + equipment", () => {
    const player = createPlayer("player_01", "冒险者", "room_01");
    expect(player.combatState).toBeDefined();
    expect(player.combatState.hp).toBe(50);
    expect(player.combatState.maxHp).toBe(50);
    expect(player.equipment).toEqual({ weapon: null, armor: null, cloak: null, accessory: null });
  });

  it("createNPC 可通过 overrides 传入自定义 combatState", () => {
    const customCombat: CombatState = {
      hp: 80,
      maxHp: 100,
      combatTarget: null,
      threatTable: {},
      lastAttackTick: 0,
      isDefending: false,
      isIncapacitated: true,
      incapacitatedUntil: 200,
    };
    const npc = createNPC("npc_02", { name: "受伤的山贼", combatState: customCombat });
    expect(npc.combatState.hp).toBe(80);
    expect(npc.combatState.maxHp).toBe(100);
    expect(npc.combatState.isIncapacitated).toBe(true);
  });

  it("createDefaultCombatState 返回正确初始值", () => {
    const state = createDefaultCombatState();
    expect(state.hp).toBe(50);
    expect(state.maxHp).toBe(50);
    expect(state.combatTarget).toBeNull();
    expect(state.threatTable).toEqual({});
    expect(state.isIncapacitated).toBe(false);
  });
});

// ── applyDelta 处理 combatHpChanges ──

describe("applyDelta 处理 combatHpChanges", () => {
  it("伤害: hp 从 50 降到 38", () => {
    const world = createWorld();
    const npc = createNPC("npc_01", { name: "山贼", roomId: "room_01" });
    addRoom(world, createRoom("room_01", "测试", "test", ""));
    addEntity(world, npc);

    applyDelta(world, {
      combatHpChanges: [{ targetId: "npc_01", delta: -12 }],
    });

    expect(npc.combatState.hp).toBe(38);
  });

  it("治疗: hp 从 38 恢复到 48", () => {
    const world = createWorld();
    const npc = createNPC("npc_01", { name: "山贼", roomId: "room_01" });
    npc.combatState.hp = 38;
    addRoom(world, createRoom("room_01", "测试", "test", ""));
    addEntity(world, npc);

    applyDelta(world, {
      combatHpChanges: [{ targetId: "npc_01", delta: 10 }],
    });

    expect(npc.combatState.hp).toBe(48);
  });

  it("hp 不超过 maxHp", () => {
    const world = createWorld();
    const npc = createNPC("npc_01", { name: "山贼", roomId: "room_01" });
    npc.combatState.hp = 45;
    addRoom(world, createRoom("room_01", "测试", "test", ""));
    addEntity(world, npc);

    applyDelta(world, {
      combatHpChanges: [{ targetId: "npc_01", delta: 100 }],
    });

    expect(npc.combatState.hp).toBe(50); // 不超过 maxHp
  });

  it("hp 不低于 0", () => {
    const world = createWorld();
    const npc = createNPC("npc_01", { name: "山贼", roomId: "room_01" });
    npc.combatState.hp = 5;
    addRoom(world, createRoom("room_01", "测试", "test", ""));
    addEntity(world, npc);

    applyDelta(world, {
      combatHpChanges: [{ targetId: "npc_01", delta: -100 }],
    });

    expect(npc.combatState.hp).toBe(0);
  });

  it("maxHp 为 0 时 hp 保持有限数值", () => {
    const world = createWorld();
    const npc = createNPC("npc_01", { name: "山贼", roomId: "room_01" });
    npc.combatState.hp = 0;
    npc.combatState.maxHp = 0;
    addRoom(world, createRoom("room_01", "测试", "test", ""));
    addEntity(world, npc);

    applyDelta(world, {
      combatHpChanges: [{ targetId: "npc_01", delta: 10 }],
    });

    expect(Number.isFinite(npc.combatState.hp)).toBe(true);
    expect(npc.combatState.hp).toBe(0);
  });

  it("玩家也支持 combatHpChanges", () => {
    const world = createWorld();
    const player = createPlayer("player_01", "冒险者", "room_01");
    addRoom(world, createRoom("room_01", "测试", "test", ""));
    addEntity(world, player);

    applyDelta(world, {
      combatHpChanges: [{ targetId: "player_01", delta: -20 }],
    });

    expect(player.combatState.hp).toBe(30);
  });

  it("不存在的 entity 应跳过", () => {
    const world = createWorld();
    // 不抛错
    applyDelta(world, {
      combatHpChanges: [{ targetId: "nonexistent", delta: -10 }],
    });
  });

  it("ItemEntity 没有 combatState 应跳过", () => {
    const world = createWorld();
    const item = createItem("item_01", "铜币", "test_item", {}, "room_01");
    addRoom(world, createRoom("room_01", "测试", "test", ""));
    addEntity(world, item);

    // 不抛错
    applyDelta(world, {
      combatHpChanges: [{ targetId: "item_01", delta: -10 }],
    });
  });
});

// ── ContentPool combatConfig ──

describe("ContentPool combatConfig", () => {
  it("默认 ContentPool 包含 combatConfig", () => {
    const pool = createDefaultContentPool();
    expect(pool.combatConfig).toBeDefined();
    expect(pool.combatConfig.baseHp).toBe(50);
    expect(pool.combatConfig.damageVariance).toBe(0.2);
    expect(pool.combatConfig.pulseInterval).toBe(3);
  });

  it("默认 ContentPool 包含空 combatSkills", () => {
    const pool = createDefaultContentPool();
    expect(pool.combatSkills).toEqual([]);
  });

  it("combatConfig zod schema 可校验正确数据", () => {
    const result = CombatConfigSchema.safeParse(createDefaultContentPool().combatConfig);
    expect(result.success).toBe(true);
  });

  it("combatConfig zod schema 拒绝无效数据", () => {
    const result = CombatConfigSchema.safeParse({ baseHp: -1 });
    expect(result.success).toBe(false);
  });
});

// ── ContentPool Loader ──

describe("ContentPoolLoader combat domain", () => {
  beforeEach(cleanTestDir);
  afterEach(cleanTestDir);

  it("loadContentPoolFromDir 可加载 combat.yaml", () => {
    const poolDir = join(TEST_DIR, "content-pool");
    mkdirSync(poolDir, { recursive: true });
    writeFileSync(
      join(poolDir, "combat.yaml"),
      "combatConfig:\n  baseHp: 80\n  damageVariance: 0.3\n",
      "utf-8",
    );

    const pool = loadContentPoolFromDir(poolDir);
    // combat.yaml 应 deep-merge 到默认值
    expect(pool.combatConfig.baseHp).toBe(80); // 覆盖
    expect(pool.combatConfig.damageVariance).toBe(0.3); // 覆盖
    expect(pool.combatConfig.pulseInterval).toBe(3); // 保留默认
  });

  it("combat.yaml 中的 combatSkills 可加载", () => {
    const poolDir = join(TEST_DIR, "content-pool");
    mkdirSync(poolDir, { recursive: true });
    writeFileSync(
      join(poolDir, "combat.yaml"),
      "combatSkills:\n  - id: power_attack\n    name: 强力攻击\n    atkMultiplier: 1.5\n    restCost: 12\n    targetMode: single_enemy\n",
      "utf-8",
    );

    const pool = loadContentPoolFromDir(poolDir);
    expect(pool.combatSkills).toHaveLength(1);
    expect(pool.combatSkills[0].id).toBe("power_attack");
  });
});

// ── ContentPool Materializer ──

describe("ContentPoolMaterializer combat mutations", () => {
  it("replaceCombatConfig 合并到 pool", () => {
    const pool = createDefaultContentPool();
    const log = applyContentPoolMutation(pool, {
      replaceCombatConfig: { baseHp: 100, critMultiplier: 2.0 } as CombatConfig,
    });
    expect(log).toContain("更新战斗配置");
    expect(pool.combatConfig.baseHp).toBe(100);
    expect(pool.combatConfig.critMultiplier).toBe(2.0);
    // 未覆盖的字段保留默认
    expect(pool.combatConfig.damageVariance).toBe(0.2);
  });

  it("addCombatSkills 添加新技能", () => {
    const pool = createDefaultContentPool();
    const log = applyContentPoolMutation(pool, {
      addCombatSkills: [
        { id: "heal", name: "治疗术", hpRestore: 20, restCost: 10, targetMode: "self" },
      ],
    });
    expect(log).toContain("新战斗技能: heal");
    expect(pool.combatSkills).toHaveLength(1);
    expect(pool.combatSkills[0].name).toBe("治疗术");
  });

  it("addCombatSkills 更新已有技能", () => {
    const pool = createDefaultContentPool();
    pool.combatSkills = [
      { id: "heal", name: "治疗术", hpRestore: 20, restCost: 10, targetMode: "self" },
    ];
    applyContentPoolMutation(pool, {
      addCombatSkills: [
        { id: "heal", name: "高级治疗术", hpRestore: 40, restCost: 15, targetMode: "self" },
      ],
    });
    expect(pool.combatSkills).toHaveLength(1);
    expect(pool.combatSkills[0].name).toBe("高级治疗术");
    expect(pool.combatSkills[0].hpRestore).toBe(40);
  });
});
