// ── EntityDetailPopup ──
// 物品实体详情弹窗：在操作列表上方展示实体类型标签、描述和属性。
// 轻量目标上下文菜单，非独立流程弹窗。TargetActionPopup 的增强版。

import { For, Show } from "solid-js";
import { formatItemProperties } from "../../shared/item-format.ts";
import type { RoomEntity } from "../../shared/protocol.ts";
import type { GameClient } from "../client/game-client.ts";
import { getEntityActions } from "../key-layer/index.ts";
import { PopupPanel } from "../layout/popup-panel.tsx";
import { THEME } from "../theme/theme.ts";
import { KeyHint } from "./key-hint.tsx";
import { LoadingHint } from "./loading-hint.tsx";

export function EntityDetailPopup(props: { client: GameClient; entity: RoomEntity | null }) {
  const isLoadingDialogue = () => props.client.hasActiveRequest();

  return (
    <Show when={props.entity}>
      {(entity: () => RoomEntity) => {
        const propertyText = () =>
          formatItemProperties(entity().properties ?? {}, props.client.itemPropertyLabels());
        return (
          <PopupPanel title={entity().name} borderColor={THEME.focus} width={30} zIndex={25}>
            <Show
              when={!isLoadingDialogue()}
              fallback={<LoadingHint color={THEME.muted} text="加载中..." />}
            >
              <box flexDirection="column">
                <Show when={entity().typeLabel}>
                  <text fg={THEME.muted} selectable={false}>
                    {entity().typeLabel}
                  </text>
                </Show>
                <Show when={entity().description}>
                  <text fg={THEME.text} wrapMode="word" selectable={false}>
                    {entity().description}
                  </text>
                </Show>
                <Show when={propertyText()}>
                  <text fg={THEME.text} wrapMode="word" selectable={false}>
                    {propertyText()}
                  </text>
                </Show>
              </box>
              <box border={["top"]} borderColor={THEME.borderMuted} paddingTop={1} />
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
        );
      }}
    </Show>
  );
}
