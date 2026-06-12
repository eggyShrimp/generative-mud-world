// ── QuestNotificationOverlay ──
// 任务通知浮层：新任务/任务完成/剧情事件。
// 仅在 questNotification() 非空时渲染。

import { Show } from "solid-js";
import type { GameClient } from "../client/game-client.ts";
import { THEME } from "../theme/theme.ts";

export function QuestNotificationOverlay(props: { client: GameClient }) {
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
