// ── EndDayPanel ──
// 结束当天面板：ConfirmEndDayModal（休息选项）+ SettlementModal（结算等待）。
// 仅在对应 layer 激活时渲染。

import { For, Show } from "solid-js";
import type { GameClient } from "../../client/game-client.ts";
import { KeyHint } from "../../components/index.ts";
import type { ModalMetrics } from "../../layout/metrics.ts";
import { PopupPanel } from "../../layout/popup-panel.tsx";
import { THEME } from "../../theme/theme.ts";

// ── ConfirmEndDayModal ──
// 选择休息方式的确认弹窗。

function ConfirmEndDayModal(props: { client: GameClient; metrics: ModalMetrics }) {
  const options = () => props.client.endDayOptions();
  const metrics = () => ({
    ...props.metrics,
    height: Math.min(props.metrics.height, options().length + 6),
    bodyHeight: Math.min(props.metrics.bodyHeight, options().length + 2),
  });

  return (
    <Show when={props.client.isLayerActive("confirm-end-day") && options().length > 0}>
      {() => (
        <PopupPanel
          title="结束今天"
          borderColor="#d6a94f"
          backgroundColor={THEME.popup}
          width={metrics().width}
          height={metrics().height}
          top={metrics().top}
          left={metrics().left}
          footer="0 取消"
        >
          <box height={metrics().bodyHeight} flexDirection="column">
            <For each={options()}>
              {(option, index) => (
                <KeyHint
                  shortcut={index() + 1}
                  label={
                    option.durability != null && option.durability > 0
                      ? `${option.label}   精力 +${option.restRecovery} (×${option.durability})`
                      : `${option.label}   精力 +${option.restRecovery}`
                  }
                  color={THEME.text}
                  selectable={false}
                  onMouseDown={() => props.client.confirmEndDay(option)}
                />
              )}
            </For>
          </box>
        </PopupPanel>
      )}
    </Show>
  );
}

// ── SettlementModal ──
// 结算等待提示弹窗。

function SettlementModal(props: { client: GameClient; metrics: ModalMetrics }) {
  const metrics = () => ({
    ...props.metrics,
    height: 5,
    bodyHeight: 1,
  });

  return (
    <Show when={props.client.settlementPending()}>
      {() => (
        <PopupPanel
          title="结算中"
          borderColor={THEME.dialogue}
          backgroundColor={THEME.popup}
          width={metrics().width}
          height={metrics().height}
          top={metrics().top}
          left={metrics().left}
          showFooter={false}
        >
          <box height={metrics().bodyHeight} flexDirection="column">
            <text selectable={false} fg={THEME.muted}>
              夜深了，世界正在沉淀这一天的故事...
            </text>
          </box>
        </PopupPanel>
      )}
    </Show>
  );
}

// ── EndDayPanel ──
// 组装两个结束天弹窗。

export function EndDayPanel(props: { client: GameClient; metrics: ModalMetrics }) {
  return (
    <>
      <ConfirmEndDayModal client={props.client} metrics={props.metrics} />
      <SettlementModal client={props.client} metrics={props.metrics} />
    </>
  );
}
