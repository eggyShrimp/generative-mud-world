import type { GameClient } from "../../client/game-client.ts";
import { THEME } from "../../theme/theme.ts";

const PANEL_PADDING_X = 1;
const PANEL_PADDING_Y = 1;
const PANEL_HORIZONTAL_INSET = PANEL_PADDING_X * 2 + 2;

export function RoleCard(props: { client: GameClient; width: number; height: number }) {
  const entity = () => props.client.entity();
  const equipment = () => entity()?.equipment;
  const status = () => props.client.status();
  const contentWidth = () => Math.max(1, props.width - PANEL_HORIZONTAL_INSET);
  const connectionColor = () => {
    if (props.client.connectionState() !== "connected") return THEME.danger;
    return status()?.llmReachable ? THEME.success : THEME.dialogue;
  };
  return (
    <box
      border
      title="角色"
      borderColor={THEME.borderMuted}
      backgroundColor={THEME.panelAlt}
      width={props.width}
      height={props.height}
      paddingX={PANEL_PADDING_X}
      paddingY={PANEL_PADDING_Y}
      flexDirection="column"
      overflow="hidden"
    >
      <box flexDirection="row" alignItems="center">
        <text selectable={false} fg={connectionColor()} width={2}>
          ●
        </text>
        <text selectable={false} fg={THEME.title} width={Math.max(1, contentWidth() - 2)}>
          {entity()?.name ?? "未绑定角色"}
        </text>
      </box>
      <text selectable={false} fg={THEME.text}>
        武器：{equipment()?.weapon?.name ?? "--"}
      </text>
      <text selectable={false} fg={THEME.text}>
        护甲：{equipment()?.armor?.name ?? "--"}
      </text>
    </box>
  );
}
