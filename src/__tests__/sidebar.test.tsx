import { testRender } from "@opentui/solid";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameClient } from "../tui/client/game-client.ts";
import { getLayerStack, popLayer } from "../tui/key-layer/index.ts";
import { Sidebar } from "../tui/panels/sidebar/sidebar.tsx";

function resetStack() {
  while (getLayerStack().length > 1) {
    const top = getLayerStack()[getLayerStack().length - 1];
    if (!top) break;
    popLayer(top.id);
  }
}

function mockClient(overrides: Partial<GameClient> = {}): GameClient {
  return {
    entity: () => null,
    hasActiveRequest: () => false,
    activeLayer: () => ({ id: "base", priority: 0, bindings: [] }),
    capabilities: () => [],
    execute: vi.fn(),
    ...overrides,
  } as unknown as GameClient;
}

function mockEntity(overrides: Record<string, unknown> = {}) {
  return () => ({
    id: "p1",
    name: "测试",
    type: "player",
    roomId: "room_1",
    needs: [],
    ...overrides,
  });
}

describe("Sidebar — wide mode (bottom bar)", () => {
  beforeEach(() => {
    resetStack();
  });

  it("has no '角色状态' title in wide mode", async () => {
    const client = mockClient({ entity: mockEntity() });
    const { captureCharFrame, flush } = await testRender(
      () => <Sidebar client={client} height={10} />,
      { width: 120, height: 14 },
    );
    await flush();
    const frame = captureCharFrame();
    expect(frame).not.toContain("角色状态");
  });

  it("does not show '暂无状态' when needs list is empty", async () => {
    const client = mockClient({ entity: mockEntity() });
    const { captureCharFrame, flush } = await testRender(
      () => <Sidebar client={client} height={10} />,
      { width: 120, height: 14 },
    );
    await flush();
    const frame = captureCharFrame();
    expect(frame).not.toContain("暂无状态");
  });

  it("displays needs in compact horizontal format", async () => {
    const client = mockClient({
      entity: mockEntity({
        needs: [
          { type: "hunger", label: "饥饿", value: 80 },
          { type: "thirst", label: "口渴", value: 45 },
        ],
      }),
    });
    const { captureCharFrame, flush } = await testRender(
      () => <Sidebar client={client} height={10} />,
      { width: 120, height: 14 },
    );
    await flush();
    const frame = captureCharFrame();
    expect(frame).toContain("饥饿");
    expect(frame).toContain("口渴");
    expect(frame).toContain("80");
    expect(frame).toContain("45");
  });

  it("renders action buttons from getGlobalBindings", async () => {
    const client = mockClient({
      entity: mockEntity(),
      capabilities: () => [
        { action: "rest", label: "休息" },
        { action: "status", label: "状态" },
      ],
    });
    const { captureCharFrame, flush } = await testRender(
      () => <Sidebar client={client} height={10} />,
      { width: 120, height: 14 },
    );
    await flush();
    const frame = captureCharFrame();
    expect(frame).toContain("休息");
    expect(frame).toContain("存档");
  });

  it("renders action buttons as disabled during active request", async () => {
    const client = mockClient({
      entity: mockEntity(),
      hasActiveRequest: () => true,
    });
    const { captureCharFrame, flush } = await testRender(
      () => <Sidebar client={client} height={10} />,
      { width: 120, height: 14 },
    );
    await flush();
    const frame = captureCharFrame();
    // Disabled buttons still render with key labels
    expect(frame).toContain("休息");
  });
});

describe("Sidebar — needs display", () => {});
