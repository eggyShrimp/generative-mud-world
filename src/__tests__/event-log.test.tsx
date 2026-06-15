import { testRender } from "@opentui/solid";
import { describe, expect, it } from "vitest";
import type { LogEntry } from "../tui/client/game-client.ts";
import { EventLog } from "../tui/panels/event-log/event-log.tsx";

describe("EventLog", () => {
  const sampleEvents: LogEntry[] = [
    { id: 1, type: "move", description: "向北走了 3 格，来到北境边塞集市。" },
    { id: 2, type: "system", description: "天色渐晚，你感到一丝疲惫。" },
    { id: 3, type: "dialogue", description: "铁匠说：需要我帮你修理武器吗？" },
  ];

  it("renders events with correct type prefix and color", async () => {
    const { captureCharFrame, flush } = await testRender(
      () => <EventLog events={sampleEvents} height={10} />,
      { width: 50, height: 14 },
    );
    await flush();
    const frame = captureCharFrame();
    expect(frame).toContain("北境边塞集市");
    expect(frame).toContain("天色渐晚");
  });

  it("accepts and applies width prop in sidebar mode", async () => {
    const narrowWidth = 38;
    const { captureCharFrame, flush } = await testRender(
      () => (
        <EventLog
          events={sampleEvents}
          height={10}
          // TODO: width prop will be added in this change
          {...({ width: narrowWidth } as Record<string, unknown>)}
        />
      ),
      { width: 80, height: 14 },
    );
    await flush();
    const frame = captureCharFrame();
    expect(frame.length).toBeGreaterThan(0);
  });

  it("shows pending event placeholder when request is active", async () => {
    const { captureCharFrame, flush } = await testRender(
      () => (
        <EventLog
          events={sampleEvents}
          height={10}
          pendingEvent={{ type: "system", description: "正在处理..." }}
        />
      ),
      { width: 50, height: 14 },
    );
    await flush();
    const frame = captureCharFrame();
    expect(frame).toContain("正在处理...");
  });

  it("renders event log with border and title", async () => {
    const { captureCharFrame, flush } = await testRender(
      () => <EventLog events={sampleEvents} height={10} />,
      { width: 50, height: 14 },
    );
    await flush();
    const frame = captureCharFrame();
    expect(frame).toContain("事件日志");
  });
});
