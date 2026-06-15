// ── DialoguePanel ──
// 对话面板：对话历史 + 选项列表 / 交易列表 + Tab 切换。
// 仅在 isLayerActive("dialogue") 时渲染。
// 通过 InteractionPanel 实现内容区 + 交互区分离。

import { type Accessor, Show } from "solid-js";
import type { DialogueState, GameClient } from "../../client/game-client.ts";
import type { ModalMetrics } from "../../layout/metrics.ts";
import { ChatDialoguePanel } from "./chat-dialogue.tsx";
import { TradeDialoguePanel } from "./trade-dialogue.tsx";

export function DialoguePanel(props: { client: GameClient; metrics: ModalMetrics }) {
  const dialogue = () => props.client.dialogue();
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
              title={title}
              metrics={props.metrics}
              tabLabels={tabLabels}
            />
          }
        >
          <TradeDialoguePanel
            cur={cur}
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
