import { describe, expect, it } from "vitest";
import { SaveManager } from "../core/save-manager.ts";

describe("SaveManager", () => {
  describe("create", () => {
    it("creates data with correct meta", () => {
      const mgr = SaveManager.create("slot_001", "test_world", 100, 5);
      const data = mgr.data;

      expect(data.meta.slotId).toBe("slot_001");
      expect(data.meta.worldId).toBe("test_world");
      expect(data.meta.gameTick).toBe(100);
      expect(data.meta.round).toBe(5);
      expect(data.meta.savedAt).toBeGreaterThan(0);
      expect(data.conversations.summaries).toEqual({});
    });
  });

  describe("getConversationSummary / setConversationSummary", () => {
    it("returns null when no summary exists", () => {
      const mgr = SaveManager.create("slot_001", "test_world", 0, 0);
      expect(mgr.getConversationSummary("player1", "npc1")).toBeNull();
    });

    it("roundtrips a summary", () => {
      const mgr = SaveManager.create("slot_001", "test_world", 0, 0);
      mgr.setConversationSummary("player1", "npc1", "老马跟你聊了北山土匪的事。", 42);
      expect(mgr.getConversationSummary("player1", "npc1")).toBe("老马跟你聊了北山土匪的事。");
    });

    it("returns latest summary when multiple exist for the same pair", () => {
      const mgr = SaveManager.create("slot_001", "test_world", 0, 0);
      mgr.setConversationSummary("player1", "npc1", "第一次对话总结", 10);
      mgr.setConversationSummary("player1", "npc1", "第二次对话总结", 20);
      expect(mgr.getConversationSummary("player1", "npc1")).toBe("第二次对话总结");
    });

    it("stores summaries for different player-npc pairs independently", () => {
      const mgr = SaveManager.create("slot_001", "test_world", 0, 0);
      mgr.setConversationSummary("p1", "npc1", "玩家1与NPC1的对话", 10);
      mgr.setConversationSummary("p1", "npc2", "玩家1与NPC2的对话", 20);
      mgr.setConversationSummary("p2", "npc1", "玩家2与NPC1的对话", 30);

      expect(mgr.getConversationSummary("p1", "npc1")).toBe("玩家1与NPC1的对话");
      expect(mgr.getConversationSummary("p1", "npc2")).toBe("玩家1与NPC2的对话");
      expect(mgr.getConversationSummary("p2", "npc1")).toBe("玩家2与NPC1的对话");
      expect(mgr.getConversationSummary("p2", "npc2")).toBeNull();
    });
  });

  describe("getMeta / updateMeta", () => {
    it("returns a copy of meta (not a reference)", () => {
      const mgr = SaveManager.create("slot_001", "test_world", 0, 0);
      const meta = mgr.getMeta();
      meta.gameTick = 999;
      expect(mgr.data.meta.gameTick).toBe(0);
    });

    it("updates meta tick and round", () => {
      const mgr = SaveManager.create("slot_001", "test_world", 0, 0);
      mgr.updateMeta(200, 10);
      expect(mgr.data.meta.gameTick).toBe(200);
      expect(mgr.data.meta.round).toBe(10);
    });
  });

  describe("load", () => {
    it("creates a new save when slot file does not exist", () => {
      const mgr = SaveManager.load("__nonexistent_test_slot__", "test_world");
      expect(mgr.data.meta.slotId).toBe("__nonexistent_test_slot__");
      expect(mgr.data.meta.worldId).toBe("test_world");
      expect(mgr.data.meta.gameTick).toBe(0);
      expect(mgr.data.conversations.summaries).toEqual({});
    });
  });

  describe("save", () => {
    it("does not throw when saving (creates saves/ dir if needed)", () => {
      const mgr = SaveManager.create("slot_001", "test_world", 0, 0);
      expect(() => mgr.save()).not.toThrow();
    });
  });
});
