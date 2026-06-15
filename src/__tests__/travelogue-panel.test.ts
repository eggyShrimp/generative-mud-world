import { describe, expect, it } from "vitest";
import {
  formatTravelogueLocationLine,
  getTraveloguePanelLayout,
} from "../tui/features/travelogue/layout.ts";

describe("travelogue panel layout", () => {
  it("keeps both columns bounded in a narrow modal", () => {
    const layout = getTraveloguePanelLayout(36);

    expect(layout.contentWidth).toBe(32);
    expect(layout.listWidth).toBe(14);
    expect(layout.detailWidth).toBe(16);
  });

  it("caps the list column in a wide modal", () => {
    const layout = getTraveloguePanelLayout(96);

    expect(layout.listWidth).toBe(28);
    expect(layout.detailWidth).toBe(62);
  });
});

describe("formatTravelogueLocationLine", () => {
  it("uses readable names for the route line", () => {
    expect(formatTravelogueLocationLine(["集市", "酒馆"])).toBe("途经：集市 → 酒馆");
  });

  it("does not render a route line when there are no readable names", () => {
    expect(formatTravelogueLocationLine([])).toBeNull();
  });
});
