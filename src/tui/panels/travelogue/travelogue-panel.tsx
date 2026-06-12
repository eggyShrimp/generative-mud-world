// ── TraveloguePanel ──
// 游记面板：左侧条目列表 + 右侧条目详情。
// 仅在 isLayerActive("travelogue") 时渲染。

import { For, Show } from "solid-js";
import type { GameClient, TravelogueEntry } from "../../client/game-client.ts";
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
          <box
            flexDirection={props.metrics.narrow ? "column" : "row"}
            height={props.metrics.bodyHeight}
          >
            <scrollbox
              height={
                props.metrics.narrow
                  ? Math.max(3, Math.floor(props.metrics.bodyHeight / 2))
                  : props.metrics.bodyHeight
              }
              width={props.metrics.narrow ? "100%" : 28}
              scrollY
            >
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
                        <text fg={selected() ? "#d4a574" : THEME.title} wrapMode="word">
                          {`${arrow}${i() + 1}. ${entry.title}`}
                        </text>
                      </box>
                      <text fg={THEME.dim}>{`    ${entry.date}`}</text>
                    </box>
                  );
                }}
              </For>
            </scrollbox>
            <Show when={selectedEntry()}>
              {(entry: () => TravelogueEntry) => (
                <scrollbox
                  border={["left"]}
                  borderColor={THEME.borderMuted}
                  paddingLeft={1}
                  marginLeft={1}
                  height={
                    props.metrics.narrow
                      ? Math.max(
                          3,
                          props.metrics.bodyHeight -
                            Math.max(3, Math.floor(props.metrics.bodyHeight / 2)),
                        )
                      : props.metrics.bodyHeight
                  }
                  width={props.metrics.narrow ? "100%" : undefined}
                  flexGrow={props.metrics.narrow ? undefined : 1}
                  scrollY
                >
                  <text fg="#d4a574">{entry().title}</text>
                  <text fg={THEME.dim}>{entry().date}</text>
                  <Show when={entry().locations.length > 0}>
                    <text fg={THEME.muted} wrapMode="word">
                      途经：{entry().locations.join(" → ")}
                    </text>
                  </Show>
                  <box height={1} />
                  <text fg={THEME.text} wrapMode="word">
                    {entry().narrative}
                  </text>
                </scrollbox>
              )}
            </Show>
          </box>
        </Show>
      </PopupPanel>
    </Show>
  );
}
