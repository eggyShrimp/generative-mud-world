import { For, Show } from "solid-js";
import { KeyHintRow, SectionTitle } from "../../components/index.ts";
import { THEME } from "../../theme/theme.ts";

export function RoomActionList(props: {
  room: { roomActions?: Array<{ id: string; label: string }> } | null;
  onExecute: (actionId: string) => void;
}) {
  const actions = () => props.room?.roomActions ?? [];
  return (
    <Show
      when={actions().length > 0}
      fallback={
        <text selectable={false} fg={THEME.dim}>
          此处无事可做。
        </text>
      }
    >
      <SectionTitle label="此处可做事" color={THEME.muted} />
      <box flexDirection="column" gap={0}>
        <For each={actions()}>
          {(action, i) => (
            <box flexDirection="row" onMouseDown={() => props.onExecute(action.id)}>
              <text selectable={false} fg={THEME.dim} width={2}>
                {"  "}
              </text>
              <KeyHintRow
                shortcut={String.fromCharCode(65 + i())}
                label={action.label}
                color={THEME.exit}
              />
            </box>
          )}
        </For>
      </box>
    </Show>
  );
}
