import { testRender } from "@opentui/solid";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../tui/app.tsx";
import type { GameClient } from "../tui/client/game-client.ts";
import { getLayerStack, popLayer } from "../tui/key-layer/index.ts";

function resetStack() {
  while (getLayerStack().length > 1) {
    const top = getLayerStack()[getLayerStack().length - 1];
    if (!top) break;
    popLayer(top.id);
  }
}

function mockClient(overrides: Partial<GameClient> = {}): GameClient {
  const fn = vi.fn();
  return {
    connectionState: () => "connected",
    entity: () => null,
    room: () => null,
    capabilities: () => [],
    events: () => [],
    dialogue: () => null,
    hasActiveRequest: () => false,
    status: () => null,
    selectedEntityId: () => null,
    selectedInventoryItemId: () => null,
    selectedQuestIndex: () => null,
    setSelectedQuestIndex: fn,
    mapGranularity: () => "region",
    mapCursor: () => ({ x: 0, y: 0 }),
    isLayerActive: (id: string) => getLayerStack().some((l) => l.id === id),
    activeLayer: () => ({ id: "base", priority: 0, bindings: [] }),
    layerStack: () => getLayerStack(),
    setSelectedEntityId: fn,
    openInventory: fn,
    closeInventory: fn,
    openQuests: fn,
    closeQuests: fn,
    openStatus: fn,
    closeStatus: fn,
    toggleStatus: fn,
    toggleMinimap: fn,
    cycleMapGranularity: fn,
    setMapCursor: fn,
    setSelectedInventoryItemId: fn,
    connect: fn,
    disconnect: fn,
    execute: fn,
    requestDialogueOptions: fn,
    chooseDialogueOption: fn,
    chooseTradeOption: fn,
    clearTradeSelection: fn,
    closeDialogue: fn,
    switchDialogueTab: fn,
    requestTradeOptions: fn,
    startCombat: fn,
    endCombat: fn,
    trackedQuestIds: () => new Set(),
    toggleTrackQuest: fn,
    isTrackingQuest: () => false,
    questNotification: () => null,
    showQuestNotification: fn,
    dismissQuestNotification: fn,
    itemChangeNotification: () => null,
    showItemChangeNotification: fn,
    dismissItemChangeNotification: fn,
    combatLog: () => [],
    combatRound: () => 0,
    settlementPending: () => false,
    groundRestRecovery: () => 20,
    itemPropertyLabels: () => ({}),
    endDayOptions: () => [],
    requestEndDay: fn,
    confirmEndDay: fn,
    cancelEndDay: fn,
    travelogue: () => [],
    selectedTravelogueIndex: () => null,
    setSelectedTravelogueIndex: fn,
    openTravelogue: fn,
    closeTravelogue: fn,
    saveSlots: () => [],
    selectedSaveSlotIndex: () => null,
    setSelectedSaveSlotIndex: fn,
    savePanelLoading: () => false,
    savePanelMessage: () => null,
    bookReader: () => null,
    openBookReader: fn,
    closeBookReader: fn,
    nextBookPage: fn,
    prevBookPage: fn,
    scrollBookReader: fn,
    openSavePanel: fn,
    closeSavePanel: fn,
    requestSaveSlots: fn,
    manualSave: fn,
    createSaveSlot: fn,
    ...overrides,
  } as unknown as GameClient;
}

describe("App — wide mode layout ordering", () => {
  beforeEach(() => {
    resetStack();
  });

  it("renders EventLog in right sidebar alongside RoomPanel", async () => {
    const client = mockClient({
      entity: () => ({
        id: "p1",
        name: "冒险者",
        type: "player",
        roomId: "room_1",
        needs: [{ type: "hunger", label: "饥饿", value: 80 }],
      }),
      room: () => ({
        id: "room_1",
        name: "村口",
        description: "这是村庄的入口，一条土路通向远方。",
        exits: {},
        entities: [],
      }),
      events: () => [{ id: 1, type: "system", description: "你来到了村口。" }],
    });
    const { captureCharFrame, flush } = await testRender(() => <App client={client} />, {
      width: 120,
      height: 40,
    });
    await flush();
    const frame = captureCharFrame();

    // EventLog title should be visible in sidebar position
    expect(frame).toContain("事件日志");
    // Room name should be visible in main panel
    expect(frame).toContain("村口");
  });

  it("has no '角色状态' title in wide mode", async () => {
    const client = mockClient({
      entity: () => ({
        id: "p1",
        name: "冒险者",
        type: "player",
        roomId: "room_1",
        needs: [{ type: "hunger", label: "饥饿", value: 80 }],
      }),
      room: () => ({
        id: "room_1",
        name: "村口",
        description: "这是村庄的入口。",
        exits: {},
        entities: [],
      }),
    });
    const { captureCharFrame, flush } = await testRender(() => <App client={client} />, {
      width: 120,
      height: 40,
    });
    await flush();
    const frame = captureCharFrame();
    expect(frame).not.toContain("角色状态");
  });

  it("needs appear in bottom bar (horizontal format)", async () => {
    const client = mockClient({
      entity: () => ({
        id: "p1",
        name: "冒险者",
        type: "player",
        roomId: "room_1",
        needs: [
          { type: "hunger", label: "饥饿", value: 80 },
          { type: "thirst", label: "口渴", value: 45 },
        ],
      }),
      room: () => ({
        id: "room_1",
        name: "村口",
        description: "这是村庄的入口。",
        exits: {},
        entities: [],
      }),
    });
    const { captureCharFrame, flush } = await testRender(() => <App client={client} />, {
      width: 120,
      height: 40,
    });
    await flush();
    const frame = captureCharFrame();
    expect(frame).toContain("饥饿");
    expect(frame).toContain("口渴");
  });
});
