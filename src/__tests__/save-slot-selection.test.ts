import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SaveManager } from "../core/save-manager.ts";
import { resolveSaveSlot } from "../core/save-slot-selection.ts";

describe("resolveSaveSlot", () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), "world-save-select-"));
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  it("skip mode returns configured SAVE_SLOT without prompting", async () => {
    const prompt = vi.fn();

    await expect(
      resolveSaveSlot({
        mode: "skip",
        configuredSlot: "slot_001",
        rootDir,
        prompt,
      }),
    ).resolves.toBe("slot_001");
    expect(prompt).not.toHaveBeenCalled();
  });

  it("prompt mode can select an existing slot by number", async () => {
    SaveManager.create({ rootDir, slotId: "slot_001", worldId: "test_world" }).save();
    SaveManager.create({ rootDir, slotId: "slot_002", worldId: "test_world" }).save();

    const slot = await resolveSaveSlot({
      mode: "prompt",
      configuredSlot: "slot_001",
      rootDir,
      prompt: vi.fn().mockResolvedValue("2"),
    });

    expect(slot).toBe("slot_002");
  });

  it("prompt mode accepts a new slot name", async () => {
    const slot = await resolveSaveSlot({
      mode: "prompt",
      configuredSlot: "slot_001",
      rootDir,
      prompt: vi.fn().mockResolvedValue("slot_new"),
    });

    expect(slot).toBe("slot_new");
  });

  it("rejects unsupported selection modes", async () => {
    await expect(
      resolveSaveSlot({
        mode: "bad",
        configuredSlot: "slot_001",
        rootDir,
      }),
    ).rejects.toThrow("Unsupported SAVE_SELECT mode");
  });
});
