import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SaveManager } from "../core/save-manager.ts";
import type { WorldState } from "../core/types.ts";

describe("SaveManager", () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), "world-save-manager-"));
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  describe("create", () => {
    it("creates data with correct meta", () => {
      const mgr = SaveManager.create({
        rootDir,
        slotId: "slot_001",
        worldId: "test_world",
        currentTick: 100,
        currentRound: 5,
      });
      const data = mgr.data;

      expect(data.version).toBe(1);
      expect(data.meta.slotId).toBe("slot_001");
      expect(data.meta.worldId).toBe("test_world");
      expect(data.meta.gameTick).toBe(100);
      expect(data.meta.round).toBe(5);
      expect(data.meta.savedAt).toBeGreaterThan(0);
      expect(data.conversations.summaries).toEqual({});
    });
  });

  describe("conversations", () => {
    it("returns null when no summary exists", () => {
      const mgr = SaveManager.create({ rootDir, slotId: "slot_001", worldId: "test_world" });
      expect(mgr.conversations.getSummary("player1", "npc1")).toBeNull();
    });

    it("roundtrips a summary", () => {
      const mgr = SaveManager.create({ rootDir, slotId: "slot_001", worldId: "test_world" });
      mgr.conversations.setSummary("player1", "npc1", "老马跟你聊了北山土匪的事。", 42);
      expect(mgr.conversations.getSummary("player1", "npc1")).toBe("老马跟你聊了北山土匪的事。");
    });

    it("returns latest summary when multiple exist for the same pair", () => {
      const mgr = SaveManager.create({ rootDir, slotId: "slot_001", worldId: "test_world" });
      mgr.conversations.setSummary("player1", "npc1", "第一次对话总结", 10);
      mgr.conversations.setSummary("player1", "npc1", "第二次对话总结", 20);
      expect(mgr.conversations.getSummary("player1", "npc1")).toBe("第二次对话总结");
    });

    it("stores summaries for different player-npc pairs independently", () => {
      const mgr = SaveManager.create({ rootDir, slotId: "slot_001", worldId: "test_world" });
      mgr.conversations.setSummary("p1", "npc1", "玩家1与NPC1的对话", 10);
      mgr.conversations.setSummary("p1", "npc2", "玩家1与NPC2的对话", 20);
      mgr.conversations.setSummary("p2", "npc1", "玩家2与NPC1的对话", 30);

      expect(mgr.conversations.getSummary("p1", "npc1")).toBe("玩家1与NPC1的对话");
      expect(mgr.conversations.getSummary("p1", "npc2")).toBe("玩家1与NPC2的对话");
      expect(mgr.conversations.getSummary("p2", "npc1")).toBe("玩家2与NPC1的对话");
      expect(mgr.conversations.getSummary("p2", "npc2")).toBeNull();
    });
  });

  describe("getMeta / updateMeta", () => {
    it("returns a copy of meta (not a reference)", () => {
      const mgr = SaveManager.create({ rootDir, slotId: "slot_001", worldId: "test_world" });
      const meta = mgr.getMeta();
      meta.gameTick = 999;
      expect(mgr.data.meta.gameTick).toBe(0);
    });

    it("updates meta tick and round", () => {
      const mgr = SaveManager.create({ rootDir, slotId: "slot_001", worldId: "test_world" });
      mgr.updateMeta(200, 10);
      expect(mgr.data.meta.gameTick).toBe(200);
      expect(mgr.data.meta.round).toBe(10);
    });
  });

  describe("load", () => {
    it("creates a new save when slot file does not exist", () => {
      const mgr = SaveManager.load({
        rootDir,
        slotId: "__nonexistent_test_slot__",
        worldId: "test_world",
      });
      expect(mgr.data.meta.slotId).toBe("__nonexistent_test_slot__");
      expect(mgr.data.meta.worldId).toBe("test_world");
      expect(mgr.data.meta.gameTick).toBe(0);
      expect(mgr.data.conversations.summaries).toEqual({});
    });

    it("loads valid JSON from the configured directory", () => {
      const mgr = SaveManager.create({
        rootDir,
        slotId: "slot_001",
        worldId: "test_world",
        currentTick: 3,
        currentRound: 2,
      });
      mgr.conversations.setSummary("p1", "npc1", "聊过北山。", 3);
      mgr.save();

      const loaded = SaveManager.load({ rootDir, slotId: "slot_001", worldId: "test_world" });

      expect(loaded.getMeta()).toMatchObject({ slotId: "slot_001", gameTick: 3, round: 2 });
      expect(loaded.conversations.getSummary("p1", "npc1")).toBe("聊过北山。");
    });

    it("recovers from malformed JSON by creating a fresh save", () => {
      writeFileSync(join(rootDir, "slot_001.json"), "{ bad json", "utf-8");

      const mgr = SaveManager.load({ rootDir, slotId: "slot_001", worldId: "test_world" });

      expect(mgr.getMeta()).toMatchObject({ slotId: "slot_001", worldId: "test_world" });
      expect(mgr.conversations.getSummary("p1", "npc1")).toBeNull();
    });

    it("rejects saves from another world", () => {
      const mgr = SaveManager.create({ rootDir, slotId: "slot_001", worldId: "other_world" });
      mgr.conversations.setSummary("p1", "npc1", "旧世界摘要", 1);
      mgr.save();

      const loaded = SaveManager.load({ rootDir, slotId: "slot_001", worldId: "test_world" });

      expect(loaded.getMeta().worldId).toBe("test_world");
      expect(loaded.conversations.getSummary("p1", "npc1")).toBeNull();
    });

    it("migrates legacy saves without a version field", () => {
      writeFileSync(
        join(rootDir, "slot_001.json"),
        JSON.stringify({
          meta: {
            slotId: "slot_001",
            worldId: "test_world",
            savedAt: 1,
            gameTick: 7,
            round: 4,
          },
          conversations: {
            summaries: {
              "p1:npc1": [{ summary: "旧格式摘要", lastTick: 7 }],
            },
          },
        }),
        "utf-8",
      );

      const loaded = SaveManager.load({ rootDir, slotId: "slot_001", worldId: "test_world" });

      expect(loaded.data.version).toBe(1);
      expect(loaded.conversations.getSummary("p1", "npc1")).toBe("旧格式摘要");
    });
  });

  describe("save", () => {
    it("does not throw when saving", () => {
      const mgr = SaveManager.create({ rootDir, slotId: "slot_001", worldId: "test_world" });
      expect(() => mgr.save()).not.toThrow();
    });

    it("lists saved slots through slot info", () => {
      const mgr = SaveManager.create({
        rootDir,
        slotId: "slot_001",
        worldId: "test_world",
        currentTick: 10,
        currentRound: 2,
      });
      mgr.conversations.setSummary("p1", "npc1", "聊过一次", 10);
      mgr.save();

      const slots = mgr.listSlots();

      expect(slots).toHaveLength(1);
      expect(slots[0]).toMatchObject({
        slotId: "slot_001",
        worldId: "test_world",
        gameTick: 10,
        round: 2,
        version: 1,
        isCurrent: true,
        summaryCount: 1,
        valid: true,
      });
    });

    it("saves current data into another slot", () => {
      const mgr = SaveManager.create({
        rootDir,
        slotId: "slot_001",
        worldId: "test_world",
        currentTick: 10,
        currentRound: 2,
      });
      mgr.conversations.setSummary("p1", "npc1", "聊过一次", 10);

      const slot = mgr.saveAs("slot_002", { tick: 20, round: 4 } as WorldState);
      const slots = mgr.listSlots();

      expect(slot).toMatchObject({
        slotId: "slot_002",
        gameTick: 20,
        round: 4,
        isCurrent: false,
        summaryCount: 1,
      });
      expect(slots.map((s) => s.slotId)).toContain("slot_002");
    });

    it("writes formatted JSON with a trailing newline", () => {
      const mgr = SaveManager.create({ rootDir, slotId: "slot_001", worldId: "test_world" });
      mgr.save();

      const raw = readFileSync(join(rootDir, "slot_001.json"), "utf-8");

      expect(raw.endsWith("\n")).toBe(true);
      expect(() => JSON.parse(raw)).not.toThrow();
      expect(raw).toContain('\n  "version": 1,');
    });

    it("does not leave the temporary file after a successful save", () => {
      const mgr = SaveManager.create({ rootDir, slotId: "slot_001", worldId: "test_world" });
      mgr.save();

      expect(existsSync(join(rootDir, ".slot_001.tmp"))).toBe(false);
      expect(readdirSync(rootDir)).toEqual(["slot_001.json"]);
    });

    it("capture updates the persisted tick and round", () => {
      const mgr = SaveManager.create({ rootDir, slotId: "slot_001", worldId: "test_world" });
      mgr.capture({ tick: 25, round: 6 } as WorldState);

      expect(mgr.getMeta()).toMatchObject({ gameTick: 25, round: 6 });
    });

    it("data returns a copy instead of mutable raw SaveData", () => {
      const mgr = SaveManager.create({ rootDir, slotId: "slot_001", worldId: "test_world" });
      const data = mgr.data;

      data.conversations.summaries["p1:npc1"] = [{ summary: "外部写入", lastTick: 1 }];

      expect(mgr.conversations.getSummary("p1", "npc1")).toBeNull();
    });
  });

  describe("weather persistence", () => {
    it("capture persists weatherByRegion", () => {
      const mgr = SaveManager.create({ rootDir, slotId: "slot_001", worldId: "test_world" });
      const world = { tick: 10, round: 1, weatherByRegion: new Map() } as WorldState;
      world.weatherByRegion.set("dunhuang", {
        id: "blizzard",
        label: "暴风雪",
        movementMultiplier: 0.3,
        visibilityMultiplier: 0.5,
        narrativeDesc: "漫天飞雪，视线模糊",
      });
      world.weatherByRegion.set("yumen", {
        id: "clear",
        label: "晴朗",
        movementMultiplier: 1.0,
        visibilityMultiplier: 1.0,
        narrativeDesc: "万里无云",
      });

      mgr.capture(world);
      const data = mgr.data;

      expect(data.weatherByRegion).toEqual({
        dunhuang: {
          id: "blizzard",
          label: "暴风雪",
          movementMultiplier: 0.3,
          visibilityMultiplier: 0.5,
          narrativeDesc: "漫天飞雪，视线模糊",
        },
        yumen: {
          id: "clear",
          label: "晴朗",
          movementMultiplier: 1.0,
          visibilityMultiplier: 1.0,
          narrativeDesc: "万里无云",
        },
      });
    });

    it("restore reads back persisted weather without rerolling", () => {
      const mgr = SaveManager.create({ rootDir, slotId: "slot_001", worldId: "test_world" });
      const world = { tick: 10, round: 1, weatherByRegion: new Map() } as WorldState;
      world.weatherByRegion.set("dunhuang", {
        id: "blizzard",
        label: "暴风雪",
        movementMultiplier: 0.3,
        visibilityMultiplier: 0.5,
        narrativeDesc: "漫天飞雪，视线模糊",
      });

      mgr.capture(world);
      mgr.save();

      const restoredWorld = { tick: 10, round: 1, weatherByRegion: new Map() } as WorldState;
      mgr.restore(restoredWorld);

      expect(restoredWorld.weatherByRegion.get("dunhuang")).toEqual({
        id: "blizzard",
        label: "暴风雪",
        movementMultiplier: 0.3,
        visibilityMultiplier: 0.5,
        narrativeDesc: "漫天飞雪，视线模糊",
      });
    });

    it("capture and restore preserve empty weatherByRegion", () => {
      const mgr = SaveManager.create({ rootDir, slotId: "slot_001", worldId: "test_world" });
      const world = { tick: 10, round: 1, weatherByRegion: new Map() } as WorldState;

      mgr.capture(world);
      const restoredWorld = { tick: 10, round: 1, weatherByRegion: new Map() } as WorldState;
      mgr.restore(restoredWorld);

      expect(restoredWorld.weatherByRegion.size).toBe(0);
    });
  });
});
