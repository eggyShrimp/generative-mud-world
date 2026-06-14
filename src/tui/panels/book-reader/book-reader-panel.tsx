// ── BookReaderPanel ──
// 分页阅读器：展示 command_result.bookDisplay 的当前页。

import type { ScrollBoxRenderable } from "@opentui/core";
import { type Accessor, createEffect, Show } from "solid-js";
import type { BookReaderState, GameClient } from "../../client/game-client.ts";
import type { ModalMetrics } from "../../layout/metrics.ts";
import { PopupPanel } from "../../layout/popup-panel.tsx";
import { THEME } from "../../theme/theme.ts";

export function BookReaderPanel(props: { client: GameClient; metrics: ModalMetrics }) {
  let scrollBox: ScrollBoxRenderable | undefined;
  const reader = () => props.client.bookReader();
  const currentPage = () => {
    const state = reader();
    return state ? (state.pages[state.pageIndex] ?? "") : "";
  };
  const pageLabel = () => {
    const state = reader();
    return state ? `${state.pageIndex + 1} / ${state.pages.length}` : "";
  };

  createEffect(() => {
    const state = reader();
    if (scrollBox && state) {
      scrollBox.scrollTop = state.scrollTop;
    }
  });

  return (
    <Show when={props.client.isLayerActive("book-reader") && reader()}>
      {(state: Accessor<BookReaderState>) => (
        <PopupPanel
          title={`${state().title}  ${pageLabel()}`}
          borderColor={THEME.travelogue}
          backgroundColor={THEME.panel}
          width={props.metrics.width}
          height={props.metrics.height}
          top={props.metrics.top}
          left={props.metrics.left}
          footer="[↑/k]上滚 [↓/j]下滚 [←/h]上一页 [→/l/space]下一页 [Esc/q]关闭"
        >
          <box height={props.metrics.bodyHeight} flexDirection="column">
            <scrollbox ref={scrollBox} height={props.metrics.bodyHeight} scrollY>
              <text fg={THEME.text} wrapMode="word">
                {currentPage()}
              </text>
            </scrollbox>
          </box>
        </PopupPanel>
      )}
    </Show>
  );
}
