// ── Map Rendering ──
// 地图渲染纯函数：输入 minimap 数据 + 光标 + 粒度，输出可渲染行。
// 不依赖 GameClient，不依赖 UI 框架。

import type { MinimapData, MinimapTile, RegionMapNode } from "../../../shared/protocol.ts";
import type { MapCursor, MapGranularity } from "../../client/game-client.ts";

interface MapLine {
  text: string;
  fg: string;
}

interface InfoLine {
  label: string;
  value: string;
  color: string;
  wrap: boolean;
}

const EXIT_N = 0b0001;
const EXIT_E = 0b0010;
const EXIT_S = 0b0100;
const EXIT_W = 0b1000;

/**
 * 区域视图：房间名 + 路径连接线。
 */
export function renderRegionRows(
  minimap: MinimapData,
  colors: { focus: string; exit: string; dim: string },
): MapLine[] {
  const regionTiles = minimap.tiles.filter(
    (t) => t.regionId === minimap.playerRegionId && t.char !== " ",
  );
  if (regionTiles.length === 0) return [];

  const yValues = [...new Set(regionTiles.map((t) => t.y))].sort((a, b) => a - b);
  const xValues = [...new Set(regionTiles.map((t) => t.x))].sort((a, b) => a - b);

  const tileMap = new Map<string, MinimapTile>();
  for (const t of regionTiles) tileMap.set(`${t.x},${t.y}`, t);

  const colWidths = xValues.map((x) => {
    const names = regionTiles.filter((t) => t.x === x && t.roomName);
    return Math.max(2, ...names.map((t) => (t.roomName ?? t.char).length));
  });

  const lines: MapLine[] = [];

  for (let yi = 0; yi < yValues.length; yi++) {
    const y = yValues[yi];
    let roomLine = "";

    for (let xi = 0; xi < xValues.length; xi++) {
      const x = xValues[xi];
      const tile = tileMap.get(`${x},${y}`);
      const w = colWidths[xi];

      if (tile) {
        const displayName = tile.roomName ?? tile.char;
        roomLine += displayName.padEnd(w);
      } else {
        roomLine += " ".repeat(w);
      }

      if (xi < xValues.length - 1) {
        const nextX = xValues[xi + 1];
        const nextTile = tileMap.get(`${nextX},${y}`);
        const hasHExit =
          tile &&
          nextTile &&
          tile.known &&
          nextTile.known &&
          (tile.hasExit & EXIT_E) !== 0 &&
          (nextTile.hasExit & EXIT_W) !== 0;
        if (tile && nextTile) {
          roomLine += hasHExit ? " ── " : "    ";
        }
      }
    }

    const roomIsCurrent = tileMap.get(`${xValues[0]},${y}`)?.isCurrent;
    lines.push({ text: roomLine, fg: roomIsCurrent ? colors.focus : colors.exit });

    if (yi < yValues.length - 1) {
      const nextY = yValues[yi + 1];
      let connLine = "";
      for (let xi = 0; xi < xValues.length; xi++) {
        const x = xValues[xi];
        const tile = tileMap.get(`${x},${y}`);
        const belowTile = tileMap.get(`${x},${nextY}`);
        const w = colWidths[xi];
        const center = Math.floor(w / 2);

        if (tile && belowTile) {
          const hasVExit =
            tile.known &&
            belowTile.known &&
            (tile.hasExit & EXIT_S) !== 0 &&
            (belowTile.hasExit & EXIT_N) !== 0;
          connLine += " ".repeat(center) + (hasVExit ? "│" : " ") + " ".repeat(w - center - 1);
        } else {
          connLine += " ".repeat(w);
        }

        if (xi < xValues.length - 1) connLine += "    ";
      }
      if (connLine.trim().length > 0) {
        lines.push({ text: connLine, fg: colors.dim });
      }
    }
  }

  return lines;
}

/**
 * 世界视图：区域节点 + 连接线。
 */
export function renderWorldRows(
  minimap: MinimapData,
  cursor: MapCursor,
  colors: { focus: string; exit: string; dim: string },
): MapLine[] {
  const nodes = minimap.regionNodes;
  if (nodes.length === 0) return [];

  const lines: MapLine[] = [];

  for (const node of nodes) {
    const isSelected = cursor.regionId === node.regionId;
    const displayName = node.explored ? node.name : "???";
    const marker = node.isCurrent ? "▸" : " ";
    lines.push({
      text: `${marker} ${displayName}`,
      fg: isSelected ? colors.focus : node.explored ? colors.exit : colors.dim,
    });
  }

  if (minimap.regionLinks.length > 0) {
    lines.push({ text: "", fg: colors.dim });
    for (const link of minimap.regionLinks) {
      const fromName = minimap.regionNodes.find((r) => r.regionId === link.from)?.name ?? link.from;
      const toName = minimap.regionNodes.find((r) => r.regionId === link.to)?.name ?? link.to;
      lines.push({ text: `  ${fromName} ── ${toName} (${link.directionLabel})`, fg: colors.dim });
    }
  }

  return lines;
}

/**
 * 地点情报面板内容。
 */
export function buildInfoLines(
  minimap: MinimapData,
  granularity: MapGranularity,
  selectedTile: MinimapTile | null,
  selectedRegion: RegionMapNode | null,
  roomExits:
    | Record<
        string,
        { directionLabel: string; distance: number; destinationName?: string; hidden?: boolean }
      >
    | undefined,
  colors: { focus: string; exit: string; dim: string; title: string; muted: string; text: string },
): InfoLine[] {
  if (granularity === "region") {
    if (!selectedTile?.known)
      return [{ label: "", value: "尚未探索", color: colors.dim, wrap: false }];

    const regionName =
      minimap.regionNodes.find((r) => r.regionId === selectedTile.regionId)?.name ?? "";
    const lines: InfoLine[] = [];
    const crossExits = selectedTile.crossRegionExits ?? [];

    lines.push({
      label: "房间名称",
      value: selectedTile.roomName ?? selectedTile.char,
      color: colors.title,
      wrap: false,
    });
    if (regionName)
      lines.push({ label: "所属区域", value: regionName, color: colors.muted, wrap: false });
    if (selectedTile.description)
      lines.push({
        label: "描述",
        value: selectedTile.description,
        color: colors.text,
        wrap: true,
      });
    if (selectedTile.terrain)
      lines.push({
        label: "地形",
        value: selectedTile.terrainLabel ?? selectedTile.terrain,
        color: colors.muted,
        wrap: false,
      });

    if (selectedTile.entityBriefs && selectedTile.entityBriefs.length > 0) {
      const names = selectedTile.entityBriefs.map((e) => e.name).join("、");
      lines.push({ label: "在场", value: names, color: colors.text, wrap: false });
    }

    if (selectedTile.isCurrent && roomExits) {
      const exitDescs = Object.entries(roomExits)
        .filter(([, exit]) => !exit.hidden)
        .map(([dir, exit]) => {
          const cross = crossExits.find((c) => c.direction === dir);
          const target = exit.destinationName ?? "???";
          const dist = exit.distance > 1 ? ` (${exit.distance}格)` : "";
          const region = cross ? ` [${cross.targetRegionName}]` : "";
          return `${exit.directionLabel} → ${target}${dist}${region}`;
        });
      if (exitDescs.length > 0)
        lines.push({ label: "出口", value: exitDescs.join(" "), color: colors.exit, wrap: false });
    } else if (!selectedTile.isCurrent) {
      const dirs = selectedTile.exitLabels ?? [];
      if (dirs.length > 0)
        lines.push({ label: "出口", value: dirs.join(" "), color: colors.text, wrap: false });
      if (crossExits.length > 0) {
        const crossDescs = crossExits.map((c) => `${c.directionLabel} → ${c.targetRegionName}`);
        lines.push({
          label: "跨区域",
          value: crossDescs.join(" "),
          color: colors.focus,
          wrap: false,
        });
      }
    }

    if (selectedTile.isCurrent)
      lines.push({ label: "", value: "当前位置", color: colors.focus, wrap: false });
    return lines;
  }

  // world
  if (!selectedRegion)
    return [{ label: "", value: "选择区域查看情报", color: colors.dim, wrap: false }];
  const lines: InfoLine[] = [];
  lines.push({ label: "区域名称", value: selectedRegion.name, color: colors.title, wrap: false });
  lines.push({
    label: "状态",
    value: selectedRegion.explored ? "已探索" : "未探索",
    color: selectedRegion.explored ? colors.text : colors.dim,
    wrap: false,
  });
  if (selectedRegion.isCurrent)
    lines.push({ label: "", value: "当前所在", color: colors.focus, wrap: false });

  const links = minimap.regionLinks.filter(
    (l) => l.from === selectedRegion.regionId || l.to === selectedRegion.regionId,
  );
  if (links.length > 0) {
    const linkDescs = links.map((l) => {
      const other = l.from === selectedRegion.regionId ? l.to : l.from;
      const otherName = minimap.regionNodes.find((r) => r.regionId === other)?.name ?? other;
      return `${l.directionLabel} → ${otherName}`;
    });
    lines.push({ label: "连接", value: linkDescs.join(", "), color: colors.text, wrap: false });
  }

  return lines;
}
