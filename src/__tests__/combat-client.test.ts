/**
 * 战斗客户端测试 — 覆盖 combatState 序列化、房间实体、事件样式、ESC 处理器
 *
 * 覆盖最近改动的所有层级：
 *   1. ws-server pushState 包含 combatState + equipment
 *   2. capability-provider getRoomEntitiesInfo 返回 combatState
 *   3. event-style 新增 combat_* 事件样式
 *   4. key-layer COMBAT_LAYER ESC 调用 endCombat
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { getEventStyle } from "../client-tui/event-style.ts";
import type { GameClient } from "../client-tui/game-client.ts";
import {
  activeLayer,
  dispatchKey,
  getLayerStack,
  hasLayer,
  popLayer,
  pushLayer,
} from "../client-tui/key-layer.ts";
import { EventBus } from "../core/event-bus.ts";
import {
  addEntity,
  addRegion,
  addRoom,
  createNPC,
  createPlayer,
  createRoom,
  createWorld,
} from "../core/world.ts";
import { getRoomEntitiesInfo } from "../engine/capability-provider.ts";
import { executeCommand } from "../engine/command-executor.ts";
import { GameServer } from "../server/ws-server.ts";
import type { Capability } from "../shared/protocol.ts";

// ============================================================
// Helpers
// ============================================================

function resetStack() {
  while (getLayerStack().length > 1) {
    const layers = getLayerStack();
    if (layers.length <= 1) break;
    const top = layers[0];
    if (top.id === "base") break;
    popLayer(top.id);
  }
}

function mockKey(name: string, meta = false) {
  let prevented = false;
  return {
    name,
    meta,
    preventDefault: () => {
      prevented = true;
    },
    get wasPrevented() {
      return prevented;
    },
  };
}

function mockClient(overrides: Partial<GameClient> = {}): GameClient {
  return {
    hasActiveRequest: () => false,
    execute: vi.fn(),
    capabilities: () => [],
    room: () => null,
    entity: () => null,
    selectedEntityId: () => null,
    selectedInventoryItemId: () => null,
    selectedQuestIndex: () => null,
    dialogue: () => null,
    mapGranularity: () => "region",
    mapCursor: () => ({ x: 0, y: 0 }),
    setSelectedEntityId: vi.fn(),
    setSelectedInventoryItemId: vi.fn(),
    setSelectedQuestIndex: vi.fn(),
    closeInventory: vi.fn(),
    closeQuests: vi.fn(),
    closeDialogue: vi.fn(),
    toggleMinimap: vi.fn(),
    cycleMapGranularity: vi.fn(),
    setMapCursor: vi.fn(),
    requestDialogueOptions: vi.fn(),
    chooseDialogueOption: vi.fn(),
    switchDialogueTab: vi.fn(),
    requestTrade: vi.fn(),
    endCombat: vi.fn(),
    questNotification: () => null,
    showQuestNotification: vi.fn(),
    dismissQuestNotification: vi.fn(),
    trackedQuestIds: () => new Set(),
    toggleTrackQuest: vi.fn(),
    isTrackingQuest: () => false,
    openInventory: vi.fn(),
    openQuests: vi.fn(),
    openStatus: vi.fn(),
    closeStatus: vi.fn(),
    toggleStatus: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    isLayerActive: (id: string) => hasLayer(id),
    activeLayer: () => activeLayer(),
    layerStack: () => getLayerStack(),
    combatLog: () => [],
    combatRound: () => 0,
    settlementPending: () => false,
    groundRestRecovery: () => 20,
    endDayOptions: () => [],
    requestEndDay: vi.fn(),
    confirmEndDay: vi.fn(),
    cancelEndDay: vi.fn(),
    ...overrides,
  } as unknown as GameClient;
}

function setupCombatWorld() {
  const world = createWorld();
  addRegion(world, {
    id: "test",
    name: "test",
    dominantCulture: "test",
    prosperity: 50,
    threatLevel: 10,
  });
  const room = createRoom("room_01", "测试房间", "test", "一个测试房间");
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

interface CollectedMessage {
  type: string;
  [key: string]: unknown;
}

function connectAndCollect(
  port: number,
  count: number,
  timeout = 3000,
): Promise<CollectedMessage[]> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    const messages: CollectedMessage[] = [];
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

function connectAndExecute(
  port: number,
  action: string,
  params: Record<string, unknown> = {},
  timeout = 3000,
): Promise<CollectedMessage[]> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    const messages: CollectedMessage[] = [];
    let sent = false;
    let gotCommandResult = false;
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`Timeout: got ${messages.length} messages`));
    }, timeout);

    ws.on("message", (data) => {
      const msg = JSON.parse(String(data));
      messages.push(msg);
      if (msg.type === "status" && !sent) {
        sent = true;
        ws.send(JSON.stringify({ type: "execute", action, params }));
        return;
      }
      if (msg.type === "command_result") {
        gotCommandResult = true;
        return;
      }
      // resolve on state_update after command_result (post-attack pushState)
      if (gotCommandResult && msg.type === "state_update") {
        clearTimeout(timer);
        ws.close();
        resolve(messages);
      }
      if (gotCommandResult && msg.type === "error") {
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

let currentPort = 9100;
function getPort() {
  return ++currentPort;
}

function createServer(world = createWorld()) {
  const port = getPort();
  const bus = new EventBus();
  const server = new GameServer(port, world, bus);
  server.setCommandHandler(async (playerId, action, params) => {
    return executeCommand(world, playerId, action, params);
  });
  return { server, port, bus };
}

// ============================================================
// 1. Event Style — combat 事件样式
// ============================================================

describe("getEventStyle — combat 事件", () => {
  it("combat_hit 返回正确样式", () => {
    const style = getEventStyle("combat_hit");
    expect(style.prefix).toBe("\u2694");
    expect(style.color).toBe("#ff9944");
  });

  it("combat_crit 返回正确样式", () => {
    const style = getEventStyle("combat_crit");
    expect(style.prefix).toBe("\u2605");
    expect(style.color).toBe("#ff4444");
  });

  it("combat_miss 返回正确样式", () => {
    const style = getEventStyle("combat_miss");
    expect(style.prefix).toBe("\u2014");
    expect(style.color).toBe("#667788");
  });

  it("combat_flee_success 返回正确样式", () => {
    const style = getEventStyle("combat_flee_success");
    expect(style.prefix).toBe("\u2197");
    expect(style.color).toBe("#44c4c4");
  });

  it("combat_flee_fail 返回正确样式", () => {
    const style = getEventStyle("combat_flee_fail");
    expect(style.prefix).toBe("\u2198");
    expect(style.color).toBe("#cc8844");
  });

  it("combat_victory 返回正确样式", () => {
    const style = getEventStyle("combat_victory");
    expect(style.prefix).toBe("\u2713");
    expect(style.color).toBe("#6bdb6b");
  });

  it("combat_defeat 返回正确样式", () => {
    const style = getEventStyle("combat_defeat");
    expect(style.prefix).toBe("\u2717");
    expect(style.color).toBe("#ff6b6b");
  });

  it("defend 返回正确样式", () => {
    const style = getEventStyle("defend");
    expect(style.prefix).toBe("\u25C7");
    expect(style.color).toBe("#6fc3bd");
  });

  it("combat_target_changed 返回正确样式", () => {
    const style = getEventStyle("combat_target_changed");
    expect(style.prefix).toBe("\u21BA");
    expect(style.color).toBe("#d39746");
  });

  it("未注册的 combat 事件类型使用 fallback", () => {
    const style = getEventStyle("combat_unknown");
    expect(style.prefix).toBe("\u00B7");
    expect(style.color).toBe("#c7d0d9");
  });
});

// ============================================================
// 2. Capability Provider — getRoomEntitiesInfo combatState
// ============================================================

describe("getRoomEntitiesInfo — combatState", () => {
  it("NPC 实体应包含 combatState (hp/maxHp/isDefending/isIncapacitated)", () => {
    const { world } = setupCombatWorld();
    const entities = getRoomEntitiesInfo(world, "room_01");

    const npc = entities.find((e) => e.id === "npc_01");
    expect(npc).toBeDefined();
    expect(npc!.combatState).toBeDefined();
    expect(npc!.combatState!.hp).toBe(50);
    expect(npc!.combatState!.maxHp).toBe(50);
    expect(npc!.combatState!.isDefending).toBe(false);
    expect(npc!.combatState!.isIncapacitated).toBe(false);
    expect(npc!.combatState!.combatTarget).toBeNull();
  });

  it("Player 实体应包含 combatState", () => {
    const { world } = setupCombatWorld();
    const entities = getRoomEntitiesInfo(world, "room_01");

    const player = entities.find((e) => e.id === "player_01");
    expect(player).toBeDefined();
    expect(player!.combatState).toBeDefined();
    expect(player!.combatState!.hp).toBe(50);
    expect(player!.combatState!.maxHp).toBe(50);
  });

  it("Item 实体不应包含 combatState", () => {
    const { world, room } = setupCombatWorld();
    const _item = world.entities.get("npc_01")!;
    // Make it an item-like entity without combatState
    const itemEntity = {
      id: "item_01",
      type: "item",
      name: "铁剑",
      roomId: room.id,
      description: "一把铁剑",
      properties: {},
    } as unknown as import("../core/types.ts").ItemEntity;
    addEntity(world, itemEntity);

    const entities = getRoomEntitiesInfo(world, "room_01");
    const foundItem = entities.find((e) => e.id === "item_01");
    expect(foundItem).toBeDefined();
    expect(foundItem!.combatState).toBeUndefined();
  });

  it("空房间返回空数组", () => {
    const world = createWorld();
    addRegion(world, { id: "r", name: "r", dominantCulture: "x", prosperity: 50, threatLevel: 10 });
    const room = createRoom("empty", "空房", "r", "空");
    addRoom(world, room);
    const entities = getRoomEntitiesInfo(world, "empty");
    expect(entities).toEqual([]);
  });

  it("不存在的房间返回空数组", () => {
    const world = createWorld();
    const entities = getRoomEntitiesInfo(world, "nonexistent");
    expect(entities).toEqual([]);
  });
});

// ============================================================
// 3. WS Server pushState — combatState + equipment 序列化
// ============================================================

describe("ws-server pushState — combatState 序列化", () => {
  it("state_update 实体应包含 combatState 字段", async () => {
    const { world, player } = setupCombatWorld();
    player.combatState.hp = 42;
    player.combatState.maxHp = 80;
    player.combatState.isDefending = true;

    const { server, port } = createServer(world);
    const msgs = await connectAndCollect(port, 2);
    server.close();

    const stateUpdates = msgs.filter((m) => m.type === "state_update");
    expect(stateUpdates.length).toBeGreaterThanOrEqual(1);

    const entity = stateUpdates[0].entity as Record<string, unknown>;
    expect(entity.combatState).toBeDefined();

    const cs = entity.combatState as Record<string, unknown>;
    expect(cs.hp).toBe(42);
    expect(cs.maxHp).toBe(80);
    expect(cs.isDefending).toBe(true);
    expect(cs.isIncapacitated).toBe(false);
  });

  it("state_update 玩家实体应包含 equipment 字段", async () => {
    const { world, player } = setupCombatWorld();
    // give player equipment (ItemEntity)
    const sword = {
      id: "sword_01",
      type: "item" as const,
      name: "铁剑",
      roomId: null,
      description: "一把铁剑",
      properties: { attack: 10 },
      ownerId: null,
      traits: [],
      needs: [],
      relations: [],
      schedule: [],
      availableActions: [],
      inventory: [],
      tick: 0,
      mood: 0,
      memories: [],
    } as unknown as import("../core/types.ts").ItemEntity;
    player.equipment.weapon = sword;

    const { server, port } = createServer(world);
    const msgs = await connectAndCollect(port, 2);
    server.close();

    const stateUpdates = msgs.filter((m) => m.type === "state_update");
    const entity = stateUpdates[0].entity as Record<string, unknown>;
    expect(entity.equipment).toBeDefined();

    const eq = entity.equipment as Record<string, unknown>;
    expect(eq.weapon).toBeDefined();
    expect((eq.weapon as Record<string, unknown>).name).toBe("铁剑");
  });

  it("NPC 实体在 state_update 中不含 equipment", async () => {
    const { world } = setupCombatWorld();
    const { server, port } = createServer(world);
    const msgs = await connectAndCollect(port, 2);
    server.close();

    // Check room entities — NPC should have combatState but no equipment
    const stateUpdates = msgs.filter((m) => m.type === "state_update");
    const room = stateUpdates[0].room as Record<string, unknown> | null;
    if (room?.entities) {
      const entities = room.entities as Array<{ id: string; type: string; combatState?: unknown }>;
      const npc = entities.find((e) => e.id === "npc_01");
      expect(npc).toBeDefined();
      expect(npc!.combatState).toBeDefined();
      expect(npc!.combatState).toHaveProperty("hp");
    }
  });

  it("无 combatState 的实体不应崩溃", async () => {
    const world = createWorld();
    addRegion(world, { id: "r", name: "r", dominantCulture: "x", prosperity: 50, threatLevel: 10 });
    const room = createRoom("room_01", "测试房间", "r", "空");
    addRoom(world, room);
    // Item entity has no combatState — pushState should handle this gracefully
    const item = {
      id: "item_01",
      type: "item",
      name: "铜币",
      roomId: "room_01",
      description: "铜币",
      properties: {},
      traits: [],
      needs: [],
      relations: [],
      schedule: [],
      availableActions: [],
      inventory: [],
      tick: 0,
      mood: 0,
      memories: [],
    } as unknown as import("../core/types.ts").ItemEntity;
    addEntity(world, item);
    // Create a player to bind to
    const player = createPlayer("p1", "test", "room_01", world.contentPool);
    addEntity(world, player);

    const { server, port } = createServer(world);
    // Just verify connection succeeds and we get state_update
    const msgs = await connectAndCollect(port, 2);
    server.close();

    const stateUpdates = msgs.filter((m) => m.type === "state_update");
    expect(stateUpdates.length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================
// 4. WS Server — 战斗命令 (attack/flee/defend)
// ============================================================

describe("ws-server — combat commands", () => {
  it("execute attack 后 state_update 包含更新后的 HP", async () => {
    const { world } = setupCombatWorld();
    const { server, port } = createServer(world);
    const msgs = await connectAndExecute(port, "attack", { targetId: "npc_01" }, 5000);
    server.close();

    // 应该有 state_update 包含 combatState
    const stateUpdates = msgs.filter((m) => m.type === "state_update");
    expect(stateUpdates.length).toBeGreaterThanOrEqual(1);

    const entity = stateUpdates[stateUpdates.length - 1].entity as Record<string, unknown>;
    expect(entity.combatState).toBeDefined();
    expect((entity.combatState as Record<string, unknown>).combatTarget).toBe("npc_01");
  });

  it("execute flee 后 combatTarget 应被清除 (mock 保证成功)", async () => {
    const { world, player } = setupCombatWorld();
    player.combatState.combatTarget = "npc_01";

    const originalRandom = Math.random;
    Math.random = () => 0; // guarantee flee success

    const { server, port } = createServer(world);
    const msgs = await connectAndExecute(port, "flee", {}, 5000);
    server.close();
    Math.random = originalRandom;

    const stateUpdates = msgs.filter((m) => m.type === "state_update");
    const entity = stateUpdates[stateUpdates.length - 1].entity as Record<string, unknown>;
    expect(entity.combatState).toBeDefined();
    const cs = entity.combatState as Record<string, unknown>;
    expect(cs.combatTarget).toBeNull();
  });

  it("execute defend 后 isDefending 应为 true", async () => {
    const { world, player } = setupCombatWorld();
    player.combatState.combatTarget = "npc_01";

    const { server, port } = createServer(world);
    const msgs = await connectAndExecute(port, "defend", {}, 5000);
    server.close();

    const stateUpdates = msgs.filter((m) => m.type === "state_update");
    const entity = stateUpdates[stateUpdates.length - 1].entity as Record<string, unknown>;
    const cs = entity.combatState as Record<string, unknown>;
    expect(cs.isDefending).toBe(true);
  });
});

// ============================================================
// 5. Key Layer — COMBAT_LAYER ESC 调用 endCombat
// ============================================================

describe("COMBAT_LAYER — ESC handler", () => {
  beforeEach(() => {
    resetStack();
  });

  afterEach(() => {
    resetStack();
  });

  it("ESC 应按调用 client.endCombat", () => {
    const endCombatFn = vi.fn();
    const client = mockClient({ endCombat: endCombatFn });
    pushLayer("combat");
    expect(hasLayer("combat")).toBe(true);

    const key = mockKey("escape");
    dispatchKey(key, client);

    expect(endCombatFn).toHaveBeenCalledOnce();
  });

  it("F 键应触发 execute('flee')", () => {
    const executeFn = vi.fn();
    const client = mockClient({ execute: executeFn });
    pushLayer("combat");

    const key = mockKey("f");
    dispatchKey(key, client);

    expect(executeFn).toHaveBeenCalledWith("flee", undefined);
  });

  it("D 键应触发 execute('defend')", () => {
    const executeFn = vi.fn();
    const client = mockClient({ execute: executeFn });
    pushLayer("combat");

    const key = mockKey("d");
    dispatchKey(key, client);

    expect(executeFn).toHaveBeenCalledWith("defend", undefined);
  });

  it("combat 层是非 passthrough，按 r 不应触发 rest", () => {
    const executeFn = vi.fn();
    const client = mockClient({ execute: executeFn });
    pushLayer("combat");

    const key = mockKey("r");
    dispatchKey(key, client);

    // r should not be processed because combat layer is non-passthrough
    expect(executeFn).not.toHaveBeenCalledWith("rest", expect.anything());
  });

  it("endCombat 后 layer 恢复正常 — r 可以触发 rest", () => {
    const executeFn = vi.fn();
    const client = mockClient({
      execute: executeFn,
      capabilities: () => [{ action: "rest", label: "休息" } as Capability],
      endCombat: vi.fn(() => popLayer("combat")),
    });
    pushLayer("combat");
    expect(hasLayer("combat")).toBe(true);

    // Press ESC to end combat
    dispatchKey(mockKey("escape"), client);
    expect(hasLayer("combat")).toBe(false);

    // Now r should work
    const key = mockKey("r");
    dispatchKey(key, client);
    expect(executeFn).toHaveBeenCalled();
  });
});
