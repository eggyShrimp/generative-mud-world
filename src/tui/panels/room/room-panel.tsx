// ── RoomPanel ──
// 房间面板：房间名/描述、房间操作、出口列表、眼前目标、目标动作弹窗。
// RoomActionList / ExitList / EntityList 为私有子组件，TargetActionPopup 已提取至 components/。

import { For, Show } from "solid-js";
import type { RoomEntity } from "../../../shared/protocol.ts";
import type { GameClient } from "../../client/game-client.ts";
import { KeyHintRow, SectionTitle, TargetActionPopup } from "../../components/index.ts";
import {
  buildEntityListRows,
  buildExitListRows,
  ENTITY_LIST_COLUMNS,
} from "../../features/room/entity-list-layout.ts";
import { directionKeyChar } from "../../key-layer/index.ts";
import { THEME } from "../../theme/theme.ts";
import { relationColor } from "../../theme/tone.ts";

// ── RoomActionList ──
// 房间级操作（如"休息"、"观察环境"），字母键触发。

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

// ── ExitList ──
// 出口列表：按键 + 方向 + 地形/距离 + 目的地名。

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

// ── EntityList ──
// 眼前目标列表：序号 + 名称 + 类型 + 关系。选中行高亮。

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

// ── RoomPanel ──
// 房间面板主组件。组装房间名/描述、操作、出口、目标、动作弹窗。

export function RoomPanel(props: {
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
