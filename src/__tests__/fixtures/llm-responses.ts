/**
 * 共享 LLM Mock 响应数据
 *
 * 集成测试使用的标准化 JSON 响应。
 * 与 prompt schema 保持同步 —— 如果 LLM prompt 的 JSON schema 变了，
 * 这里也要更新。
 */
import type { SimulationDelta } from "../../core/types.ts";
import type { ToolCallResult } from "../../llm/adapter.ts";

// ============================================================
// 对话回复 —— tool_calls 格式
// ============================================================

/** shift_relation: 轻微正面关系变化 */
export const TOOL_SHIFT_RELATION_SLIGHT: ToolCallResult = {
  id: "call_rel_1",
  function: {
    name: "shift_relation",
    arguments: JSON.stringify({ target: "player", direction: "slight_positive" }),
  },
};

/** affect_need: 正面社交需求 */
export const TOOL_AFFECT_NEED_SOCIAL: ToolCallResult = {
  id: "call_need_1",
  function: {
    name: "affect_need",
    arguments: JSON.stringify({ target: "self", need: "social", direction: "slight_positive" }),
  },
};

/** share_information: 警告 */
export const TOOL_SHARE_INFORMATION: ToolCallResult = {
  id: "call_info_1",
  function: {
    name: "share_information",
    arguments: JSON.stringify({
      type: "warning",
      content: "东山有兽人出没，小心为妙。",
    }),
  },
};

/** express_emotion */
export const TOOL_EXPRESS_EMOTION: ToolCallResult = {
  id: "call_emo_1",
  function: {
    name: "express_emotion",
    arguments: JSON.stringify({ emotion: "grateful" }),
  },
};

/** 多个 tool_calls 组合 */
export const MULTI_TOOL_CALLS: ToolCallResult[] = [
  TOOL_SHIFT_RELATION_SLIGHT,
  TOOL_AFFECT_NEED_SOCIAL,
  TOOL_SHARE_INFORMATION,
];

// ============================================================
// idle-chat JSON 格式回复 (配合新 prompt schema)
// ============================================================

/** LLM 返回的 JSON 格式 idle-chat 回复 */
export const IDLE_CHAT_REPLY_JSON = '{"reply": "这里的天很蓝，你从哪里来？"}';

/** LLM 返回的带 NPC 名称前缀的原始文本 (用于测试 fallback 剥离) */
export const IDLE_CHAT_REPLY_WITH_NPC_PREFIX = "法显：这里的天很蓝，你从哪里来？";

// ============================================================
// 对话回复 —— 完整 SimulationDelta 产出
// ============================================================

/** 轻微正面对话回复 delta */
export function dialogueDeltaSimple(npcId: string, roomId: string): SimulationDelta {
  return {
    dialogues: [{ speakerId: npcId, content: "你好，年轻人。", roomId, tick: 0 }],
    relationChanges: [{ fromId: "p1", toId: npcId, delta: 1 }],
  };
}

/** 完整对话回复 delta (关系 + 需求 + 信息) */
export function dialogueDeltaFull(npcId: string, roomId: string): SimulationDelta {
  return {
    dialogues: [{ speakerId: npcId, content: "最近不太平，东山有兽人。", roomId, tick: 0 }],
    relationChanges: [{ fromId: "p1", toId: npcId, delta: 2 }],
    needChanges: [{ targetId: npcId, needType: "social", delta: 3 }],
    worldEvents: [
      {
        id: "info_test_1",
        type: "information",
        title: "警告",
        description: "东山有兽人",
        scope: roomId,
        tick: 0,
        source: "llm",
        data: { infoType: "warning" },
      },
    ],
  };
}

// ============================================================
// Settlement batch —— LLM 产出
// ============================================================

/** 世界事件 LLM 输出文本 (供 parseWorldEventOutput 解析) */
export const WORLD_EVENT_OUTPUT_TEXT = JSON.stringify({
  title: "边境冲突",
  description: "西境巡逻队与游牧部落发生小规模冲突。",
  effects: {
    needChanges: [{ target: "all", needType: "safety", delta: -3 }],
    traitModifiers: [{ target: "all", trait: "courage", delta: 1 }],
  },
});

/** 记忆压缩 LLM 输出文本 */
export const MEMORY_COMPRESSION_OUTPUT_TEXT = JSON.stringify({
  insights: ["这个村庄的居民对陌生人持谨慎态度。", "铁匠铺是村里的消息集散地。"],
  traitModifiers: [{ trait: "suspicious", delta: 2 }],
});

// ============================================================
// 对话回复 —— 含物品交换
// ============================================================

/** 对话 delta 含 itemChanges（NPC → 玩家物品转移） */
export function dialogueDeltaWithItemExchange(
  npcId: string,
  roomId: string,
  itemId: string,
  itemName: string,
): SimulationDelta {
  return {
    dialogues: [{ speakerId: npcId, content: `这${itemName}送你。`, roomId, tick: 0 }],
    itemChanges: [
      { targetId: npcId, templateId: itemId, operation: "remove", qty: 1, itemId },
      { targetId: "p1", templateId: itemId, operation: "add", qty: 1, itemId, name: itemName },
    ],
    worldEvents: [
      {
        id: `ex_${npcId}_${Date.now()}`,
        type: "item_exchange",
        title: `物品交换: ${itemName}`,
        description: `${npcId} 给了你 ${itemName}`,
        scope: roomId,
        tick: 0,
        source: "llm",
        data: { direction: "give", item: itemName, transferred: true },
      },
    ],
  };
}
