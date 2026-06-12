// ── StatusPanel ──
// 角色状态面板：装备/生命/需求/特质四个 Section。
// 仅在 isLayerActive("status") 时渲染。

import { For, Show } from "solid-js";
import type { EntityCombatState, EntityEquipment } from "../../../shared/protocol.ts";
import type { GameClient } from "../../client/game-client.ts";
import { BarRow, EmptyState, Section } from "../../components/index.ts";
import type { ModalMetrics } from "../../layout/metrics.ts";
import { PopupPanel } from "../../layout/popup-panel.tsx";
import { percentBar, signedPercentBar } from "../../theme/progress-format.ts";
import { THEME } from "../../theme/theme.ts";
import { needColor, traitColor } from "../../theme/tone.ts";

const EQUIP_COLS = { label: 4 };
const COMBAT_COLS = { label: 6, bar: 10, value: 11 };
const NEED_COLS = { label: 6, bar: 10, value: 5 };
const TRAIT_COLS = { label: 8, bar: 11, value: 5 };
const NEED_ROW_WIDTH = NEED_COLS.label + NEED_COLS.bar + NEED_COLS.value + 1;
const NEED_COLUMN_GAP = 2;

function NeedRow(props: { need: { label: string; value: number } }) {
  return (
    <BarRow
      label={props.need.label}
      bar={percentBar(props.need.value)}
      value={String(Math.round(props.need.value))}
      labelWidth={NEED_COLS.label}
      barWidth={NEED_COLS.bar}
      valueWidth={NEED_COLS.value}
      color={needColor(props.need.value)}
      valueColor={THEME.text}
      paddingLeft={0}
    />
  );
}

export function StatusPanel(props: { client: GameClient; metrics: ModalMetrics }) {
  const entity = () => props.client.entity();
  const equipment = () => entity()?.equipment;
  const combatState = () => entity()?.combatState;
  const needs = () => entity()?.needs ?? [];
  const traits = () => entity()?.traits ?? [];

  const needColumns = () =>
    props.metrics.width >= NEED_ROW_WIDTH * 2 + NEED_COLUMN_GAP + 8 ? 2 : 1;

  const needRows = () => {
    const n = needs();
    if (needColumns() === 1) return n.map((need) => [need]);
    const rows = [];
    for (let i = 0; i < n.length; i += 2) {
      rows.push(n.slice(i, i + 2));
    }
    return rows;
  };

  return (
    <Show when={props.client.isLayerActive("status")}>
      <PopupPanel
        title={`角色状态 · ${entity()?.name ?? "?"}`}
        borderColor={THEME.focus}
        backgroundColor={THEME.panel}
        width={props.metrics.width}
        height={props.metrics.height}
        top={props.metrics.top}
        left={props.metrics.left}
        footer="Q/Esc 关闭"
      >
        <scrollbox height={props.metrics.bodyHeight} scrollY>
          <Section title="装备" color={THEME.title}>
            <Show when={equipment()} fallback={<EmptyState type="装备" color={THEME.dim} />}>
              {(eq: () => EntityEquipment) => (
                <box flexDirection="row" gap={6} paddingLeft={2}>
                  <box flexDirection="row">
                    <text selectable={false} fg={THEME.text} width={EQUIP_COLS.label}>
                      武器
                    </text>
                    <text selectable={false} fg={THEME.text}>
                      {eq()?.weapon?.name ?? "--"}
                    </text>
                  </box>
                  <box flexDirection="row">
                    <text selectable={false} fg={THEME.text} width={EQUIP_COLS.label}>
                      护甲
                    </text>
                    <text selectable={false} fg={THEME.text}>
                      {eq()?.armor?.name ?? "--"}
                    </text>
                  </box>
                </box>
              )}
            </Show>
          </Section>
          <box height={1} />
          <Section title="生命" color={THEME.title}>
            <Show when={combatState()} fallback={<EmptyState type="战斗数据" color={THEME.dim} />}>
              {(cs: () => EntityCombatState) => {
                const hp = () => cs()?.hp ?? 0;
                const maxHp = () => cs()?.maxHp ?? 1;
                const ratio = () => Math.round((hp() / maxHp()) * 100);
                return (
                  <BarRow
                    label="生命"
                    bar={percentBar(ratio())}
                    value={`${hp()}/${maxHp()}`}
                    labelWidth={COMBAT_COLS.label}
                    barWidth={COMBAT_COLS.bar}
                    valueWidth={COMBAT_COLS.value}
                    color={needColor(ratio())}
                    valueColor={THEME.text}
                  />
                );
              }}
            </Show>
          </Section>
          <box height={1} />
          <Section title="需求" color={THEME.title}>
            <Show when={needs().length > 0} fallback={<EmptyState type="需求" color={THEME.dim} />}>
              <box flexDirection="column" gap={1} paddingLeft={2}>
                <For each={needRows()}>
                  {(row) => (
                    <box flexDirection="row" gap={NEED_COLUMN_GAP}>
                      <box width={NEED_ROW_WIDTH}>
                        <NeedRow need={row[0]} />
                      </box>
                      {row[1] ? (
                        <box width={NEED_ROW_WIDTH}>
                          <NeedRow need={row[1]} />
                        </box>
                      ) : undefined}
                    </box>
                  )}
                </For>
              </box>
            </Show>
          </Section>
          <box height={1} />
          <Section title="特质" color={THEME.title}>
            <Show
              when={traits().length > 0}
              fallback={<EmptyState type="特质" color={THEME.dim} />}
            >
              <box flexDirection="column" gap={1}>
                <For each={traits()}>
                  {(trait) => (
                    <BarRow
                      label={trait.name}
                      bar={signedPercentBar(trait.value)}
                      value={String(trait.value)}
                      labelWidth={TRAIT_COLS.label}
                      barWidth={TRAIT_COLS.bar}
                      valueWidth={TRAIT_COLS.value}
                      color={traitColor(trait.value)}
                      valueColor={THEME.text}
                    />
                  )}
                </For>
              </box>
            </Show>
          </Section>
        </scrollbox>
      </PopupPanel>
    </Show>
  );
}
