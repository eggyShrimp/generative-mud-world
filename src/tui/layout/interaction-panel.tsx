// ── InteractionPanel ──
// 互动面板：PopupPanel + 下方交互区（对话选项、交易按钮等）。
// content 区域可滚动，interaction 区域固定在底部，用顶部分隔线隔开。

import { THEME } from "../theme/theme.ts";
import type { ModalMetrics } from "./metrics.ts";
import { computeContentHeight } from "./metrics.ts";
import { PopupPanel } from "./popup-panel.tsx";

export function InteractionPanel(props: {
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
