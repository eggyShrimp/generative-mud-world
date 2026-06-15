import { For, Show } from "solid-js";
import { buildExitListRows, ENTITY_LIST_COLUMNS } from "../../features/room/entity-list-layout.ts";
import { directionKeyChar } from "../../key-layer/index.ts";
import { THEME } from "../../theme/theme.ts";

export function ExitList(props: {
  exits: Record<
    string,
    {
      to: string;
      directionLabel: string;
      distance: number;
      terrain?: string;
      terrainLabel?: string;
      destinationName?: string;
    }
  >;
}) {
  const rows = () => buildExitListRows(props.exits, directionKeyChar);

  return (
    <Show
      when={rows().length > 0}
      fallback={
        <text selectable={false} fg={THEME.dim}>
          无出口
        </text>
      }
    >
      <box flexDirection="column" gap={0}>
        <For each={rows()}>
          {(row) => (
            <box flexDirection="row" alignItems="center">
              <text selectable={false} fg={THEME.dim} width={ENTITY_LIST_COLUMNS.selector}>
                {"  "}
              </text>
              <text selectable={false} fg={THEME.text} width={ENTITY_LIST_COLUMNS.index}>
                {row.keyText}
              </text>
              <text selectable={false} fg={THEME.text} width={ENTITY_LIST_COLUMNS.name}>
                {row.directionText}
              </text>
              <text selectable={false} fg={THEME.muted} width={ENTITY_LIST_COLUMNS.type}>
                {row.typeText}
              </text>
              <text selectable={false} fg={THEME.dim} width={ENTITY_LIST_COLUMNS.relation}>
                {row.relationText}
              </text>
            </box>
          )}
        </For>
      </box>
    </Show>
  );
}
