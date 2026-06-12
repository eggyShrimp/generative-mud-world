// ── Sidebar ──
// 侧栏：需求条 + 全局操作按钮。
// narrow=true 时单行横向排列（仅操作按钮，无需求条）。
// narrow=false 时竖向排列，30 列宽带边框。

import { createMemo, For, Show } from "solid-js";
import type { GameClient } from "../../client/game-client.ts";
import { KeyHint, SectionTitle } from "../../components/index.ts";
import { bindingLabel, getGlobalBindings } from "../../key-layer/index.ts";
import { percentBar } from "../../theme/progress-format.ts";
import { THEME } from "../../theme/theme.ts";
import { needColor } from "../../theme/tone.ts";

export function Sidebar(props: { client: GameClient; height?: number; narrow?: boolean }) {
  const needs = () => props.client.entity()?.needs ?? [];
  const topLayer = createMemo(() => props.client.activeLayer());
  const disabled = createMemo(
    () => props.client.hasActiveRequest() || (topLayer().id !== "base" && !topLayer().passthrough),
  );

  if (props.narrow) {
    return (
      <box
        height={1}
        paddingX={1}
        backgroundColor={THEME.panelAlt}
        flexDirection="row"
        gap={2}
        flexWrap="wrap"
      >
        <SectionTitle label="行动" color={THEME.muted} marginBottom={0} />
        <For each={getGlobalBindings()}>
          {(binding) => {
            const displayKey = Array.isArray(binding.key)
              ? binding.key[0].toUpperCase()
              : binding.key.toUpperCase();
            const available = () =>
              !disabled() && (!binding.enabled || binding.enabled(props.client));
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
      </box>
    );
  }

  return (
    <box
      border
      borderColor={THEME.borderMuted}
      backgroundColor={THEME.panelAlt}
      title="角色状态"
      padding={1}
      flexDirection="column"
      width={30}
      height={props.height}
      gap={1}
    >
      <Show
        when={needs().length > 0}
        fallback={
          <text selectable={false} fg={THEME.dim}>
            暂无状态
          </text>
        }
      >
        <For each={needs()}>
          {(need) => (
            <box flexDirection="row">
              <text selectable={false} fg={needColor(need.value)} width={6}>
                {need.label}
              </text>
              <text selectable={false} fg={needColor(need.value)} width={10}>
                {percentBar(need.value)}
              </text>
              <text selectable={false} width={1}>
                {" "}
              </text>
              <text selectable={false} fg={THEME.text}>
                {Math.round(need.value)}
              </text>
            </box>
          )}
        </For>
      </Show>

      <box border={["top"]} borderColor={THEME.borderMuted} paddingTop={1} flexDirection="column">
        <SectionTitle label="行动" color={THEME.muted} />
        <For each={getGlobalBindings()}>
          {(binding) => {
            const displayKey = Array.isArray(binding.key)
              ? binding.key[0].toUpperCase()
              : binding.key.toUpperCase();
            const available = () =>
              !disabled() && (!binding.enabled || binding.enabled(props.client));
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
      </box>
    </box>
  );
}
