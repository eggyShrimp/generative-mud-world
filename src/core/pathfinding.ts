import type { Exit, RoomGraph, RoomId, RoomNode } from "./types.ts";

export function findPath(
  graph: RoomGraph,
  exits: Map<RoomId, Map<string, Exit>>,
  from: RoomId,
  to: RoomId,
): RoomId[] | null {
  if (from === to) return [];
  if (!graph.nodes.has(from) || !graph.nodes.has(to)) return null;

  const visited = new Set<RoomId>([from]);
  const queue: Array<{ roomId: RoomId; path: RoomId[] }> = [{ roomId: from, path: [from] }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;

    const neighbors = exits.get(current.roomId);
    if (!neighbors) continue;

    for (const exit of neighbors.values()) {
      if (exit.to === to) return [...current.path, to];
      if (visited.has(exit.to)) continue;
      visited.add(exit.to);
      queue.push({ roomId: exit.to, path: [...current.path, exit.to] });
    }
  }

  return null;
}

export function findWeightedPath(
  graph: RoomGraph,
  exits: Map<RoomId, Map<string, Exit>>,
  terrainCosts: Record<string, number>,
  from: RoomId,
  to: RoomId,
): RoomId[] | null {
  if (from === to) return [];
  const fromNode = graph.nodes.get(from);
  const toNode = graph.nodes.get(to);
  if (!fromNode || !toNode) return null;

  const openSet = new Set<RoomId>([from]);
  const cameFrom = new Map<RoomId, RoomId>();
  const gScore = new Map<RoomId, number>([[from, 0]]);
  const fScore = new Map<RoomId, number>([[from, heuristic(fromNode, toNode)]]);

  while (openSet.size > 0) {
    let current: RoomId | undefined;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const id of openSet) {
      const score = fScore.get(id) ?? Number.POSITIVE_INFINITY;
      if (score < bestScore) {
        bestScore = score;
        current = id;
      }
    }
    if (!current) break;

    if (current === to) {
      return reconstructPath(cameFrom, to);
    }

    openSet.delete(current);
    const neighbors = exits.get(current);
    if (!neighbors) continue;

    for (const exit of neighbors.values()) {
      const targetNode = graph.nodes.get(exit.to);
      if (!targetNode) continue;

      const cost = terrainCosts[exit.terrain ?? "plain"] ?? 1;
      const tentativeG = (gScore.get(current) ?? Number.POSITIVE_INFINITY) + cost;
      if (tentativeG >= (gScore.get(exit.to) ?? Number.POSITIVE_INFINITY)) continue;

      cameFrom.set(exit.to, current);
      gScore.set(exit.to, tentativeG);
      fScore.set(exit.to, tentativeG + heuristic(targetNode, toNode));
      openSet.add(exit.to);
    }
  }

  return null;
}

export function reachableRooms(
  graph: RoomGraph,
  exits: Map<RoomId, Map<string, Exit>>,
  from: RoomId,
  maxDistance: number,
): Map<RoomId, number> {
  const distances = new Map<RoomId, number>();
  if (!graph.nodes.has(from)) return distances;

  const queue: Array<{ roomId: RoomId; distance: number }> = [{ roomId: from, distance: 0 }];
  distances.set(from, 0);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.distance >= maxDistance) continue;

    const neighbors = exits.get(current.roomId);
    if (!neighbors) continue;

    for (const exit of neighbors.values()) {
      const nextDistance = current.distance + exit.distance;
      if (nextDistance > maxDistance || distances.has(exit.to)) continue;
      distances.set(exit.to, nextDistance);
      queue.push({ roomId: exit.to, distance: nextDistance });
    }
  }

  return distances;
}

function heuristic(a: RoomNode, b: RoomNode): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function reconstructPath(cameFrom: Map<RoomId, RoomId>, to: RoomId): RoomId[] {
  const path = [to];
  while (cameFrom.has(path[0])) {
    const previous = cameFrom.get(path[0]);
    if (!previous) break;
    path.unshift(previous);
  }
  return path;
}
