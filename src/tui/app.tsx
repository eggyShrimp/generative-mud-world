import { useTerminalDimensions } from "@opentui/solid";
import { createMemo, onCleanup, onMount } from "solid-js";
import type { GameClient } from "./client/game-client.ts";
import { KeyboardController } from "./controllers/keyboard-controller.tsx";
import { findGroupForItem, groupInventory } from "./features/inventory/grouping.ts";
import { getLayoutMetrics, getModalMetrics, getStatusPanelMetrics } from "./layout/metrics.ts";
import { ItemChangeNotificationOverlay } from "./overlays/item-change-notification.tsx";
import { QuestNotificationOverlay } from "./overlays/quest-notification.tsx";
import { BookReaderPanel } from "./panels/book-reader/book-reader-panel.tsx";
import { CombatPanel } from "./panels/combat/combat-panel.tsx";
import { DialoguePanel } from "./panels/dialogue/dialogue-panel.tsx";
import { EndDayPanel } from "./panels/end-day/end-day-panel.tsx";
import { EventLog } from "./panels/event-log/event-log.tsx";
import { InventoryPanel } from "./panels/inventory/inventory-panel.tsx";
import { MapPanel } from "./panels/map/map-panel.tsx";
import { QuestsPanel } from "./panels/quests/quests-panel.tsx";
import { RoomPanel } from "./panels/room/room-panel.tsx";
import { SavePanel } from "./panels/save/save-panel.tsx";
import { Sidebar } from "./panels/sidebar/sidebar.tsx";
import { StatusBar } from "./panels/sidebar/status-bar.tsx";
import { StatusPanel } from "./panels/status/status-panel.tsx";
import { TraveloguePanel } from "./panels/travelogue/travelogue-panel.tsx";
import { THEME } from "./theme/theme.ts";

export function App(props: { client: GameClient }) {
  const dimensions = useTerminalDimensions();
  const layoutMetrics = createMemo(() => getLayoutMetrics(dimensions().width, dimensions().height));

  const visibleEntities = createMemo(() => {
    const playerId = props.client.entity()?.id;
    return (props.client.room()?.entities ?? []).filter((entity) => entity.id !== playerId);
  });
  const selectedEntity = createMemo(() => {
    const selectedId = props.client.selectedEntityId();
    return visibleEntities().find((entity) => entity.id === selectedId) ?? null;
  });
  const inventoryGroups = createMemo(() => groupInventory(props.client.entity()?.inventory ?? []));
  const selectedInventoryGroup = createMemo(() => {
    const selectedId = props.client.selectedInventoryItemId();
    return selectedId ? findGroupForItem(selectedId, inventoryGroups()) : null;
  });
  const pendingEvent = createMemo(() => {
    if (props.client.hasActiveRequest()) {
      return { type: "system", description: "正在处理..." };
    }
    return null;
  });

  const modalMetrics = createMemo(() =>
    getModalMetrics(dimensions().width, dimensions().height, layoutMetrics()),
  );
  const statusMetrics = createMemo(() =>
    getStatusPanelMetrics(dimensions().width, dimensions().height, layoutMetrics()),
  );

  onMount(() => props.client.connect());
  onCleanup(() => props.client.disconnect());

  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      padding={1}
      backgroundColor={THEME.background}
    >
      <KeyboardController client={props.client} />
      <StatusBar client={props.client} />
      <box flexDirection="column" flexGrow={1} gap={0}>
        <box flexDirection="row" height={layoutMetrics().roomHeight} gap={1}>
          <RoomPanel
            client={props.client}
            entities={visibleEntities()}
            selectedEntity={selectedEntity()}
            height={layoutMetrics().roomHeight}
          />
          <EventLog
            events={props.client.events()}
            pendingEvent={pendingEvent()}
            height={layoutMetrics().roomHeight}
            width={layoutMetrics().sidebarWidth}
          />
        </box>
        <Sidebar client={props.client} />
      </box>

      <StatusPanel client={props.client} metrics={statusMetrics()} />
      <QuestsPanel client={props.client} metrics={modalMetrics()} />
      <TraveloguePanel client={props.client} metrics={modalMetrics()} />
      <EndDayPanel client={props.client} metrics={modalMetrics()} />
      <InventoryPanel
        client={props.client}
        items={inventoryGroups()}
        selectedItem={selectedInventoryGroup()}
        metrics={modalMetrics()}
      />
      <DialoguePanel client={props.client} metrics={modalMetrics()} />
      <MapPanel client={props.client} metrics={modalMetrics()} />
      <SavePanel client={props.client} metrics={modalMetrics()} />
      <BookReaderPanel client={props.client} metrics={modalMetrics()} />
      <CombatPanel client={props.client} entities={visibleEntities()} metrics={modalMetrics()} />

      <QuestNotificationOverlay client={props.client} />
      <ItemChangeNotificationOverlay client={props.client} />
    </box>
  );
}
