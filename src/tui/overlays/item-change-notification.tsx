// ── ItemChangeNotificationOverlay ──
// 物品变动通知浮层：增减物品列表。
// 仅在 itemChangeNotification() 非空时渲染。

import { For, Show } from "solid-js";
import type { GameClient } from "../client/game-client.ts";
import { PopupPanel } from "../layout/popup-panel.tsx";
import { THEME } from "../theme/theme.ts";

export function ItemChangeNotificationOverlay(props: { client: GameClient }) {
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
