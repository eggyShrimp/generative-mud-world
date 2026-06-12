// ── TradeDetail ──
// 交易详情：物品描述 + 价格 + 持有量。
// 仅由 DialoguePanel 使用（dialogue/ 内部组件）。

import type { TradeOption } from "../../../shared/protocol.ts";
import { THEME } from "../../theme/theme.ts";

export function TradeDetail(props: {
  selection: { option: TradeOption; detail?: string };
  playerCopper: number;
}) {
  const price = () => (props.selection.option.meta?.price as number) ?? 0;
  const currencyName = () => (props.selection.option.meta?.currencyName as string) ?? "铜钱";
  const isSell = () => props.selection.option.action === "sell";
  const actionLabel = () => (props.selection.option.action === "sell" ? "卖出" : "购买");
  const priceLabel = () => (isSell() ? "收购价" : "售价");

  return (
    <box flexDirection="column">
      <text fg={THEME.title} wrapMode="word">
        {props.selection.option.meta?.itemName ?? props.selection.option.label}
      </text>
      {props.selection.detail === undefined ? (
        <text fg={THEME.dim}>正在查看...</text>
      ) : (
        <>
          <text fg={THEME.text} wrapMode="word">
            {props.selection.detail}
          </text>
          {price() > 0 ? (
            <>
              <text fg={THEME.muted}>
                {priceLabel()}：{price()} {currencyName()}
              </text>
              {!isSell() ? (
                <text fg={props.playerCopper >= price() ? THEME.dialogue : THEME.danger}>
                  你的{currencyName()}：{props.playerCopper}
                </text>
              ) : undefined}
            </>
          ) : undefined}
          <text fg={THEME.muted} marginTop={1}>
            [1] {actionLabel()} [Esc] 返回
          </text>
        </>
      )}
    </box>
  );
}
