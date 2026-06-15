// ── TargetActionPopup ──
// 选中目标后的动作弹窗：显示该实体的可用操作（交谈/观察/拾取等）。
// 共享组件：RoomPanel 和其他需要目标选择的面板均可使用。

import { For, Show } from "solid-js";
import type { RoomEntity } from "../../shared/protocol.ts";
import type { GameClient } from "../client/game-client.ts";
import { getEntityActions } from "../key-layer/index.ts";
import { PopupPanel } from "../layout/popup-panel.tsx";
import { THEME } from "../theme/theme.ts";
import { KeyHint } from "./key-hint.tsx";
import { LoadingHint } from "./loading-hint.tsx";

export function TargetActionPopup(props: { client: GameClient; entity: RoomEntity | null }) {
  const isLoadingDialogue = () => props.client.hasActiveRequest();

  return (
    <Show when={props.entity}>
      {(entity: () => RoomEntity) => (
        <PopupPanel title={entity().name} borderColor={THEME.focus} width={26} zIndex={25}>
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
