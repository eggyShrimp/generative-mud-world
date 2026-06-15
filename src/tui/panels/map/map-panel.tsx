// ── MapPanel ──
// 地图面板：区域/世界视图 + 地点情报侧栏。
// 仅在 isLayerActive("map") 时渲染。

import { createEffect, createMemo, For, Show } from "solid-js";
import type { MinimapTile, RegionMapNode } from "../../../shared/protocol.ts";
import type { GameClient, MapGranularity } from "../../client/game-client.ts";
import { buildInfoLines, renderRegionRows, renderWorldRows } from "../../features/map/rendering.ts";
import type { ModalMetrics } from "../../layout/metrics.ts";
import { PopupPanel } from "../../layout/popup-panel.tsx";
import { THEME } from "../../theme/theme.ts";

const MAP_COLORS = {
  focus: THEME.focus,
  exit: THEME.exit,
  dim: THEME.dim,
  title: THEME.title,
  muted: THEME.muted,
  text: THEME.text,
};

export function MapPanel(props: { client: GameClient; metrics: ModalMetrics }) {
  const data = () => props.client.room()?.minimap;
  const granularity = () => props.client.mapGranularity();
  const cursor = () => props.client.mapCursor();

  const breadcrumb = createMemo(() => {
    const g = granularity();
    const minimap = data();
    if (g === "world") return "世界";
    const regionName =
      minimap?.regionNodes.find((r) => r.regionId === minimap.playerRegionId)?.name ?? "未知区域";
    return `世界 > ${regionName}`;
  });

  const title = createMemo(() => {
    return granularity() === "world" ? "地图 · 世界" : "地图 · 当前区域";
  });

  const selectedTile = createMemo((): MinimapTile | null => {
    const minimap = data();
    if (!minimap) return null;
    const c = cursor();
    if (granularity() !== "region") return null;
    return (
      minimap.tiles.find(
        (t) => t.x === c.x && t.y === c.y && t.regionId === minimap.playerRegionId,
      ) ?? null
    );
  });

  const selectedRegion = createMemo((): RegionMapNode | null => {
    const minimap = data();
    if (!minimap || granularity() !== "world") return null;
    const c = cursor();
    return minimap.regionNodes.find((r) => r.regionId === c.regionId) ?? null;
  });

  // 光标初始化：地图打开时跳转到玩家位置
  createEffect(() => {
    const minimap = data();
    const c = cursor();
    if (minimap && props.client.isLayerActive("map") && !Number.isFinite(c.x)) {
      props.client.setMapCursor({
        x: minimap.centerX,
        y: minimap.centerY,
        regionId: minimap.playerRegionId,
      });
    }
  });

  const mapLines = createMemo(() => {
    const minimap = data();
    if (!minimap) return [];
    return granularity() === "world"
      ? renderWorldRows(minimap, cursor(), MAP_COLORS)
      : renderRegionRows(minimap, MAP_COLORS);
  });

  const infoLines = createMemo(() => {
    const minimap = data();
    if (!minimap) return [];
    const roomExits = selectedTile()?.isCurrent ? props.client.room()?.exits : undefined;
    return buildInfoLines(
      minimap,
      granularity() as MapGranularity,
      selectedTile(),
      selectedRegion(),
      roomExits,
      MAP_COLORS,
    );
  });

  const bodyH = () => props.metrics.bodyHeight;
  const mapViewportHeight = () => Math.max(1, bodyH() - 1);
  const infoPanelWidth = () => Math.min(24, Math.max(12, props.metrics.width - 8));
  const mapViewportWidth = () => Math.max(1, props.metrics.width - 4 - infoPanelWidth());

  return (
    <Show when={props.client.isLayerActive("map")}>
      <PopupPanel
        title={title()}
        borderColor={THEME.border}
        backgroundColor={THEME.panel}
        width={props.metrics.width}
        height={props.metrics.height}
        top={props.metrics.top}
        left={props.metrics.left}
        footer="← → 移动光标 g 切换粒度 M 关闭"
      >
        <text selectable={false} fg={THEME.muted}>
          {breadcrumb()}
        </text>

        <box flexDirection="row" height={mapViewportHeight()}>
          <scrollbox width={mapViewportWidth()} height={mapViewportHeight()} scrollY>
            <Show
              when={mapLines().length > 0}
              fallback={
                <text selectable={false} fg={THEME.dim}>
                  暂无地图数据。
                </text>
              }
            >
              <For each={mapLines()}>
                {(line) => (
                  <text selectable={false} fg={line.fg}>
                    {line.text}
                  </text>
                )}
              </For>
            </Show>
          </scrollbox>

          <scrollbox width={infoPanelWidth()} paddingLeft={1} height={mapViewportHeight()} scrollY>
            <text selectable={false} fg={THEME.title}>
              ── 地点情报 ──
            </text>
            <For each={infoLines()}>
              {(info) => (
                <text selectable={false} fg={info.color} wrapMode={info.wrap ? "word" : undefined}>
                  {info.label ? `${info.label}：${info.value}` : info.value}
                </text>
              )}
            </For>
          </scrollbox>
        </box>
      </PopupPanel>
    </Show>
  );
}
