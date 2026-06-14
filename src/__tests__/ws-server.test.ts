import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { EventBus } from "../core/event-bus.ts";
import { SaveManager } from "../core/save-manager.ts";
import {
  addEntity,
  addRegion,
  addRoom,
  createPlayer,
  createRoom,
  createWorld,
} from "../core/world.ts";
import { buildWorld } from "../core/world-loader.ts";
import { executeCommand } from "../engine/command-executor.ts";
import { GameServer } from "../server/ws-server.ts";

function setupWorld() {
  const world = createWorld();
  addRegion(world, {
    id: "test",
    name: "test",
    dominantCulture: "test",
    prosperity: 50,
    threatLevel: 10,
  });
  const room = createRoom("market", "集市", "test", "热闹的市场");
  addRoom(world, room);
  const player = createPlayer("p1", "赵行舟", "market", world.contentPool);
  addEntity(world, player);
  return world;
}

function connectAndCollect(
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

function connectAndCollectOpen(
  port: number,
  count: number,
  timeout = 3000,
): Promise<{ ws: WebSocket; messages: Record<string, unknown>[] }> {
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
        resolve({ ws, messages });
      }
    });
    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function connectAndSend(
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
      // After receiving status (end of init sequence), send our command
      if (msg.type === "status" && !sent) {
        sent = true;
        ws.send(JSON.stringify(sendMsg));
      }
      // Wait for command_result or error after the init sequence
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

function connectAndSendUntil(
  port: number,
  sendMsg: unknown,
  done: (messages: Record<string, unknown>[]) => boolean,
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
      if (sent && done(messages)) {
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

function connectMoveOutAndBack(port: number, timeout = 3000): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    const messages: Record<string, unknown>[] = [];
    let sentEast = false;
    let sentWest = false;
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

      if (msg.type === "status" && !sentEast) {
        sentEast = true;
        ws.send(JSON.stringify({ type: "execute", action: "move", params: { direction: "东" } }));
        return;
      }

      if (sentEast && !sentWest && msg.type === "state_update") {
        const room = msg.room as Record<string, unknown> | null;
        if (room?.id === "workshop") {
          sentWest = true;
          ws.send(JSON.stringify({ type: "execute", action: "move", params: { direction: "西" } }));
        }
        return;
      }

      if (sentWest && msg.type === "state_update") {
        const room = msg.room as Record<string, unknown> | null;
        if (room?.id === "market") {
          clearTimeout(timer);
          ws.close();
          resolve(messages);
        }
      }
    });
    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

describe("GameServer", () => {
  let server: GameServer;
  let port: number;

  beforeAll(() => {
    port = 19000 + Math.floor(Math.random() * 1000);
    const world = setupWorld();
    const eventBus = new EventBus();
    server = new GameServer(port, world, eventBus);
    server.setCommandHandler(async (playerId, action, params) => {
      return executeCommand(world, playerId, action, params);
    });
  });

  afterAll(() => {
    server.close();
  });

  it("should send init + state_update + status on connection", async () => {
    const msgs = await connectAndCollect(port, 3);
    const types = msgs.map((m) => m.type);
    expect(types).toContain("init");
    expect(types).toContain("state_update");
    expect(types).toContain("status");
  });

  it("should bind player entity on first connection", async () => {
    const msgs = await connectAndCollect(port, 3);
    const init = msgs.find((m) => m.type === "init");
    expect(init).toBeDefined();
    expect(init?.boundEntityId).toBe("p1");
    expect(init?.boundEntityName).toBe("赵行舟");
  });

  it("should bind the only player when a previous single-player connection is still open", async () => {
    const first = await connectAndCollectOpen(port, 3);

    try {
      const second = await connectAndCollect(port, 3);
      const init = second.find((m) => m.type === "init");
      const state = second.find((m) => m.type === "state_update");

      expect(init?.boundEntityId).toBe("p1");
      expect(state?.capabilities).toBeDefined();
      const actions = (state?.capabilities as Record<string, unknown>[]).map((c) => c.action);
      expect(actions).toContain("rest");
      expect(actions).toContain("inventory");
      expect(actions).toContain("end_day");
    } finally {
      first.ws.close();
    }
  });

  it("should include capabilities in state_update", async () => {
    const msgs = await connectAndCollect(port, 3);
    const state = msgs.find((m) => m.type === "state_update");
    expect(state).toBeDefined();
    expect(state?.capabilities).toBeDefined();
    const actions = (state?.capabilities as Record<string, unknown>[]).map((c) => c.action);
    expect(actions).toContain("look");
    expect(actions).toContain("status");
    expect(actions).toContain("end_day");
  });

  it("should include room info in state_update", async () => {
    const msgs = await connectAndCollect(port, 3);
    const state = msgs.find((m) => m.type === "state_update");
    expect(state).toBeDefined();
    const room = state?.room as Record<string, unknown> | undefined;
    expect(room).toBeDefined();
    expect(room?.name).toBe("集市");
  });

  it("should send llmReachable in status", async () => {
    server.broadcastStatus(true);
    const msgs = await connectAndCollect(port, 3);
    const status = msgs.find((m) => m.type === "status");
    expect(status).toBeDefined();
    expect(status?.llmReachable).toBe(true);
  });

  it("should handle execute look command", async () => {
    const msgs = await connectAndSend(port, {
      type: "execute",
      action: "look",
      params: { target: "房间" },
    });
    const result = msgs.find((m) => m.type === "command_result");
    expect(result).toBeDefined();
    const events = result?.events as Record<string, unknown>[] | undefined;
    expect(events).toBeDefined();
    expect(events?.[0].type).toBe("look");
    expect(events?.[0].description).toContain("集市");
  });

  it("should handle execute end_day command", async () => {
    const msgs = await connectAndSend(port, { type: "execute", action: "end_day", params: {} });
    const result = msgs.find((m) => m.type === "command_result");
    expect(result).toBeDefined();
    expect(result?.ended).toBe(true);
  });

  it("should handle execute status command", async () => {
    const msgs = await connectAndSend(port, { type: "execute", action: "status", params: {} });
    const result = msgs.find((m) => m.type === "command_result");
    expect(result).toBeDefined();
    const events = result?.events as Record<string, unknown>[] | undefined;
    expect(events?.[0].type).toBe("status");
    expect(events?.[0].description).toContain("状态");
  });

  it("should return error for unknown message type", async () => {
    const msgs = await connectAndSend(port, { type: "nonexistent" });
    const err = msgs.find((m) => m.type === "error");
    expect(err).toBeDefined();
    expect(err?.code).toBe("invalid_message");
  });

  it("should return error for invalid JSON", async () => {
    const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error("timeout"));
      }, 3000);
      let statusReceived = false;
      ws.on("message", (data) => {
        const msg = JSON.parse(String(data));
        if (msg.type === "status") {
          statusReceived = true;
          ws.send("not json{{{");
        } else if (statusReceived && msg.type === "error") {
          clearTimeout(timer);
          ws.close();
          resolve(msg);
        }
      });
    });
    expect(result.code).toBe("invalid_json");
  });

  it("should return error for move with invalid direction", async () => {
    const msgs = await connectAndSend(port, {
      type: "execute",
      action: "move",
      params: { direction: "east" },
    });
    const result = msgs.find((m) => m.type === "command_result");
    expect(result).toBeDefined();
    const events = result?.events as Record<string, unknown>[] | undefined;
    expect(events?.[0].type).toBe("error");
  });

  it("should reveal destination names only after visiting rooms", async () => {
    const world = buildWorld({
      name: "map-test",
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
        { id: "market" as const, name: "集市", regionId: "test" as const, description: "" },
        { id: "workshop" as const, name: "工坊", regionId: "test" as const, description: "" },
      ],
      graph: {
        layout: {
          test: {
            rows: 1,
            cols: 2,
            rooms: ["market", "workshop"],
            defaultDistance: 1,
          },
        },
      },
      players: [{ id: "p1", name: "赵行舟", roomId: "market" as const }],
    });
    const mapPort = port + 2000;
    const mapServer = new GameServer(mapPort, world, new EventBus());
    mapServer.setCommandHandler(async (playerId, action, params) => {
      return executeCommand(world, playerId, action, params);
    });

    const msgs = await connectMoveOutAndBack(mapPort);
    const stateUpdates = msgs.filter((m) => m.type === "state_update");
    const initialState = stateUpdates.find((m) => {
      const room = m.room as Record<string, unknown> | null;
      return room?.id === "market";
    });
    expect(initialState).toBeDefined();
    const initialRoom = initialState?.room as Record<string, unknown>;
    const initialExits = initialRoom.exits as Record<string, Record<string, unknown>>;
    expect(initialExits.东?.destinationName).toBeUndefined();
    expect(initialRoom.minimap).toBeDefined();

    // 验证新 minimap 结构
    const minimap = initialRoom.minimap as Record<string, unknown>;
    expect(minimap.minX).toBeDefined();
    expect(minimap.minY).toBeDefined();
    expect(minimap.playerRegionId).toBeDefined();
    expect(minimap.regionNodes).toBeDefined();
    expect(Array.isArray(minimap.regionNodes)).toBe(true);
    expect(minimap.regionLinks).toBeDefined();
    expect(Array.isArray(minimap.regionLinks)).toBe(true);
    // 当前区域应被标记为 isCurrent
    const currentNode = (minimap.regionNodes as Record<string, unknown>[]).find((n) => n.isCurrent);
    expect(currentNode).toBeDefined();

    // 验证 tile 有 regionId 和新字段
    const tiles = minimap.tiles as Record<string, unknown>[];
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles[0].regionId).toBeDefined();

    // 已知房间 tile 应有 description、terrain、entityBriefs
    const knownTile = tiles.find((t) => t.known === true);
    expect(knownTile).toBeDefined();
    expect(knownTile?.description).toBeDefined();
    expect(typeof knownTile?.description).toBe("string");
    expect(knownTile?.terrain).toBeDefined();
    expect(typeof knownTile?.terrain).toBe("string");
    expect(knownTile?.entityBriefs).toBeDefined();
    expect(Array.isArray(knownTile?.entityBriefs)).toBe(true);

    // 未知房间 tile 不应有 description
    const unknownTile = tiles.find((t) => t.known === false && t.char !== " ");
    if (unknownTile) {
      expect(unknownTile.description).toBeUndefined();
    }

    const finalState = stateUpdates[stateUpdates.length - 1];
    const finalRoom = finalState.room as Record<string, unknown>;
    const finalExits = finalRoom.exits as Record<string, Record<string, unknown>>;
    expect(finalRoom.id).toBe("market");
    expect(finalExits.东?.destinationName).toBe("工坊");
  });

  it("should include relations in state_update when player has relations", async () => {
    const world = buildWorld({
      name: "rel-test",
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
        {
          id: "market" as const,
          name: "集市",
          regionId: "test" as const,
          description: "热闹的市场",
        },
      ],
      graph: {
        layout: {
          test: {
            rows: 1,
            cols: 1,
            rooms: ["market"],
            defaultDistance: 1,
          },
        },
      },
      npcs: [
        {
          id: "npc_friend",
          name: "老张",
          roomId: "market" as const,
          personality: "友善",
          npcTier: "regional",
        },
      ],
      players: [{ id: "p1", name: "赵行舟", roomId: "market" as const }],
    });
    // Add a relation from player to NPC
    const player = world.entities.get("p1") as any;
    player.relations.push({
      targetId: "npc_friend",
      level: 55,
      label: "友好",
      lastInteractionTick: 0,
    });

    const relPort = port + 4000;
    const relServer = new GameServer(relPort, world, new EventBus());
    relServer.setCommandHandler(async (playerId, action, params) => {
      return executeCommand(world, playerId, action, params);
    });

    const msgs = await connectAndCollect(relPort, 3);
    const state = msgs.find((m) => m.type === "state_update");
    expect(state).toBeDefined();
    const entity = state?.entity as Record<string, unknown>;
    expect(entity.relations).toBeDefined();
    const relations = entity.relations as Array<Record<string, unknown>>;
    expect(relations).toHaveLength(1);
    expect(relations[0].targetId).toBe("npc_friend");
    expect(relations[0].targetName).toBe("老张");
    expect(relations[0].level).toBe(55);
    expect(relations[0].label).toBe("友好");
  });

  it("should exclude player from entityBriefs and include NPCs", async () => {
    const world = buildWorld({
      name: "npc-test",
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
        {
          id: "market" as const,
          name: "集市",
          regionId: "test" as const,
          description: "热闹的市场",
        },
      ],
      graph: {
        layout: {
          test: {
            rows: 1,
            cols: 1,
            rooms: ["market"],
            defaultDistance: 1,
          },
        },
      },
      npcs: [
        {
          id: "npc_01",
          name: "铁匠老张",
          roomId: "market" as const,
          personality: "沉默寡言",
          npcTier: "regional",
        },
      ],
      players: [{ id: "p1", name: "赵行舟", roomId: "market" as const }],
    });

    const npcPort = port + 3000;
    const npcServer = new GameServer(npcPort, world, new EventBus());
    npcServer.setCommandHandler(async (playerId, action, params) => {
      return executeCommand(world, playerId, action, params);
    });

    const msgs = await connectAndCollect(npcPort, 3);
    const state = msgs.find((m) => m.type === "state_update");
    expect(state).toBeDefined();
    const roomInfo = state?.room as Record<string, unknown>;
    const minimap = roomInfo.minimap as Record<string, unknown>;
    expect(minimap).toBeDefined();
    const tiles = minimap.tiles as Record<string, unknown>[];
    const knownTile = tiles.find((t) => t.known === true);
    expect(knownTile).toBeDefined();

    const briefs = knownTile?.entityBriefs as { name: string; type: string }[];
    expect(Array.isArray(briefs)).toBe(true);
    expect(briefs.some((b) => b.name === "铁匠老张")).toBe(true);
    expect(briefs.some((b) => b.name === "赵行舟")).toBe(false);
  });

  it("should populate crossRegionExits for rooms with exits to other regions", async () => {
    const world = buildWorld({
      name: "cross-region-test",
      seed: "seed",
      era: "stone",
      regions: [
        {
          id: "a" as const,
          name: "区域A",
          dominantCulture: "test",
          prosperity: 50,
          threatLevel: 10,
        },
        {
          id: "b" as const,
          name: "区域B",
          dominantCulture: "test",
          prosperity: 50,
          threatLevel: 10,
        },
      ],
      rooms: [
        {
          id: "r1" as const,
          name: "区域A房间",
          regionId: "a" as const,
          description: "区域A的房间",
        },
        {
          id: "r2" as const,
          name: "区域B房间",
          regionId: "b" as const,
          description: "区域B的房间",
        },
      ],
      graph: {
        layout: {
          a: { rows: 1, cols: 1, rooms: ["r1"], defaultDistance: 1 },
          b: { rows: 1, cols: 1, rooms: ["r2"], defaultDistance: 1 },
        },
        edges: [{ from: "r1" as const, to: "r2" as const, direction: "南" }],
      },
      players: [{ id: "p1", name: "测试", roomId: "r1" as const }],
    });

    const crossPort = port + 5000;
    const server = new GameServer(crossPort, world, new EventBus());
    server.setCommandHandler(async (playerId, action, params) => {
      return executeCommand(world, playerId, action, params);
    });
    const msgs = await connectAndCollect(crossPort, 3);
    const state = msgs.find((m) => m.type === "state_update");
    expect(state).toBeDefined();
    const roomInfo = state?.room as Record<string, unknown>;
    const minimap = roomInfo?.minimap as Record<string, unknown>;
    expect(minimap).toBeDefined();
    const tiles = minimap?.tiles as Record<string, unknown>[];
    const tileA = tiles?.find((t: Record<string, unknown>) => t.roomName === "区域A房间") as
      | Record<string, unknown>
      | undefined;
    expect(tileA).toBeDefined();
    const crossExits = tileA?.crossRegionExits as
      | { direction: string; targetRegionName: string }[]
      | undefined;
    expect(crossExits).toHaveLength(1);
    expect(crossExits?.[0].direction).toBe("南");
    expect(crossExits?.[0].targetRegionName).toBe("区域B");
  });

  it("should list, save, and create save slots over websocket", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "world-save-ws-"));
    const savePort = port + 6000;
    const world = setupWorld();
    const saveServer = new GameServer(savePort, world, new EventBus());
    const manager = SaveManager.load({
      rootDir,
      slotId: "slot_001",
      worldId: "ws-test",
      currentTick: world.tick,
      currentRound: world.round,
    });
    manager.save();
    saveServer.setSaveHandlers({
      listSlots: () => manager.listSlots(),
      manualSave: (slotId) => {
        if (slotId) return manager.saveAs(slotId, world);
        manager.capture(world);
        manager.save();
        return manager.toSlotInfo();
      },
      createSlot: (slotId) => manager.saveAs(slotId, world),
    });

    try {
      const listMessages = await connectAndSendUntil(
        savePort,
        { type: "request_save_slots" },
        (messages) => messages.some((m) => m.type === "save_slots"),
      );
      const list = listMessages.find((m) => m.type === "save_slots");
      expect(list).toBeDefined();
      expect((list?.slots as Record<string, unknown>[])[0].slotId).toBe("slot_001");

      const saveMessages = await connectAndSendUntil(
        savePort,
        { type: "manual_save", slotId: "slot_001" },
        (messages) =>
          messages.some((m) => m.type === "save_result") &&
          messages.some((m) => m.type === "save_slots"),
      );
      const saveResult = saveMessages.find((m) => m.type === "save_result");
      expect(saveResult).toMatchObject({ ok: true });

      const createMessages = await connectAndSendUntil(
        savePort,
        { type: "create_save_slot", slotId: "slot_002" },
        (messages) =>
          messages.some((m) => m.type === "save_result") &&
          messages.some((m) => m.type === "save_slots"),
      );
      const createResult = createMessages.find((m) => m.type === "save_result");
      expect(createResult).toMatchObject({ ok: true });
      const createList = createMessages.find((m) => m.type === "save_slots");
      const slotIds = (createList?.slots as Record<string, unknown>[]).map((slot) => slot.slotId);
      expect(slotIds).toContain("slot_001");
      expect(slotIds).toContain("slot_002");
    } finally {
      saveServer.close();
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});
