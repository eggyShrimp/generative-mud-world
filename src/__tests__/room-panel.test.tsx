import { testRender } from "@opentui/solid";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomEntity } from "../shared/protocol.ts";
import type { GameClient } from "../tui/client/game-client.ts";
import { getLayerStack, popLayer } from "../tui/key-layer/index.ts";
import { RoomPanel } from "../tui/panels/room/room-panel.tsx";

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
    room: () => ({
      id: "room_1",
      name: "村口",
      description: "一个安静的村庄入口。",
      exits: {},
      entities: [],
    }),
    entity: () => null,
    capabilities: () => [],
    hasActiveRequest: () => false,
    execute: fn,
    setSelectedEntityId: fn,
    interactWithEntity: fn,
    itemPropertyLabels: () => ({}),
    ...overrides,
  } as unknown as GameClient;
}

describe("RoomPanel — entity detail popup routing", () => {
  beforeEach(() => {
    resetStack();
  });

  it("renders EntityDetailPopup when selected entity is an item", async () => {
    const selectedEntity: RoomEntity = {
      id: "e1",
      name: "干面包",
      type: "item",
      typeLabel: "物品",
      description: "一块干硬的面包。",
      takeable: true,
    };
    const client = mockClient();
    const { captureCharFrame, flush } = await testRender(
      () => (
        <RoomPanel
          client={client}
          entities={[selectedEntity]}
          selectedEntity={selectedEntity}
          height={20}
          width={52}
        />
      ),
      { width: 120, height: 40 },
    );
    await flush();
    const frame = captureCharFrame();
    expect(frame).toContain("物品");
    expect(frame).toContain("一块干硬的面包。");
  });

  it("renders TargetActionPopup when selected entity is not an item", async () => {
    const selectedEntity: RoomEntity = {
      id: "e2",
      name: "守卫",
      type: "npc",
      typeLabel: "人物",
      description: "一个站岗的守卫。",
      interactable: true,
    };
    const client = mockClient({
      capabilities: () => [{ action: "look", label: "观察" }],
    });
    const { captureCharFrame, flush } = await testRender(
      () => (
        <RoomPanel
          client={client}
          entities={[selectedEntity]}
          selectedEntity={selectedEntity}
          height={20}
          width={52}
        />
      ),
      { width: 120, height: 40 },
    );
    await flush();
    const frame = captureCharFrame();
    expect(frame).toContain("观察");
    expect(frame).not.toContain("物品");
  });

  it("renders no popup when no entity is selected", async () => {
    const entities: RoomEntity[] = [
      {
        id: "e3",
        name: "干面包",
        type: "item",
        typeLabel: "物品",
        description: "一块干硬的面包。",
        takeable: true,
      },
    ];
    const client = mockClient();
    const { captureCharFrame, flush } = await testRender(
      () => (
        <RoomPanel
          client={client}
          entities={entities}
          selectedEntity={null}
          height={20}
          width={52}
        />
      ),
      { width: 120, height: 40 },
    );
    await flush();
    const frame = captureCharFrame();
    expect(frame).toContain("干面包");
    expect(frame).not.toContain("拾取");
  });
});
