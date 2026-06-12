import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid";
import { createEffect, createMemo, For, onCleanup, onMount, Show } from "solid-js";
import { logWrite } from "../shared/log.ts";
import type { MinimapData, QuestInfo, RoomEntity } from "../shared/protocol.ts";
import {
  buildEntityListRows,
  buildExitListRows,
  ENTITY_LIST_COLUMNS,
} from "./entity-list-layout.ts";
import { getEventStyle } from "./event-style.ts";
import { computeContentHeight, type GameClient, type LogEntry } from "./game-client.ts";
import type { GroupedItem } from "./key-layer.ts";
import {
  bindingLabel,
  directionKeyChar,
  dispatchKey,
  findGroupForItem,
  formatGroupedItemName,
  getEntityActions,
  getGlobalBindings,
  getInventoryActions as getInventoryActionsFromGroup,
  groupInventory,
} from "./key-layer.ts";
import {
  percentBar,
  percentToneColor,
  ratioBar,
  ratioToneColor,
  signedPercentBar,
  signedToneColor,
} from "./progress-format.ts";
import {
  BarRow,
  EmptyState,
  KeyHint,
  KeyHintRow,
  LoadingHint,
  Section,
  SectionTitle,
} from "./shared.tsx";

const THEME = {
  background: "#0f0d0a",
  panel: "#17130f",
  panelAlt: "#12171a",
  popup: "#201811",
  border: "#8a6a3f",
  borderMuted: "#4e4030",
  focus: "#d6a94f",
  title: "#f1d08a",
  text: "#e6ddc9",
  muted: "#9ba7a3",
  dim: "#6f766f",
  exit: "#6fc3bd",
  success: "#7fc27a",
  dialogue: "#e3b96f",
  danger: "#d76b5d",
  disabled: "#5c554d",
};

const DESKTOP_MIN_ROOM_HEIGHT = 16;
const DESKTOP_MAX_ROOM_HEIGHT = 24;
const DESKTOP_MIN_EVENT_LOG_HEIGHT = 6;
const NARROW_MIN_ROOM_HEIGHT = 10;
const NARROW_MAX_ROOM_HEIGHT = 18;
const NARROW_MIN_EVENT_LOG_HEIGHT = 4;
const MODAL_MIN_WIDTH = 36;
const MODAL_MAX_WIDTH = 96;
const MODAL_MIN_HEIGHT = 8;
const MODAL_MAX_HEIGHT = 18;

export function App(props: { client: GameClient }) {
  const dimensions = useTerminalDimensions();
  const renderer = useRenderer();
  const narrow = createMemo(() => dimensions().width < 100);
  const layoutMetrics = createMemo(() => getLayoutMetrics(dimensions().height, narrow()));
  const modalMetrics = createMemo(() =>
    getModalMetrics(dimensions().width, dimensions().height, layoutMetrics(), narrow()),
  );
  const statusPanelMetrics = createMemo(() =>
    getStatusPanelMetrics(dimensions().width, dimensions().height, layoutMetrics(), narrow()),
  );
  const visibleEntities = createMemo(() => {
    const playerId = props.client.entity()?.id;
    return (props.client.room()?.entities ?? []).filter((entity) => entity.id !== playerId);
  });
  const selectedEntity = createMemo(() => {
    const selectedId = props.client.selectedEntityId();
    return visibleEntities().find((entity) => entity.id === selectedId) ?? null;
  });
  const inventoryItems = createMemo(() => props.client.entity()?.inventory ?? []);
  const inventoryGroups = createMemo(() => groupInventory(inventoryItems()));
  const selectedInventoryGroup = createMemo(() => {
    const selectedId = props.client.selectedInventoryItemId();
    return selectedId ? findGroupForItem(selectedId, inventoryGroups()) : null;
  });
  const pendingEvent = createMemo(() => {
    if (props.client.hasActiveRequest()) {
      return { type: "system", description: "正在处理..." };
    }
    return null;
  });

  onMount(() => props.client.connect());
  onCleanup(() => props.client.disconnect());

  useKeyboard((key) => {
    const name = key.name.toLowerCase();

    if (key.meta && name === "c") {
      const selection = renderer.getSelection();
      if (selection) {
        const text = selection.getSelectedText();
        if (text) {
          renderer.copyToClipboardOSC52(text);
          key.preventDefault();
          return;
        }
      }
    }

    dispatchKey(key, props.client);
  });

  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      padding={narrow() ? 0 : 1}
      backgroundColor={THEME.background}
    >
      <StatusBar client={props.client} compact={narrow()} />
      <Show
        when={!narrow()}
        fallback={
          <box flexDirection="column" flexGrow={1} gap={0}>
            <RoomPanel
              client={props.client}
              entities={visibleEntities()}
              selectedEntity={selectedEntity()}
              height={layoutMetrics().roomHeight}
              narrow
            />
            <EventLog
              events={props.client.events()}
              pendingEvent={pendingEvent()}
              height={layoutMetrics().eventLogHeight}
            />
            <Sidebar client={props.client} narrow />
          </box>
        }
      >
        <box flexDirection="column" flexGrow={1} gap={0}>
          <box flexDirection="row" height={layoutMetrics().roomHeight} gap={1}>
            <RoomPanel
              client={props.client}
              entities={visibleEntities()}
              selectedEntity={selectedEntity()}
              height={layoutMetrics().roomHeight}
            />
            <Sidebar client={props.client} height={layoutMetrics().roomHeight} />
          </box>
          <EventLog events={props.client.events()} height={layoutMetrics().eventLogHeight} />
        </box>
      </Show>
      <DialoguePanel client={props.client} metrics={modalMetrics()} />
      <InventoryPanel
        client={props.client}
        items={inventoryGroups()}
        selectedItem={selectedInventoryGroup()}
        metrics={modalMetrics()}
      />
      <MapPanel client={props.client} metrics={modalMetrics()} />
      <StatusPanel client={props.client} metrics={statusPanelMetrics()} />
      <QuestPanel client={props.client} metrics={modalMetrics()} />
      <TraveloguePanel client={props.client} metrics={modalMetrics()} />
      <CombatModal client={props.client} entities={visibleEntities()} metrics={modalMetrics()} />
      <QuestNotificationOverlay client={props.client} />
      <ItemChangeNotificationOverlay client={props.client} />
      <ConfirmEndDayModal client={props.client} metrics={modalMetrics()} />
      <SettlementModal client={props.client} metrics={modalMetrics()} />
    </box>
  );
}

function StatusBar(props: { client: GameClient; compact?: boolean }) {
  const entity = () => props.client.entity();
  const status = () => props.client.status();

  const dotColor = () => {
    const state = props.client.connectionState();
    if (state !== "connected") return THEME.danger;
    return status()?.llmReachable ? THEME.success : THEME.dialogue;
  };

  const connectionText = () => {
    const state = props.client.connectionState();
    if (state === "connected") return "已连接";
    if (state === "connecting") return "连接中";
    if (state === "error") return "连接失败";
    return "未连接";
  };

  if (props.compact) {
    return (
      <box
        height={1}
        paddingX={1}
        backgroundColor={THEME.panelAlt}
        flexDirection="row"
        alignItems="center"
      >
        <text fg={dotColor()} width={2}>
          ●
        </text>
        <text fg={THEME.title}>{entity()?.name ?? "未绑定角色"}</text>
        <text fg={THEME.muted} wrapMode="word">
          {"  "}第 {status()?.round ?? "-"} 天 · {status()?.date ?? "-"} · {connectionText()} ·
          Ctrl+C 退出
        </text>
      </box>
    );
  }

  return (
    <box
      border
      borderColor={THEME.borderMuted}
      backgroundColor={THEME.panelAlt}
      height={3}
      paddingX={1}
      marginBottom={1}
      flexDirection="row"
      alignItems="center"
    >
      <text fg={dotColor()} width={2}>
        ●
      </text>
      <text fg={THEME.title}>{entity()?.name ?? "未绑定角色"}</text>
      <text fg={THEME.muted} wrapMode="word">
        {"  "}第 {status()?.round ?? "-"} 天 · {status()?.date ?? "-"} · {connectionText()} · Ctrl+C
        退出
      </text>
    </box>
  );
}

function RoomPanel(props: {
  client: GameClient;
  entities: RoomEntity[];
  selectedEntity: RoomEntity | null;
  height: number;
  narrow?: boolean;
}) {
  const room = () => props.client.room();

  return (
    <box
      border
      borderColor={THEME.border}
      backgroundColor={THEME.panel}
      title="当前地点"
      padding={1}
      flexDirection="column"
      flexGrow={props.narrow ? 0 : 1}
      height={props.height}
      position="relative"
    >
      <text fg={THEME.title}>{room()?.name ?? "未进入房间"}</text>
      <text fg={THEME.text} wrapMode="word">
        {room()?.description ?? "等待世界回应。"}
      </text>

      <box height={1} />

      <RoomActionList room={room()} onExecute={(actionId) => props.client.execute(actionId)} />

      <SectionTitle label="出口" color={THEME.muted} />
      <ExitList exits={room()?.exits ?? {}} />

      <box height={1} />

      <SectionTitle label="眼前" color={THEME.muted} />
      <EntityList
        entities={props.entities}
        selectedEntityId={props.selectedEntity?.id}
        onSelect={(entity) => props.client.setSelectedEntityId(entity.id)}
        relations={props.client.entity()?.relations}
      />

      <TargetActionPopup
        client={props.client}
        entity={props.selectedEntity}
        narrow={Boolean(props.narrow)}
      />
    </box>
  );
}

function ExitList(props: {
  exits: Record<
    string,
    {
      to: string;
      directionLabel: string;
      distance: number;
      terrain?: string;
      terrainLabel?: string;
      destinationName?: string;
    }
  >;
}) {
  const rows = () => buildExitListRows(props.exits, directionKeyChar);

  logWrite("srv", "dbg", JSON.stringify(rows()));

  return (
    <Show
      when={rows().length > 0}
      fallback={
        <text selectable={false} fg={THEME.dim}>
          无出口
        </text>
      }
    >
      <box flexDirection="column" gap={0}>
        <For each={rows()}>
          {(row) => (
            <box flexDirection="row" alignItems="center">
              <text selectable={false} fg={THEME.dim} width={ENTITY_LIST_COLUMNS.selector}>
                {"  "}
              </text>
              <text selectable={false} fg={THEME.text} width={ENTITY_LIST_COLUMNS.index}>
                {row.keyText}
              </text>
              <text selectable={false} fg={THEME.text} width={ENTITY_LIST_COLUMNS.name}>
                {row.directionText}
              </text>
              <text selectable={false} fg={THEME.muted} width={ENTITY_LIST_COLUMNS.type}>
                {row.typeText}
              </text>
              <text selectable={false} fg={THEME.dim} width={ENTITY_LIST_COLUMNS.relation}>
                {row.relationText}
              </text>
            </box>
          )}
        </For>
      </box>
    </Show>
  );
}

function EntityList(props: {
  entities: RoomEntity[];
  selectedEntityId?: string;
  onSelect: (entity: RoomEntity) => void;
  relations?: Array<{ targetId: string; level: number; label?: string | null }>;
}) {
  const rows = () => buildEntityListRows(props.entities, props.selectedEntityId, props.relations);

  return (
    <Show
      when={props.entities.length > 0}
      fallback={
        <text selectable={false} fg={THEME.dim}>
          眼前没有可交互目标。
        </text>
      }
    >
      <box flexDirection="column" gap={0}>
        <For each={rows()}>
          {(row) => {
            const selected = () => row.selected;
            return (
              <box flexDirection="row" onMouseDown={() => props.onSelect(row.entity)}>
                <text
                  selectable={false}
                  fg={selected() ? THEME.focus : THEME.dim}
                  width={ENTITY_LIST_COLUMNS.selector}
                >
                  {selected() ? ">" : " "}
                </text>
                <text
                  selectable={false}
                  fg={selected() ? THEME.focus : THEME.text}
                  width={ENTITY_LIST_COLUMNS.index}
                >
                  {row.indexLabel}
                </text>
                <text
                  selectable={false}
                  fg={selected() ? THEME.focus : THEME.text}
                  width={ENTITY_LIST_COLUMNS.name}
                >
                  {row.nameText}
                </text>
                <text selectable={false} fg={THEME.muted} width={ENTITY_LIST_COLUMNS.type}>
                  {row.typeText}
                </text>
                <text
                  selectable={false}
                  fg={row.relation ? relationColor(row.relation.level) : THEME.dim}
                  width={ENTITY_LIST_COLUMNS.relation}
                >
                  {row.relationText}
                </text>
              </box>
            );
          }}
        </For>
      </box>
    </Show>
  );
}

function TargetActionPopup(props: {
  client: GameClient;
  entity: RoomEntity | null;
  narrow: boolean;
}) {
  const isLoadingDialogue = () => props.client.hasActiveRequest();

  return (
    <Show when={props.entity}>
      {(entity: () => RoomEntity) => (
        <PopupPanel
          title={entity().name}
          borderColor={THEME.focus}
          width={props.narrow ? 28 : 26}
          zIndex={25}
        >
          <Show
            when={!isLoadingDialogue()}
            fallback={<LoadingHint color={THEME.muted} text="加载中..." />}
          >
            <For each={getEntityActions(entity(), props.client.capabilities())}>
              {(action, index) => (
                <KeyHint
                  shortcut={index() + 1}
                  label={action.label}
                  color={action.color ?? THEME.text}
                  selectable={false}
                  onMouseDown={() => {
                    action.run(props.client, entity());
                    props.client.setSelectedEntityId(null);
                  }}
                />
              )}
            </For>
          </Show>
        </PopupPanel>
      )}
    </Show>
  );
}

function Sidebar(props: { client: GameClient; height?: number; narrow?: boolean }) {
  const needs = () => props.client.entity()?.needs ?? [];
  const topLayer = createMemo(() => props.client.activeLayer());
  const disabled = createMemo(
    () => props.client.hasActiveRequest() || (topLayer().id !== "base" && !topLayer().passthrough),
  );

  if (props.narrow) {
    return (
      <box
        height={1}
        paddingX={1}
        backgroundColor={THEME.panelAlt}
        flexDirection="row"
        gap={2}
        flexWrap="wrap"
      >
        <SectionTitle label="行动" color={THEME.muted} marginBottom={0} />
        <For each={getGlobalBindings()}>
          {(binding) => {
            const displayKey = Array.isArray(binding.key)
              ? binding.key[0].toUpperCase()
              : binding.key.toUpperCase();
            const available = () =>
              !disabled() && (!binding.enabled || binding.enabled(props.client));
            return (
              <KeyHint
                shortcut={displayKey}
                label={bindingLabel(props.client, binding)}
                color={available() ? (binding.color ?? THEME.text) : THEME.disabled}
                selectable={false}
                onMouseDown={() => {
                  if (!available()) return;
                  if (binding.handler) binding.handler(props.client, "");
                  else if (binding.action) props.client.execute(binding.action, binding.params);
                }}
              />
            );
          }}
        </For>
      </box>
    );
  }

  return (
    <box
      border
      borderColor={THEME.borderMuted}
      backgroundColor={THEME.panelAlt}
      title="角色状态"
      padding={1}
      flexDirection="column"
      width={30}
      height={props.height}
      gap={1}
    >
      <Show
        when={needs().length > 0}
        fallback={
          <text selectable={false} fg={THEME.dim}>
            暂无状态
          </text>
        }
      >
        <For each={needs()}>
          {(need) => (
            <box flexDirection="row">
              <text selectable={false} fg={needColor(need.value)} width={6}>
                {need.label}
              </text>
              <text selectable={false} fg={needColor(need.value)} width={10}>
                {percentBar(need.value)}
              </text>
              <text selectable={false} width={1}>
                {" "}
              </text>
              <text selectable={false} fg={THEME.text}>
                {Math.round(need.value)}
              </text>
            </box>
          )}
        </For>
      </Show>

      <box border={["top"]} borderColor={THEME.borderMuted} paddingTop={1} flexDirection="column">
        <SectionTitle label="行动" color={THEME.muted} />
        <For each={getGlobalBindings()}>
          {(binding) => {
            const displayKey = Array.isArray(binding.key)
              ? binding.key[0].toUpperCase()
              : binding.key.toUpperCase();
            const available = () =>
              !disabled() && (!binding.enabled || binding.enabled(props.client));
            return (
              <KeyHint
                shortcut={displayKey}
                label={bindingLabel(props.client, binding)}
                color={available() ? (binding.color ?? THEME.text) : THEME.disabled}
                selectable={false}
                onMouseDown={() => {
                  if (!available()) return;
                  if (binding.handler) binding.handler(props.client, "");
                  else if (binding.action) props.client.execute(binding.action, binding.params);
                }}
              />
            );
          }}
        </For>
      </box>
    </box>
  );
}

function MapPanel(props: { client: GameClient; metrics: ModalMetrics; narrow?: boolean }) {
  const data = () => props.client.room()?.minimap;
  const granularity = () => props.client.mapGranularity();
  const cursor = () => props.client.mapCursor();
  const isNarrow = () => props.narrow ?? props.metrics.narrow;

  // 面包屑路径
  const breadcrumb = createMemo(() => {
    const g = granularity();
    const minimap = data();
    if (g === "world") return "世界";
    const regionName =
      minimap?.regionNodes.find((r) => r.regionId === minimap.playerRegionId)?.name ?? "未知区域";
    return `世界 > ${regionName}`;
  });

  // 标题
  const title = createMemo(() => {
    const g = granularity();
    return g === "world" ? "地图 · 世界" : "地图 · 当前区域";
  });

  // 当前光标选中的 tile 信息
  const selectedTile = createMemo(() => {
    const minimap = data();
    if (!minimap) return null;
    const c = cursor();
    const g = granularity();
    if (g === "region") {
      return (
        minimap.tiles.find(
          (t) => t.x === c.x && t.y === c.y && t.regionId === minimap.playerRegionId,
        ) ?? null
      );
    }
    return null;
  });

  // 当前光标选中的区域节点
  const selectedRegion = createMemo(() => {
    const minimap = data();
    if (!minimap || granularity() !== "world") return null;
    const c = cursor();
    return minimap.regionNodes.find((r) => r.regionId === c.regionId) ?? null;
  });

  // 光标初始化：地图打开且 data 就绪时跳转到玩家位置
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

  // ---- 区域视图渲染（房间名 + 路径连接） ----
  const regionRows = createMemo(() => {
    const minimap = data();
    if (!minimap || granularity() !== "region") return [];

    const regionTiles = minimap.tiles.filter(
      (t) => t.regionId === minimap.playerRegionId && t.char !== " ",
    );
    if (regionTiles.length === 0) return [];

    const yValues = [...new Set(regionTiles.map((t) => t.y))].sort((a, b) => a - b);
    const xValues = [...new Set(regionTiles.map((t) => t.x))].sort((a, b) => a - b);

    const tileMap = new Map<string, (typeof regionTiles)[number]>();
    for (const t of regionTiles) tileMap.set(`${t.x},${t.y}`, t);

    // 列宽：每列最长房间名
    const colWidths = xValues.map((x) => {
      const names = regionTiles.filter((t) => t.x === x && t.roomName);
      return Math.max(2, ...names.map((t) => (t.roomName ?? t.char).length));
    });

    const _c = cursor();
    const narrow = isNarrow();
    const lines: { text: string; fg: string }[] = [];

    for (let yi = 0; yi < yValues.length; yi++) {
      const y = yValues[yi];
      // 房间行
      let roomLine = "";
      for (let xi = 0; xi < xValues.length; xi++) {
        const x = xValues[xi];
        const tile = tileMap.get(`${x},${y}`);
        const w = colWidths[xi];

        if (tile) {
          const displayName = narrow
            ? tile.char === "@"
              ? (tile.roomName?.[0] ?? "?")
              : tile.char
            : (tile.roomName ?? tile.char);
          const name = narrow ? displayName.padEnd(w) : displayName.padEnd(w);
          roomLine += name;
        } else {
          roomLine += " ".repeat(w);
        }

        // 水平连接
        if (xi < xValues.length - 1) {
          const nextX = xValues[xi + 1];
          const nextTile = tileMap.get(`${nextX},${y}`);
          const hasHExit =
            tile &&
            nextTile &&
            tile.known &&
            nextTile.known &&
            (tile.hasExit & 0b0010) !== 0 &&
            (nextTile.hasExit & 0b1000) !== 0;
          if (!narrow && tile && nextTile) {
            roomLine += hasHExit ? " ── " : "    ";
          }
        }
      }
      const roomIsCurrent = tileMap.get(`${xValues[0]},${y}`)?.isCurrent;
      lines.push({
        text: roomLine,
        fg: roomIsCurrent ? THEME.focus : THEME.exit,
      });

      // 垂直连接行
      if (yi < yValues.length - 1) {
        const nextY = yValues[yi + 1];
        let connLine = "";
        for (let xi = 0; xi < xValues.length; xi++) {
          const x = xValues[xi];
          const tile = tileMap.get(`${x},${y}`);
          const belowTile = tileMap.get(`${x},${nextY}`);
          const w = colWidths[xi];
          const center = Math.floor(w / 2);

          if (!narrow && tile && belowTile) {
            const hasVExit =
              tile.known &&
              belowTile.known &&
              (tile.hasExit & 0b0100) !== 0 &&
              (belowTile.hasExit & 0b0001) !== 0;
            connLine += " ".repeat(center) + (hasVExit ? "│" : " ") + " ".repeat(w - center - 1);
          } else {
            connLine += " ".repeat(w);
          }

          if (xi < xValues.length - 1) connLine += "    ";
        }
        if (connLine.trim().length > 0) {
          lines.push({ text: connLine, fg: THEME.dim });
        }
      }
    }

    return lines;
  });

  // ---- 世界视图渲染（区域节点 + 连接线） ----
  const worldRows = createMemo(() => {
    const minimap = data();
    if (!minimap || granularity() !== "world") return [];

    const nodes = minimap.regionNodes;
    if (nodes.length === 0) return [];

    const c = cursor();
    const lines: { text: string; fg: string }[] = [];

    // 简化渲染：区域名按行排列，连接线在下方
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const isSelected = c.regionId === node.regionId;
      const displayName = node.explored ? node.name : "???";
      const marker = node.isCurrent ? "▸" : " ";
      const line = `${marker} ${displayName}`;
      lines.push({
        text: line,
        fg: isSelected ? THEME.focus : node.explored ? THEME.exit : THEME.dim,
      });
    }

    // 区域连接线
    if (minimap.regionLinks.length > 0) {
      lines.push({ text: "", fg: THEME.dim });
      for (const link of minimap.regionLinks) {
        const fromName =
          minimap.regionNodes.find((r) => r.regionId === link.from)?.name ?? link.from;
        const toName = minimap.regionNodes.find((r) => r.regionId === link.to)?.name ?? link.to;
        lines.push({
          text: `  ${fromName} ── ${toName} (${link.directionLabel})`,
          fg: THEME.dim,
        });
      }
    }

    return lines;
  });

  // ---- 信息面板 ----
  const infoLines = createMemo(() => {
    const g = granularity();
    const minimap = data();
    if (!minimap) return [];

    if (g === "region") {
      const tile = selectedTile();
      if (!tile?.known) return [{ label: "", value: "尚未探索", color: THEME.dim, wrap: false }];
      const regionName = minimap.regionNodes.find((r) => r.regionId === tile.regionId)?.name ?? "";
      const lines: {
        label: string;
        value: string;
        color: string;
        wrap: boolean;
      }[] = [];

      // 房间名称
      lines.push({
        label: "房间名称",
        value: tile.roomName ?? tile.char,
        color: THEME.title,
        wrap: false,
      });
      // 所属区域
      if (regionName)
        lines.push({
          label: "所属区域",
          value: regionName,
          color: THEME.muted,
          wrap: false,
        });
      // 描述
      if (tile.description)
        lines.push({
          label: "描述",
          value: tile.description,
          color: THEME.text,
          wrap: true,
        });
      // 地形
      if (tile.terrain)
        lines.push({
          label: "地形",
          value: tile.terrainLabel ?? tile.terrain,
          color: THEME.muted,
          wrap: false,
        });
      // NPC/物品
      if (tile.entityBriefs && tile.entityBriefs.length > 0) {
        const names = tile.entityBriefs.map((e) => e.name).join("、");
        lines.push({
          label: "在场",
          value: names,
          color: THEME.text,
          wrap: false,
        });
      }
      // 出口
      const crossExits = tile.crossRegionExits ?? [];
      if (tile.isCurrent) {
        // 当前房间：从 room().exits 读取完整出口信息
        const roomExits = props.client.room()?.exits;
        if (roomExits) {
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
            lines.push({
              label: "出口",
              value: exitDescs.join(" "),
              color: THEME.exit,
              wrap: false,
            });
        }
      } else {
        // 非当前房间：用 hasExit 位掩码
        const dirs = tile.exitLabels ?? [];
        if (dirs.length > 0)
          lines.push({
            label: "出口",
            value: dirs.join(" "),
            color: THEME.text,
            wrap: false,
          });
        // 跨区域出口
        if (crossExits.length > 0) {
          const crossDescs = crossExits.map((c) => `${c.directionLabel} → ${c.targetRegionName}`);
          lines.push({
            label: "跨区域",
            value: crossDescs.join(" "),
            color: THEME.focus,
            wrap: false,
          });
        }
      }
      if (tile.isCurrent)
        lines.push({
          label: "",
          value: "当前位置",
          color: THEME.focus,
          wrap: false,
        });
      return lines;
    }

    // world
    const region = selectedRegion();
    if (!region) return [{ label: "", value: "选择区域查看情报", color: THEME.dim, wrap: false }];
    const lines: {
      label: string;
      value: string;
      color: string;
      wrap: boolean;
    }[] = [];
    lines.push({
      label: "区域名称",
      value: region.name,
      color: THEME.title,
      wrap: false,
    });
    lines.push({
      label: "状态",
      value: region.explored ? "已探索" : "未探索",
      color: region.explored ? THEME.text : THEME.dim,
      wrap: false,
    });
    if (region.isCurrent)
      lines.push({
        label: "",
        value: "当前所在",
        color: THEME.focus,
        wrap: false,
      });

    const links = minimap.regionLinks.filter(
      (l) => l.from === region.regionId || l.to === region.regionId,
    );
    if (links.length > 0) {
      const linkDescs = links.map((l) => {
        const other = l.from === region.regionId ? l.to : l.from;
        const otherName = minimap.regionNodes.find((r) => r.regionId === other)?.name ?? other;
        return `${l.directionLabel} → ${otherName}`;
      });
      lines.push({
        label: "连接",
        value: linkDescs.join(", "),
        color: THEME.text,
        wrap: false,
      });
    }

    return lines;
  });

  const mapLines = () => (granularity() === "world" ? worldRows() : regionRows());
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

function _tileChar(tile: MinimapData["tiles"][number]): string {
  if (tile.char === " ") return " ";
  return tile.char;
}

function EventLog(props: {
  events: LogEntry[];
  height: number;
  pendingEvent?: { type: string; description: string } | null;
}) {
  return (
    <scrollbox
      border
      borderColor={THEME.borderMuted}
      backgroundColor={THEME.panelAlt}
      title="事件日志"
      padding={1}
      height={props.height}
      stickyScroll
      stickyStart="bottom"
    >
      <For each={props.events}>
        {(event) => {
          const style = getEventStyle(event.type);
          return (
            <box flexDirection="row" alignItems="flex-start">
              <text selectable={false} fg={style.color} width={4}>
                {style.prefix}
              </text>
              <text wrapMode="word" fg={style.color} flexGrow={1}>
                {event.description}
              </text>
            </box>
          );
        }}
      </For>
      <Show when={props.pendingEvent} keyed>
        {(pe: { type: string; description: string }) => (
          <box flexDirection="row" alignItems="flex-start">
            <text selectable={false} fg={THEME.muted} width={4}>
              ···
            </text>
            <text wrapMode="word" fg={THEME.muted} flexGrow={1}>
              {pe.description}
            </text>
          </box>
        )}
      </Show>
    </scrollbox>
  );
}

export interface ModalMetrics {
  width: number;
  height: number;
  top: number;
  left: number;
  bodyHeight: number;
  narrow: boolean;
}

interface LayoutMetrics {
  roomHeight: number;
  eventLogHeight: number;
}

function getLayoutMetrics(terminalHeight: number, narrow: boolean): LayoutMetrics {
  if (narrow) {
    const compactStatusHeight = 1;
    const actionBarHeight = 1;
    const availableHeight = Math.max(
      NARROW_MIN_ROOM_HEIGHT + NARROW_MIN_EVENT_LOG_HEIGHT,
      terminalHeight - compactStatusHeight - actionBarHeight,
    );
    const roomHeight = clamp(
      Math.round(availableHeight * 0.62),
      NARROW_MIN_ROOM_HEIGHT,
      NARROW_MAX_ROOM_HEIGHT,
    );

    return {
      roomHeight,
      eventLogHeight: Math.max(NARROW_MIN_EVENT_LOG_HEIGHT, availableHeight - roomHeight),
    };
  }

  const rootVerticalPadding = 2;
  const statusHeight = 4;
  const availableHeight = Math.max(
    DESKTOP_MIN_ROOM_HEIGHT + DESKTOP_MIN_EVENT_LOG_HEIGHT,
    terminalHeight - rootVerticalPadding - statusHeight,
  );
  const roomHeight = clamp(
    Math.round(availableHeight * 0.68),
    DESKTOP_MIN_ROOM_HEIGHT,
    DESKTOP_MAX_ROOM_HEIGHT,
  );

  return {
    roomHeight,
    eventLogHeight: Math.max(DESKTOP_MIN_EVENT_LOG_HEIGHT, availableHeight - roomHeight),
  };
}

function getModalMetrics(
  terminalWidth: number,
  terminalHeight: number,
  layout: LayoutMetrics,
  narrow: boolean,
): ModalMetrics {
  const horizontalPadding = narrow ? 2 : 8;
  const width = clamp(
    terminalWidth - horizontalPadding,
    Math.min(MODAL_MIN_WIDTH, Math.max(1, terminalWidth - 2)),
    MODAL_MAX_WIDTH,
  );
  const reservedBottom = layout.eventLogHeight + (narrow ? 2 : 3);
  const minTop = narrow ? 2 : 6;
  const availableHeight = Math.max(MODAL_MIN_HEIGHT, terminalHeight - reservedBottom - minTop);
  const height = clamp(availableHeight, MODAL_MIN_HEIGHT, MODAL_MAX_HEIGHT);
  const left = Math.max(1, Math.floor((terminalWidth - width) / 2));
  const topLimit = Math.max(minTop, terminalHeight - reservedBottom - height);
  const top = Math.max(minTop, topLimit);

  return {
    width,
    height,
    top,
    left,
    bodyHeight: Math.max(3, height - 5),
    narrow,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getStatusPanelMetrics(
  terminalWidth: number,
  terminalHeight: number,
  layout: LayoutMetrics,
  narrow: boolean,
): ModalMetrics {
  const horizontalPadding = narrow ? 2 : 8;
  const width = clamp(
    terminalWidth - horizontalPadding,
    Math.min(MODAL_MIN_WIDTH, Math.max(1, terminalWidth - 2)),
    64,
  );
  const reservedBottom = layout.eventLogHeight + (narrow ? 2 : 3);
  const minTop = narrow ? 2 : 6;
  const availableHeight = Math.max(14, terminalHeight - reservedBottom - minTop);
  const height = clamp(availableHeight, 14, 24);
  const left = Math.max(1, Math.floor((terminalWidth - width) / 2));
  const topLimit = Math.max(minTop, terminalHeight - reservedBottom - height);
  const top = Math.max(minTop, topLimit);

  return {
    width,
    height,
    top,
    left,
    bodyHeight: Math.max(3, height - 5),
    narrow,
  };
}

function PopupPanel(props: {
  title: string;
  borderColor: string;
  footer?: string;
  width?: number;
  top?: number;
  left?: number;
  height?: number;
  zIndex?: number;
  backgroundColor?: string;
  showFooter?: boolean;
  children: unknown;
}) {
  const dims = useTerminalDimensions();
  const w = () => props.width ?? 36;
  const z = () => props.zIndex ?? 20;
  const bg = () => props.backgroundColor ?? THEME.popup;
  const top = () => props.top ?? 8;
  const left = () => props.left ?? Math.max(1, Math.floor((dims().width - w()) / 2));
  const footerText = () =>
    props.showFooter === false ? null : (props.footer ?? "\u2190 按 Esc 退出");
  return (
    <box
      border
      borderColor={props.borderColor}
      backgroundColor={bg()}
      title={props.title}
      padding={1}
      width={w()}
      height={props.height}
      position="absolute"
      top={top()}
      left={left()}
      zIndex={z()}
      flexDirection="column"
    >
      <box flexGrow={1} flexDirection="column">
        {props.children}
      </box>
      <Show when={footerText()}>
        <text selectable={false} fg={THEME.muted}>
          {footerText()}
        </text>
      </Show>
    </box>
  );
}

// ============================================================
// Interaction Panel (通用布局：内容区 + 交互区)
// ============================================================

function InteractionPanel(props: {
  title: string;
  borderColor: string;
  backgroundColor?: string;
  metrics: ModalMetrics;
  interactionHeight: number;
  content: unknown;
  interaction: unknown;
}) {
  const contentHeight = () =>
    computeContentHeight(props.metrics.bodyHeight, props.interactionHeight);

  return (
    <PopupPanel
      title={props.title}
      borderColor={props.borderColor}
      backgroundColor={props.backgroundColor}
      width={props.metrics.width}
      height={props.metrics.height}
      top={props.metrics.top}
      left={props.metrics.left}
      showFooter={false}
    >
      <scrollbox height={contentHeight()} scrollY stickyScroll stickyStart="bottom">
        {props.content}
      </scrollbox>
      <box
        border={["top"]}
        borderColor={THEME.borderMuted}
        paddingTop={1}
        flexDirection="column"
        flexGrow={1}
      >
        {props.interaction}
      </box>
    </PopupPanel>
  );
}

const TAB_LABELS: Record<string, string> = {
  chat: "对话",
  trade: "交易",
};

function TabBar(props: { tabs: string[]; active: string }) {
  return (
    <box flexDirection="row">
      <text selectable={false} fg={THEME.dim}>
        {"\u2501\u2501 "}
      </text>
      {props.tabs.map((tab, i) => (
        <>
          {i > 0 ? <text fg={THEME.borderMuted}> │ </text> : null}
          <text fg={tab === props.active ? THEME.focus : THEME.dim}>{TAB_LABELS[tab] ?? tab}</text>
        </>
      ))}
      <text selectable={false} fg={THEME.dim}>
        {" \u2501\u2501"}
      </text>
    </box>
  );
}

function TradeDetail(props: {
  selection: {
    option: { id: string; label: string; meta?: Record<string, unknown> };
    detail?: string;
  };
  playerCopper: number;
  npcName: string;
}) {
  const price = () => (props.selection.option.meta?.price as number) ?? 0;
  const currencyName = () => (props.selection.option.meta?.currencyName as string) ?? "铜钱";
  return (
    <box flexDirection="column">
      <text fg={THEME.title} wrapMode="word">
        {props.selection.option.meta?.itemName ?? props.selection.option.label}
      </text>
      {props.selection.detail === undefined ? (
        <text fg={THEME.dim}>正在查看...</text>
      ) : (
        <>
          <text fg={THEME.text} wrapMode="word">
            {props.selection.detail}
          </text>
          {price() > 0 ? (
            <>
              <text fg={THEME.muted}>
                售价：{price()} {currencyName()}
              </text>
              <text fg={props.playerCopper >= price() ? THEME.dialogue : THEME.danger}>
                持有：{props.playerCopper} {currencyName()}
              </text>
            </>
          ) : undefined}
          <text fg={THEME.muted} marginTop={1}>
            [1] 购买 [Esc] 返回
          </text>
        </>
      )}
    </box>
  );
}

export function DialoguePanel(props: { client: GameClient; metrics: ModalMetrics }) {
  const dialogue = () => props.client.dialogue();
  const isLoading = () => dialogue() !== null && dialogue()?.options.length === 0;
  const entity = () => props.client.entity();

  const title = () => {
    const d = dialogue();
    if (!d) return "";
    if (d.activeTab === "trade") return `交易：${d.npcName}`;
    return `对话：${d.npcName}`;
  };

  const _playerCopper = () => {
    const inv = entity()?.inventory ?? [];
    return inv.filter((i) => i.templateId === "copper_coin").length;
  };

  return (
    <Show when={dialogue()}>
      {(current: () => NonNullable<ReturnType<GameClient["dialogue"]>>) => {
        const cur = current();

        if (cur.activeTab === "trade") {
          const sel = cur.tradeSelection;
          const listWidth = sel
            ? Math.max(16, Math.floor(props.metrics.width * 0.35))
            : props.metrics.width - 2;
          const contentH = computeContentHeight(props.metrics.bodyHeight, 2);
          return (
            <InteractionPanel
              title={title()}
              borderColor={THEME.focus}
              backgroundColor={THEME.popup}
              metrics={props.metrics}
              interactionHeight={2}
              content={
                <box flexDirection="row" height={contentH}>
                  <scrollbox height={contentH} width={listWidth} scrollY>
                    <Show
                      when={isLoading()}
                      fallback={
                        <Show
                          when={cur.options.length > 0}
                          fallback={
                            <text selectable={false} fg={THEME.dim}>
                              没有可交易的物品。
                            </text>
                          }
                        >
                          {cur.options.map((opt, i) => (
                            <KeyHint
                              shortcut={i + 1}
                              label={opt.label}
                              color={THEME.dialogue}
                              wrapMode="word"
                            />
                          ))}
                        </Show>
                      }
                    >
                      <LoadingHint color={THEME.muted} text="正在思考中..." />
                    </Show>
                  </scrollbox>
                  {sel ? (
                    <scrollbox
                      border={["left"]}
                      borderColor={THEME.borderMuted}
                      paddingLeft={1}
                      marginLeft={1}
                      height={contentH}
                      flexGrow={1}
                      scrollY
                    >
                      <TradeDetail
                        selection={sel}
                        playerCopper={_playerCopper()}
                        npcName={cur.npcName}
                      />
                    </scrollbox>
                  ) : undefined}
                </box>
              }
              interaction={<TabBar tabs={cur.availableTabs} active={cur.activeTab} />}
            />
          );
        }

        return (
          <InteractionPanel
            title={title()}
            borderColor={THEME.focus}
            backgroundColor={THEME.popup}
            metrics={props.metrics}
            interactionHeight={6}
            content={
              cur.history.length === 0 ? (
                <box flexDirection="column">
                  <text fg={THEME.title}>{cur.npcName}</text>
                  <text fg={THEME.muted}>{cur.npcDescription ?? "人物"}</text>
                </box>
              ) : (
                <For each={cur.history}>
                  {(entry) => (
                    <text
                      wrapMode="word"
                      fg={entry.speaker === "player" ? "#6fc3bd" : THEME.dialogue}
                    >
                      {entry.speaker === "player" ? "你" : cur.npcName}：{entry.content}
                    </text>
                  )}
                </For>
              )
            }
            interaction={
              <box flexDirection="column" flexGrow={1}>
                <box flexGrow={1}>
                  <Show
                    when={isLoading()}
                    fallback={
                      <Show
                        when={cur.options.length > 0}
                        fallback={
                          <text selectable={false} fg={THEME.dim}>
                            没有可选回应。
                          </text>
                        }
                      >
                        <For each={cur.options}>
                          {(option, index) => (
                            <KeyHint
                              shortcut={index() + 1}
                              label={option.label}
                              color={THEME.dialogue}
                              wrapMode="word"
                            />
                          )}
                        </For>
                      </Show>
                    }
                  >
                    <LoadingHint color={THEME.muted} text="正在思考中..." />
                  </Show>
                </box>
                <box marginTop={1}>
                  <TabBar tabs={cur.availableTabs} active={cur.activeTab} />
                </box>
              </box>
            }
          />
        );
      }}
    </Show>
  );
}

function InventoryPanel(props: {
  client: GameClient;
  items: GroupedItem[];
  selectedItem: GroupedItem | null;
  metrics: ModalMetrics;
}) {
  return (
    <Show when={props.client.isLayerActive("inventory")}>
      <PopupPanel
        title="背包"
        borderColor={THEME.border}
        backgroundColor={THEME.panel}
        width={props.metrics.width}
        height={props.metrics.height}
        top={props.metrics.top}
        left={props.metrics.left}
        footer={props.selectedItem ? "Esc 关闭" : "选择物品编号，Esc 关闭"}
      >
        <Show
          when={props.selectedItem}
          fallback={
            <scrollbox height={props.metrics.bodyHeight} scrollY>
              <InventoryList
                items={props.items}
                selectedGroupName={props.selectedItem?.name}
                onSelect={(group) => props.client.setSelectedInventoryItemId(group.items[0].id)}
              />
            </scrollbox>
          }
        >
          {(group: () => GroupedItem) => (
            <box
              flexDirection={props.metrics.narrow ? "column" : "row"}
              height={props.metrics.bodyHeight}
            >
              <scrollbox
                height={
                  props.metrics.narrow
                    ? Math.max(3, Math.floor(props.metrics.bodyHeight / 2))
                    : props.metrics.bodyHeight
                }
                width={props.metrics.narrow ? "100%" : 24}
                scrollY
              >
                <InventoryList
                  items={props.items}
                  selectedGroupName={group().name}
                  onSelect={(candidate) =>
                    props.client.setSelectedInventoryItemId(candidate.items[0].id)
                  }
                />
              </scrollbox>
              <InventoryDetail
                client={props.client}
                group={group()}
                height={
                  props.metrics.narrow
                    ? Math.max(
                        3,
                        props.metrics.bodyHeight -
                          Math.max(3, Math.floor(props.metrics.bodyHeight / 2)),
                      )
                    : props.metrics.bodyHeight
                }
              />
            </box>
          )}
        </Show>
      </PopupPanel>
    </Show>
  );
}

function InventoryDetail(props: { client: GameClient; group: GroupedItem; height: number }) {
  const representative = props.group.items[0];
  return (
    <scrollbox
      border={["left"]}
      borderColor={THEME.borderMuted}
      paddingLeft={1}
      marginLeft={1}
      height={props.height}
      flexGrow={1}
      scrollY
    >
      <text fg={THEME.title} wrapMode="word">
        {formatGroupedItemName(props.group)}：{representative.description}
      </text>
      <For each={getInventoryActionsFromGroup(props.group, props.client.capabilities())}>
        {(action, index) => (
          <KeyHint
            shortcut={index() + 1}
            label={action.label}
            color={action.color ?? THEME.text}
            selectable={false}
            onMouseDown={() => {
              action.run(props.client, props.group);
              props.client.closeInventory();
            }}
          />
        )}
      </For>
    </scrollbox>
  );
}

function InventoryList(props: {
  items: GroupedItem[];
  selectedGroupName?: string;
  onSelect: (group: GroupedItem) => void;
}) {
  return (
    <Show
      when={props.items.length > 0}
      fallback={
        <text selectable={false} fg={THEME.dim}>
          背包是空的。
        </text>
      }
    >
      <box flexDirection="column">
        <For each={props.items}>
          {(group, index) => {
            const selected = () => props.selectedGroupName === group.name;
            return (
              <box flexDirection="row" onMouseDown={() => props.onSelect(group)}>
                <text selectable={false} fg={selected() ? THEME.focus : THEME.dim} width={2}>
                  {selected() ? ">" : " "}
                </text>
                <KeyHintRow
                  shortcut={index() + 1}
                  label={formatGroupedItemName(group)}
                  color={selected() ? THEME.focus : THEME.text}
                />
              </box>
            );
          }}
        </For>
      </box>
    </Show>
  );
}

function ConfirmEndDayModal(props: { client: GameClient; metrics: ModalMetrics }) {
  const options = () => props.client.endDayOptions();
  const metrics = () => ({
    ...props.metrics,
    height: Math.min(props.metrics.height, options().length + 6),
    bodyHeight: Math.min(props.metrics.bodyHeight, options().length + 2),
  });

  return (
    <Show when={props.client.isLayerActive("confirm-end-day") && options().length > 0}>
      {() => (
        <PopupPanel
          title="结束今天"
          borderColor="#d6a94f"
          backgroundColor={THEME.popup}
          width={metrics().width}
          height={metrics().height}
          top={metrics().top}
          left={metrics().left}
          footer="0 取消"
        >
          <box height={metrics().bodyHeight} flexDirection="column">
            <For each={options()}>
              {(option, index) => (
                <KeyHint
                  shortcut={index() + 1}
                  label={
                    option.durability != null && option.durability > 0
                      ? `${option.label}   精力 +${option.restRecovery} (×${option.durability})`
                      : `${option.label}   精力 +${option.restRecovery}`
                  }
                  color={THEME.text}
                  selectable={false}
                  onMouseDown={() => props.client.confirmEndDay(option)}
                />
              )}
            </For>
          </box>
        </PopupPanel>
      )}
    </Show>
  );
}

function SettlementModal(props: { client: GameClient; metrics: ModalMetrics }) {
  const metrics = () => ({
    ...props.metrics,
    height: 5,
    bodyHeight: 1,
  });

  return (
    <Show when={props.client.settlementPending()}>
      {() => (
        <PopupPanel
          title="结算中"
          borderColor={THEME.dialogue}
          backgroundColor={THEME.popup}
          width={metrics().width}
          height={metrics().height}
          top={metrics().top}
          left={metrics().left}
          showFooter={false}
        >
          <box height={metrics().bodyHeight} flexDirection="column">
            <text selectable={false} fg={THEME.muted}>
              夜深了，世界正在沉淀这一天的故事...
            </text>
          </box>
        </PopupPanel>
      )}
    </Show>
  );
}

function needColor(value: number): string {
  return percentToneColor(value, {
    high: THEME.success,
    medium: THEME.dialogue,
    low: THEME.danger,
  });
}

function relationColor(level: number): string {
  if (level >= 50) return THEME.success;
  if (level >= 0) return THEME.dialogue;
  return THEME.danger;
}

// ============================================================
// Status Panel
// ============================================================

function StatusPanel(props: { client: GameClient; metrics: ModalMetrics }) {
  const entity = () => props.client.entity();
  const equipment = () => entity()?.equipment;
  const combatState = () => entity()?.combatState;
  const needs = () => entity()?.needs ?? [];
  const traits = () => entity()?.traits ?? [];

  const EQUIP_COLS = { label: 4 };
  const COMBAT_COLS = { label: 6, bar: 10, value: 11 };
  const NEED_COLS = { label: 6, bar: 10, value: 5 };
  const TRAIT_COLS = { label: 8, bar: 11, value: 5 };
  const NEED_ROW_WIDTH = NEED_COLS.label + NEED_COLS.bar + NEED_COLS.value + 1;
  const NEED_COLUMN_GAP = 2;
  const needColumns = () =>
    props.metrics.width >= NEED_ROW_WIDTH * 2 + NEED_COLUMN_GAP + 8 ? 2 : 1;
  const needRows = () => {
    if (needColumns() === 1) return needs().map((need) => [need]);
    const rows = [];
    for (let i = 0; i < needs().length; i += 2) {
      rows.push(needs().slice(i, i + 2));
    }
    return rows;
  };

  const NeedRow = (rowProps: { need: NonNullable<ReturnType<typeof entity>>["needs"][number] }) => (
    <BarRow
      label={rowProps.need.label}
      bar={percentBar(rowProps.need.value)}
      value={String(Math.round(rowProps.need.value))}
      labelWidth={NEED_COLS.label}
      barWidth={NEED_COLS.bar}
      valueWidth={NEED_COLS.value}
      color={needColor(rowProps.need.value)}
      valueColor={THEME.text}
      paddingLeft={0}
    />
  );

  return (
    <Show when={props.client.isLayerActive("status")}>
      <PopupPanel
        title={`角色状态 · ${entity()?.name ?? "?"}`}
        borderColor={THEME.focus}
        backgroundColor={THEME.panel}
        width={props.metrics.width}
        height={props.metrics.height}
        top={props.metrics.top}
        left={props.metrics.left}
        footer="Q/Esc 关闭"
      >
        <scrollbox height={props.metrics.bodyHeight} scrollY>
          <Section title="装备" color={THEME.title}>
            <Show when={equipment()} fallback={<EmptyState type="装备" color={THEME.dim} />}>
              {(eq: () => NonNullable<typeof equipment> extends () => infer T ? T : never) => (
                <box flexDirection="row" gap={6} paddingLeft={2}>
                  <box flexDirection="row">
                    <text selectable={false} fg={THEME.text} width={EQUIP_COLS.label}>
                      武器
                    </text>
                    <text selectable={false} fg={THEME.text}>
                      {eq()?.weapon?.name ?? "--"}
                    </text>
                  </box>
                  <box flexDirection="row">
                    <text selectable={false} fg={THEME.text} width={EQUIP_COLS.label}>
                      护甲
                    </text>
                    <text selectable={false} fg={THEME.text}>
                      {eq()?.armor?.name ?? "--"}
                    </text>
                  </box>
                </box>
              )}
            </Show>
          </Section>
          <box height={1} />
          <Section title="生命" color={THEME.title}>
            <Show when={combatState()} fallback={<EmptyState type="战斗数据" color={THEME.dim} />}>
              {(cs: () => NonNullable<typeof combatState> extends () => infer T ? T : never) => {
                const hp = () => cs()?.hp ?? 0;
                const maxHp = () => cs()?.maxHp ?? 1;
                const ratio = () => Math.round((hp() / maxHp()) * 100);
                return (
                  <BarRow
                    label="生命"
                    bar={percentBar(ratio())}
                    value={`${hp()}/${maxHp()}`}
                    labelWidth={COMBAT_COLS.label}
                    barWidth={COMBAT_COLS.bar}
                    valueWidth={COMBAT_COLS.value}
                    color={needColor(ratio())}
                    valueColor={THEME.text}
                  />
                );
              }}
            </Show>
          </Section>
          <box height={1} />
          <Section title="需求" color={THEME.title}>
            <Show when={needs().length > 0} fallback={<EmptyState type="需求" color={THEME.dim} />}>
              <box flexDirection="column" gap={1} paddingLeft={2}>
                <For each={needRows()}>
                  {(row) => (
                    <box flexDirection="row" gap={NEED_COLUMN_GAP}>
                      <box width={NEED_ROW_WIDTH}>
                        <NeedRow need={row[0]} />
                      </box>
                      {row[1] ? (
                        <box width={NEED_ROW_WIDTH}>
                          <NeedRow need={row[1]} />
                        </box>
                      ) : undefined}
                    </box>
                  )}
                </For>
              </box>
            </Show>
          </Section>
          <box height={1} />
          <Section title="特质" color={THEME.title}>
            <Show
              when={traits().length > 0}
              fallback={<EmptyState type="特质" color={THEME.dim} />}
            >
              <box flexDirection="column" gap={1}>
                <For each={traits()}>
                  {(trait) => (
                    <BarRow
                      label={trait.name}
                      bar={signedPercentBar(trait.value)}
                      value={String(trait.value)}
                      labelWidth={TRAIT_COLS.label}
                      barWidth={TRAIT_COLS.bar}
                      valueWidth={TRAIT_COLS.value}
                      color={traitColor(trait.value)}
                      valueColor={THEME.text}
                    />
                  )}
                </For>
              </box>
            </Show>
          </Section>
        </scrollbox>
      </PopupPanel>
    </Show>
  );
}

// ============================================================
// Quest Panel
// ============================================================

function statusLabel(status: string): string {
  if (status === "active") return "进行中";
  if (status === "completed") return "已完成";
  if (status === "failed") return "已失败";
  return status;
}

function objectiveProgressText(current: number, count: number): string {
  return `${Math.min(current, count)}/${count}`;
}

function QuestPanel(props: { client: GameClient; metrics: ModalMetrics }) {
  const quests = () => (props.client.entity()?.activeQuests ?? []) as QuestInfo[];
  const selectedIndex = () => props.client.selectedQuestIndex();
  const selectedQuest = () => {
    const idx = selectedIndex();
    return idx !== null ? (quests()[idx] ?? null) : null;
  };

  return (
    <Show when={props.client.isLayerActive("quests")}>
      <PopupPanel
        title="任务日志"
        borderColor={THEME.success}
        backgroundColor={THEME.panel}
        width={props.metrics.width}
        height={props.metrics.height}
        top={props.metrics.top}
        left={props.metrics.left}
        footer={
          selectedIndex() !== null ? "[t]跟踪 [x]放弃 Esc 取消选择" : "选择任务编号，Esc/J 关闭"
        }
      >
        <Show
          when={quests().length > 0}
          fallback={
            <text fg={THEME.muted} paddingLeft={1}>
              没有进行中的任务。
            </text>
          }
        >
          <box
            flexDirection={props.metrics.narrow ? "column" : "row"}
            height={props.metrics.bodyHeight}
          >
            <scrollbox
              height={
                props.metrics.narrow
                  ? Math.max(3, Math.floor(props.metrics.bodyHeight / 2))
                  : props.metrics.bodyHeight
              }
              width={props.metrics.narrow ? "100%" : 28}
              scrollY
            >
              <For each={quests()}>
                {(quest, i) => {
                  const selected = () => selectedIndex() === i();
                  const tracked = () => props.client.isTrackingQuest(quest.templateId);
                  const marker = tracked() ? "* " : "  ";
                  const arrow = selected() ? "\u25B8 " : "  ";
                  const progress = () => {
                    if (quest.objectives.length === 0) return "";
                    const done = quest.objectives.filter((o) => o.completed).length;
                    return ` ${done}/${quest.objectives.length}`;
                  };
                  return (
                    <box
                      flexDirection="row"
                      onMouseDown={() => props.client.setSelectedQuestIndex(i())}
                    >
                      <text fg={selected() ? THEME.success : THEME.title} wrapMode="word">
                        {`${arrow}${marker}${i() + 1}. ${quest.title}${progress()}`}
                      </text>
                    </box>
                  );
                }}
              </For>
            </scrollbox>
            <Show when={selectedQuest()}>
              {(quest: () => QuestInfo) => (
                <scrollbox
                  border={["left"]}
                  borderColor={THEME.borderMuted}
                  paddingLeft={1}
                  marginLeft={1}
                  height={
                    props.metrics.narrow
                      ? Math.max(
                          3,
                          props.metrics.bodyHeight -
                            Math.max(3, Math.floor(props.metrics.bodyHeight / 2)),
                        )
                      : props.metrics.bodyHeight
                  }
                  flexGrow={1}
                  scrollY
                >
                  <text fg={THEME.title} wrapMode="word">
                    {quest().title}
                  </text>
                  <text fg={THEME.text} wrapMode="word">
                    {quest().description}
                  </text>
                  <Show when={quest().status !== "active"}>
                    <text fg={quest().status === "completed" ? THEME.success : THEME.danger}>
                      状态：{statusLabel(quest().status)}
                    </text>
                  </Show>
                  <Show when={quest().deadlineDay}>
                    <text fg={THEME.dialogue}>期限：第 {quest().deadlineDay} 天</text>
                  </Show>
                  <Show when={quest().objectives.length > 0}>
                    <text fg={THEME.muted}>─── 目标 ───</text>
                    <For each={quest().objectives}>
                      {(obj) => {
                        const checkmark = () => (obj.completed ? "\u2713" : "\u25CB");
                        const color = () => (obj.completed ? THEME.success : THEME.muted);
                        return (
                          <text fg={color()} wrapMode="word">
                            {` ${checkmark()} ${obj.description} (${objectiveProgressText(obj.current, obj.count)})`}
                          </text>
                        );
                      }}
                    </For>
                  </Show>
                  <Show when={quest().narrative}>
                    <text fg={THEME.muted} wrapMode="word">
                      {quest().narrative}
                    </text>
                  </Show>
                  <Show when={quest().giverNpcId}>
                    <text fg={THEME.dim}>委托人：{quest().giverNpcId}</text>
                  </Show>
                </scrollbox>
              )}
            </Show>
          </box>
        </Show>
      </PopupPanel>
    </Show>
  );
}

// ============================================================
// Travelogue Panel
// ============================================================

function TraveloguePanel(props: { client: GameClient; metrics: ModalMetrics }) {
  const entries = () => props.client.travelogue();
  const selectedIndex = () => props.client.selectedTravelogueIndex();
  const selectedEntry = () => {
    const idx = selectedIndex();
    return idx !== null ? (entries()[idx] ?? null) : null;
  };

  return (
    <Show when={props.client.isLayerActive("travelogue")}>
      <PopupPanel
        title="游记"
        borderColor="#d4a574"
        backgroundColor={THEME.panel}
        width={props.metrics.width}
        height={props.metrics.height}
        top={props.metrics.top}
        left={props.metrics.left}
        footer={entries().length > 0 ? "[↑↓/jk]切换 [1-9]选择 [t]关闭" : "[t]关闭"}
      >
        <Show
          when={entries().length > 0}
          fallback={
            <text fg={THEME.muted} paddingLeft={1}>
              暂无游记。在世界上经历一段旅程后，每日结算时将自动生成游记。
            </text>
          }
        >
          <box
            flexDirection={props.metrics.narrow ? "column" : "row"}
            height={props.metrics.bodyHeight}
          >
            <scrollbox
              height={
                props.metrics.narrow
                  ? Math.max(3, Math.floor(props.metrics.bodyHeight / 2))
                  : props.metrics.bodyHeight
              }
              width={props.metrics.narrow ? "100%" : 28}
              scrollY
            >
              <For each={entries()}>
                {(entry, i) => {
                  const selected = () => selectedIndex() === i();
                  const arrow = selected() ? "\u25B8 " : "  ";
                  return (
                    <box
                      flexDirection="column"
                      onMouseDown={() => props.client.setSelectedTravelogueIndex(i())}
                    >
                      <box flexDirection="row">
                        <text fg={selected() ? "#d4a574" : THEME.title} wrapMode="word">
                          {`${arrow}${i() + 1}. ${entry.title}`}
                        </text>
                      </box>
                      <text fg={THEME.dim}>{`    ${entry.date}`}</text>
                    </box>
                  );
                }}
              </For>
            </scrollbox>
            <Show when={selectedEntry()}>
              {(entry: () => ReturnType<typeof props.client.travelogue>[number]) => (
                <scrollbox
                  border={["left"]}
                  borderColor={THEME.borderMuted}
                  paddingLeft={1}
                  marginLeft={1}
                  height={
                    props.metrics.narrow
                      ? Math.max(
                          3,
                          props.metrics.bodyHeight -
                            Math.max(3, Math.floor(props.metrics.bodyHeight / 2)),
                        )
                      : props.metrics.bodyHeight
                  }
                  width={props.metrics.narrow ? "100%" : undefined}
                  flexGrow={props.metrics.narrow ? undefined : 1}
                  scrollY
                >
                  <text fg="#d4a574">{entry().title}</text>
                  <text fg={THEME.dim}>{entry().date}</text>
                  <Show when={entry().locations.length > 0}>
                    <text fg={THEME.muted} wrapMode="word">
                      途经：{entry().locations.join(" → ")}
                    </text>
                  </Show>
                  <box height={1} />
                  <text fg={THEME.text} wrapMode="word">
                    {entry().narrative}
                  </text>
                </scrollbox>
              )}
            </Show>
          </box>
        </Show>
      </PopupPanel>
    </Show>
  );
}

// ============================================================
// Quest Notification Overlay
// ============================================================

function QuestNotificationOverlay(props: { client: GameClient }) {
  const notif = () => props.client.questNotification();
  const typeColor = () => {
    const t = notif()?.type;
    if (t === "accept") return THEME.success;
    if (t === "complete") return THEME.focus;
    return THEME.dialogue;
  };
  const typeLabel = () => {
    const t = notif()?.type;
    if (t === "accept") return "新任务";
    if (t === "complete") return "任务完成";
    return "剧情事件";
  };
  return (
    <Show when={notif()}>
      <box
        position="absolute"
        top={2}
        left={2}
        width={48}
        border
        borderColor={typeColor()}
        backgroundColor={THEME.popup}
        flexDirection="column"
        paddingX={1}
        zIndex={30}
      >
        <text fg={typeColor()}>{`\u2726 ${typeLabel()}`}</text>
        <text fg={THEME.title} wrapMode="word">
          {notif()?.title}
        </text>
        <text selectable={false} fg={THEME.muted}>
          按 Enter/Esc 关闭
        </text>
      </box>
    </Show>
  );
}

function ItemChangeNotificationOverlay(props: { client: GameClient }) {
  const notif = () => props.client.itemChangeNotification();
  return (
    <Show when={notif()}>
      <PopupPanel
        title="物品变动"
        borderColor={THEME.dialogue}
        zIndex={25}
        footer="按 Enter/Esc 确认"
      >
        <For each={notif()?.gains ?? []}>
          {(item) => (
            <text fg={THEME.success}>
              +{item.qty} {item.name}
            </text>
          )}
        </For>
        <For each={notif()?.losses ?? []}>
          {(item) => (
            <text fg={THEME.danger}>
              -{item.qty} {item.name}
            </text>
          )}
        </For>
      </PopupPanel>
    </Show>
  );
}

// ============================================================
// Combat Modal
// ============================================================

function CombatModal(props: { client: GameClient; entities: RoomEntity[]; metrics: ModalMetrics }) {
  const entity = () => props.client.entity();
  const combatState = () => entity()?.combatState;
  const targetEntity = () => {
    const cs = combatState();
    if (!cs?.combatTarget) return null;
    return props.entities.find((e) => e.id === cs.combatTarget) ?? null;
  };
  const log = () => props.client.combatLog();
  const round = () => props.client.combatRound();

  const hpColor = (hp: number, max: number) => {
    return ratioToneColor(hp, max, {
      high: "#6bdb6b",
      medium: "#d39746",
      low: "#ff6b44",
    });
  };

  const eventFg = (type: string) => {
    const style = getEventStyle(type);
    return style.color;
  };

  return (
    <Show when={props.client.isLayerActive("combat")}>
      <PopupPanel
        title={`战斗 — 第 ${round()} 回合`}
        borderColor="#ff6b44"
        backgroundColor={THEME.popup}
        width={props.metrics.width}
        height={props.metrics.height}
        top={props.metrics.top}
        left={props.metrics.left}
        showFooter={false}
      >
        <box flexDirection="row" gap={4} marginBottom={1}>
          <box flexDirection="column" flexGrow={1}>
            <text selectable={false} fg={THEME.title}>
              {entity()?.name ?? "你"}
            </text>
            <text
              selectable={false}
              fg={hpColor(combatState()?.hp ?? 0, combatState()?.maxHp ?? 50)}
            >
              {`${ratioBar(combatState()?.hp ?? 0, combatState()?.maxHp ?? 50)} ${combatState()?.hp ?? 0}/${combatState()?.maxHp ?? 50}`}
            </text>
            {combatState()?.isDefending ? (
              <text selectable={false} fg="#6fc3bd">
                ◇ 防御中
              </text>
            ) : undefined}
          </box>
          <box flexDirection="column" flexGrow={1}>
            <text selectable={false} fg="#ff9944">
              {targetEntity()?.name ?? "???"}
            </text>
            <text
              selectable={false}
              fg={hpColor(
                targetEntity()?.combatState?.hp ?? 0,
                targetEntity()?.combatState?.maxHp ?? 50,
              )}
            >
              {`${ratioBar(
                targetEntity()?.combatState?.hp ?? 0,
                targetEntity()?.combatState?.maxHp ?? 50,
              )} ${targetEntity()?.combatState?.hp ?? 0}/${targetEntity()?.combatState?.maxHp ?? 50}`}
            </text>
          </box>
        </box>

        <box flexDirection="column" flexGrow={1}>
          <scrollbox
            height={Math.max(1, props.metrics.bodyHeight - 6)}
            scrollY
            stickyScroll
            stickyStart="bottom"
          >
            <For each={log()}>
              {(entry) => (
                <box flexDirection="row">
                  <text selectable={false} fg={THEME.dim} width={5}>
                    {entry.round > 0 ? `R${entry.round}` : ""}
                  </text>
                  <text selectable={false} fg={eventFg(entry.type)} wrapMode="word" flexGrow={1}>
                    {entry.description}
                  </text>
                </box>
              )}
            </For>
            <Show when={log().length === 0}>
              <text selectable={false} fg={THEME.dim}>
                战斗开始！
              </text>
            </Show>
          </scrollbox>
        </box>

        <box
          border={["top"]}
          borderColor={THEME.borderMuted}
          paddingTop={1}
          flexDirection="row"
          gap={3}
        >
          <KeyHint shortcut="D" label="防御" color="#6fc3bd" selectable={false} />
          <KeyHint shortcut="F" label="逃跑" color="#d39746" selectable={false} />
          <KeyHint shortcut="Esc" label="撤退" color={THEME.dim} selectable={false} />
        </box>
      </PopupPanel>
    </Show>
  );
}

// ============================================================
// Room Action List
// ============================================================

function RoomActionList(props: {
  room: { roomActions?: Array<{ id: string; label: string }> } | null;
  onExecute: (actionId: string) => void;
}) {
  const actions = () => props.room?.roomActions ?? [];
  return (
    <Show
      when={actions().length > 0}
      fallback={
        <text selectable={false} fg={THEME.dim}>
          此处无事可做。
        </text>
      }
    >
      <SectionTitle label="此处可做事" color={THEME.muted} />
      <box flexDirection="column" gap={0}>
        <For each={actions()}>
          {(action, i) => (
            <box flexDirection="row" onMouseDown={() => props.onExecute(action.id)}>
              <text selectable={false} fg={THEME.dim} width={2}>
                {"  "}
              </text>
              <KeyHintRow
                shortcut={String.fromCharCode(65 + i())}
                label={action.label}
                color={THEME.exit}
              />
            </box>
          )}
        </For>
      </box>
    </Show>
  );
}

function traitColor(value: number): string {
  return signedToneColor(value, {
    high: THEME.success,
    neutral: THEME.muted,
    medium: THEME.dialogue,
    low: THEME.danger,
  });
}
