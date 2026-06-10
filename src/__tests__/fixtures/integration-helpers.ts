/**
 * 集成测试共享工具
 *
 * 提取自 round-engine.test.ts 和 ws-server.test.ts 的 setup/teardown 模式。
 */
import { vi } from "vitest";
import WebSocket from "ws";
import { EventBus } from "../../core/event-bus.ts";
import { RoundEngine } from "../../core/round-engine.ts";
import type { SimulationDelta, WorldState } from "../../core/types.ts";
import {
  addEntity,
  addRegion,
  addRoom,
  createNPC,
  createPlayer,
  createRoom,
  createWorld,
} from "../../core/world.ts";
import type { DialogueGenerator } from "../../llm/dialogue-generator.ts";
import { InteractionDispatcher, LLMAdapter } from "../../llm/index.ts";
import { GameServer } from "../../server/ws-server.ts";

// ============================================================
// 世界构建 helpers
// ============================================================

export function setupBaseWorld(): WorldState {
  const world = createWorld();
  addRegion(world, {
    id: "test",
    name: "测试区域",
    dominantCulture: "test",
    prosperity: 50,
    threatLevel: 10,
  });
  return world;
}

export function addBasicRooms(world: WorldState): void {
  const market = createRoom("market", "集市", "test", "热闹的市场");
  const tavern = createRoom("tavern", "酒馆", "test", "昏暗的酒馆");
  market.exits.set("north", {
    to: "tavern",
    direction: "north",
    distance: 1,
    hidden: false,
    bidirectional: true,
  });
  tavern.exits.set("south", {
    to: "market",
    direction: "south",
    distance: 1,
    hidden: false,
    bidirectional: true,
  });
  addRoom(world, market);
  addRoom(world, tavern);
}

export function addPlayerToRoom(world: WorldState, roomId: string): void {
  const player = createPlayer("p1", "赵行舟", roomId, world.contentPool);
  addEntity(world, player);
}

export function setupWorldWithPlayer(): WorldState {
  const world = setupBaseWorld();
  addBasicRooms(world);
  addPlayerToRoom(world, "market");
  return world;
}

export function setupWorldWithNPC(): WorldState {
  const world = setupWorldWithPlayer();
  movePlayerTo(world, "tavern");
  const npc = createNPC("npc1", {
    name: "老马",
    roomId: "tavern",
    description: "热情的酒馆老板",
    npcTier: "core",
    personality: "热情",
    mood: 50,
    needs: [{ type: "social", value: 50, baseUrgency: 0.3, decayRate: 3 }],
    relations: [],
  });
  addEntity(world, npc);
  return world;
}

export function setupWorldWithObserver(): WorldState {
  const world = setupWorldWithNPC();
  const observer = createNPC("obs1", {
    name: "老王",
    roomId: "tavern",
    description: "酒馆常客",
    npcTier: "background",
    personality: "多疑",
    mood: 50,
    needs: [],
    traits: [{ name: "suspicious", value: 80 }],
    relations: [{ targetId: "p1", level: 40, label: "认识", lastInteractionTick: 0 }],
  });
  addEntity(world, observer);
  return world;
}

export function setupWorldWithSchedule(): WorldState {
  const world = setupBaseWorld();
  const room = createRoom("tavern", "酒馆", "test", "昏暗的酒馆");
  addRoom(world, room);
  addPlayerToRoom(world, "tavern");

  const npc = createNPC("npc_smith", {
    name: "铁匠",
    roomId: "tavern",
    description: "村里的铁匠",
    npcTier: "core",
    personality: "勤劳",
    needs: [
      { type: "hunger", value: 50, baseUrgency: 0.5, decayRate: 5 },
      { type: "rest", value: 60, baseUrgency: 0.2, decayRate: 8 },
      { type: "safety", value: 40, baseUrgency: 0.4, decayRate: 1 },
    ],
    traits: [],
    schedule: [
      {
        startHour: 6,
        endHour: 12,
        action: "work_at_smithy",
        targetRoomId: null,
        priority: 8,
        deviationAllowed: true,
      },
      {
        startHour: 12,
        endHour: 13,
        action: "eat_at_tavern",
        targetRoomId: null,
        priority: 9,
        deviationAllowed: false,
      },
      {
        startHour: 13,
        endHour: 18,
        action: "work_at_smithy",
        targetRoomId: null,
        priority: 8,
        deviationAllowed: true,
      },
    ],
  });
  addEntity(world, npc);
  return world;
}

export function movePlayerTo(world: WorldState, roomId: string): void {
  const player = world.entities.get("p1");
  if (!player) throw new Error("player not found");
  const oldRoomId = player.roomId;
  if (oldRoomId) {
    world.rooms.get(oldRoomId)?.entities.delete("p1");
  }
  player.roomId = roomId;
  world.rooms.get(roomId)?.entities.add("p1");
}

// ============================================================
// LLM / Dispatcher / Simulation 模拟
// ============================================================

export function stubAdapter(): LLMAdapter {
  return new LLMAdapter({ baseUrl: "http://localhost/v1", apiKey: "x", model: "x" });
}

export function stubDispatcher(): InteractionDispatcher {
  const d = new InteractionDispatcher(stubAdapter());
  vi.spyOn(d, "checkReachable").mockResolvedValue(false);
  vi.spyOn(d, "runSettlementBatch").mockResolvedValue({
    deltas: [],
    worldMutations: [],
    contentPoolMutations: [],
  });
  return d;
}

export function stubSimulation() {
  return { runDay: () => ({}) };
}

export function mockDialogueGenerator(delta: SimulationDelta): DialogueGenerator {
  return {
    generateFixedMenu: vi.fn().mockReturnValue([
      { id: "opt_1", label: "你好", type: "idle_chat" },
      { id: "opt_2", label: "再见", type: "close" },
    ]),
    handleOption: vi.fn().mockResolvedValue({ delta, subOptions: undefined }),
  } as unknown as DialogueGenerator;
}

// ============================================================
// Engine 构建
// ============================================================

export function createTestEngine(
  world: WorldState,
  opts?: {
    dispatcher?: InteractionDispatcher;
    simulation?: { runDay: (w: WorldState, a: unknown[]) => SimulationDelta };
    dialogueDelta?: SimulationDelta;
  },
): RoundEngine {
  const dispatcher = opts?.dispatcher ?? stubDispatcher();
  const simulation = opts?.simulation ?? stubSimulation();
  const engine = new RoundEngine(world, new EventBus(), dispatcher, simulation);
  if (opts?.dialogueDelta) {
    engine.setDialogueGenerator(mockDialogueGenerator(opts.dialogueDelta));
  }
  return engine;
}

// ============================================================
// WebSocket helpers
// ============================================================

export function randomPort(): number {
  return 19000 + Math.floor(Math.random() * 1000);
}

export function connectAndCollect(
  port: number,
  count: number,
  timeout = 3000,
): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    const messages: Record<string, unknown>[] = [];
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`Timeout: got ${messages.length}/${count} messages`));
    }, timeout);

    ws.on("message", (data) => {
      messages.push(JSON.parse(String(data)));
      if (messages.length >= count) {
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

export function connectAndSend(
  port: number,
  sendMsg: unknown,
  timeout = 3000,
): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    const messages: Record<string, unknown>[] = [];
    let sent = false;
    const timer = setTimeout(() => {
      ws.close();
      reject(
        new Error(
          `Timeout: got ${messages.length} messages, types: ${messages.map((m) => m.type)}`,
        ),
      );
    }, timeout);

    ws.on("message", (data) => {
      const msg = JSON.parse(String(data));
      messages.push(msg);
      if (msg.type === "status" && !sent) {
        sent = true;
        ws.send(JSON.stringify(sendMsg));
      }
      if (sent && messages.some((m) => m.type === "command_result" || m.type === "error")) {
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

/**
 * 创建并启动一个 GameServer 实例，绑定到 RoundEngine.executeStructuredCommand。
 * 返回 server 和 port，caller 负责关闭。
 */
export function startTestServer(
  world: WorldState,
  opts?: { dialogueDelta?: SimulationDelta },
): { server: GameServer; port: number; engine: RoundEngine } {
  const port = randomPort();
  const engine = createTestEngine(world, { dialogueDelta: opts?.dialogueDelta });
  const eventBus = engine.getEventBus();
  const server = new GameServer(port, world, eventBus);
  server.setCommandHandler(async (playerId, action, params) => {
    return engine.executeStructuredCommand(playerId, action, params);
  });
  return { server, port, engine };
}
