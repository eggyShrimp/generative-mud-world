// ── TraveloguePanel ──
// 游记面板：左侧条目列表 + 右侧条目详情。
// 仅在 isLayerActive("travelogue") 时渲染。

import { For, Show } from "solid-js";
import type { GameClient, TravelogueEntry } from "../../client/game-client.ts";
import {
  formatTravelogueLocationLine,
  getTraveloguePanelLayout,
} from "../../features/travelogue/layout.ts";
import type { ModalMetrics } from "../../layout/metrics.ts";
import { PopupPanel } from "../../layout/popup-panel.tsx";
import { THEME } from "../../theme/theme.ts";

export function TraveloguePanel(props: { client: GameClient; metrics: ModalMetrics }) {
  const entries = () => props.client.travelogue();
  const selectedIndex = () => props.client.selectedTravelogueIndex();
  const selectedEntry = () => {
    const idx = selectedIndex();
    return idx !== null ? (entries()[idx] ?? null) : null;
  };
  const layout = () => getTraveloguePanelLayout(props.metrics.width);
  const listWidth = () => layout().listWidth;
  const detailWidth = () => layout().detailWidth;

  return (
    <Show when={props.client.isLayerActive("travelogue")}>
      <PopupPanel
        title="游记"
        borderColor="#d4a574"
        backgroundColor={THEME.panel}
        width={props.metrics.width}
        height={props.metrics.height}
        top={props.metrics.top}
        left={props.metrics.left}
        footer={entries().length > 0 ? "[↑↓/jk]切换 [1-9]选择 [t]关闭" : "[t]关闭"}
      >
        <Show
          when={entries().length > 0}
          fallback={
            <text fg={THEME.muted} paddingLeft={1}>
              暂无游记。在世界上经历一段旅程后，每日结算时将自动生成游记。
            </text>
          }
        >
          <box flexDirection={"row"} height={props.metrics.bodyHeight}>
            <scrollbox height={props.metrics.bodyHeight} width={listWidth()} scrollY>
              <For each={entries()}>
                {(entry, i) => {
                  const selected = () => selectedIndex() === i();
                  const arrow = selected() ? "\u25B8 " : "  ";
                  return (
                    <box
                      flexDirection="column"
                      onMouseDown={() => props.client.setSelectedTravelogueIndex(i())}
                    >
                      <box flexDirection="row">
                        <text
                          fg={selected() ? "#d4a574" : THEME.title}
                          width={listWidth()}
                          wrapMode="word"
                        >
                          {`${arrow}${i() + 1}. ${entry.title}`}
                        </text>
                      </box>
                      <text fg={THEME.dim} width={listWidth()} wrapMode="word">
                        {`    ${entry.date}`}
                      </text>
                    </box>
                  );
                }}
              </For>
            </scrollbox>
            <Show when={selectedEntry()}>
              {(entry: () => TravelogueEntry) =>
                (() => {
                  const locationLine = () => formatTravelogueLocationLine(entry().locationNames);
                  return (
                    <scrollbox
                      border={["left"]}
                      borderColor={THEME.borderMuted}
                      paddingLeft={1}
                      marginLeft={1}
                      height={props.metrics.bodyHeight}
                      width={detailWidth()}
                      scrollY
                    >
                      <text fg="#d4a574" width={detailWidth()} wrapMode="word">
                        {entry().title}
                      </text>
                      <text fg={THEME.dim} width={detailWidth()} wrapMode="word">
                        {entry().date}
                      </text>
                      <Show when={locationLine()}>
                        {(line: () => string) => (
                          <text fg={THEME.muted} width={detailWidth()} wrapMode="word">
                            {line()}
                          </text>
                        )}
                      </Show>
                      <box height={1} />
                      <text fg={THEME.text} width={detailWidth()} wrapMode="word">
                        {entry().narrative}
                      </text>
                    </scrollbox>
                  );
                })()
              }
            </Show>
          </box>
        </Show>
      </PopupPanel>
    </Show>
  );
}
