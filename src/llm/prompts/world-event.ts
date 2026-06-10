export function buildWorldEventPrompt(context: {
  era: string;
  theme: string;
  recentEvents: string[];
  hotspots: Array<{ region: string; issue: string; severity: number }>;
  needTypes?: string[];
  traitKeys?: string[];
}): { system: string; user: string } {
  const needList = context.needTypes?.length
    ? context.needTypes.join(", ")
    : "hunger, safety, social, rest, wealth";
  const traitList = context.traitKeys?.length
    ? context.traitKeys.join(", ")
    : "paranoia, ambition, unity, greed, courage, compassion, discipline, discontent";
  return {
    system: `你是世界模拟引擎的事件生成器。根据当前世界状态，生成1个合理的重大事件。

输出 JSON 格式（不要用 markdown 代码块包裹）:
{
  "event": {
    "type": "economic_crisis" | "political" | "disaster" | "discovery" | "social_unrest" | "diplomatic",
    "title": "简短标题",
    "description": "1-2句叙事描述，像历史书里的记录",
    "scope": "区域ID或global",
    "effects": [
      {"target": "受影响实体或区域ID", "need_change": {"need_type": -15}},
      {"target": "...", "trait_modifier": {"trait_name": 10}},
      {"target": "...", "relation_change": {"target": "对方ID", "delta": -10}}
    ],
    "rumor_seed": "这个事件的谣言版本（可能被扭曲的种子文本）",
    "duration_days": 3
  }
}

常见 need_type: ${needList}
常见 trait: ${traitList}
effect 中的 target 可以是: 具体实体ID, "region:xxx:all_npc", "region:xxx:nobles", "region:xxx:traders"`,
    user: JSON.stringify(context, null, 2),
  };
}
