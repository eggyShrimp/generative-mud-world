import { getDialogueVisibleOptions } from "../client/dialogue-state.ts";
import type { GameClient } from "../client/types.ts";
import { groupInventory } from "../features/inventory/grouping.ts";
import { getEntityActions, getInventoryActions } from "./actions.ts";

export function handleRoomAction(client: GameClient, keyName: string): boolean {
  const actions = client.room()?.roomActions ?? [];
  const idx = keyName.charCodeAt(0) - 97;
  if (idx >= 0 && idx < actions.length) {
    client.execute(actions[idx].id);
    return true;
  }
  return false;
}

export function handleEntitySelect(client: GameClient, keyName: string) {
  const idx = Number(keyName) - 1;
  const player = client.entity();
  const entities = (client.room()?.entities ?? []).filter((e) => e.id !== player?.id);
  const target = entities[idx];
  if (target) {
    client.interactWithEntity(target.id);
  }
}

export function handleEntityAction(client: GameClient, keyName: string) {
  const entityId = client.selectedEntityId();
  if (!entityId) return;
  const player = client.entity();
  const entities = (client.room()?.entities ?? []).filter((e) => e.id !== player?.id);
  const entity = entities.find((e) => e.id === entityId);
  if (!entity) return;
  const idx = Number(keyName) - 1;
  const actions = getEntityActions(entity, client.capabilities());
  const action = actions[idx];
  if (action) {
    action.run(client, entity);
    client.setSelectedEntityId(null);
  }
}

export function handleInventoryKey(client: GameClient, keyName: string) {
  const idx = Number(keyName) - 1;
  const selectedItemId = client.selectedInventoryItemId();

  if (selectedItemId !== null) {
    const inventory = client.entity()?.inventory ?? [];
    const groups = groupInventory(inventory);
    const selectedGroup = groups.find((g) => g.items.some((i) => i.id === selectedItemId));
    if (selectedGroup) {
      const actions = getInventoryActions(selectedGroup, client.capabilities());
      const action = actions[idx];
      if (action) {
        action.run(client, selectedGroup);
        client.closeInventory();
      }
    }
  } else {
    const inventory = client.entity()?.inventory ?? [];
    const groups = groupInventory(inventory);
    const group = groups[idx];
    if (group) {
      client.setSelectedInventoryItemId(group.items[0].id);
    }
  }
}

export function handleQuestSelect(client: GameClient, keyName: string) {
  const idx = Number(keyName) - 1;
  const quests = client.entity()?.activeQuests ?? [];
  if (idx >= 0 && idx < quests.length) {
    client.setSelectedQuestIndex(idx);
  }
}

export function handleDialogueOption(client: GameClient, keyName: string) {
  const idx = Number(keyName) - 1;
  const dialogue = client.dialogue();
  if (!dialogue) return;
  if (dialogue.activeTab === "trade") {
    const tradeOption = dialogue.tabs.trade.options[idx];
    if (tradeOption) {
      client.chooseTradeOption(tradeOption);
    }
  } else {
    const option = getDialogueVisibleOptions(dialogue)[idx];
    if (option) {
      client.chooseDialogueOption(option);
    }
  }
}

export function handleDialogueTabLeft(client: GameClient) {
  client.switchDialogueTab(-1);
}

export function handleDialogueTabRight(client: GameClient) {
  client.switchDialogueTab(1);
}

export function handleDialogueEscape(client: GameClient) {
  const dlg = client.dialogue();
  if (dlg?.activeTab === "trade" && dlg.tabs.trade.selected) {
    client.clearTradeSelection();
    return;
  }
  client.closeDialogue();
}

export function handleDialogueFollowUp(client: GameClient) {
  const dlg = client.dialogue();
  if (dlg?.activeTab !== "chat") return;

  const selectedText = client.popFollowUpSelection();
  if (!selectedText) {
    client.showFollowUpSelectionRequired();
    return;
  }

  client.requestFollowUpOptions(selectedText);
}

export function handleInventoryEscape(client: GameClient) {
  if (client.selectedInventoryItemId() !== null) {
    client.setSelectedInventoryItemId(null);
  } else {
    client.closeInventory();
  }
}

export function handleInventoryArrow(client: GameClient, keyName: string) {
  const inventory = client.entity()?.inventory ?? [];
  const groups = groupInventory(inventory);
  if (groups.length === 0) return;

  const selectedId = client.selectedInventoryItemId();
  let currentIndex = -1;
  if (selectedId !== null) {
    currentIndex = groups.findIndex((g) => g.items.some((i) => i.id === selectedId));
  }

  if (currentIndex === -1) {
    const initialIndex = keyName === "up" ? groups.length - 1 : 0;
    client.setSelectedInventoryItemId(groups[initialIndex].items[0].id);
    return;
  }

  const direction = keyName === "up" ? -1 : 1;
  const newIndex = (currentIndex + direction + groups.length) % groups.length;

  client.setSelectedInventoryItemId(groups[newIndex].items[0].id);
}
