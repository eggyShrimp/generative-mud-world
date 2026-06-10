import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
/**
 * 集成测试: 房间动作全链路
 *
 * 验证房间动作从数据加载到执行的完整闭环:
 *   1. entity-actions.yaml 加载 → ContentPool.entityActionsByTag 生效
 *   2. 世界配置 tags → 房间创建时携带 tags
 *   3. buildWorld → 玩家进入带 tag 的房间 → protocol 携带 roomActions
 *   4. executeStructuredCommand 全管线: feasibility → execute → applyDelta
 *   5. 无 tag 房间降级: roomActions 为空
 */
import { describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { EventBus } from "../../core/event-bus.ts";
import { RoundEngine } from "../../core/round-engine.ts";
import type { WorldState } from "../../core/types.ts";
import {
  addEntity,
  addRegion,
  addRoom,
  createPlayer,
  createRoom,
  createWorld,
} from "../../core/world.ts";
import { executeCommand } from "../../engine/command-executor.ts";
import { InteractionDispatcher, LLMAdapter } from "../../llm/index.ts";
import { GameServer } from "../../server/ws-server.ts";

// ============================================================
// Fixtures
// ============================================================

const TEST_DIR = join(import.meta.dirname, "../../.test-room-actions-integration");

function _cleanTestDir() {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
}

function stubAdapter() {
  return new LLMAdapter({ baseUrl: "http://localhost/v1", apiKey: "x", model: "x" });
}

function stubDispatcher() {
  const d = new InteractionDispatcher(stubAdapter());
  vi.spyOn(d, "checkReachable").mockResolvedValue(false);
  vi.spyOn(d, "runSettlementBatch").mockResolvedValue({
    deltas: [],
    worldMutations: [],
    contentPoolMutations: [],
  });
  return d;
}

function stubSimulation() {
  return { runDay: () => ({}) };
}

function createTestEngine(world: WorldState) {
  const engine = new RoundEngine(world, new EventBus(), stubDispatcher(), stubSimulation());
  return engine;
}

/** 启动 WS 服务器并收集初始消息 */
function startServerAndCollect(
  world: WorldState,
  count: number,
): Promise<{
  port: number;
  messages: Record<string, unknown>[];
}> {
  return new Promise((resolve, reject) => {
    const port = 20000 + Math.floor(Math.random() * 1000);
    const eventBus = new EventBus();
    const server = new GameServer(port, world, eventBus);
    server.setCommandHandler(async (playerId, action, params) => {
      return executeCommand(world, playerId, action, params);
    });

    const ws = new WebSocket(`ws://localhost:${port}`);
    const messages: Record<string, unknown>[] = [];
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`timeout: collected ${messages.length}/${count} messages`));
    }, 5000);

    ws.on("message", (data) => {
      const msg = JSON.parse(String(data));
      messages.push(msg);
      if (messages.length >= count) {
        clearTimeout(timer);
        ws.close();
        resolve({ port, messages });
      }
    });
    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** 连接 WS 服务器并发送 execute 命令 */
function sendExecute(
  port: number,
  action: string,
  params: Record<string, unknown> = {},
): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    const messages: Record<string, unknown>[] = [];
    let statusReceived = false;
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`timeout: collected ${messages.length} messages`));
    }, 5000);

    ws.on("message", (data) => {
      const msg = JSON.parse(String(data));
      messages.push(msg);
      if (msg.type === "status" && !statusReceived) {
        statusReceived = true;
        ws.send(JSON.stringify({ type: "execute", action, params }));
      }
      if (msg.type === "command_result") {
        clearTimeout(timer);
        ws.close();
        resolve(messages);
      }
    });
    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// ============================================================
// Tests
// ============================================================

describe("集成: 房间动作 YAML 加载", () => {
  it("loadContentPoolFromDir: entity-actions.yaml 加载到 ContentPool", async () => {
    // 使用真实的 content-pool 目录
    const poolDir = join(import.meta.dirname, "../../../worlds/content-pool");
    const { loadContentPoolFromDir } = await import("../../core/content-pool-loader.ts");

    const pool = loadContentPoolFromDir(poolDir);

    expect(pool.entityActionsByTag).toBeDefined();
    expect(Object.keys(pool.entityActionsByTag).length).toBeGreaterThan(0);
    expect(pool.entityActionsByTag.mine).toContain("mine_ore");
    expect(pool.entityActionsByTag.tavern).toContain("order_drink");
    expect(pool.entityActionsByTag.smithy).toContain("work_at_smithy");

    expect(pool.entityActionLabels.mine_ore).toBe("采矿");
    expect(pool.entityActionLabels.order_drink).toBe("点酒");

    expect(pool.entityTagLabels.mine).toBe("矿场");
    expect(pool.entityTagLabels.tavern).toBe("酒馆");
  });
});

describe("集成: 房间动作 WS 协议", () => {
  it("state_update: 带 tag 的房间 → room.roomActions 有内容", async () => {
    const world = createWorld();
    addRegion(world, {
      id: "test",
      name: "test",
      dominantCulture: "test",
      prosperity: 50,
      threatLevel: 10,
    });
    const mine = createRoom("mine", "矿洞", "test", "幽深的矿洞", "cave", ["mine"]);
    addRoom(world, mine);
    world.contentPool.entityActionsByTag = { mine: ["mine_ore"] };
    world.contentPool.entityActionLabels = { mine_ore: "采矿" };
    world.contentPool.actionEffects = [
      { action: "mine_ore", needDeltas: { rest: -10, wealth: 15 } },
    ];
    const player = createPlayer("p1", "矿工", "mine", world.contentPool);
    addEntity(world, player);

    const { messages } = await startServerAndCollect(world, 3);
    const state = messages.find((m) => m.type === "state_update") as Record<string, unknown>;
    const room = state.room as Record<string, unknown>;
    const roomActions = room.roomActions as Array<{ id: string; label: string }>;

    expect(roomActions).toHaveLength(1);
    expect(roomActions[0]).toEqual({ id: "mine_ore", label: "采矿" });
  });

  it("state_update: 无 tag 的房间 → room.roomActions 为空", async () => {
    const world = createWorld();
    addRegion(world, {
      id: "test",
      name: "test",
      dominantCulture: "test",
      prosperity: 50,
      threatLevel: 10,
    });
    const room = createRoom("room1", "空房间", "test", "空荡荡的房间");
    addRoom(world, room);
    world.contentPool.entityActionsByTag = { mine: ["mine_ore"] };
    const player = createPlayer("p1", "旅人", "room1", world.contentPool);
    addEntity(world, player);

    const { messages } = await startServerAndCollect(world, 3);
    const state = messages.find((m) => m.type === "state_update") as Record<string, unknown>;
    const roomInfo = state.room as Record<string, unknown>;
    const roomActions = roomInfo.roomActions as Array<{ id: string; label: string }>;

    expect(roomActions).toHaveLength(0);
  });

  it("execute via WS: room action → command_result + delta 生效", async () => {
    const world = createWorld();
    addRegion(world, {
      id: "test",
      name: "test",
      dominantCulture: "test",
      prosperity: 50,
      threatLevel: 10,
    });
    const mine = createRoom("mine", "矿洞", "test", "幽深的矿洞", "cave", ["mine"]);
    addRoom(world, mine);
    world.contentPool.entityActionsByTag = { mine: ["mine_ore"] };
    world.contentPool.entityActionLabels = { mine_ore: "采矿" };
    world.contentPool.actionEffects = [
      { action: "mine_ore", needDeltas: { rest: -10, hunger: 5 } },
    ];
    const player = createPlayer("p1", "矿工", "mine", world.contentPool);
    addEntity(world, player);

    const { port } = await startServerAndCollect(world, 3);
    const messages = await sendExecute(port, "mine_ore");

    const result = messages.find((m) => m.type === "command_result") as Record<string, unknown>;
    const events = result.events as Array<{ type: string; description: string }>;

    expect(events[0].type).toBe("room_action");
    expect(events[0].description).toContain("采矿");

    // executeCommand 直接修改实体状态，检查 player needs
    const restNeed = player.needs.find((n) => n.type === "rest");
    const hungerNeed = player.needs.find((n) => n.type === "hunger");
    expect(restNeed?.value).toBe(60); // 初始 70 + delta(-10)
    expect(hungerNeed?.value).toBe(75); // 初始 70 + delta(5)
  });
});

describe("集成: 房间动作 RoundEngine 全管线", () => {
  it("executeStructuredCommand: mine_ore → feasibility + execute + applyDelta 全链路", async () => {
    const world = createWorld();
    addRegion(world, {
      id: "test",
      name: "test",
      dominantCulture: "test",
      prosperity: 50,
      threatLevel: 10,
    });
    const mine = createRoom("mine", "矿洞", "test", "幽深的矿洞", "cave", ["mine"]);
    addRoom(world, mine);
    world.contentPool.entityActionsByTag = { mine: ["mine_ore"] };
    world.contentPool.entityActionLabels = { mine_ore: "采矿" };
    world.contentPool.actionEffects = [
      { action: "mine_ore", needDeltas: { rest: -10, social: 5 } },
    ];
    const player = createPlayer("p1", "矿工", "mine", world.contentPool);
    addEntity(world, player);

    const initialRest = player.needs.find((n) => n.type === "rest")?.value ?? 70;
    const initialSocial = player.needs.find((n) => n.type === "social")?.value ?? 70;

    const engine = createTestEngine(world);
    const result = await engine.executeStructuredCommand("p1", "mine_ore", {});

    // 事件包含 room_action
    expect(result.events.some((e) => e.type === "room_action")).toBe(true);
    expect(result.events.some((e) => e.description.includes("采矿"))).toBe(true);

    // needs 已被 applyDelta 修改
    const afterRest = player.needs.find((n) => n.type === "rest")?.value;
    const afterSocial = player.needs.find((n) => n.type === "social")?.value;
    expect(afterRest).toBe(initialRest - 10);
    expect(afterSocial).toBe(initialSocial + 5);
  });

  it("executeStructuredCommand: room action rest 不足 → feasibility 拦截", async () => {
    const world = createWorld();
    addRegion(world, {
      id: "test",
      name: "test",
      dominantCulture: "test",
      prosperity: 50,
      threatLevel: 10,
    });
    const mine = createRoom("mine", "矿洞", "test", "幽深的矿洞", "cave", ["mine"]);
    addRoom(world, mine);
    world.contentPool.entityActionsByTag = { mine: ["mine_ore"] };
    world.contentPool.entityActionLabels = { mine_ore: "采矿" };
    world.contentPool.actionEffects = [
      { action: "mine_ore", needDeltas: { rest: -10, wealth: 15 } },
    ];
    const player = createPlayer("p1", "矿工", "mine", world.contentPool);
    addEntity(world, player);

    // 把 rest 降到不够扣
    const restNeed = player.needs.find((n) => n.type === "rest");
    if (restNeed) restNeed.value = 5;

    const engine = createTestEngine(world);
    const result = await engine.executeStructuredCommand("p1", "mine_ore", {});

    expect(result.events[0].type).toBe("error");
    expect(result.events[0].description).toContain("精力不足");
  });

  it("executeStructuredCommand: 无 tag 房间执行 room action → 返回未知操作", async () => {
    const world = createWorld();
    addRegion(world, {
      id: "test",
      name: "test",
      dominantCulture: "test",
      prosperity: 50,
      threatLevel: 10,
    });
    const room = createRoom("room1", "空房间", "test", "空荡荡的房间");
    addRoom(world, room);
    world.contentPool.entityActionsByTag = { mine: ["mine_ore"] };
    world.contentPool.actionEffects = [
      { action: "mine_ore", needDeltas: { rest: -10, wealth: 15 } },
    ];
    const player = createPlayer("p1", "旅人", "room1", world.contentPool);
    addEntity(world, player);

    const engine = createTestEngine(world);
    const result = await engine.executeStructuredCommand("p1", "mine_ore", {});

    expect(result.events[0].type).toBe("error");
    expect(result.events[0].description).toContain("未知操作");
  });
});
