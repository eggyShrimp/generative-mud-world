import type { PlayerEntity, WorldState } from "../../core/types.ts";
import { logWrite } from "../../shared/log.ts";
import type {
  CrossRegionExit,
  EntityBrief,
  MinimapData,
  MinimapTile,
} from "../../shared/protocol.ts";
import {
  getDirectionLabel,
  getExitLabels,
  getExitMask,
  getTerrainLabel,
} from "./server-helpers.ts";

export function buildMinimap(world: WorldState, player: PlayerEntity): MinimapData | undefined {
  if (!world.graph || !player.roomId) return undefined;

  const graph = world.graph;
  const current = graph.nodes.get(player.roomId);
  if (!current) return undefined;

  const { bounds, regionBounds, regionLinks } = graph;
  const { minX, minY, maxX, maxY } = bounds;
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;

  const nodesByCoord = new Map<string, typeof current>();
  for (const node of graph.nodes.values()) {
    nodesByCoord.set(`${node.x},${node.y}`, node);
  }

  const tiles: MinimapTile[] = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const node = nodesByCoord.get(`${x},${y}`);

      if (!node) {
        tiles.push({ x, y, char: " ", known: false, isCurrent: false, hasExit: 0 });
        continue;
      }

      const room = world.rooms.get(node.roomId);
      const known = player.knownRooms.includes(node.roomId);
      const isCurrent = node.roomId === player.roomId;
      const name = room?.name ?? "";

      tiles.push({
        x,
        y,
        char: isCurrent ? "@" : known ? (name[0] ?? "?") : "?",
        roomName: known ? room?.name : undefined,
        known,
        isCurrent,
        hasExit: room
          ? getExitMask(room.exits, world.contentPool.narrativeTemplates.directionNames)
          : 0,
        regionId: node.regionId,
        ...(known && room
          ? {
              description: room.description,
              terrain: room.terrain ?? "plain",
              terrainLabel: getTerrainLabel(world, room.terrain ?? "plain"),
              exitLabels: getExitLabels(
                room.exits,
                world.contentPool.narrativeTemplates.directionNames,
              ),
              entityBriefs: Array.from(room.entities.values())
                .filter((eid) => eid !== player.id)
                .map((eid) => {
                  const ent = world.entities.get(eid);
                  return ent ? { name: ent.name, type: ent.type } : null;
                })
                .filter(Boolean) as EntityBrief[],
              crossRegionExits: Array.from(room.exits.entries())
                .filter(([, exit]) => {
                  const target = world.rooms.get(exit.to);
                  return target && target.regionId !== node.regionId;
                })
                .map(([dir, exit]) => {
                  const target = world.rooms.get(exit.to);
                  const region = target ? world.regions.get(target.regionId) : undefined;
                  return {
                    direction: dir,
                    directionLabel: getDirectionLabel(
                      world.contentPool.narrativeTemplates.directionNames,
                      dir,
                    ),
                    targetRegionName: region?.name ?? target?.regionId ?? "未知",
                  } as CrossRegionExit;
                }),
            }
          : {}),
      });
    }
  }

  const playerRegionId = current.regionId;
  const regionNodes = Array.from(regionBounds.entries()).map(([regionId, rb]) => {
    const region = world.regions.get(regionId);
    const explored = Array.from(graph.nodes.values()).some(
      (n) => n.regionId === regionId && player.knownRooms.includes(n.roomId),
    );
    return {
      regionId,
      name: region?.name ?? regionId,
      explored,
      isCurrent: regionId === playerRegionId,
      x: Math.round((rb.minX + rb.maxX) / 2),
      y: Math.round((rb.minY + rb.maxY) / 2),
    };
  });

  const regionLinksMapped = regionLinks.map((rl) => ({
    from: rl.fromRegion,
    to: rl.toRegion,
    direction: rl.direction,
    directionLabel: getDirectionLabel(
      world.contentPool.narrativeTemplates.directionNames,
      rl.direction,
    ),
    distance: rl.distance,
    terrain: rl.terrain,
    terrainLabel: getTerrainLabel(world, rl.terrain),
  }));

  logWrite(
    "srv",
    "dbg",
    `buildMinimap: ${tiles.length} tiles, ${regionNodes.length} regions, playerRegion=${playerRegionId}`,
  );

  return {
    width,
    height,
    minX,
    minY,
    centerX: current.x,
    centerY: current.y,
    tiles,
    playerRegionId,
    regionNodes,
    regionLinks: regionLinksMapped,
  };
}
