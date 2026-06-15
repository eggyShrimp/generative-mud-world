import { For, Show } from "solid-js";
import type { RoomEntity } from "../../../shared/protocol.ts";
import {
  buildEntityListRows,
  ENTITY_LIST_COLUMNS,
} from "../../features/room/entity-list-layout.ts";
import { THEME } from "../../theme/theme.ts";
import { relationColor } from "../../theme/tone.ts";

export function EntityList(props: {
  entities: RoomEntity[];
  selectedEntityId?: string;
  onSelect: (entity: RoomEntity) => void;
  relations?: Array<{ targetId: string; level: number; label?: string | null }>;
}) {
  const rows = () => buildEntityListRows(props.entities, props.selectedEntityId, props.relations);

  return (
    <Show
      when={props.entities.length > 0}
      fallback={
        <text selectable={false} fg={THEME.dim}>
          眼前没有可交互目标。
        </text>
      }
    >
      <box flexDirection="column" gap={0}>
        <For each={rows()}>
          {(row) => {
            const selected = () => row.selected;
            return (
              <box flexDirection="row" onMouseDown={() => props.onSelect(row.entity)}>
                <text
                  selectable={false}
                  fg={selected() ? THEME.focus : THEME.dim}
                  width={ENTITY_LIST_COLUMNS.selector}
                >
                  {selected() ? ">" : " "}
                </text>
                <text
                  selectable={false}
                  fg={selected() ? THEME.focus : THEME.text}
                  width={ENTITY_LIST_COLUMNS.index}
                >
                  {row.indexLabel}
                </text>
                <text
                  selectable={false}
                  fg={selected() ? THEME.focus : THEME.text}
                  width={ENTITY_LIST_COLUMNS.name}
                >
                  {row.nameText}
                </text>
                <text selectable={false} fg={THEME.muted} width={ENTITY_LIST_COLUMNS.type}>
                  {row.typeText}
                </text>
                <text
                  selectable={false}
                  fg={row.relation ? relationColor(row.relation.level) : THEME.dim}
                  width={ENTITY_LIST_COLUMNS.relation}
                >
                  {row.relationText}
                </text>
              </box>
            );
          }}
        </For>
      </box>
    </Show>
  );
}
