// ── CombatPanel ──
// 战斗面板：双方 HP + 战斗日志 + 操作提示。
// 仅在 isLayerActive("combat") 时渲染。

import { For, Show } from "solid-js";
import type { RoomEntity } from "../../../shared/protocol.ts";
import type { GameClient } from "../../client/game-client.ts";
import { KeyHint } from "../../components/index.ts";
import { combatEventColor, combatHpColor, combatHpText } from "../../features/combat/formatting.ts";
import type { ModalMetrics } from "../../layout/metrics.ts";
import { PopupPanel } from "../../layout/popup-panel.tsx";
import { THEME } from "../../theme/theme.ts";

export function CombatPanel(props: {
  client: GameClient;
  entities: RoomEntity[];
  metrics: ModalMetrics;
}) {
  const entity = () => props.client.entity();
  const combatState = () => entity()?.combatState;
  const targetEntity = () => {
    const cs = combatState();
    if (!cs?.combatTarget) return null;
    return props.entities.find((e) => e.id === cs.combatTarget) ?? null;
  };
  const log = () => props.client.combatLog();
  const round = () => props.client.combatRound();

  return (
    <Show when={props.client.isLayerActive("combat")}>
      <PopupPanel
        title={`战斗 — 第 ${round()} 回合`}
        borderColor="#ff6b44"
        backgroundColor={THEME.popup}
        width={props.metrics.width}
        height={props.metrics.height}
        top={props.metrics.top}
        left={props.metrics.left}
        showFooter={false}
      >
        {/* 双方 HP */}
        <box flexDirection="row" gap={4} marginBottom={1}>
          <box flexDirection="column" flexGrow={1}>
            <text selectable={false} fg={THEME.title}>
              {entity()?.name ?? "你"}
            </text>
            <text
              selectable={false}
              fg={combatHpColor(combatState()?.hp ?? 0, combatState()?.maxHp ?? 50)}
            >
              {combatHpText(combatState()?.hp ?? 0, combatState()?.maxHp ?? 50)}
            </text>
            {combatState()?.isDefending ? (
              <text selectable={false} fg="#6fc3bd">
                ◇ 防御中
              </text>
            ) : undefined}
          </box>
          <box flexDirection="column" flexGrow={1}>
            <text selectable={false} fg="#ff9944">
              {targetEntity()?.name ?? "???"}
            </text>
            <text
              selectable={false}
              fg={combatHpColor(
                targetEntity()?.combatState?.hp ?? 0,
                targetEntity()?.combatState?.maxHp ?? 50,
              )}
            >
              {combatHpText(
                targetEntity()?.combatState?.hp ?? 0,
                targetEntity()?.combatState?.maxHp ?? 50,
              )}
            </text>
          </box>
        </box>

        {/* 战斗日志 */}
        <box flexDirection="column" flexGrow={1}>
          <scrollbox
            height={Math.max(1, props.metrics.bodyHeight - 6)}
            scrollY
            stickyScroll
            stickyStart="bottom"
          >
            <For each={log()}>
              {(entry) => (
                <box flexDirection="row">
                  <text selectable={false} fg={THEME.dim} width={5}>
                    {entry.round > 0 ? `R${entry.round}` : ""}
                  </text>
                  <text
                    selectable={false}
                    fg={combatEventColor(entry.type)}
                    wrapMode="word"
                    flexGrow={1}
                  >
                    {entry.description}
                  </text>
                </box>
              )}
            </For>
            <Show when={log().length === 0}>
              <text selectable={false} fg={THEME.dim}>
                战斗开始！
              </text>
            </Show>
          </scrollbox>
        </box>

        {/* 操作提示 */}
        <box
          border={["top"]}
          borderColor={THEME.borderMuted}
          paddingTop={1}
          flexDirection="row"
          gap={3}
        >
          <KeyHint shortcut="D" label="防御" color="#6fc3bd" selectable={false} />
          <KeyHint shortcut="F" label="逃跑" color="#d39746" selectable={false} />
          <KeyHint shortcut="Esc" label="撤退" color={THEME.dim} selectable={false} />
        </box>
      </PopupPanel>
    </Show>
  );
}
