import { createSignal, untrack } from "solid-js";
import type { Capability, RoomEntity } from "../../shared/protocol.ts";
import { type GameClient, getDialogueVisibleOptions } from "../client/game-client.ts";
import {
  findGroupForItem,
  formatGroupedItemName,
  type GroupedItem,
  groupInventory,
} from "../features/inventory/grouping.ts";
import { getEventStyle } from "../theme/event-style.ts";

// ── Types ──
// KeyBinding: 单个按键绑定，key 支持精确匹配或范围（"1-9", "a-z"）。
// KeyLayer: 按键图层，priority 越高越优先；passthrough=false 时未匹配按键被消费。

export interface KeyBinding {
  key: string | string[];
  action?: string;
  labelAction?: string;
  params?: Record<string, unknown>;
  handler?: (client: GameClient, keyName: string) => void;
  label: string;
  color?: string;
  group?: "direction" | "room-action" | "global" | "entity-select";
  enabled?: (client: GameClient) => boolean;
}

export interface KeyLayer {
  id: string;
  priority: number;
  passthrough?: boolean;
  bindings: KeyBinding[];
}

export { findGroupForItem, formatGroupedItemName, type GroupedItem, groupInventory };

// ── Direction Key Map ──
// 键盘按键 → 游戏内方向值的映射。每个键对应中英文两个候选值。

export const DIRECTION_KEYS: Record<string, string[]> = {
  w: ["north", "北"],
  a: ["west", "西"],
  s: ["south", "南"],
  d: ["east", "东"],
  u: ["up", "上"],
  x: ["down", "下"],
};

// ── Helpers ──

export function findDirectionValue(capabilities: Capability[], key: string): string | null {
  const values = capabilities.find((c) => c.action === "move")?.params?.values ?? [];
  const candidates = DIRECTION_KEYS[key] ?? [];
  return candidates.find((v) => values.includes(v)) ?? null;
}

export function hasCapability(capabilities: Capability[], action: string): boolean {
  return capabilities.some((c) => c.action === action);
}

function directionEnabled(key: string) {
  return (client: GameClient) => findDirectionValue(client.capabilities(), key) !== null;
}

function capEnabled(action: string) {
  return (client: GameClient) => hasCapability(client.capabilities(), action);
}

function capabilityLabel(capabilities: Capability[], action: string, fallback: string): string {
  return capabilities.find((c) => c.action === action)?.label ?? fallback;
}

export function bindingLabel(client: GameClient, binding: KeyBinding): string {
  const action = binding.labelAction ?? binding.action;
  return action ? capabilityLabel(client.capabilities(), action, binding.label) : binding.label;
}

function makeDirectionHandler(key: string) {
  return (client: GameClient) => {
    const value = findDirectionValue(client.capabilities(), key);
    if (value) client.execute("move", { direction: value });
  };
}

function handleRoomAction(client: GameClient, keyName: string): boolean {
  const actions = client.room()?.roomActions ?? [];
  const idx = keyName.charCodeAt(0) - 97;
  if (idx >= 0 && idx < actions.length) {
    client.execute(actions[idx].id);
    return true;
  }
  return false;
}

function handleEntitySelect(client: GameClient, keyName: string) {
  const idx = Number(keyName) - 1;
  const player = client.entity();
  const entities = (client.room()?.entities ?? []).filter((e) => e.id !== player?.id);
  const target = entities[idx];
  if (target) {
    client.setSelectedEntityId(target.id);
  }
}

function handleEntityAction(client: GameClient, keyName: string) {
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

function handleInventoryKey(client: GameClient, keyName: string) {
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

function handleQuestSelect(client: GameClient, keyName: string) {
  const idx = Number(keyName) - 1;
  const quests = client.entity()?.activeQuests ?? [];
  if (idx >= 0 && idx < quests.length) {
    client.setSelectedQuestIndex(idx);
  }
}

function handleDialogueOption(client: GameClient, keyName: string) {
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

function handleDialogueTabLeft(client: GameClient) {
  client.switchDialogueTab(-1);
}

function handleDialogueTabRight(client: GameClient) {
  client.switchDialogueTab(1);
}

function handleDialogueEscape(client: GameClient) {
  const dlg = client.dialogue();
  if (dlg?.activeTab === "trade" && dlg.tabs.trade.selected) {
    client.clearTradeSelection();
    return;
  }
  client.closeDialogue();
}

function capabilityTargets(capabilities: Capability[], action: string): string[] {
  return capabilities.find((c) => c.action === action)?.params?.values ?? [];
}

function actionColor(action: string): string {
  return getEventStyle(action).color;
}

// ── Action Builders ──
// 为实体和库存物品构建可用动作列表。
// 返回的 run 函数直接调用 client.execute 或其他 client 方法。

export function getEntityActions(
  entity: RoomEntity,
  capabilities: Capability[] = [],
): Array<{
  label: string;
  color?: string;
  run: (client: GameClient, entity: RoomEntity) => void;
}> {
  const entityActions: Array<{
    label: string;
    color?: string;
    run: (client: GameClient, entity: RoomEntity) => void;
  }> = [];

  if (capabilityTargets(capabilities, "take").includes(entity.id)) {
    entityActions.push({
      label: capabilityLabel(capabilities, "take", "拾取"),
      color: actionColor("take"),
      run: (client, target) => client.execute("take", { itemId: target.id }),
    });
  }
  if (capabilityTargets(capabilities, "talk").includes(entity.id)) {
    entityActions.push({
      label: capabilityLabel(capabilities, "talk", "交谈"),
      color: actionColor("dialogue"),
      run: (client, target) => client.requestDialogueOptions(target.id),
    });
  }
  entityActions.push({
    label: capabilityLabel(capabilities, "look", "观察"),
    color: actionColor("look"),
    run: (client, target) => client.execute("look", { target: target.name }),
  });
  if (capabilityTargets(capabilities, "attack").includes(entity.id)) {
    entityActions.push({
      label: capabilityLabel(capabilities, "attack", "攻击"),
      color: actionColor("attack"),
      run: (client, target) => {
        client.startCombat(target.id, target.name);
        client.execute("attack", { targetId: target.id });
      },
    });
  }
  if (capabilityTargets(capabilities, "operate").includes(entity.id)) {
    entityActions.push({
      label: capabilityLabel(capabilities, "operate", "操作"),
      color: actionColor("operate"),
      run: (client, target) => client.execute("operate", { itemId: target.id }),
    });
  }

  return entityActions;
}

export function getInventoryActions(
  group: GroupedItem,
  capabilities: Capability[] = [],
): Array<{
  label: string;
  color?: string;
  run: (client: GameClient, group: GroupedItem) => void;
}> {
  const actions: Array<{
    label: string;
    color?: string;
    run: (client: GameClient, group: GroupedItem) => void;
  }> = [
    {
      label: capabilityLabel(capabilities, "use", "使用"),
      color: actionColor("use"),
      run: (client, g) => client.execute("use", { itemId: g.items[0].id }),
    },
    {
      label: capabilityLabel(capabilities, "look", "观察"),
      color: actionColor("look"),
      run: (client, g) => client.execute("look", { target: g.items[0].name }),
    },
    {
      label: capabilityLabel(capabilities, "drop", "丢下"),
      color: actionColor("drop"),
      run: (client, g) => client.execute("drop", { itemId: g.items[0].id }),
    },
  ];
  if (capabilityTargets(capabilities, "operate").includes(group.items[0].id)) {
    actions.splice(1, 0, {
      label: "操作",
      color: actionColor("operate"),
      run: (client, g) => client.execute("operate", { itemId: g.items[0].id }),
    });
  }
  if (group.count > 1) {
    actions.push({
      label: `丢下全部 x${group.count}`,
      color: actionColor("drop"),
      run: (client, g) => {
        for (const item of g.items) {
          client.execute("drop", { itemId: item.id });
        }
      },
    });
  }
  return actions;
}

// ── Layer Definitions ──
// 12 个按键图层，priority 从 0（base）到 100（combat）。
// base 和 entity-selected 的 passthrough=true，允许未匹配按键穿透到下层。

const BASE_LAYER: KeyLayer = {
  id: "base",
  priority: 0,
  passthrough: true,
  bindings: [
    // Direction keys (exact matches, checked first)
    {
      key: ["w", "up"],
      handler: makeDirectionHandler("w"),
      label: "北",
      group: "direction",
      enabled: directionEnabled("w"),
    },
    {
      key: ["s", "down"],
      handler: makeDirectionHandler("s"),
      label: "南",
      group: "direction",
      enabled: directionEnabled("s"),
    },
    {
      key: ["d", "right"],
      handler: makeDirectionHandler("d"),
      label: "东",
      group: "direction",
      enabled: directionEnabled("d"),
    },
    {
      key: ["a", "left"],
      handler: makeDirectionHandler("a"),
      label: "西",
      group: "direction",
      enabled: directionEnabled("a"),
    },
    {
      key: "u",
      handler: makeDirectionHandler("u"),
      label: "上",
      group: "direction",
      enabled: directionEnabled("u"),
    },
    {
      key: "x",
      handler: makeDirectionHandler("x"),
      label: "下",
      group: "direction",
      enabled: directionEnabled("x"),
    },

    // Room actions (a-z pattern, before globals so room actions shadow globals)
    {
      key: "a-z",
      handler: handleRoomAction,
      label: "",
      group: "room-action",
      enabled: (c) => (c.room()?.roomActions?.length ?? 0) > 0,
    },

    // Global actions (exact matches)
    {
      key: "r",
      action: "rest",
      label: "休息",
      color: "#6fc3bd",
      group: "global",
      enabled: capEnabled("rest"),
    },
    {
      key: "q",
      labelAction: "status",
      handler: (c) => c.toggleStatus(),
      label: "状态",
      color: "#e6ddc9",
      group: "global",
      enabled: capEnabled("status"),
    },
    {
      key: "i",
      labelAction: "inventory",
      handler: (c) => c.openInventory(),
      label: "背包",
      color: "#e3b96f",
      group: "global",
      enabled: capEnabled("inventory"),
    },
    {
      key: "j",
      labelAction: "quests",
      handler: (c) => c.openQuests(),
      label: "任务",
      color: "#7fc27a",
      group: "global",
      enabled: capEnabled("quests"),
    },
    {
      key: "t",
      labelAction: "travelogue",
      handler: (c) => c.openTravelogue(),
      label: "游记",
      color: "#d4a574",
      group: "global",
      enabled: capEnabled("travelogue"),
    },
    {
      key: "0",
      handler: (c) => c.requestEndDay(),
      label: "结束今天",
      color: "#d6a94f",
      group: "global",
      enabled: capEnabled("end_day"),
    },
    {
      key: "m",
      handler: (c) => c.toggleMinimap(),
      label: "地图",
      color: "#6fc3bd",
      group: "global",
    },
    {
      key: "v",
      handler: (c) => c.openSavePanel(),
      label: "存档",
      color: "#8fb9e8",
      group: "global",
    },

    // Entity select (1-9 pattern)
    {
      key: "1-9",
      handler: handleEntitySelect,
      label: "",
      group: "entity-select",
      enabled: (c) => {
        const player = c.entity();
        return (c.room()?.entities ?? []).filter((e) => e.id !== player?.id).length > 0;
      },
    },
  ],
};

const ENTITY_SELECTED_LAYER: KeyLayer = {
  id: "entity-selected",
  priority: 10,
  passthrough: true,
  bindings: [
    {
      key: "escape",
      handler: (c) => c.setSelectedEntityId(null),
      label: "返回",
    },
    { key: "1-9", handler: handleEntityAction, label: "" },
  ],
};

const MAP_LAYER: KeyLayer = {
  id: "map",
  priority: 30,
  bindings: [
    { key: ["escape", "m"], handler: () => popLayer("map"), label: "关闭" },
    { key: "g", handler: (c) => c.cycleMapGranularity(), label: "切换" },
    {
      key: ["h", "left"],
      handler: (c) => {
        const minimap = c.room()?.minimap;
        const cursor = c.mapCursor();
        const granularity = c.mapGranularity();
        if (!minimap) return;
        if (granularity === "region") {
          const tiles = minimap.tiles.filter(
            (t) => t.regionId === minimap.playerRegionId && t.roomName,
          );
          const idx = tiles.findIndex((t) => t.x === cursor.x && t.y === cursor.y);
          const next = Math.max(0, idx - 1);
          if (next !== idx) {
            const t = tiles[next];
            c.setMapCursor({ x: t.x, y: t.y, regionId: t.regionId });
          }
        } else {
          const nodes = minimap.regionNodes;
          const idx = nodes.findIndex((n) =>
            cursor.regionId ? n.regionId === cursor.regionId : n.isCurrent,
          );
          const next = Math.max(0, idx - 1);
          if (next !== idx) {
            const n = nodes[next];
            c.setMapCursor({ x: n.x, y: n.y, regionId: n.regionId });
          }
        }
      },
      label: "←",
    },
    {
      key: ["l", "right"],
      handler: (c) => {
        const minimap = c.room()?.minimap;
        const cursor = c.mapCursor();
        const granularity = c.mapGranularity();
        if (!minimap) return;
        if (granularity === "region") {
          const tiles = minimap.tiles.filter(
            (t) => t.regionId === minimap.playerRegionId && t.roomName,
          );
          const idx = tiles.findIndex((t) => t.x === cursor.x && t.y === cursor.y);
          const next = Math.min(tiles.length - 1, idx + 1);
          if (next !== idx) {
            const t = tiles[next];
            c.setMapCursor({ x: t.x, y: t.y, regionId: t.regionId });
          }
        } else {
          const nodes = minimap.regionNodes;
          const idx = nodes.findIndex((n) =>
            cursor.regionId ? n.regionId === cursor.regionId : n.isCurrent,
          );
          const next = Math.min(nodes.length - 1, idx + 1);
          if (next !== idx) {
            const n = nodes[next];
            c.setMapCursor({ x: n.x, y: n.y, regionId: n.regionId });
          }
        }
      },
      label: "→",
    },
    {
      key: ["k", "up"],
      handler: (c) => {
        const minimap = c.room()?.minimap;
        const cursor = c.mapCursor();
        if (!minimap || c.mapGranularity() !== "region") return;
        const tiles = minimap.tiles.filter(
          (t) => t.regionId === minimap.playerRegionId && t.roomName,
        );
        const above = tiles.filter((t) => t.y < cursor.y);
        if (above.length > 0) {
          const closest = above.reduce((a, b) =>
            Math.abs(a.x - cursor.x) <= Math.abs(b.x - cursor.x) ? a : b,
          );
          c.setMapCursor({
            x: closest.x,
            y: closest.y,
            regionId: closest.regionId,
          });
        }
      },
      label: "↑",
      enabled: (c) => c.mapGranularity() === "region",
    },
    {
      key: ["j", "down"],
      handler: (c) => {
        const minimap = c.room()?.minimap;
        const cursor = c.mapCursor();
        if (!minimap || c.mapGranularity() !== "region") return;
        const tiles = minimap.tiles.filter(
          (t) => t.regionId === minimap.playerRegionId && t.roomName,
        );
        const below = tiles.filter((t) => t.y > cursor.y);
        if (below.length > 0) {
          const closest = below.reduce((a, b) =>
            Math.abs(a.x - cursor.x) <= Math.abs(b.x - cursor.x) ? a : b,
          );
          c.setMapCursor({
            x: closest.x,
            y: closest.y,
            regionId: closest.regionId,
          });
        }
      },
      label: "↓",
      enabled: (c) => c.mapGranularity() === "region",
    },
  ],
};

const STATUS_LAYER: KeyLayer = {
  id: "status",
  priority: 40,
  bindings: [{ key: ["escape", "q"], handler: () => popLayer("status"), label: "关闭" }],
};

const INVENTORY_LAYER: KeyLayer = {
  id: "inventory",
  priority: 50,
  bindings: [
    { key: ["escape", "i"], handler: (c) => c.closeInventory(), label: "关闭" },
    { key: "1-9", handler: handleInventoryKey, label: "" },
  ],
};

const QUESTS_LAYER: KeyLayer = {
  id: "quests",
  priority: 50,
  bindings: [
    {
      key: "escape",
      handler: (c) => c.closeQuests(),
      label: "返回",
    },
    { key: "j", handler: (c) => c.closeQuests(), label: "关闭" },
    { key: "1-9", handler: handleQuestSelect, label: "" },
    {
      key: "t",
      handler: (c) => {
        const quests = c.entity()?.activeQuests ?? [];
        const idx = c.selectedQuestIndex();
        if (idx !== null && idx < quests.length) {
          c.toggleTrackQuest(quests[idx].templateId);
        }
      },
      label: "跟踪/取消跟踪",
      enabled: (c) => c.selectedQuestIndex() !== null,
    },
    {
      key: "x",
      handler: (c) => {
        const quests = c.entity()?.activeQuests ?? [];
        const idx = c.selectedQuestIndex();
        if (idx !== null && idx < quests.length) {
          c.execute("quests", {
            subcommand: "abandon",
            templateId: quests[idx].templateId,
          });
          c.setSelectedQuestIndex(null);
        }
      },
      label: "放弃任务",
      enabled: (c) => c.selectedQuestIndex() !== null,
    },
  ],
};

const TRAVELOGUE_LAYER: KeyLayer = {
  id: "travelogue",
  priority: 45,
  bindings: [
    {
      key: ["escape", "t"],
      handler: (c) => c.closeTravelogue(),
      label: "关闭",
    },
    {
      key: ["k", "up"],
      handler: (c) => {
        const entries = c.travelogue();
        const idx = c.selectedTravelogueIndex();
        if (entries.length === 0) return;
        c.setSelectedTravelogueIndex(idx === null ? entries.length - 1 : Math.max(0, idx - 1));
      },
      label: "上一条",
      enabled: (c) => c.travelogue().length > 0,
    },
    {
      key: ["j", "down"],
      handler: (c) => {
        const entries = c.travelogue();
        const idx = c.selectedTravelogueIndex();
        if (entries.length === 0) return;
        c.setSelectedTravelogueIndex(idx === null ? 0 : Math.min(entries.length - 1, idx + 1));
      },
      label: "下一条",
      enabled: (c) => c.travelogue().length > 0,
    },
    {
      key: "1-9",
      handler: (c, keyName) => {
        const idx = Number(keyName) - 1;
        const entries = c.travelogue();
        if (idx >= 0 && idx < entries.length) {
          c.setSelectedTravelogueIndex(idx);
        }
      },
      label: "",
      enabled: (c) => c.travelogue().length > 0,
    },
  ],
};

const SAVE_LAYER: KeyLayer = {
  id: "save",
  priority: 50,
  bindings: [
    {
      key: ["escape", "v"],
      handler: (c) => c.closeSavePanel(),
      label: "关闭",
    },
    {
      key: "s",
      handler: (c) => c.manualSave(),
      label: "保存",
    },
    {
      key: "r",
      handler: (c) => c.requestSaveSlots(),
      label: "刷新",
    },
    {
      key: "n",
      handler: (c) => c.createSaveSlot(),
      label: "新建",
    },
    {
      key: "1-9",
      handler: (c, keyName) => {
        const idx = Number(keyName) - 1;
        if (idx >= 0 && idx < c.saveSlots().length) {
          c.setSelectedSaveSlotIndex(idx);
        }
      },
      label: "",
      enabled: (c) => c.saveSlots().length > 0,
    },
  ],
};

const DIALOGUE_LAYER: KeyLayer = {
  id: "dialogue",
  priority: 60,
  bindings: [
    { key: "left", handler: handleDialogueTabLeft, label: "" },
    { key: "right", handler: handleDialogueTabRight, label: "" },
    { key: "1-9", handler: handleDialogueOption, label: "" },
    { key: "escape", handler: handleDialogueEscape, label: "关闭" },
  ],
};

const QUEST_NOTIFICATION_LAYER: KeyLayer = {
  id: "quest-notification",
  priority: 90,
  bindings: [
    {
      key: ["escape", "enter", " "],
      handler: (c) => c.dismissQuestNotification(),
      label: "确认",
    },
  ],
};

const ITEM_CHANGE_NOTIFICATION_LAYER: KeyLayer = {
  id: "item-change-notification",
  priority: 85,
  bindings: [
    {
      key: ["escape", "enter", " "],
      handler: (c) => c.dismissItemChangeNotification(),
      label: "确认",
    },
  ],
};

const CONFIRM_END_DAY_LAYER: KeyLayer = {
  id: "confirm-end-day",
  priority: 95,
  bindings: [
    {
      key: "1-9",
      handler: (c, keyName) => {
        const idx = Number(keyName) - 1;
        const options = c.endDayOptions();
        if (idx >= 0 && idx < options.length) {
          c.confirmEndDay(options[idx]);
        }
      },
      label: "",
    },
    {
      key: ["escape", "0"],
      handler: (c) => c.cancelEndDay(),
      label: "取消",
    },
  ],
};

const COMBAT_LAYER: KeyLayer = {
  id: "combat",
  priority: 100,
  bindings: [
    { key: "f", action: "flee", label: "逃跑" },
    { key: "d", action: "defend", label: "防御" },
    {
      key: "escape",
      handler: (c) => c.endCombat(),
      label: "撤退",
    },
  ],
};

// ── Layer Registry ──

const ALL_LAYERS: Record<string, KeyLayer> = {
  base: BASE_LAYER,
  "entity-selected": ENTITY_SELECTED_LAYER,
  map: MAP_LAYER,
  status: STATUS_LAYER,
  inventory: INVENTORY_LAYER,
  quests: QUESTS_LAYER,
  travelogue: TRAVELOGUE_LAYER,
  save: SAVE_LAYER,
  "quest-notification": QUEST_NOTIFICATION_LAYER,
  "item-change-notification": ITEM_CHANGE_NOTIFICATION_LAYER,
  "confirm-end-day": CONFIRM_END_DAY_LAYER,
  dialogue: DIALOGUE_LAYER,
  combat: COMBAT_LAYER,
};

// ── Stack Management (Solid.js signal) ──
// 图层栈用 Solid.js signal 管理，pushLayer 按 priority 降序排列。
// 新图层入栈时，priority 低于它的旧图层被移除（被"覆盖"）。

const [layerStack, setLayerStack] = createSignal<KeyLayer[]>([BASE_LAYER]);

export function pushLayer(id: string): void {
  const layer = ALL_LAYERS[id];
  if (!layer || layer.id === "base") return;
  setLayerStack((prev) => {
    const kept = prev.filter(
      (l) => l.id === "base" || (l.id !== id && l.priority > layer.priority),
    );
    const result = [layer, ...kept];
    result.sort((a, b) => b.priority - a.priority);
    return result;
  });
}

export function popLayer(id: string): void {
  setLayerStack((prev) => prev.filter((l) => l.id !== id));
}

export function hasLayer(id: string): boolean {
  return layerStack().some((l) => l.id === id);
}

export function activeLayer(): KeyLayer {
  return layerStack()[0] ?? BASE_LAYER;
}

export function getLayerStack(): KeyLayer[] {
  return layerStack();
}

// ── Key Dispatch ──
// 唯一的按键分发入口。从栈顶向下遍历，第一个匹配的 binding 执行。
// passthrough=false 的图层消费所有未匹配按键（模态行为）。

function matchKey(pattern: string | string[], name: string): boolean {
  const patterns = Array.isArray(pattern) ? pattern : [pattern];
  for (const p of patterns) {
    if (p === name) return true;
    if (p === "1-9" && name.length === 1 && name >= "1" && name <= "9") return true;
    if (p === "a-z" && name.length === 1 && name >= "a" && name <= "z") return true;
  }
  return false;
}

export function dispatchKey(
  key: { name: string; meta?: boolean; preventDefault: () => void },
  client: GameClient,
): void {
  if (key.meta && key.name.toLowerCase() === "c") return;
  if (client.hasActiveRequest() || client.settlementPending()) {
    const currentLayer = activeLayer();
    const name = key.name.toLowerCase();
    if (currentLayer.id === "dialogue" && (name === "left" || name === "right")) {
    } else {
      key.preventDefault();
      return;
    }
  }

  const name = key.name.toLowerCase();
  const stack = untrack(() => layerStack());

  for (const layer of stack) {
    for (const b of layer.bindings) {
      if (!matchKey(b.key, name)) continue;
      if (b.enabled && !b.enabled(client)) continue;
      if (b.handler) {
        const handled = b.handler(client, name) as unknown;
        if (handled === false) continue;
      }
      if (b.action) client.execute(b.action, b.params);
      key.preventDefault();
      return;
    }
    if (!layer.passthrough) {
      key.preventDefault();
      return;
    }
  }
}

// ── For Sidebar ──

export function getGlobalBindings(): KeyBinding[] {
  return BASE_LAYER.bindings.filter((b) => b.group === "global");
}

export function directionKeyChar(direction: string): string {
  const KEY_HINTS: Record<string, string> = {
    w: "W",
    a: "A",
    s: "S",
    d: "D",
    u: "U",
    x: "X",
  };
  const entry = Object.entries(DIRECTION_KEYS).find(([, vals]) => vals.includes(direction));
  return entry ? (KEY_HINTS[entry[0]] ?? direction) : direction;
}
