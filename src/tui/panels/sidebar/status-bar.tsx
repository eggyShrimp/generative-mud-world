// ── StatusBar ──
// 顶部状态栏：角色名、日期、退出提示。

import type { GameClient } from "../../client/game-client.ts";
import { THEME } from "../../theme/theme.ts";

export function StatusBar(props: { client: GameClient }) {
  const entity = () => props.client.entity();
  const status = () => props.client.status();

  const dotColor = () => {
    const state = props.client.connectionState();
    if (state !== "connected") return THEME.danger;
    return status()?.llmReachable ? THEME.success : THEME.dialogue;
  };

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
        {"  "}
        {status()?.date ?? "-"} · Ctrl+C 退出
      </text>
    </box>
  );
}
