import { capEnabled, directionEnabled, makeDirectionHandler } from "./direction.ts";
import {
  handleDialogueEscape,
  handleDialogueOption,
  handleDialogueTabLeft,
  handleDialogueTabRight,
  handleEntityAction,
  handleEntitySelect,
  handleInventoryKey,
  handleQuestSelect,
  handleRoomAction,
} from "./handlers.ts";
import type { KeyLayer } from "./types.ts";

// ── Layer Definitions ──
// 12 个按键图层，priority 从 0（base）到 100（combat）。
// base 和 entity-selected 的 passthrough=true，允许未匹配按键穿透到下层。

export const BASE_LAYER: KeyLayer = {
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
    { key: ["escape", "m"], handler: (c) => c.toggleMinimap(), label: "关闭" },
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
  bindings: [{ key: ["escape", "q"], handler: (c) => c.closeStatus(), label: "关闭" }],
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

const BOOK_READER_LAYER: KeyLayer = {
  id: "book-reader",
  priority: 70,
  bindings: [
    {
      key: ["escape", "q"],
      handler: (c) => c.closeBookReader(),
      label: "关闭",
    },
    {
      key: ["left", "h"],
      handler: (c) => c.prevBookPage(),
      label: "上一页",
      enabled: (c) => (c.bookReader()?.pageIndex ?? 0) > 0,
    },
    {
      key: ["right", "l", " "],
      handler: (c) => c.nextBookPage(),
      label: "下一页",
      enabled: (c) => {
        const reader = c.bookReader();
        return reader ? reader.pageIndex < reader.pages.length - 1 : false;
      },
    },
    {
      key: ["up", "k", "pageup"],
      handler: (c, keyName) => c.scrollBookReader(keyName === "pageup" ? -8 : -2),
      label: "上滚",
      enabled: (c) => (c.bookReader()?.scrollTop ?? 0) > 0,
    },
    {
      key: ["down", "j", "pagedown"],
      handler: (c, keyName) => c.scrollBookReader(keyName === "pagedown" ? 8 : 2),
      label: "下滚",
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

export const ALL_LAYERS: Record<string, KeyLayer> = {
  base: BASE_LAYER,
  "entity-selected": ENTITY_SELECTED_LAYER,
  map: MAP_LAYER,
  status: STATUS_LAYER,
  inventory: INVENTORY_LAYER,
  quests: QUESTS_LAYER,
  travelogue: TRAVELOGUE_LAYER,
  save: SAVE_LAYER,
  "book-reader": BOOK_READER_LAYER,
  "quest-notification": QUEST_NOTIFICATION_LAYER,
  "item-change-notification": ITEM_CHANGE_NOTIFICATION_LAYER,
  "confirm-end-day": CONFIRM_END_DAY_LAYER,
  dialogue: DIALOGUE_LAYER,
  combat: COMBAT_LAYER,
};
