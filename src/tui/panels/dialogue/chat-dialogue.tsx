import { type Accessor, For, Show } from "solid-js";
import {
  type DialogueState,
  getDialogueVisibleOptions,
  isDialogueTabLoading,
} from "../../client/game-client.ts";
import { KeyHint, LoadingHint, TabBar } from "../../components/index.ts";
import { InteractionPanel } from "../../layout/interaction-panel.tsx";
import type { ModalMetrics } from "../../layout/metrics.ts";
import { THEME } from "../../theme/theme.ts";

export function ChatDialoguePanel(props: {
  cur: Accessor<DialogueState>;
  title: () => string;
  metrics: ModalMetrics;
  tabLabels: Record<string, string>;
}) {
  const visibleOptions = () => getDialogueVisibleOptions(props.cur());
  const isLoading = () => isDialogueTabLoading(props.cur());

  return (
    <InteractionPanel
      title={props.title()}
      borderColor={THEME.focus}
      backgroundColor={THEME.popup}
      metrics={props.metrics}
      interactionHeight={8}
      content={
        <Show
          when={props.cur().tabs.chat.history.length > 0}
          fallback={
            <box flexDirection="column">
              <text fg={THEME.title}>{props.cur().npcName}</text>
              <text fg={THEME.muted}>{props.cur().npcDescription ?? "人物"}</text>
            </box>
          }
        >
          <For each={props.cur().tabs.chat.history}>
            {(entry) => (
              <text wrapMode="word" fg={entry.speaker === "player" ? "#6fc3bd" : THEME.dialogue}>
                {entry.speaker === "player" ? "你" : props.cur().npcName}：{entry.content}
              </text>
            )}
          </For>
        </Show>
      }
      interaction={
        <box flexDirection="column" flexGrow={1}>
          <box flexGrow={1}>
            <Show
              when={isLoading()}
              fallback={
                <Show
                  when={visibleOptions().length > 0}
                  fallback={
                    <text selectable={false} fg={THEME.dim}>
                      没有可选回应。
                    </text>
                  }
                >
                  <Show when={props.cur().followUpContext}>
                    <text selectable={false} fg={THEME.muted} wrapMode="word">
                      追问："{props.cur().followUpContext}"
                    </text>
                  </Show>
                  <For each={visibleOptions()}>
                    {(option, index) => (
                      <KeyHint
                        shortcut={index() + 1}
                        label={option.label}
                        tag={option.tag}
                        color={THEME.dialogue}
                        wrapMode="word"
                      />
                    )}
                  </For>
                </Show>
              }
            >
              <LoadingHint color={THEME.muted} text="正在思考中..." />
            </Show>
          </box>
          <box marginTop={1}>
            <TabBar
              tabs={props.cur().availableTabs}
              active={props.cur().activeTab}
              labels={props.tabLabels}
            />
          </box>
        </box>
      }
    />
  );
}
