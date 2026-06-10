/**
 * 集成测试: 双玩家 WebSocket
 *
 * 验证两个 WebSocket 客户端连接同一服务器时的交互:
 *   1. 两个玩家连接并各自绑定实体
 *   2. 两个玩家都能看到对方在房间实体列表中
 *   3. 玩家 A 做动作 → 收到 command_result
 */
import { describe, expect, it } from "vitest";
import WebSocket from "ws";
import { EventBus } from "../../core/event-bus.ts";
import { RoundEngine } from "../../core/round-engine.ts";
import { buildWorld } from "../../core/world-loader.ts";
import { InteractionDispatcher, LLMAdapter } from "../../llm/index.ts";
import { GameServer } from "../../server/ws-server.ts";
import { randomPort } from "../fixtures/integration-helpers.ts";

function createMultiplayerWorld() {
  return buildWorld({
    name: "multi-test",
    seed: "seed",
    era: "stone",
    regions: [
      {
        id: "test" as const,
        name: "test",
        dominantCulture: "test",
        prosperity: 50,
        threatLevel: 10,
      },
    ],
    rooms: [
      { id: "tavern" as const, name: "酒馆", regionId: "test" as const, description: "热闹的酒馆" },
      { id: "market" as const, name: "集市", regionId: "test" as const, description: "繁忙的集市" },
    ],
    graph: {
      layout: {
        test: {
          rows: 1,
          cols: 2,
          rooms: ["tavern", "market"],
          defaultDistance: 1,
        },
      },
    },
    players: [
      { id: "p1", name: "赵行舟", roomId: "tavern" as const },
      { id: "p2", name: "李青山", roomId: "tavern" as const },
    ],
  });
}

/** 连接并收集初始化序列 (init + state_update + status) */
function connectAndInit(
  port: number,
  timeout = 5000,
): Promise<{ ws: WebSocket; messages: Record<string, unknown>[] }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    const messages: Record<string, unknown>[] = [];
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`Timeout: got ${messages.length} messages`));
    }, timeout);

    ws.on("message", (data) => {
      const msg = JSON.parse(String(data));
      messages.push(msg);
      // 收到 status 表示初始化序列完成
      if (msg.type === "status") {
        clearTimeout(timer);
        resolve({ ws, messages });
      }
    });
    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** 发送命令并等待 command_result */
function sendAndWaitResult(
  ws: WebSocket,
  msg: unknown,
  timeout = 5000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timeout waiting for command_result"));
    }, timeout);

    const handler = (data: unknown) => {
      const parsed = JSON.parse(String(data));
      if (parsed.type === "command_result" || parsed.type === "error") {
        clearTimeout(timer);
        ws.off("message", handler);
        resolve(parsed);
      }
    };
    ws.on("message", handler);
    ws.send(JSON.stringify(msg));
  });
}

describe("集成: 双玩家 WebSocket", () => {
  it("两个玩家都收到 init 消息并绑定不同实体", async () => {
    const port = randomPort();
    const world = createMultiplayerWorld();
    const eventBus = new EventBus();
    const adapter = new LLMAdapter({ baseUrl: "http://localhost/v1", apiKey: "x", model: "x" });
    const dispatcher = new InteractionDispatcher(adapter);
    const engine = new RoundEngine(world, eventBus, dispatcher, { runDay: () => ({}) });

    const server = new GameServer(port, world, eventBus);
    server.setCommandHandler(async (playerId, action, params) => {
      return engine.executeStructuredCommand(playerId, action, params);
    });

    try {
      const [conn1, conn2] = await Promise.all([connectAndInit(port), connectAndInit(port)]);

      const init1 = conn1.messages.find((m) => m.type === "init");
      const init2 = conn2.messages.find((m) => m.type === "init");

      expect(init1).toBeDefined();
      expect(init2).toBeDefined();
      expect(init1?.boundEntityId).not.toBe(init2?.boundEntityId);

      conn1.ws.close();
      conn2.ws.close();
    } finally {
      server.close();
    }
  });

  it("两个玩家都能看到对方在房间实体列表中", async () => {
    const port = randomPort();
    const world = createMultiplayerWorld();
    const eventBus = new EventBus();
    const adapter = new LLMAdapter({ baseUrl: "http://localhost/v1", apiKey: "x", model: "x" });
    const dispatcher = new InteractionDispatcher(adapter);
    const engine = new RoundEngine(world, eventBus, dispatcher, { runDay: () => ({}) });

    const server = new GameServer(port, world, eventBus);
    server.setCommandHandler(async (playerId, action, params) => {
      return engine.executeStructuredCommand(playerId, action, params);
    });

    try {
      const [conn1, conn2] = await Promise.all([connectAndInit(port), connectAndInit(port)]);

      const state1 = conn1.messages.find((m) => m.type === "state_update");
      const room = state1?.room as Record<string, unknown>;
      const entities = room?.entities as Array<Record<string, unknown>>;

      expect(entities).toBeDefined();
      const entityNames = entities.map((e) => e.name);
      expect(entityNames).toContain("赵行舟");
      expect(entityNames).toContain("李青山");

      conn1.ws.close();
      conn2.ws.close();
    } finally {
      server.close();
    }
  });

  it("玩家 A 发送 look → 收到 command_result", async () => {
    const port = randomPort();
    const world = createMultiplayerWorld();
    const eventBus = new EventBus();
    const adapter = new LLMAdapter({ baseUrl: "http://localhost/v1", apiKey: "x", model: "x" });
    const dispatcher = new InteractionDispatcher(adapter);
    const engine = new RoundEngine(world, eventBus, dispatcher, { runDay: () => ({}) });

    const server = new GameServer(port, world, eventBus);
    server.setCommandHandler(async (playerId, action, params) => {
      return engine.executeStructuredCommand(playerId, action, params);
    });

    try {
      const conn1 = await connectAndInit(port);

      const result = await sendAndWaitResult(conn1.ws, {
        type: "execute",
        action: "look",
        params: { target: "房间" },
      });

      const events = result.events as Array<Record<string, unknown>>;
      expect(events).toBeDefined();
      expect(events[0].type).toBe("look");
      expect(events[0].description).toContain("酒馆");

      conn1.ws.close();
    } finally {
      server.close();
    }
  });
});
