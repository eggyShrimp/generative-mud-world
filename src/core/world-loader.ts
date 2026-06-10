import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse as parseYaml } from "yaml";
import { getReverseDirection } from "../shared/directions.ts";
import { logWrite } from "../shared/log.ts";
import { getScheduleForRole } from "../simulation/index";
import { loadContentPoolFromDir } from "./content-pool-loader";
import { WorldConfigSchema } from "./schemas/index.ts";
import type {
  ContentPool,
  Exit,
  GraphConfig,
  ItemEntity,
  Need,
  NeedType,
  RegionId,
  RoomGraph,
  RoomId,
  TerrainType,
  WorldState,
} from "./types";
import { validateWithSchema } from "./validate.ts";
import {
  addEntity,
  addRegion,
  addRoom,
  createDefaultContentPool,
  createItem,
  createNPC,
  createPlayer,
  createRoom,
  createWorld,
} from "./world";

interface WorldConfig {
  name: string;
  seed: string;
  era: string;
  regions: Array<{
    id: RegionId;
    name: string;
    dominantCulture: string;
    prosperity: number;
    threatLevel: number;
  }>;
  rooms: Array<{
    id: RoomId;
    name: string;
    regionId: RegionId;
    description: string;
    terrain?: TerrainType;
    tags?: string[];
  }>;
  exits?: Record<RoomId, Record<string, RoomId>>;
  graph?: GraphConfig;
  npcs?: NPCConfig[];
  players?: PlayerConfig[];
}

interface NPCConfig {
  id: string;
  name: string;
  roomId: RoomId;
  personality: string;
  npcTier: "core" | "regional" | "background";
  role?: string;
  tags?: string[];
  traits?: Array<{ name: string; value: number }>;
  needs?: Record<string, number>;
  memories?: Array<{
    content: string;
    importance: number;
    type?: "observation" | "conversation" | "reflection" | "event";
  }>;
  items?: Array<{
    name: string;
    properties?: Record<string, unknown>;
  }>;
}

interface PlayerConfig {
  id: string;
  name: string;
  roomId: RoomId;
  description?: string;
  traits?: Array<{ name: string; value: number }>;
  needs?: Record<string, number>;
}

export function loadWorldFromYaml(yamlPath: string): WorldState {
  const raw = readFileSync(yamlPath, "utf-8");
  const parsed = parseYaml(raw);

  // Schema 校验
  const validation = validateWithSchema(WorldConfigSchema, parsed, "WorldConfig");
  if (!validation.ok) {
    logWrite("srv", "warn", "[WorldLoader] YAML 校验失败，尝试使用原始数据继续加载");
  }
  const config = (validation.ok ? validation.data : parsed) as WorldConfig;

  // ContentPool 从 YAML 目录加载 (3 层合并: defaults → base YAML → evolve YAML)
  const worldDir = dirname(yamlPath);
  const poolDir = join(worldDir, "content-pool");
  logWrite("srv", "info", `[WorldLoader] ContentPool dir: ${poolDir}`);
  const pool = loadContentPoolFromDir(poolDir);

  const world = buildWorld(config, pool);
  world.poolDir = poolDir;
  return world;
}

export function buildWorld(config: WorldConfig, pool?: ContentPool): WorldState {
  const world = createWorld();
  const contentPool = pool ?? createDefaultContentPool();
  world.contentPool = contentPool;

  for (const region of config.regions) {
    addRegion(world, {
      id: region.id,
      name: region.name,
      dominantCulture: region.dominantCulture,
      prosperity: region.prosperity,
      threatLevel: region.threatLevel,
    });
  }

  for (const room of config.rooms) {
    const r = createRoom(
      room.id,
      room.name,
      room.regionId,
      room.description,
      room.terrain,
      room.tags,
    );
    addRoom(world, r);
  }

  // 构建 exits: 三层合并 (layout → regionLinks → edges) + 旧格式兼容
  buildExits(world, config);

  // Load NPCs from config, or auto-populate
  if (config.npcs && config.npcs.length > 0) {
    for (const npc of config.npcs) {
      const schedule = npc.role ? getScheduleForRole(contentPool, npc.role) : [];
      const needs: Need[] = npc.needs
        ? Object.entries(npc.needs).map(([type, value]) => {
            const def = contentPool.needDefinitions.find((n) => n.type === type);
            return {
              type: type as unknown as NeedType,
              value,
              baseUrgency: def?.baseUrgency ?? 0.3,
              decayRate: def?.decayRate ?? 3,
            };
          })
        : [];
      const inventory = (npc.items ?? []).flatMap((item) => {
        // New schema: { templateId, quantity? }
        const raw = item as Record<string, unknown>;
        const templateId = raw.templateId as string | undefined;
        if (templateId) {
          const template = contentPool.itemTemplates.find((t) => t.id === templateId);
          if (!template) {
            logWrite(
              "srv",
              "warn",
              `[world-loader] NPC ${npc.name}: unknown templateId "${templateId}"`,
            );
            return [];
          }
          const quantity = (raw.quantity as number) ?? 1;
          const entities: ItemEntity[] = [];
          for (let i = 0; i < quantity; i++) {
            const itemEntity = createItem(
              `${npc.id}_item_${templateId}_${i}`,
              template.name,
              templateId,
              template.properties ?? {},
              npc.id,
            );
            itemEntity.ownerId = npc.id;
            addEntity(world, itemEntity);
            entities.push(itemEntity);
          }
          return entities;
        }
        // Old schema fallback: { name, properties? }
        const name = (item as { name?: string }).name ?? "";
        const props = (item as { properties?: Record<string, unknown> }).properties ?? {};
        const oldTemplateId = (props.templateId as string) || name;
        const itemEntity = createItem(
          `${npc.id}_item_${Date.now()}`,
          name,
          oldTemplateId,
          props,
          npc.id,
        );
        itemEntity.ownerId = npc.id;
        addEntity(world, itemEntity);
        return [itemEntity];
      });
      const entity = createNPC(
        npc.id,
        {
          name: npc.name,
          roomId: npc.roomId,
          personality: npc.personality,
          npcTier: npc.npcTier,
          tags: npc.tags ?? (npc.role ? [npc.role] : undefined),
          schedule,
          needs,
          traits: npc.traits ?? [],
          memories:
            npc.memories?.map((m) => ({
              tick: 0,
              content: m.content,
              importance: m.importance,
              type: m.type ?? ("observation" as const),
            })) ?? [],
          inventory,
        },
        contentPool,
      );
      addEntity(world, entity);
    }
  } else {
    const names = contentPool.namePools[0];
    const npcItemTemplates = [
      { templateId: "herb", name: "草药", props: { usable: true } },
      { templateId: "copper_coin", name: "铜币", props: { currency: true } },
      { templateId: "dried_meat", name: "干肉", props: { edible: true, hungerRestore: 10 } },
      { templateId: "waterskin", name: "水袋", props: { drinkable: true } },
    ];
    for (const room of config.rooms.slice(0, Math.min(15, config.rooms.length))) {
      const itemTemplate = pick(npcItemTemplates);
      const npcId = `npc_${room.id}`;
      const itemEntity = createItem(
        `${npcId}_item_0`,
        itemTemplate.name,
        itemTemplate.templateId,
        itemTemplate.props,
        npcId,
      );
      itemEntity.ownerId = npcId;
      addEntity(world, itemEntity);
      const npcRole = pick(["farmer", "hunter", "merchant"]);
      const npc = createNPC(npcId, {
        name: `${pick(names.surnames)}${pick(names.maleGiven)}`,
        roomId: room.id,
        personality: pick(["勤劳朴实", "沉默寡言", "热情好客", "警惕陌生人"]),
        npcTier: "regional" as const,
        tags: [npcRole],
        schedule: getScheduleForRole(contentPool, npcRole),
        needs: contentPool.needDefinitions
          .filter((n) => n.type !== "wealth")
          .map((n) => ({
            type: n.type as unknown as NeedType,
            value: 60 + Math.floor(Math.random() * 20),
            baseUrgency: n.baseUrgency,
            decayRate: n.decayRate,
          })),
        inventory: [itemEntity],
      });
      addEntity(world, npc);
    }
  }

  // Load players from config, or auto-create
  if (config.players && config.players.length > 0) {
    for (const player of config.players) {
      const entity = createPlayer(
        player.id,
        player.name,
        player.roomId,
        contentPool,
        player.description,
        player.traits,
      );
      addEntity(world, entity);
    }
  } else {
    const startRoom = config.rooms[0];
    if (startRoom) {
      const player = createPlayer("player_01", "探索者", startRoom.id, contentPool);
      addEntity(world, player);
    }
  }

  // Auto-populate basic items in rooms
  const itemTemplates = [
    { templateId: "naan_bread", name: "干面包", props: { edible: true, hungerRestore: 15 } },
    { templateId: "waterskin", name: "水壶", props: { drinkable: true } },
    { templateId: "camel_bell", name: "旧麻绳", props: { usable: true } },
    { templateId: "torch", name: "火把", props: { lightSource: true } },
  ];
  for (const room of config.rooms.slice(0, 5)) {
    const item = itemTemplates[Math.floor(Math.random() * itemTemplates.length)];
    const itemEntity = createItem(
      `item_${room.id}`,
      item.name,
      item.templateId,
      item.props,
      room.id,
    );
    addEntity(world, itemEntity);
    // Add to room entities
    const r = world.rooms.get(room.id);
    r?.entities.add(itemEntity.id);
  }

  return world;
}

// ============================================================
// buildExits: 三层合并 + 旧格式兼容
// ============================================================

function buildExits(world: WorldState, config: WorldConfig): void {
  let exitCount = 0;

  if (config.graph) {
    if (config.graph.layout) {
      world.graph = buildGraph(world, config.graph);
    }
    // 层1: 区域内部自动布局
    if (config.graph.layout) {
      exitCount += buildLayoutExits(world, config.graph);
    }
    // 层2: 区域间要道
    if (config.graph.regionLinks) {
      exitCount += buildRegionLinks(world, config.graph);
    }
    // 层3: 手动边
    if (config.graph.edges) {
      exitCount += buildManualEdges(world, config.graph);
    }
  } else if (config.exits) {
    // 旧格式兼容: exits: { roomId: { direction: targetRoomId } }
    exitCount += buildLegacyExits(world, config.exits);
  }

  logWrite("srv", "info", `[WorldLoader] buildExits: 共生成 ${exitCount} 条出口`);
}

function buildGraph(world: WorldState, graph: GraphConfig): RoomGraph {
  const nodes: RoomGraph["nodes"] = new Map();
  const regionBounds: RoomGraph["regionBounds"] = new Map();
  const layout = graph.layout ?? {};
  let nextAutoY = 0;

  for (const [regionId, cfg] of Object.entries(layout)) {
    const originX = cfg.worldOffsetX ?? 0;
    const originY = cfg.worldOffsetY ?? nextAutoY;
    if (cfg.worldOffsetY === undefined) {
      nextAutoY = originY + cfg.rows + 2;
    }

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < cfg.rooms.length; i++) {
      const roomId = cfg.rooms[i] as RoomId;
      const room = world.rooms.get(roomId);
      if (!room) continue;

      const row = Math.floor(i / cfg.cols);
      const col = i % cfg.cols;
      const x = originX + col;
      const y = originY + row;

      nodes.set(roomId, {
        roomId,
        x,
        y,
        regionId: room.regionId,
      });

      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }

    if (minX !== Number.POSITIVE_INFINITY) {
      regionBounds.set(regionId as RegionId, { minX, maxX, minY, maxY });
    }
  }

  const allNodes = Array.from(nodes.values());
  const bounds =
    allNodes.length > 0
      ? {
          minX: Math.min(...allNodes.map((node) => node.x)),
          maxX: Math.max(...allNodes.map((node) => node.x)),
          minY: Math.min(...allNodes.map((node) => node.y)),
          maxY: Math.max(...allNodes.map((node) => node.y)),
        }
      : { minX: 0, maxX: 0, minY: 0, maxY: 0 };

  logWrite("srv", "info", `[WorldLoader] buildGraph: 共生成 ${nodes.size} 个房间坐标`);

  return { nodes, regionBounds, bounds, regionLinks: [] };
}

function buildLayoutExits(world: WorldState, graph: GraphConfig): number {
  let count = 0;
  const layout = graph.layout ?? {};

  for (const [regionId, cfg] of Object.entries(layout)) {
    const { rows, cols, rooms: roomIds, defaultDistance, defaultTerrain } = cfg;
    const terrain = (defaultTerrain ?? "plain") as TerrainType;
    const dist = defaultDistance ?? 1;

    logWrite(
      "srv",
      "info",
      `[WorldLoader] auto-layout: ${regionId} ${rows}×${cols} rooms=${roomIds.length}`,
    );

    for (let i = 0; i < roomIds.length; i++) {
      const room = world.rooms.get(roomIds[i] as RoomId);
      if (!room) continue;

      const row = Math.floor(i / cols);
      const col = i % cols;

      // 东边邻居
      if (col < cols - 1 && i + 1 < roomIds.length) {
        const neighborId = roomIds[i + 1] as RoomId;
        if (world.rooms.has(neighborId)) {
          room.exits.set("东", {
            to: neighborId,
            direction: "东",
            distance: dist,
            terrain,
            hidden: false,
            bidirectional: true,
          });
          count++;
          const neighbor = world.rooms.get(neighborId);
          if (neighbor && !neighbor.exits.has("西")) {
            neighbor.exits.set("西", {
              to: roomIds[i] as RoomId,
              direction: "西",
              distance: dist,
              terrain,
              hidden: false,
              bidirectional: true,
            });
            count++;
          }
        }
      }

      // 南边邻居
      if (row < rows - 1 && i + cols < roomIds.length) {
        const neighborId = roomIds[i + cols] as RoomId;
        if (world.rooms.has(neighborId)) {
          room.exits.set("南", {
            to: neighborId,
            direction: "南",
            distance: dist,
            terrain,
            hidden: false,
            bidirectional: true,
          });
          count++;
          const neighbor = world.rooms.get(neighborId);
          if (neighbor && !neighbor.exits.has("北")) {
            neighbor.exits.set("北", {
              to: roomIds[i] as RoomId,
              direction: "北",
              distance: dist,
              terrain,
              hidden: false,
              bidirectional: true,
            });
            count++;
          }
        }
      }
    }
  }

  return count;
}

function buildRegionLinks(world: WorldState, graph: GraphConfig): number {
  let count = 0;
  const layout = graph.layout ?? {};
  const links = graph.regionLinks ?? [];

  for (const link of links) {
    const fromLayout = layout[link.fromRegion];
    const toLayout = layout[link.toRegion];
    if (!fromLayout || !toLayout) {
      logWrite(
        "srv",
        "warn",
        `[WorldLoader] regionLink 引用未知区域: ${link.fromRegion} → ${link.toRegion}`,
      );
      continue;
    }

    const terrain = (link.terrain ?? "plain") as TerrainType;
    const dist = link.distance ?? 1;
    const dir = link.direction;
    const reverseDir = getReverseDirection(dir);
    if (!reverseDir) continue;

    // 存储区域连接信息到 graph
    if (world.graph) {
      world.graph.regionLinks.push({
        fromRegion: link.fromRegion as RegionId,
        toRegion: link.toRegion as RegionId,
        direction: dir,
        distance: dist,
        terrain,
      });
    }

    // 找到 fromRegion 的边界房间和 toRegion 的边界房间
    const fromBoundary = getBoundaryRooms(fromLayout.rooms, fromLayout.cols, dir);
    const toBoundary = getBoundaryRooms(toLayout.rooms, toLayout.cols, reverseDir);

    const pairs = Math.min(fromBoundary.length, toBoundary.length);
    for (let i = 0; i < pairs; i++) {
      const fromRoom = world.rooms.get(fromBoundary[i] as RoomId);
      const toRoom = world.rooms.get(toBoundary[i] as RoomId);
      if (!fromRoom || !toRoom) continue;

      fromRoom.exits.set(dir, {
        to: toBoundary[i] as RoomId,
        direction: dir,
        distance: dist,
        terrain,
        hidden: false,
        bidirectional: true,
      });
      count++;

      if (!toRoom.exits.has(reverseDir)) {
        toRoom.exits.set(reverseDir, {
          to: fromBoundary[i] as RoomId,
          direction: reverseDir,
          distance: dist,
          terrain,
          hidden: false,
          bidirectional: true,
        });
        count++;
      }
    }

    logWrite(
      "srv",
      "info",
      `[WorldLoader] regionLink: ${link.fromRegion} ↔ ${link.toRegion} (${dir}) ${pairs} 条通道`,
    );
  }

  return count;
}

function buildManualEdges(world: WorldState, graph: GraphConfig): number {
  let count = 0;
  const edges = graph.edges ?? [];

  for (const edge of edges) {
    const fromRoom = world.rooms.get(edge.from as RoomId);
    if (!fromRoom) {
      logWrite("srv", "warn", `[WorldLoader] edge 引用未知房间: ${edge.from}`);
      continue;
    }
    if (!world.rooms.has(edge.to as RoomId)) {
      logWrite("srv", "warn", `[WorldLoader] edge 引用未知房间: ${edge.to}`);
      continue;
    }

    const exit: Exit = {
      to: edge.to,
      direction: edge.direction,
      distance: edge.distance ?? 1,
      terrain: edge.terrain as TerrainType | undefined,
      hidden: edge.hidden ?? false,
      bidirectional: edge.bidirectional ?? true,
      conditions: edge.conditions,
      description: edge.description,
    };
    fromRoom.exits.set(edge.direction, exit);
    count++;

    // 双向补全
    if (exit.bidirectional) {
      const toRoom = world.rooms.get(edge.to as RoomId);
      if (!toRoom) continue;
      const reverseDir = getReverseDirection(edge.direction);
      if (reverseDir && !toRoom.exits.has(reverseDir)) {
        toRoom.exits.set(reverseDir, { ...exit, to: edge.from, direction: reverseDir });
        count++;
      }
    }
  }

  return count;
}

function buildLegacyExits(
  world: WorldState,
  exits: Record<string, Record<string, string>>,
): number {
  let count = 0;
  for (const [roomId, exitMap] of Object.entries(exits)) {
    const room = world.rooms.get(roomId as RoomId);
    if (!room) continue;
    for (const [direction, targetId] of Object.entries(exitMap)) {
      if (!world.rooms.has(targetId as RoomId)) continue;
      room.exits.set(direction, {
        to: targetId,
        direction,
        distance: 1,
        hidden: false,
        bidirectional: true,
      });
      count++;
    }
  }
  return count;
}

function getBoundaryRooms(roomIds: string[], cols: number, direction: string): string[] {
  switch (direction) {
    case "东":
      // 右边一列
      return roomIds.filter((_, i) => i % cols === cols - 1);
    case "西":
      return roomIds.filter((_, i) => i % cols === 0);
    case "南":
      // 最后一行
      return roomIds.filter((_, i) => i >= roomIds.length - (roomIds.length % cols || cols));
    case "北":
      // 第一行
      return roomIds.slice(0, cols);
    default:
      return [];
  }
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
