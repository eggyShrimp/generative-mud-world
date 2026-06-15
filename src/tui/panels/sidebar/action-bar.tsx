import { For } from "solid-js";
import type { GameClient } from "../../client/game-client.ts";
import { KeyHint } from "../../components/index.ts";
import { bindingLabel, getGlobalBindings } from "../../key-layer/index.ts";
import { THEME } from "../../theme/theme.ts";
import { displayWidth } from "./sidebar-format.ts";

const ACTION_ITEM_GAP = 1;
const PANEL_PADDING_X = 1;
const PANEL_PADDING_Y = 1;
const PANEL_HORIZONTAL_INSET = PANEL_PADDING_X * 2 + 2;

type ActionBinding = ReturnType<typeof getGlobalBindings>[number];

export function ActionBar(props: {
  client: GameClient;
  width: number;
  height: number;
  disabled: boolean;
}) {
  const actionContentWidth = () => Math.max(1, props.width - PANEL_HORIZONTAL_INSET);
  const actionDisplayKey = (binding: ActionBinding) =>
    Array.isArray(binding.key) ? binding.key[0].toUpperCase() : binding.key.toUpperCase();
  const actionItemWidth = (binding: ActionBinding) =>
    displayWidth(`[${actionDisplayKey(binding)}] ${bindingLabel(props.client, binding)}`);
  const actionRows = () => {
    const rows: ActionBinding[][] = [];
    let row: ActionBinding[] = [];
    let rowWidth = 0;

    for (const binding of getGlobalBindings()) {
      const itemWidth = actionItemWidth(binding);
      const nextWidth = row.length === 0 ? itemWidth : rowWidth + ACTION_ITEM_GAP + itemWidth;
      if (row.length > 0 && nextWidth > actionContentWidth()) {
        rows.push(row);
        row = [binding];
        rowWidth = itemWidth;
      } else {
        row.push(binding);
        rowWidth = nextWidth;
      }
    }

    if (row.length > 0) rows.push(row);
    return rows;
  };

  return (
    <box
      border
      title="行动"
      borderColor={THEME.borderMuted}
      backgroundColor={THEME.panelAlt}
      width={props.width}
      height={props.height}
      paddingX={PANEL_PADDING_X}
      paddingY={PANEL_PADDING_Y}
      flexDirection="column"
      gap={0}
      overflow="hidden"
    >
      <For each={actionRows()}>
        {(row) => (
          <box flexDirection="row" gap={ACTION_ITEM_GAP} height={1}>
            <For each={row}>
              {(binding) => {
                const displayKey = actionDisplayKey(binding);
                const label = () => bindingLabel(props.client, binding);
                const itemWidth = () => displayWidth(`[${displayKey}] ${label()}`);
                const available = () =>
                  !props.disabled && (!binding.enabled || binding.enabled(props.client));

                return (
                  <box width={itemWidth()} overflow="hidden">
                    <KeyHint
                      shortcut={displayKey}
                      label={label()}
                      color={available() ? (binding.color ?? THEME.text) : THEME.disabled}
                      selectable={false}
                      onMouseDown={() => {
                        if (!available()) return;
                        if (binding.handler) binding.handler(props.client, "");
                        else if (binding.action)
                          props.client.execute(binding.action, binding.params);
                      }}
                    />
                  </box>
                );
              }}
            </For>
          </box>
        )}
      </For>
    </box>
  );
}
