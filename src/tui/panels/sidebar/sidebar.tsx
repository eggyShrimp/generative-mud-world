// ── Sidebar ──
// 底部 2 行横栏：需求行 + 行动行。

import { createEffect, createMemo, For, Show } from "solid-js";
import { logWrite } from "../../../shared/log.ts";
import type { GameClient } from "../../client/game-client.ts";
import { KeyHint } from "../../components/index.ts";
import { bindingLabel, getGlobalBindings } from "../../key-layer/index.ts";
import { percentBar } from "../../theme/progress-format.ts";
import { THEME } from "../../theme/theme.ts";
import { needColor } from "../../theme/tone.ts";

export function Sidebar(props: { client: GameClient; height?: number }) {
  const needs = () => props.client.entity()?.needs ?? [];
  const topLayer = createMemo(() => props.client.activeLayer());
  const disabled = createMemo(
    () => props.client.hasActiveRequest() || (topLayer().id !== "base" && !topLayer().passthrough),
  );

  const ActionButtons = () => (
    <For each={getGlobalBindings()}>
      {(binding) => {
        const displayKey = Array.isArray(binding.key)
          ? binding.key[0].toUpperCase()
          : binding.key.toUpperCase();
        const available = () => !disabled() && (!binding.enabled || binding.enabled(props.client));

        createEffect(() => {
          const keyStr = Array.isArray(binding.key) ? binding.key[0] : binding.key;
          logWrite(
            "cli",
            "dbg",
            `${keyStr}: available=${available()} disabled=${disabled()} caps=${props.client.capabilities()?.length}`,
          );
        });
        return (
          <KeyHint
            shortcut={displayKey}
            label={bindingLabel(props.client, binding)}
            color={available() ? (binding.color ?? THEME.text) : THEME.disabled}
            selectable={false}
            onMouseDown={() => {
              if (!available()) return;
              if (binding.handler) binding.handler(props.client, "");
              else if (binding.action) props.client.execute(binding.action, binding.params);
            }}
          />
        );
      }}
    </For>
  );

  return (
    <box
      border={["top"]}
      borderColor={THEME.borderMuted}
      backgroundColor={THEME.panelAlt}
      height={3}
      paddingX={1}
      flexDirection="column"
      gap={0}
    >
      <Show when={needs().length > 0}>
        <box flexDirection="row" gap={3} height={1} paddingX={1}>
          <For each={needs()}>
            {(need) => (
              <box flexDirection="row" gap={1}>
                <text selectable={false} fg={needColor(need.value)}>
                  {need.label}
                </text>
                <text selectable={false} fg={needColor(need.value)}>
                  {percentBar(need.value)}
                </text>
                <text selectable={false} fg={THEME.text}>
                  {Math.round(need.value)}
                </text>
              </box>
            )}
          </For>
        </box>
      </Show>
      <box flexDirection="row" gap={2} height={1} paddingX={1} alignItems="center">
        <ActionButtons />
      </box>
    </box>
  );
}
