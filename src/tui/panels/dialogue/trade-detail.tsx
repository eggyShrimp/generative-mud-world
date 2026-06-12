// ── TradeDetail ──
// 交易详情：物品描述 + 价格 + 持有量。
// 仅由 DialoguePanel 使用（dialogue/ 内部组件）。

import type { DialogueOption } from "../../../shared/protocol.ts";
import { THEME } from "../../theme/theme.ts";

export function TradeDetail(props: {
  selection: { option: DialogueOption; detail?: string };
  playerCopper: number;
  npcName: string;
}) {
  const price = () => (props.selection.option.meta?.price as number) ?? 0;
  const currencyName = () => (props.selection.option.meta?.currencyName as string) ?? "铜钱";

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
                售价：{price()} {currencyName()}
              </text>
              <text fg={props.playerCopper >= price() ? THEME.dialogue : THEME.danger}>
                持有：{props.playerCopper} {currencyName()}
              </text>
            </>
          ) : undefined}
          <text fg={THEME.muted} marginTop={1}>
            [1] 购买 [Esc] 返回
          </text>
        </>
      )}
    </box>
  );
}
