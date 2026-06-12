// ── PopupPanel ──
// 通用弹窗容器：绝对定位 + 标题 + 内容区 + 可选底部提示。
// 所有面板弹窗的根组件。不读取任何游戏状态。

import { useTerminalDimensions } from "@opentui/solid";
import { Show } from "solid-js";
import { THEME } from "../theme/theme.ts";

export function PopupPanel(props: {
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
