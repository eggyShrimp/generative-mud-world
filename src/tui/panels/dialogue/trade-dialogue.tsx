import { type Accessor, For, Show } from "solid-js";
import { type DialogueState, isDialogueTabLoading } from "../../client/game-client.ts";
import { KeyHint, LoadingHint, TabBar } from "../../components/index.ts";
import { InteractionPanel } from "../../layout/interaction-panel.tsx";
import type { ModalMetrics } from "../../layout/metrics.ts";
import { computeContentHeight } from "../../layout/metrics.ts";
import { THEME } from "../../theme/theme.ts";
import { TradeDetail } from "./trade-detail.tsx";

export function TradeDialoguePanel(props: {
  cur: Accessor<DialogueState>;
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
  const isLoading = () => isDialogueTabLoading(props.cur());

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
              when={isLoading()}
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
