// ── RoomPanel ──
// 房间面板：房间名/描述、房间操作、出口列表、眼前目标、目标动作弹窗。
// RoomActionList / ExitList / EntityList 为私有子组件，TargetActionPopup 已提取至 components/。

import { Show } from "solid-js";
import type { RoomEntity } from "../../../shared/protocol.ts";
import type { GameClient } from "../../client/game-client.ts";
import { EntityDetailPopup, SectionTitle, TargetActionPopup } from "../../components/index.ts";
import { THEME } from "../../theme/theme.ts";
import { EntityList } from "./entity-list.tsx";
import { ExitList } from "./exit-list.tsx";
import { RoomActionList } from "./room-action-list.tsx";

// ── RoomPanel ──
// 房间面板主组件。组装房间名/描述、操作、出口、目标、动作弹窗。

export function RoomPanel(props: {
  client: GameClient;
  entities: RoomEntity[];
  selectedEntity: RoomEntity | null;
  height: number;
  width: number;
}) {
  const room = () => props.client.room();
  const contentWidth = () => Math.max(1, props.width - 2);

  return (
    <box
      border
      borderColor={THEME.border}
      backgroundColor={THEME.panel}
      title="当前地点"
      flexDirection="column"
      width={props.width}
      height={props.height}
      position="relative"
    >
      <box flexDirection="column" width={contentWidth()} padding={1} overflow="hidden">
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
          onSelect={(entity) => props.client.interactWithEntity(entity.id)}
          relations={props.client.entity()?.relations}
        />
      </box>

      <Show
        when={props.selectedEntity?.type === "item"}
        fallback={<TargetActionPopup client={props.client} entity={props.selectedEntity} />}
      >
        <EntityDetailPopup client={props.client} entity={props.selectedEntity} />
      </Show>
    </box>
  );
}
