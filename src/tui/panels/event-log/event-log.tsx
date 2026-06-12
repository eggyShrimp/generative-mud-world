// ── EventLog ──
// 事件日志列表：滚动区域，每行由前缀符号 + 正文组成。
// 前缀颜色由事件类型决定（通过 getEventStyle）。
// pendingEvent 表示正在等待服务端响应时的占位行。

import { For, Show } from "solid-js";
import type { LogEntry } from "../../client/game-client.ts";
import { getEventStyle } from "../../theme/event-style.ts";
import { THEME } from "../../theme/theme.ts";

export function EventLog(props: {
  events: LogEntry[];
  height: number;
  pendingEvent?: { type: string; description: string } | null;
}) {
  return (
    <scrollbox
      border
      borderColor={THEME.borderMuted}
      backgroundColor={THEME.panelAlt}
      title="事件日志"
      padding={1}
      height={props.height}
      stickyScroll
      stickyStart="bottom"
    >
      <For each={props.events}>
        {(event) => {
          const style = getEventStyle(event.type);
          return (
            <box flexDirection="row" alignItems="flex-start">
              <text selectable={false} fg={style.color} width={4}>
                {style.prefix}
              </text>
              <text wrapMode="word" fg={style.color} flexGrow={1}>
                {event.description}
              </text>
            </box>
          );
        }}
      </For>
      <Show when={props.pendingEvent} keyed>
        {(pe: { type: string; description: string }) => (
          <box flexDirection="row" alignItems="flex-start">
            <text selectable={false} fg={THEME.muted} width={4}>
              ···
            </text>
            <text wrapMode="word" fg={THEME.muted} flexGrow={1}>
              {pe.description}
            </text>
          </box>
        )}
      </Show>
    </scrollbox>
  );
}
