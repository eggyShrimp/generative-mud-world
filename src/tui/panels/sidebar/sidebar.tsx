// ── Sidebar ──
// 左侧控制区：角色/状态摘要 + 单行动作栏。

import { createMemo } from "solid-js";
import type { GameClient } from "../../client/game-client.ts";
import { ActionBar } from "./action-bar.tsx";
import { RoleCard } from "./role-card.tsx";
import { StatusCard } from "./status-card.tsx";

const DEFAULT_HEIGHT = 10;
const ACTION_BAR_HEIGHT = 5;
const PANEL_GAP = 1;
const ROLE_MIN_WIDTH = 22;
const STATUS_MIN_WIDTH = 24;

export function Sidebar(props: { client: GameClient; width?: number; height?: number }) {
  const topLayer = createMemo(() => props.client.activeLayer());
  const disabled = createMemo(
    () => props.client.hasActiveRequest() || (topLayer().id !== "base" && !topLayer().passthrough),
  );

  const panelWidth = () => Math.max(1, props.width ?? 80);
  const panelHeight = () => Math.max(4, props.height ?? DEFAULT_HEIGHT);
  const actionBarHeight = () =>
    Math.min(ACTION_BAR_HEIGHT, Math.max(2, panelHeight() - PANEL_GAP - 1));
  const infoHeight = () => Math.max(1, panelHeight() - actionBarHeight() - PANEL_GAP);
  const infoContentWidth = () => Math.max(1, panelWidth() - PANEL_GAP);
  const roleWidth = () => {
    const availableWidth = infoContentWidth();
    if (availableWidth >= ROLE_MIN_WIDTH + PANEL_GAP + STATUS_MIN_WIDTH) {
      return Math.max(ROLE_MIN_WIDTH, Math.floor((availableWidth - PANEL_GAP) * 0.42));
    }
    return Math.max(1, Math.floor((availableWidth - PANEL_GAP) / 2));
  };
  const statusWidth = () => Math.max(1, infoContentWidth() - roleWidth() - PANEL_GAP);

  return (
    <box height={panelHeight()} width={panelWidth()} flexDirection="column" gap={PANEL_GAP}>
      <box flexDirection="row" height={infoHeight()} width={panelWidth()} gap={PANEL_GAP}>
        <RoleCard client={props.client} width={roleWidth()} height={infoHeight()} />
        <StatusCard client={props.client} width={statusWidth()} height={infoHeight()} />
      </box>
      <ActionBar
        client={props.client}
        width={panelWidth()}
        height={actionBarHeight()}
        disabled={disabled()}
      />
    </box>
  );
}
