// ── QuestsPanel ──
// 任务日志面板：左侧任务列表 + 右侧任务详情。
// 仅在 isLayerActive("quests") 时渲染。

import { For, Show } from "solid-js";
import type { QuestInfo } from "../../../shared/protocol.ts";
import type { GameClient } from "../../client/game-client.ts";
import { objectiveProgressText, statusLabel } from "../../features/quests/progress.ts";
import type { ModalMetrics } from "../../layout/metrics.ts";
import { PopupPanel } from "../../layout/popup-panel.tsx";
import { THEME } from "../../theme/theme.ts";

export function QuestsPanel(props: { client: GameClient; metrics: ModalMetrics }) {
  const quests = () => (props.client.entity()?.activeQuests ?? []) as QuestInfo[];
  const selectedIndex = () => props.client.selectedQuestIndex();
  const selectedQuest = () => {
    const idx = selectedIndex();
    return idx !== null ? (quests()[idx] ?? null) : null;
  };

  return (
    <Show when={props.client.isLayerActive("quests")}>
      <PopupPanel
        title="任务日志"
        borderColor={THEME.success}
        backgroundColor={THEME.panel}
        width={props.metrics.width}
        height={props.metrics.height}
        top={props.metrics.top}
        left={props.metrics.left}
        footer={
          selectedIndex() !== null ? "[t]跟踪 [x]放弃 Esc 取消选择" : "选择任务编号，Esc/J 关闭"
        }
      >
        <Show
          when={quests().length > 0}
          fallback={
            <text fg={THEME.muted} paddingLeft={1}>
              没有进行中的任务。
            </text>
          }
        >
          <box flexDirection={"row"} height={props.metrics.bodyHeight}>
            <scrollbox height={props.metrics.bodyHeight} width={28} scrollY>
              <For each={quests()}>
                {(quest, i) => {
                  const selected = () => selectedIndex() === i();
                  const tracked = () => props.client.isTrackingQuest(quest.templateId);
                  const marker = tracked() ? "* " : "  ";
                  const arrow = selected() ? "\u25B8 " : "  ";
                  const progress = () => {
                    if (quest.objectives.length === 0) return "";
                    const done = quest.objectives.filter((o) => o.completed).length;
                    return ` ${done}/${quest.objectives.length}`;
                  };
                  return (
                    <box
                      flexDirection="row"
                      onMouseDown={() => props.client.setSelectedQuestIndex(i())}
                    >
                      <text fg={selected() ? THEME.success : THEME.title} wrapMode="word">
                        {`${arrow}${marker}${i() + 1}. ${quest.title}${progress()}`}
                      </text>
                    </box>
                  );
                }}
              </For>
            </scrollbox>
            <Show when={selectedQuest()}>
              {(quest: () => QuestInfo) => (
                <scrollbox
                  border={["left"]}
                  borderColor={THEME.borderMuted}
                  paddingLeft={1}
                  marginLeft={1}
                  height={props.metrics.bodyHeight}
                  flexGrow={1}
                  scrollY
                >
                  <text fg={THEME.title} wrapMode="word">
                    {quest().title}
                  </text>
                  <text fg={THEME.text} wrapMode="word">
                    {quest().description}
                  </text>
                  <Show when={quest().status !== "active"}>
                    <text fg={quest().status === "completed" ? THEME.success : THEME.danger}>
                      状态：{statusLabel(quest().status)}
                    </text>
                  </Show>
                  <Show when={quest().deadlineDay}>
                    <text fg={THEME.dialogue}>期限：第 {quest().deadlineDay} 天</text>
                  </Show>
                  <Show when={quest().objectives.length > 0}>
                    <text fg={THEME.muted}>─── 目标 ───</text>
                    <For each={quest().objectives}>
                      {(obj) => {
                        const checkmark = () => (obj.completed ? "\u2713" : "\u25CB");
                        const color = () => (obj.completed ? THEME.success : THEME.muted);
                        return (
                          <text fg={color()} wrapMode="word">
                            {` ${checkmark()} ${obj.description} (${objectiveProgressText(obj.current, obj.count)})`}
                          </text>
                        );
                      }}
                    </For>
                  </Show>
                  <Show when={quest().narrative}>
                    <text fg={THEME.muted} wrapMode="word">
                      {quest().narrative}
                    </text>
                  </Show>
                  <Show when={quest().giverNpcId}>
                    <text fg={THEME.dim}>委托人：{quest().giverNpcId}</text>
                  </Show>
                </scrollbox>
              )}
            </Show>
          </box>
        </Show>
      </PopupPanel>
    </Show>
  );
}
