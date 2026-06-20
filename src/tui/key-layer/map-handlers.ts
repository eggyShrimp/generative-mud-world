import type { GameClient } from "../client/types.ts";

export function makeMapLinearCursorMover(direction: "prev" | "next"): (client: GameClient) => void {
  return (client) => {
    const minimap = client.room()?.minimap;
    const cursor = client.mapCursor();
    const granularity = client.mapGranularity();
    if (!minimap) return;
    if (granularity === "region") {
      const tiles = minimap.tiles.filter(
        (t) => t.regionId === minimap.playerRegionId && t.roomName,
      );
      const idx = tiles.findIndex((t) => t.x === cursor.x && t.y === cursor.y);
      const next =
        direction === "prev" ? Math.max(0, idx - 1) : Math.min(tiles.length - 1, idx + 1);
      if (next !== idx) {
        const t = tiles[next];
        client.setMapCursor({ x: t.x, y: t.y, regionId: t.regionId });
      }
    } else {
      const nodes = minimap.regionNodes;
      const idx = nodes.findIndex((n) =>
        cursor.regionId ? n.regionId === cursor.regionId : n.isCurrent,
      );
      const next =
        direction === "prev" ? Math.max(0, idx - 1) : Math.min(nodes.length - 1, idx + 1);
      if (next !== idx) {
        const n = nodes[next];
        client.setMapCursor({ x: n.x, y: n.y, regionId: n.regionId });
      }
    }
  };
}

export function makeMapRegionCursorMover(direction: "up" | "down"): (client: GameClient) => void {
  return (client) => {
    const minimap = client.room()?.minimap;
    const cursor = client.mapCursor();
    if (!minimap || client.mapGranularity() !== "region") return;
    const tiles = minimap.tiles.filter((t) => t.regionId === minimap.playerRegionId && t.roomName);
    const candidates =
      direction === "up"
        ? tiles.filter((t) => t.y < cursor.y)
        : tiles.filter((t) => t.y > cursor.y);
    if (candidates.length > 0) {
      const closest = candidates.reduce((a, b) =>
        Math.abs(a.x - cursor.x) <= Math.abs(b.x - cursor.x) ? a : b,
      );
      client.setMapCursor({
        x: closest.x,
        y: closest.y,
        regionId: closest.regionId,
      });
    }
  };
}
