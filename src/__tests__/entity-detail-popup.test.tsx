import { testRender } from "@opentui/solid";
import { describe, expect, it, vi } from "vitest";
import type { RoomEntity } from "../shared/protocol.ts";
import type { GameClient } from "../tui/client/game-client.ts";
import { EntityDetailPopup } from "../tui/components/entity-detail-popup.tsx";

function mockClient(overrides: Partial<GameClient> = {}): GameClient {
  return {
    hasActiveRequest: () => false,
    capabilities: () => [],
    setSelectedEntityId: vi.fn(),
    execute: vi.fn(),
    itemPropertyLabels: () => ({}),
    ...overrides,
  } as unknown as GameClient;
}

function itemEntity(overrides: Partial<RoomEntity> = {}): RoomEntity {
  return {
    id: "item_1",
    name: "干面包",
    type: "item",
    typeLabel: "物品",
    description: "一块干硬的面包，勉强能充饥。",
    takeable: true,
    ...overrides,
  };
}

describe("EntityDetailPopup", () => {
  it("renders typeLabel and description for item entity", async () => {
    const client = mockClient();
    const entity = itemEntity();
    const { captureCharFrame, flush } = await testRender(
      () => <EntityDetailPopup client={client} entity={entity} />,
      { width: 120, height: 40 },
    );
    await flush();
    const frame = captureCharFrame();
    expect(frame).toContain("干面包");
    expect(frame).toContain("物品");
    expect(frame).toContain("一块干硬的面包，勉强能充饥。");
  });

  it("renders available actions for item entity", async () => {
    const client = mockClient({
      capabilities: () => [{ action: "take", label: "拾取" }],
    });
    const entity = itemEntity();
    const { captureCharFrame, flush } = await testRender(
      () => <EntityDetailPopup client={client} entity={entity} />,
      { width: 120, height: 40 },
    );
    await flush();
    const frame = captureCharFrame();
    expect(frame).toContain("拾取");
    expect(frame).not.toContain("观察");
  });

  it("renders nothing when entity is null", async () => {
    const client = mockClient();
    const { captureCharFrame, flush } = await testRender(
      () => <EntityDetailPopup client={client} entity={null} />,
      { width: 120, height: 40 },
    );
    await flush();
    const frame = captureCharFrame();
    expect(frame).not.toContain("干面包");
    expect(frame).not.toContain("拾取");
  });

  it("shows loading hint when client has active request", async () => {
    const client = mockClient({ hasActiveRequest: () => true });
    const entity = itemEntity();
    const { captureCharFrame, flush } = await testRender(
      () => <EntityDetailPopup client={client} entity={entity} />,
      { width: 120, height: 40 },
    );
    await flush();
    const frame = captureCharFrame();
    expect(frame).toContain("加载中");
    expect(frame).not.toContain("拾取");
  });

  it("does not crash when typeLabel is missing", async () => {
    const client = mockClient();
    const entity = itemEntity({ typeLabel: undefined });
    const { captureCharFrame, flush } = await testRender(
      () => <EntityDetailPopup client={client} entity={entity} />,
      { width: 120, height: 40 },
    );
    await flush();
    const frame = captureCharFrame();
    expect(frame).toContain("干面包");
    expect(frame).toContain("一块干硬的面包");
  });

  it("does not crash when description is missing", async () => {
    const client = mockClient();
    const entity = itemEntity({ description: undefined });
    const { captureCharFrame, flush } = await testRender(
      () => <EntityDetailPopup client={client} entity={entity} />,
      { width: 120, height: 40 },
    );
    await flush();
    const frame = captureCharFrame();
    expect(frame).toContain("干面包");
    expect(frame).toContain("物品");
  });

  it("clears selected entity and executes action on click", async () => {
    const setSelectedEntityId = vi.fn();
    const execute = vi.fn();
    const client = mockClient({
      setSelectedEntityId,
      execute,
      capabilities: () => [{ action: "take", label: "拾取" }],
    });
    const entity = itemEntity();
    const { captureCharFrame, flush } = await testRender(
      () => <EntityDetailPopup client={client} entity={entity} />,
      { width: 120, height: 40 },
    );
    await flush();
    const frame = captureCharFrame();
    expect(frame).toContain("拾取");
  });

  it("does not crash when both typeLabel and description are missing", async () => {
    const client = mockClient({
      capabilities: () => [{ action: "take", label: "拾取" }],
    });
    const entity = itemEntity({ typeLabel: undefined, description: undefined });
    const { captureCharFrame, flush } = await testRender(
      () => <EntityDetailPopup client={client} entity={entity} />,
      { width: 120, height: 40 },
    );
    await flush();
    const frame = captureCharFrame();
    expect(frame).toContain("干面包");
    expect(frame).toContain("拾取");
  });

  it("displays formatted properties for item entity with properties", async () => {
    const client = mockClient({
      itemPropertyLabels: () => ({ weapon: "武器", atkBonus: "攻击" }),
      capabilities: () => [{ action: "take", label: "拾取" }],
    });
    const entity = itemEntity({
      name: "铁剑",
      description: "一把锈迹斑斑的铁剑",
      properties: { weapon: true, atkBonus: 5 },
    });
    const { captureCharFrame, flush } = await testRender(
      () => <EntityDetailPopup client={client} entity={entity} />,
      { width: 120, height: 40 },
    );
    await flush();
    const frame = captureCharFrame();
    expect(frame).toContain("铁剑");
    expect(frame).toContain("一把锈迹斑斑的铁剑");
    expect(frame).toContain("武器");
    expect(frame).toContain("攻击：5");
    expect(frame).toContain("拾取");
  });

  it("renders no properties line when entity has no properties", async () => {
    const client = mockClient({
      itemPropertyLabels: () => ({ weapon: "武器" }),
    });
    const entity = itemEntity({
      description: "一块干硬的面包",
      properties: undefined,
    });
    const { captureCharFrame, flush } = await testRender(
      () => <EntityDetailPopup client={client} entity={entity} />,
      { width: 120, height: 40 },
    );
    await flush();
    const frame = captureCharFrame();
    expect(frame).toContain("一块干硬的面包");
    expect(frame).not.toContain("武器");
  });

  it("does not crash when entity has empty properties object", async () => {
    const client = mockClient();
    const entity = itemEntity({ properties: {} });
    const { captureCharFrame, flush } = await testRender(
      () => <EntityDetailPopup client={client} entity={entity} />,
      { width: 120, height: 40 },
    );
    await flush();
    const frame = captureCharFrame();
    expect(frame).toContain("干面包");
  });
});
