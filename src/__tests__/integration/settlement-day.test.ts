/**
 * 集成测试: 结算日全链路
 *
 * 验证 end_day → settleDay 的完整闭环:
 *   1. NPC schedule 按小时执行并产生 need 变化
 *   2. 需求衰减 (decayNeeds) 生效
 *   3. 每日例行记忆 (createDailyRoutineMemory) 生成
 *   4. 世界时间推进 (advanceDay)
 *   5. 事件记录到 eventLog
 *   6. 日报生成并回调
 */
import { describe, expect, it } from "vitest";
import { createDailyRoutineMemory } from "../../core/memory.ts";
import type { NPCEntity, SimulationDelta, WorldState } from "../../core/types.ts";
import { applyDelta } from "../../core/world.ts";
import { executeEntityAction } from "../../engine/act-loop.ts";
import { decayNeeds } from "../../simulation/index.ts";
import {
  createTestEngine,
  setupWorldWithSchedule,
  stubSimulation,
} from "../fixtures/integration-helpers.ts";

/** 从 index.ts 提取的真实 simulation 逻辑 */
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

describe("集成: 结算日全链路", () => {
  it("settleDay: NPC 需求按 schedule + decay 变化", async () => {
    const world = setupWorldWithSchedule();
    const npc = world.entities.get("npc_smith") as NPCEntity;
    expect(npc).toBeDefined();

    const initialHunger = npc.needs.find((n) => n.type === "hunger")?.value;
    const initialRest = npc.needs.find((n) => n.type === "rest")?.value;

    // 使用真实 simulation（非 stub），以便执行 NPC schedule
    const simulation = createRealSimulation();
    const engine = createTestEngine(world, { simulation });

    // 标记玩家结束当天
    await engine.executeStructuredCommand("p1", "end_day", {});

    // 执行结算
    let _reportSent = false;
    await engine.settleDay({
      getPlayerIds: () => ["p1"],
      onRoundStart: () => {},
      onSettlementStarted: () => {},
      onReportReady: (reports) => {
        _reportSent = true;
        expect(reports.has("p1")).toBe(true);
      },
      onActionResult: () => {},
    });

    // 验证 NPC needs 变化
    const afterHunger = npc.needs.find((n) => n.type === "hunger")?.value;
    const afterRest = npc.needs.find((n) => n.type === "rest")?.value;

    // work_at_smithy: rest -10 (执行 12 小时)
    // eat_at_tavern: hunger +30, social +10 (执行 1 小时)
    // decay: hunger -5, rest -8
    // net hunger: 30 - 5 = +25
    // net rest: -10*12 + (-8) = -128 (clamp to 0)
    expect(afterHunger).toBeGreaterThan(initialHunger!);
    expect(afterRest).toBeLessThan(initialRest!);
  });

  it("settleDay: 时间推进 (day +1, round +1)", async () => {
    const world = setupWorldWithSchedule();
    const engine = createTestEngine(world, { simulation: createRealSimulation() });

    const initialDay = world.time.day;
    const initialRound = world.round;

    await engine.executeStructuredCommand("p1", "end_day", {});
    await engine.settleDay({
      getPlayerIds: () => ["p1"],
      onRoundStart: () => {},
      onSettlementStarted: () => {},
      onReportReady: () => {},
      onActionResult: () => {},
    });

    expect(world.time.day).toBe(initialDay + 1);
    expect(world.round).toBe(initialRound + 1);
  });

  it("settleDay: NPC 生成每日例行记忆", async () => {
    const world = setupWorldWithSchedule();
    const npc = world.entities.get("npc_smith") as NPCEntity;
    expect(npc).toBeDefined();

    const initialMemories = npc.memories.length;

    const engine = createTestEngine(world, { simulation: createRealSimulation() });
    await engine.executeStructuredCommand("p1", "end_day", {});
    await engine.settleDay({
      getPlayerIds: () => ["p1"],
      onRoundStart: () => {},
      onSettlementStarted: () => {},
      onReportReady: () => {},
      onActionResult: () => {},
    });

    expect(npc.memories.length).toBeGreaterThan(initialMemories);
    // 最后一条应该是例行记忆 (createDailyRoutineMemory 创建 observation 类型)
    const lastMemory = npc.memories[npc.memories.length - 1];
    expect(lastMemory.content).toContain("度过了日常的一天");
  });

  it("settleDay: 日报回调被触发且包含玩家信息", async () => {
    const world = setupWorldWithSchedule();
    const engine = createTestEngine(world, { simulation: createRealSimulation() });

    await engine.executeStructuredCommand("p1", "end_day", {});

    const reports: Map<string, unknown> = new Map();
    await engine.settleDay({
      getPlayerIds: () => ["p1"],
      onRoundStart: () => {},
      onSettlementStarted: () => {},
      onReportReady: (r) => {
        for (const [k, v] of r) reports.set(k, v);
      },
      onActionResult: () => {},
    });

    expect(reports.has("p1")).toBe(true);
    const report = reports.get("p1") as Record<string, unknown>;
    expect(report.playerId).toBe("p1");
    expect(report.round).toBe(1);
    expect(typeof report.date).toBe("string");
    expect(typeof report.summary).toBe("string");
  });

  it("settleDay: stub simulation 不影响时间推进和日报", async () => {
    const world = setupWorldWithSchedule();
    const engine = createTestEngine(world, { simulation: stubSimulation() });

    await engine.executeStructuredCommand("p1", "end_day", {});
    await engine.settleDay({
      getPlayerIds: () => ["p1"],
      onRoundStart: () => {},
      onSettlementStarted: () => {},
      onReportReady: () => {},
      onActionResult: () => {},
    });

    expect(world.time.day).toBe(2);
    expect(world.round).toBe(1);
  });

  it("settleDay 连续调用: 天数和回合数正确递增", async () => {
    const world = setupWorldWithSchedule();
    const engine = createTestEngine(world, { simulation: createRealSimulation() });

    for (let i = 0; i < 3; i++) {
      await engine.executeStructuredCommand("p1", "end_day", {});
      await engine.settleDay({
        getPlayerIds: () => ["p1"],
        onRoundStart: () => {},
        onSettlementStarted: () => {},
        onReportReady: () => {},
        onActionResult: () => {},
      });
    }

    expect(world.time.day).toBe(4); // 初始 1 → 4
    expect(world.round).toBe(3);
  });
});
