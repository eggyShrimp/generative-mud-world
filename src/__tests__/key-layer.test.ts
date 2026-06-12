import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Capability, InventoryItem, RoomEntity } from "../shared/protocol.ts";
import type { GameClient } from "../tui/client/game-client.ts";
import {
  activeLayer,
  directionKeyChar,
  dispatchKey,
  findDirectionValue,
  getEntityActions,
  getGlobalBindings,
  getInventoryActions,
  getLayerStack,
  groupInventory,
  hasCapability,
  hasLayer,
  popLayer,
  pushLayer,
} from "../tui/key-layer/index.ts";

function cap(action: string, params?: Capability["params"], label = action): Capability {
  return params ? { action, label, params } : { action, label };
}

function mockClient(overrides: Partial<GameClient> = {}): GameClient {
  return {
    hasActiveRequest: () => false,
    execute: vi.fn(),
    capabilities: () => [],
    room: () => null,
    entity: () => null,
    selectedEntityId: () => null,
    selectedInventoryItemId: () => null,
    selectedQuestIndex: () => null,
    dialogue: () => null,
    mapGranularity: () => "region",
    mapCursor: () => ({ x: 0, y: 0 }),
    setSelectedEntityId: vi.fn(),
    setSelectedInventoryItemId: vi.fn(),
    setSelectedQuestIndex: vi.fn(),
    closeInventory: vi.fn(),
    closeQuests: vi.fn(),
    closeDialogue: vi.fn(),
    toggleMinimap: vi.fn(),
    cycleMapGranularity: vi.fn(),
    setMapCursor: vi.fn(),
    requestDialogueOptions: vi.fn(),
    chooseDialogueOption: vi.fn(),
    switchDialogueTab: vi.fn(),
    requestTrade: vi.fn(),
    endCombat: vi.fn(),
    questNotification: () => null,
    showQuestNotification: vi.fn(),
    dismissQuestNotification: vi.fn(),
    itemChangeNotification: () => null,
    dismissItemChangeNotification: vi.fn(),
    trackedQuestIds: () => new Set(),
    toggleTrackQuest: vi.fn(),
    isTrackingQuest: () => false,
    openInventory: vi.fn(),
    openQuests: vi.fn(),
    openStatus: vi.fn(),
    closeStatus: vi.fn(),
    toggleStatus: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    isLayerActive: (id: string) => hasLayer(id),
    activeLayer: () => activeLayer(),
    layerStack: () => getLayerStack(),
    settlementPending: () => false,
    groundRestRecovery: () => 20,
    endDayOptions: () => [],
    requestEndDay: vi.fn(),
    confirmEndDay: vi.fn(),
    cancelEndDay: vi.fn(),
    ...overrides,
  } as unknown as GameClient;
}

function mockKey(name: string, meta = false) {
  let prevented = false;
  return {
    name,
    meta,
    preventDefault: () => {
      prevented = true;
    },
    get wasPrevented() {
      return prevented;
    },
  };
}

function resetStack() {
  for (const id of [
    "entity-selected",
    "map",
    "status",
    "inventory",
    "quests",
    "quest-notification",
    "item-change-notification",
    "dialogue",
    "combat",
  ]) {
    popLayer(id);
  }
}

beforeEach(resetStack);

// ── Stack Management ──

describe("layer stack", () => {
  it("初始状态: 只有 base 层", () => {
    const stack = getLayerStack();
    expect(stack).toHaveLength(1);
    expect(stack[0].id).toBe("base");
  });

  it("pushLayer: 添加到栈顶", () => {
    pushLayer("inventory");
    expect(hasLayer("inventory")).toBe(true);
    expect(activeLayer().id).toBe("inventory");
  });

  it("popLayer: 从栈中移除", () => {
    pushLayer("inventory");
    popLayer("inventory");
    expect(hasLayer("inventory")).toBe(false);
    expect(activeLayer().id).toBe("base");
  });

  it("popLayer: 不存在的层是 no-op", () => {
    popLayer("nonexistent");
    expect(getLayerStack()).toHaveLength(1);
  });

  it("pushLayer: 同 id 重复 push 不会堆叠", () => {
    pushLayer("inventory");
    pushLayer("inventory");
    const stack = getLayerStack();
    expect(stack.filter((l) => l.id === "inventory")).toHaveLength(1);
  });

  it("pushLayer: 高优先级自动弹出低优先级", () => {
    pushLayer("inventory"); // priority 50
    pushLayer("combat"); // priority 100
    expect(hasLayer("inventory")).toBe(false);
    expect(hasLayer("combat")).toBe(true);
  });

  it("pushLayer: 同优先级互相替换", () => {
    pushLayer("inventory"); // priority 50
    pushLayer("quests"); // priority 50
    expect(hasLayer("inventory")).toBe(false);
    expect(hasLayer("quests")).toBe(true);
  });

  it("pushLayer: 低优先级不弹出高优先级", () => {
    pushLayer("combat"); // priority 100
    pushLayer("inventory"); // priority 50
    expect(hasLayer("combat")).toBe(true);
    expect(hasLayer("inventory")).toBe(true);
    // combat stays on top
    expect(activeLayer().id).toBe("combat");
  });

  it("pushLayer: base 层不能被 push", () => {
    pushLayer("base");
    expect(getLayerStack()).toHaveLength(1);
  });

  it("pushLayer: entity-selected 自动弹出", () => {
    pushLayer("entity-selected"); // priority 10
    pushLayer("inventory"); // priority 50
    expect(hasLayer("entity-selected")).toBe(false);
    expect(hasLayer("inventory")).toBe(true);
  });

  it("activeLayer: 空栈返回 base", () => {
    resetStack();
    expect(activeLayer().id).toBe("base");
  });
});

// ── dispatchKey ──

describe("dispatchKey", () => {
  it("pending 状态拦截所有按键", () => {
    const client = mockClient({ hasActiveRequest: () => true });
    const key = mockKey("r");
    dispatchKey(key, client);
    expect(key.wasPrevented).toBe(true);
    expect(client.execute).not.toHaveBeenCalled();
  });

  it("base 层: 方向键执行移动", () => {
    const client = mockClient({
      capabilities: () => [cap("move", { type: "direction", values: ["north", "south"] }, "移动")],
    });
    const key = mockKey("w");
    dispatchKey(key, client);
    expect(client.execute).toHaveBeenCalledWith("move", { direction: "north" });
    expect(key.wasPrevented).toBe(true);
  });

  it("base 层: 方向键无出口时不触发", () => {
    const client = mockClient({
      capabilities: () => [cap("move", { type: "direction", values: [] }, "移动")],
    });
    const key = mockKey("w");
    dispatchKey(key, client);
    expect(client.execute).not.toHaveBeenCalledWith("move", expect.anything());
  });

  it("base 层: 全局动作 r 执行 rest", () => {
    const client = mockClient({
      capabilities: () => [cap("rest", undefined, "休息")],
    });
    const key = mockKey("r");
    dispatchKey(key, client);
    expect(client.execute).toHaveBeenCalledWith("rest", undefined);
  });

  it("base 层: 全局动作无 capability 时不触发", () => {
    const client = mockClient({ capabilities: () => [] });
    const key = mockKey("r");
    dispatchKey(key, client);
    expect(client.execute).not.toHaveBeenCalledWith("rest", expect.anything());
  });

  it("base 层: x 键有下楼出口时移动", () => {
    const client = mockClient({
      capabilities: () => [
        cap("move", { type: "direction", values: ["down", "下"] }, "移动"),
        cap("defend", undefined, "防御"),
      ],
    });
    const key = mockKey("x");
    dispatchKey(key, client);
    expect(client.execute).toHaveBeenCalledWith("move", { direction: "down" });
  });

  it("base 层: x 键无下楼出口时不触发", () => {
    const client = mockClient({
      capabilities: () => [
        cap("move", { type: "direction", values: ["north"] }, "移动"),
        cap("defend", undefined, "防御"),
      ],
    });
    const key = mockKey("x");
    dispatchKey(key, client);
    expect(client.execute).not.toHaveBeenCalled();
  });

  it("base 层: 1-9 选择实体", () => {
    const entities = [
      { id: "npc1", name: "老马", type: "npc" },
      { id: "item1", name: "铜币", type: "item" },
    ];
    const client = mockClient({
      room: () => ({ entities }) as never,
      entity: () => ({ id: "player" }) as never,
    });
    const key = mockKey("1");
    dispatchKey(key, client);
    expect(client.setSelectedEntityId).toHaveBeenCalledWith("npc1");
  });

  it("base 层: 1-9 无实体时不触发", () => {
    const client = mockClient({
      room: () => ({ entities: [] }) as never,
      entity: () => ({ id: "player" }) as never,
    });
    const key = mockKey("1");
    dispatchKey(key, client);
    expect(client.setSelectedEntityId).not.toHaveBeenCalled();
  });

  it("combat 层: 仅 f/d/escape 生效", () => {
    pushLayer("combat");
    const client = mockClient({ capabilities: () => [cap("flee", undefined, "逃跑")] });

    const fleeKey = mockKey("f");
    dispatchKey(fleeKey, client);
    expect(client.execute).toHaveBeenCalledWith("flee", undefined);

    const blockedKey = mockKey("r");
    dispatchKey(blockedKey, client);
    expect(blockedKey.wasPrevented).toBe(true);
  });

  it("combat 层: 其他按键被拦截", () => {
    pushLayer("combat");
    const client = mockClient();
    const key = mockKey("n");
    dispatchKey(key, client);
    expect(key.wasPrevented).toBe(true);
    expect(client.execute).not.toHaveBeenCalledWith("move", expect.anything());
  });

  it("inventory 层: escape 关闭背包", () => {
    pushLayer("inventory");
    const client = mockClient();
    const key = mockKey("escape");
    dispatchKey(key, client);
    expect(client.closeInventory).toHaveBeenCalled();
  });

  it("inventory 层: i 关闭背包", () => {
    pushLayer("inventory");
    const client = mockClient();
    const key = mockKey("i");
    dispatchKey(key, client);
    expect(client.closeInventory).toHaveBeenCalled();
  });

  it("inventory 层: 其他按键被拦截", () => {
    pushLayer("inventory");
    const client = mockClient();
    const key = mockKey("r");
    dispatchKey(key, client);
    expect(key.wasPrevented).toBe(true);
  });

  it("dialogue 层: escape 关闭对话", () => {
    pushLayer("dialogue");
    const client = mockClient();
    const key = mockKey("escape");
    dispatchKey(key, client);
    expect(client.closeDialogue).toHaveBeenCalled();
  });

  it("dialogue 层: 数字键选择选项", () => {
    const options = [
      { id: "opt1", label: "你好", type: "idle_chat" as const },
      { id: "opt2", label: "再见", type: "close" as const },
    ];
    pushLayer("dialogue");
    const client = mockClient({
      dialogue: () => ({
        npcId: "npc1",
        npcName: "老马",
        activeTab: "chat" as const,
        availableTabs: ["chat" as const, "trade" as const],
        tabs: {
          chat: { options, loading: false, history: [] },
          trade: { options: [], loading: false },
        },
      }),
    });
    const key = mockKey("2");
    dispatchKey(key, client);
    expect(client.chooseDialogueOption).toHaveBeenCalledWith(options[1]);
  });

  it("dialogue 层: left → switchDialogueTab(-1)", () => {
    const client = mockClient();
    pushLayer("dialogue");
    dispatchKey(mockKey("left"), client);
    expect(client.switchDialogueTab).toHaveBeenCalledWith(-1);
  });

  it("dialogue 层: right → switchDialogueTab(1)", () => {
    const client = mockClient();
    pushLayer("dialogue");
    dispatchKey(mockKey("right"), client);
    expect(client.switchDialogueTab).toHaveBeenCalledWith(1);
  });

  it("非 dialogue 层时 left/right 不触发 switchDialogueTab", () => {
    const client = mockClient();
    dispatchKey(mockKey("left"), client);
    expect(client.switchDialogueTab).not.toHaveBeenCalled();
    dispatchKey(mockKey("right"), client);
    expect(client.switchDialogueTab).not.toHaveBeenCalled();
  });

  it("dialogue 层 left, hasActiveRequest=true 仍放行", () => {
    const client = mockClient({
      hasActiveRequest: () => true,
    });
    pushLayer("dialogue");
    const key = mockKey("left");
    dispatchKey(key, client);
    expect(client.switchDialogueTab).toHaveBeenCalledWith(-1);
  });

  it("dialogue 层 right, hasActiveRequest=true 仍放行", () => {
    const client = mockClient({
      hasActiveRequest: () => true,
    });
    pushLayer("dialogue");
    const key = mockKey("right");
    dispatchKey(key, client);
    expect(client.switchDialogueTab).toHaveBeenCalledWith(1);
  });

  it("status 层: q 关闭状态", () => {
    pushLayer("status");
    const client = mockClient();
    const key = mockKey("q");
    dispatchKey(key, client);
    expect(key.wasPrevented).toBe(true);
  });

  it("map 层: m 关闭地图", () => {
    pushLayer("map");
    const client = mockClient();
    const key = mockKey("m");
    dispatchKey(key, client);
    expect(key.wasPrevented).toBe(true);
  });

  it("entity-selected 层: escape 取消选择", () => {
    pushLayer("entity-selected");
    const client = mockClient();
    const key = mockKey("escape");
    dispatchKey(key, client);
    expect(client.setSelectedEntityId).toHaveBeenCalledWith(null);
  });

  it("entity-selected 层: 数字键执行实体动作", () => {
    const entities = [{ id: "npc1", name: "老马", type: "npc", interactable: true }];
    pushLayer("entity-selected");
    const client = mockClient({
      selectedEntityId: () => "npc1",
      room: () => ({ entities }) as never,
      entity: () => ({ id: "player" }) as never,
      capabilities: () => [cap("talk", { type: "npc_select", values: ["npc1"] }, "交谈")],
    });
    const key = mockKey("1");
    dispatchKey(key, client);
    expect(client.requestDialogueOptions).toHaveBeenCalledWith("npc1");
  });

  it("meta+c 不拦截（由外部处理）", () => {
    const client = mockClient();
    const key = mockKey("c", true);
    dispatchKey(key, client);
    expect(key.wasPrevented).toBe(false);
  });

  // ── item-change-notification 层 ──

  it("item-change-notification 层: 注册并可 push/pop", () => {
    pushLayer("item-change-notification");
    expect(hasLayer("item-change-notification")).toBe(true);
    popLayer("item-change-notification");
    expect(hasLayer("item-change-notification")).toBe(false);
  });

  it("item-change-notification 层: Enter 关闭通知", () => {
    pushLayer("item-change-notification");
    const client = mockClient();
    const key = mockKey("enter");
    dispatchKey(key, client);
    expect(client.dismissItemChangeNotification).toHaveBeenCalled();
    expect(key.wasPrevented).toBe(true);
  });

  it("item-change-notification 层: Escape 关闭通知", () => {
    pushLayer("item-change-notification");
    const client = mockClient();
    const key = mockKey("escape");
    dispatchKey(key, client);
    expect(client.dismissItemChangeNotification).toHaveBeenCalled();
  });

  it("item-change-notification 层: Space 关闭通知", () => {
    pushLayer("item-change-notification");
    const client = mockClient();
    const key = mockKey(" ");
    dispatchKey(key, client);
    expect(client.dismissItemChangeNotification).toHaveBeenCalled();
  });

  it("item-change-notification 层: 其他按键被拦截", () => {
    pushLayer("item-change-notification");
    const client = mockClient();
    const key = mockKey("r");
    dispatchKey(key, client);
    expect(key.wasPrevented).toBe(true);
    expect(client.dismissItemChangeNotification).not.toHaveBeenCalled();
  });

  it("item-change-notification 层: 优先级 85 > dialogue 60", () => {
    pushLayer("dialogue");
    pushLayer("item-change-notification");
    expect(hasLayer("dialogue")).toBe(false);
    expect(hasLayer("item-change-notification")).toBe(true);
    expect(activeLayer().id).toBe("item-change-notification");
  });

  it("item-change-notification 层: 优先级 85 < quest-notification 90", () => {
    pushLayer("item-change-notification");
    pushLayer("quest-notification");
    expect(hasLayer("item-change-notification")).toBe(false);
    expect(hasLayer("quest-notification")).toBe(true);
    expect(activeLayer().id).toBe("quest-notification");
  });

  it("未匹配的按键在 passthrough 层穿透", () => {
    // base 层 passthrough=true, 但没有 binding 匹配 "z"
    const client = mockClient({ capabilities: () => [] });
    const key = mockKey("z");
    dispatchKey(key, client);
    // base passthrough=true, 无匹配 → 不 preventDefault
    expect(key.wasPrevented).toBe(false);
  });

  it("房间动作: a-z 触发房间动作", () => {
    const client = mockClient({
      room: () => ({ roomActions: [{ id: "eat", label: "吃饭" }] }) as never,
    });
    const key = mockKey("a");
    dispatchKey(key, client);
    expect(client.execute).toHaveBeenCalledWith("eat");
  });

  it("房间动作: a 键有西向出口时优先移动", () => {
    const client = mockClient({
      capabilities: () => [cap("move", { type: "direction", values: ["west"] }, "移动")],
      room: () => ({ roomActions: [{ id: "eat", label: "吃饭" }] }) as never,
    });
    const key = mockKey("a");
    dispatchKey(key, client);
    expect(client.execute).toHaveBeenCalledWith("move", { direction: "west" });
    expect(client.execute).not.toHaveBeenCalledWith("eat");
  });

  it("房间动作: 超出范围的字母不触发", () => {
    const client = mockClient({
      room: () => ({ roomActions: [{ id: "eat", label: "吃饭" }] }) as never,
    });
    const key = mockKey("b");
    dispatchKey(key, client);
    expect(client.execute).not.toHaveBeenCalledWith("eat");
  });
});

// ── Pure Functions ──

describe("findDirectionValue", () => {
  it("找到匹配的方向值", () => {
    const caps: Capability[] = [
      cap("move", { type: "direction", values: ["north", "south", "down", "下"] }, "移动"),
    ];
    expect(findDirectionValue(caps, "w")).toBe("north");
    expect(findDirectionValue(caps, "s")).toBe("south");
    expect(findDirectionValue(caps, "x")).toBe("down");
  });

  it("无 move capability 返回 null", () => {
    expect(findDirectionValue([], "w")).toBeNull();
  });

  it("方向不在 values 中返回 null", () => {
    const caps: Capability[] = [cap("move", { type: "direction", values: ["north"] }, "移动")];
    expect(findDirectionValue(caps, "s")).toBeNull();
  });
});

describe("hasCapability", () => {
  it("有能力时返回 true", () => {
    const caps: Capability[] = [cap("rest"), cap("flee")];
    expect(hasCapability(caps, "rest")).toBe(true);
    expect(hasCapability(caps, "flee")).toBe(true);
  });

  it("无能力时返回 false", () => {
    const caps: Capability[] = [cap("rest")];
    expect(hasCapability(caps, "flee")).toBe(false);
  });

  it("空能力列表返回 false", () => {
    expect(hasCapability([], "rest")).toBe(false);
  });
});

describe("groupInventory", () => {
  it("相同 templateId 分组", () => {
    const items: InventoryItem[] = [
      {
        id: "1",
        name: "铜币",
        type: "item",
        description: "",
        templateId: "copper",
        properties: { templateId: "copper" },
      },
      {
        id: "2",
        name: "铜币",
        type: "item",
        description: "",
        templateId: "copper",
        properties: { templateId: "copper" },
      },
    ];
    const groups = groupInventory(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("铜币");
    expect(groups[0].count).toBe(2);
  });

  it("不同 templateId 分开", () => {
    const items: InventoryItem[] = [
      {
        id: "1",
        name: "铜币",
        type: "item",
        description: "",
        templateId: "copper",
        properties: { templateId: "copper" },
      },
      {
        id: "2",
        name: "铁矿",
        type: "item",
        description: "",
        templateId: "iron",
        properties: { templateId: "iron" },
      },
    ];
    const groups = groupInventory(items);
    expect(groups).toHaveLength(2);
  });

  it("无 templateId 时按 name 分组", () => {
    const items: InventoryItem[] = [
      {
        id: "1",
        name: "神秘物品",
        type: "item",
        description: "",
        templateId: "test_item",
        properties: {},
      },
      {
        id: "2",
        name: "神秘物品",
        type: "item",
        description: "",
        templateId: "test_item",
        properties: {},
      },
    ];
    const groups = groupInventory(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(2);
  });

  it("空列表返回空数组", () => {
    expect(groupInventory([])).toEqual([]);
  });
});

describe("getEntityActions", () => {
  it("NPC 有交谈、观察、攻击", () => {
    const entity = { id: "1", name: "老马", type: "npc" } as RoomEntity;
    const actions = getEntityActions(entity, [
      cap("talk", { type: "npc_select", values: ["1"] }, "交谈"),
      cap("look", { type: "optional_target", values: ["老马"] }, "观察"),
      cap("attack", { type: "npc_select", values: ["1"] }, "攻击"),
    ]);
    const labels = actions.map((a) => a.label);
    expect(labels).toContain("交谈");
    expect(labels).toContain("观察");
    expect(labels).toContain("攻击");
  });

  it("实体动作带有菜单颜色", () => {
    const entity = { id: "1", name: "老马", type: "npc" } as RoomEntity;
    const actions = getEntityActions(entity, [
      cap("talk", { type: "npc_select", values: ["1"] }, "交谈"),
      cap("look", { type: "optional_target", values: ["老马"] }, "观察"),
      cap("attack", { type: "npc_select", values: ["1"] }, "攻击"),
    ]);
    expect(actions.find((a) => a.label === "交谈")?.color).toBe("#f0c674");
    expect(actions.find((a) => a.label === "观察")?.color).toBe("#d5dde5");
    expect(actions.find((a) => a.label === "攻击")?.color).toBe("#d76b5d");
  });

  it("物品有拾取、观察", () => {
    const entity = { id: "1", name: "铜币", type: "item" } as RoomEntity;
    const actions = getEntityActions(entity, [
      cap("take", { type: "item_select", values: ["1"] }, "拾取"),
      cap("look", { type: "optional_target", values: ["铜币"] }, "观察"),
    ]);
    const labels = actions.map((a) => a.label);
    expect(labels).toContain("拾取");
    expect(labels).toContain("观察");
    expect(labels).not.toContain("交谈");
    expect(labels).not.toContain("攻击");
  });

  it("interactable 实体有交谈和攻击", () => {
    const entity = { id: "1", name: "箱子", type: "object", interactable: true } as RoomEntity;
    const actions = getEntityActions(entity, [
      cap("talk", { type: "npc_select", values: ["1"] }, "交谈"),
      cap("attack", { type: "npc_select", values: ["1"] }, "攻击"),
    ]);
    const labels = actions.map((a) => a.label);
    expect(labels).toContain("交谈");
    expect(labels).toContain("攻击");
  });
});

describe("getInventoryActions", () => {
  it("单个物品: 使用、观察、丢下", () => {
    const group = {
      name: "铜币",
      count: 1,
      items: [
        {
          id: "1",
          name: "铜币",
          type: "item" as const,
          description: "",
          templateId: "test_item",
          properties: {},
        },
      ],
    };
    const actions = getInventoryActions(group);
    const labels = actions.map((a) => a.label);
    expect(labels).toEqual(["使用", "观察", "丢下"]);
  });

  it("物品动作带有菜单颜色", () => {
    const group = {
      name: "铜币",
      count: 1,
      items: [
        {
          id: "1",
          name: "铜币",
          type: "item" as const,
          description: "",
          templateId: "test_item",
          properties: {},
        },
      ],
    };
    const actions = getInventoryActions(group);
    expect(actions.map((a) => a.color)).toEqual(["#a46bdb", "#d5dde5", "#6bdb6b"]);
  });

  it("多个物品: 多一个丢下全部", () => {
    const group = {
      name: "铜币",
      count: 3,
      items: [
        {
          id: "1",
          name: "铜币",
          type: "item" as const,
          description: "",
          templateId: "test_item",
          properties: {},
        },
        {
          id: "2",
          name: "铜币",
          type: "item" as const,
          description: "",
          templateId: "test_item",
          properties: {},
        },
        {
          id: "3",
          name: "铜币",
          type: "item" as const,
          description: "",
          templateId: "test_item",
          properties: {},
        },
      ],
    };
    const actions = getInventoryActions(group);
    const labels = actions.map((a) => a.label);
    expect(labels).toContain("丢下全部 x3");
  });
});

describe("directionKeyChar", () => {
  it("英文方向名转按键字符", () => {
    expect(directionKeyChar("north")).toBe("W");
    expect(directionKeyChar("south")).toBe("S");
    expect(directionKeyChar("east")).toBe("D");
    expect(directionKeyChar("west")).toBe("A");
    expect(directionKeyChar("up")).toBe("U");
    expect(directionKeyChar("down")).toBe("X");
  });

  it("中文方向名转按键字符（服务端实际返回值）", () => {
    expect(directionKeyChar("北")).toBe("W");
    expect(directionKeyChar("南")).toBe("S");
    expect(directionKeyChar("东")).toBe("D");
    expect(directionKeyChar("西")).toBe("A");
    expect(directionKeyChar("上")).toBe("U");
    expect(directionKeyChar("下")).toBe("X");
  });

  it("未知方向返回原值", () => {
    expect(directionKeyChar("teleport")).toBe("teleport");
  });
});

describe("getGlobalBindings", () => {
  it("返回 base 层的 global 组绑定", () => {
    const bindings = getGlobalBindings();
    expect(bindings.length).toBeGreaterThan(0);
    for (const b of bindings) {
      expect(b.group).toBe("global");
    }
  });

  it("包含所有全局动作", () => {
    const bindings = getGlobalBindings();
    const keys = bindings.map((b) => (Array.isArray(b.key) ? b.key[0] : b.key));
    expect(keys).toContain("r");
    expect(keys).toContain("q");
    expect(keys).toContain("i");
    expect(keys).toContain("j");
    expect(keys).toContain("0");
    expect(keys).toContain("m");
  });
});

// ── Integration: entity selection full flow ──

describe("entity selection flow (integration)", () => {
  function mockClientWithLayerSync(overrides: Partial<GameClient> = {}): GameClient {
    let selectedId: string | null = null;
    const setSelectedEntityId = vi.fn((id: string | null) => {
      selectedId = id;
      if (id !== null) pushLayer("entity-selected");
      else if (hasLayer("entity-selected")) popLayer("entity-selected");
    });
    return {
      hasActiveRequest: () => false,
      execute: vi.fn(),
      capabilities: () => [],
      room: () => null,
      entity: () => null,
      selectedEntityId: () => selectedId,
      selectedInventoryItemId: () => null,
      selectedQuestIndex: () => null,
      dialogue: () => null,
      mapGranularity: () => "region",
      mapCursor: () => ({ x: 0, y: 0 }),
      setSelectedEntityId,
      setSelectedInventoryItemId: vi.fn(),
      setSelectedQuestIndex: vi.fn(),
      closeInventory: vi.fn(),
      closeQuests: vi.fn(),
      closeDialogue: vi.fn(),
      toggleMinimap: vi.fn(),
      cycleMapGranularity: vi.fn(),
      setMapCursor: vi.fn(),
      requestDialogueOptions: vi.fn(),
      chooseDialogueOption: vi.fn(),
      switchDialogueTab: vi.fn(),
      requestTrade: vi.fn(),
      endCombat: vi.fn(),
      openInventory: vi.fn(() => {
        setSelectedEntityId(null);
        pushLayer("inventory");
      }),
      isLayerActive: (id: string) => hasLayer(id),
      activeLayer: () => activeLayer(),
      layerStack: () => getLayerStack(),
      settlementPending: () => false,
      groundRestRecovery: () => 20,
      endDayOptions: () => [],
      requestEndDay: vi.fn(),
      confirmEndDay: vi.fn(),
      cancelEndDay: vi.fn(),
      ...overrides,
    } as unknown as GameClient;
  }

  it("press 1 → select entity → entity-selected layer is active", () => {
    const entities = [{ id: "npc1", name: "老马", type: "npc" }];
    const client = mockClientWithLayerSync({
      room: () => ({ entities }) as never,
      entity: () => ({ id: "player" }) as never,
      capabilities: () => [cap("talk", { type: "npc_select", values: ["npc1"] }, "交谈")],
    });
    expect(hasLayer("entity-selected")).toBe(false);

    const key = mockKey("1");
    dispatchKey(key, client);
    expect(client.setSelectedEntityId).toHaveBeenCalledWith("npc1");
    expect(hasLayer("entity-selected")).toBe(true);
  });

  it("select entity → press 1 again → triggers entity action (not re-select)", () => {
    const entities = [{ id: "npc1", name: "老马", type: "npc" }];
    const client = mockClientWithLayerSync({
      room: () => ({ entities }) as never,
      entity: () => ({ id: "player" }) as never,
      capabilities: () => [cap("talk", { type: "npc_select", values: ["npc1"] }, "交谈")],
    });

    dispatchKey(mockKey("1"), client);
    expect(hasLayer("entity-selected")).toBe(true);

    dispatchKey(mockKey("1"), client);
    expect(client.requestDialogueOptions).toHaveBeenCalledWith("npc1");
  });

  it("select entity → press escape → deselects and pops layer", () => {
    const entities = [{ id: "npc1", name: "老马", type: "npc" }];
    const client = mockClientWithLayerSync({
      room: () => ({ entities }) as never,
      entity: () => ({ id: "player" }) as never,
    });

    dispatchKey(mockKey("1"), client);
    expect(hasLayer("entity-selected")).toBe(true);

    dispatchKey(mockKey("escape"), client);
    expect(hasLayer("entity-selected")).toBe(false);
  });

  it("open inventory while entity selected → entity-selected evicted", () => {
    const entities = [{ id: "npc1", name: "老马", type: "npc" }];
    const client = mockClientWithLayerSync({
      room: () => ({ entities }) as never,
      entity: () => ({ id: "player" }) as never,
    });

    dispatchKey(mockKey("1"), client);
    expect(hasLayer("entity-selected")).toBe(true);

    client.openInventory();
    expect(hasLayer("entity-selected")).toBe(false);
    expect(hasLayer("inventory")).toBe(true);
  });
});
