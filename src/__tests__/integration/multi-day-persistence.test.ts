/**
 * 集成测试: 持久化 round-trip
 *
 * 验证多天后保存 + 重新加载的一致性:
 *   1. 创建世界 → 运行多天结算
 *   2. 写入 evolve deltas → 重新加载 ContentPool
 *   3. evolve 层数据正确保留
 *   4. 世界状态（时间、NPC 需求、记忆）在多天后正确累积
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadContentPoolFromDir, writeEvolveDeltas } from "../../core/content-pool-loader.ts";
import { createDailyRoutineMemory } from "../../core/memory.ts";
import type {
  ContentPoolMutation,
  NPCEntity,
  SimulationDelta,
  WorldState,
} from "../../core/types.ts";
import { applyDelta } from "../../core/world.ts";
import { executeEntityAction } from "../../engine/act-loop.ts";
import { applyContentPoolMutation } from "../../simulation/content-pool-materializer.ts";
import { decayNeeds } from "../../simulation/index.ts";
import {
  createTestEngine,
  setupWorldWithSchedule,
  stubSimulation,
} from "../fixtures/integration-helpers.ts";

const TEST_DIR = join(import.meta.dirname, "../../.test-integration-persist");

function cleanTestDir() {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
}

beforeEach(cleanTestDir);
afterEach(cleanTestDir);

function createRealSimulation() {
  return {
    runDay(world: WorldState, _playerActions: unknown[]): SimulationDelta {
      for (const [id, entity] of world.entities) {
        if (entity.type !== "npc" && entity.type !== "player") continue;
        const e = entity as NPCEntity;

        for (let hour = 6; hour <= 22; hour++) {
          const schedule = e.schedule ?? [];
          const entry = schedule.find((s) => hour >= s.startHour && hour < s.endHour);
          if (!entry) continue;

          const effect = world.contentPool.actionEffects.find((a) => a.action === entry.action);
          const actionDelta: SimulationDelta = { needChanges: [] };
          if (effect) {
            for (const [needType, d] of Object.entries(effect.needDeltas)) {
              actionDelta.needChanges?.push({
                targetId: id,
                needType: needType as unknown as import("../../core/types.js").NeedType,
                delta: d,
              });
            }
          }

          executeEntityAction({
            world,
            actorId: id,
            action: entry.action,
            actionDelta,
            actionEvents: [],
            options: { roomId: entity.roomId ?? undefined, createMemory: false },
          });
        }

        const decayDelta = decayNeeds(id, e);
        applyDelta(world, decayDelta);

        if (e.type === "npc") {
          createDailyRoutineMemory(e as NPCEntity, world.tick, world);
        }
      }
      return {};
    },
  };
}

describe("集成: 持久化 round-trip", () => {
  it("多天结算后: 时间和回合数正确累积", async () => {
    const world = setupWorldWithSchedule();
    const engine = createTestEngine(world, { simulation: createRealSimulation() });

    for (let day = 0; day < 5; day++) {
      await engine.executeStructuredCommand("p1", "end_day", {});
      await engine.settleDay({
        getPlayerIds: () => ["p1"],
        onRoundStart: () => {},
        onSettlementStarted: () => {},
        onReportReady: () => {},
        onActionResult: () => {},
      });
    }

    expect(world.time.day).toBe(6); // 初始 1 → 6
    expect(world.round).toBe(5);
    expect(world.tick).toBeGreaterThan(0);
  });

  it("多天结算后: NPC 记忆累积", async () => {
    const world = setupWorldWithSchedule();
    const npc = world.entities.get("npc_smith") as NPCEntity;
    const engine = createTestEngine(world, { simulation: createRealSimulation() });

    for (let day = 0; day < 3; day++) {
      await engine.executeStructuredCommand("p1", "end_day", {});
      await engine.settleDay({
        getPlayerIds: () => ["p1"],
        onRoundStart: () => {},
        onSettlementStarted: () => {},
        onReportReady: () => {},
        onActionResult: () => {},
      });
    }

    // 每天产生一条例行记忆 (createDailyRoutineMemory 创建 observation 类型)
    const routineMemories = npc.memories.filter((m) => m.content.includes("度过了日常的一天"));
    expect(routineMemories.length).toBeGreaterThanOrEqual(3);
  });

  it("writeEvolveDeltas + loadContentPoolFromDir: evolve 层保留", () => {
    const poolDir = join(TEST_DIR, "content-pool");
    mkdirSync(poolDir, { recursive: true });

    // 写入基础 YAML (文件名必须是 domain 名: needs-actions)
    const yamlContent = `
needDefinitions:
  - type: hunger
    baseUrgency: 0.5
    decayRate: 5
    description: 饥饿
    bornFrom: baseline
actionEffects:
  - action: eat
    needDeltas:
      hunger: 20
`;
    writeFileSync(join(poolDir, "needs-actions.yaml"), yamlContent);

    // 先加载基础 pool
    const basePool = loadContentPoolFromDir(poolDir);

    // 模拟 evolve mutation: 新增动作效果
    const mutation: ContentPoolMutation = {
      addActionEffects: [{ action: "rally", needDeltas: { social: 10 } }],
    };

    // 应用 mutation 到 pool
    applyContentPoolMutation(basePool, mutation, poolDir);

    // 写入 evolve deltas
    writeEvolveDeltas(poolDir, mutation, basePool);

    // 重新加载 → evolve 层数据应被保留
    const reloaded = loadContentPoolFromDir(poolDir);

    const rally = reloaded.actionEffects.find((a) => a.action === "rally");
    expect(rally).toBeDefined();
    expect(rally?.needDeltas.social).toBe(10);
  });

  it("世界状态: 天数 1→5 时 NPC 需求在合理范围内", async () => {
    const world = setupWorldWithSchedule();
    const npc = world.entities.get("npc_smith") as NPCEntity;
    const engine = createTestEngine(world, { simulation: createRealSimulation() });

    for (let day = 0; day < 5; day++) {
      await engine.executeStructuredCommand("p1", "end_day", {});
      await engine.settleDay({
        getPlayerIds: () => ["p1"],
        onRoundStart: () => {},
        onSettlementStarted: () => {},
        onReportReady: () => {},
        onActionResult: () => {},
      });
    }

    // 所有需求在 [0, 100] 范围内
    for (const need of npc.needs) {
      expect(need.value).toBeGreaterThanOrEqual(0);
      expect(need.value).toBeLessThanOrEqual(100);
    }
  });

  it("stub simulation: 多天后时间推进正确但 NPC 状态不变", async () => {
    const world = setupWorldWithSchedule();
    const npc = world.entities.get("npc_smith") as NPCEntity;
    const initialNeeds = npc.needs.map((n) => ({ type: n.type, value: n.value }));

    const engine = createTestEngine(world, { simulation: stubSimulation() });

    for (let day = 0; day < 3; day++) {
      await engine.executeStructuredCommand("p1", "end_day", {});
      await engine.settleDay({
        getPlayerIds: () => ["p1"],
        onRoundStart: () => {},
        onSettlementStarted: () => {},
        onReportReady: () => {},
        onActionResult: () => {},
      });
    }

    // 时间推进正确
    expect(world.time.day).toBe(4);
    expect(world.round).toBe(3);

    // stub simulation 不执行 NPC 逻辑，所以 needs 不变
    for (const initial of initialNeeds) {
      const current = npc.needs.find((n) => n.type === initial.type);
      expect(current?.value).toBe(initial.value);
    }
  });
});
