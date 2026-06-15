import { For, Show } from "solid-js";
import type { GameClient } from "../../client/game-client.ts";
import { percentBar } from "../../theme/progress-format.ts";
import { THEME } from "../../theme/theme.ts";
import { needColor, traitColor } from "../../theme/tone.ts";

const PANEL_PADDING_X = 1;
const PANEL_PADDING_Y = 1;
const PANEL_HORIZONTAL_INSET = PANEL_PADDING_X * 2 + 2;
const NEED_LABEL_WIDTH = 6;
const NEED_VALUE_WIDTH = 4;
const NEED_VALUE_GAP = 1;
const NEED_BAR_MIN_WIDTH = 8;
const NEED_BAR_MAX_WIDTH = 12;
const NEED_LIMIT = 4;
const TRAIT_LIMIT = 2;

export function StatusCard(props: { client: GameClient; width: number; height: number }) {
  const needs = () => props.client.entity()?.needs ?? [];
  const traits = () => props.client.entity()?.traits ?? [];
  const contentWidth = () => Math.max(1, props.width - PANEL_HORIZONTAL_INSET);
  const needBarWidth = () =>
    Math.min(
      NEED_BAR_MAX_WIDTH,
      Math.max(
        NEED_BAR_MIN_WIDTH,
        contentWidth() - NEED_LABEL_WIDTH - NEED_VALUE_WIDTH - NEED_VALUE_GAP,
      ),
    );
  const visibleTraits = () =>
    [...traits()].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, TRAIT_LIMIT);

  const NeedRow = (props: { need: { label: string; value: number } }) => (
    <box flexDirection="row">
      <text selectable={false} fg={needColor(props.need.value)} width={NEED_LABEL_WIDTH}>
        {props.need.label}
      </text>
      <text selectable={false} fg={needColor(props.need.value)} width={needBarWidth()}>
        {percentBar(props.need.value, needBarWidth())}
      </text>
      <text selectable={false} width={NEED_VALUE_GAP}>
        {" "}
      </text>
      <text selectable={false} fg={THEME.text} width={NEED_VALUE_WIDTH}>
        {Math.round(props.need.value)}
      </text>
    </box>
  );

  return (
    <box
      border
      title="状态"
      borderColor={THEME.borderMuted}
      backgroundColor={THEME.panelAlt}
      width={props.width}
      height={props.height}
      paddingX={PANEL_PADDING_X}
      paddingY={PANEL_PADDING_Y}
      flexDirection="column"
      overflow="hidden"
    >
      <box flexDirection="row" gap={2}>
        <box
          flexDirection="column"
          width={NEED_LABEL_WIDTH + needBarWidth() + NEED_VALUE_GAP + NEED_VALUE_WIDTH}
        >
          <Show when={needs().length > 0} fallback={<text fg={THEME.dim}>无需求</text>}>
            <For each={needs().slice(0, NEED_LIMIT)}>{(need) => <NeedRow need={need} />}</For>
          </Show>
        </box>
        <box flexDirection="column" overflow="hidden">
          <text selectable={false} fg={THEME.muted}>
            特质
          </text>
          <Show
            when={visibleTraits().length > 0}
            fallback={
              <text selectable={false} fg={THEME.dim}>
                无
              </text>
            }
          >
            <For each={visibleTraits()}>
              {(trait) => (
                <text selectable={false} fg={traitColor(trait.value)}>
                  {trait.name}
                  {trait.value}
                </text>
              )}
            </For>
          </Show>
        </box>
      </box>
    </box>
  );
}
