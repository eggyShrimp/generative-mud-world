// ── DialoguePanel ──
// 对话面板：对话历史 + 选项列表 / 交易列表 + Tab 切换。
// 仅在 isLayerActive("dialogue") 时渲染。
// 通过 InteractionPanel 实现内容区 + 交互区分离。

import { type Accessor, For, Show } from "solid-js";
import {
  type DialogueState,
  type GameClient,
  getDialogueVisibleOptions,
  isDialogueTabLoading,
} from "../../client/game-client.ts";
import { KeyHint, LoadingHint, TabBar } from "../../components/index.ts";
import { InteractionPanel } from "../../layout/interaction-panel.tsx";
import type { ModalMetrics } from "../../layout/metrics.ts";
import { computeContentHeight } from "../../layout/metrics.ts";
import { THEME } from "../../theme/theme.ts";
import { TradeDetail } from "./trade-detail.tsx";

export function DialoguePanel(props: { client: GameClient; metrics: ModalMetrics }) {
  const dialogue = () => props.client.dialogue();
  const isLoading = () => {
    const d = dialogue();
    return d !== null && isDialogueTabLoading(d);
  };
  const entity = () => props.client.entity();

  const title = () => {
    const d = dialogue();
    if (!d) return "";
    if (d.activeTab === "trade") return `交易：${d.npcName}`;
    return `对话：${d.npcName}`;
  };

  const playerCopper = () => {
    const inv = entity()?.inventory ?? [];
    return inv.filter((i) => i.templateId === "copper_coin").length;
  };

  // Tab 标签映射：键名 → 中文显示
  const tabLabels: Record<string, string> = { chat: "对话", trade: "交易" };

  return (
    <Show when={dialogue()}>
      {(cur: Accessor<DialogueState>) => (
        <Show
          when={cur().activeTab === "trade"}
          fallback={
            <ChatDialoguePanel
              cur={cur}
              isLoading={isLoading}
              title={title}
              metrics={props.metrics}
              tabLabels={tabLabels}
            />
          }
        >
          <TradeDialoguePanel
            cur={cur}
            isLoading={isLoading}
            title={title}
            metrics={props.metrics}
            playerCopper={playerCopper}
            tabLabels={tabLabels}
          />
        </Show>
      )}
    </Show>
  );
}

function TradeDialoguePanel(props: {
  cur: Accessor<DialogueState>;
  isLoading: () => boolean;
  title: () => string;
  metrics: ModalMetrics;
  playerCopper: () => number;
  tabLabels: Record<string, string>;
}) {
  const trade = () => props.cur().tabs.trade;
  const selected = () => trade().selected;
  const listWidth = () =>
    selected() ? Math.max(16, Math.floor(props.metrics.width * 0.35)) : props.metrics.width - 2;
  const contentH = () => computeContentHeight(props.metrics.bodyHeight, 2);

  return (
    <InteractionPanel
      title={props.title()}
      borderColor={THEME.focus}
      backgroundColor={THEME.popup}
      metrics={props.metrics}
      interactionHeight={2}
      content={
        <box flexDirection="row" height={contentH()}>
          <scrollbox height={contentH()} width={listWidth()} scrollY>
            <Show
              when={props.isLoading()}
              fallback={
                <Show
                  when={trade().options.length > 0}
                  fallback={
                    <text selectable={false} fg={THEME.dim}>
                      没有可交易的物品。
                    </text>
                  }
                >
                  <For each={trade().options}>
                    {(opt, i) => (
                      <KeyHint
                        shortcut={i() + 1}
                        label={opt.label}
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
          </scrollbox>
          <Show when={selected()}>
            {(sel: Accessor<NonNullable<DialogueState["tabs"]["trade"]["selected"]>>) => (
              <scrollbox
                border={["left"]}
                borderColor={THEME.borderMuted}
                paddingLeft={1}
                marginLeft={1}
                height={contentH()}
                flexGrow={1}
                scrollY
              >
                <TradeDetail selection={sel()} playerCopper={props.playerCopper()} />
              </scrollbox>
            )}
          </Show>
        </box>
      }
      interaction={
        <TabBar
          tabs={props.cur().availableTabs}
          active={props.cur().activeTab}
          labels={props.tabLabels}
        />
      }
    />
  );
}

function ChatDialoguePanel(props: {
  cur: Accessor<DialogueState>;
  isLoading: () => boolean;
  title: () => string;
  metrics: ModalMetrics;
  tabLabels: Record<string, string>;
}) {
  const visibleOptions = () => getDialogueVisibleOptions(props.cur());

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
              when={props.isLoading()}
              fallback={
                <Show
                  when={visibleOptions().length > 0}
                  fallback={
                    <text selectable={false} fg={THEME.dim}>
                      没有可选回应。
                    </text>
                  }
                >
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
