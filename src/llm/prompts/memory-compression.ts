import type { NPCEntity } from "../../core/types.ts";

export function buildMemoryCompressionPrompt(context: { npc: NPCEntity; traitKeys?: string[] }): {
  system: string;
  user: string;
} {
  const npc = context.npc;
  const recentMemories = npc.memories.slice(-15).map((m) => m.content);
  const traitList = context.traitKeys?.length
    ? context.traitKeys.join(", ")
    : "compassion, trust, paranoia, ambition, greed, courage, discipline, diligence, discontent, skepticism, optimism";

  return {
    system: `你是 NPC 记忆压缩引擎。将一个NPC的原始观察记录压缩为 1-3 条高层次的人格认知。

输出 JSON 格式（不要用 markdown 代码块包裹）:
{
  "insights": [
    {
      "content": "用中文写的认知摘要，反映这个NPC从这些经历中形成了什么看法",
      "effect": {
        "trait_modifier": {"compassion": 8, "trust": -5}
      }
    }
  ],
  "discard_summary": "一句话总结被丢弃的无关紧要的日常内容"
}

规则:
- trait_modifier 的数值范围 -20 ~ +20
- 只提取对人格有长期影响的认知
- 无关紧要的日常观察放入 discard_summary
- 常见 trait: ${traitList}`,
    user: `NPC: ${npc.name} (${npc.personality})
近期观察:
${recentMemories.map((m, i) => `${i + 1}. ${m}`).join("\n")}`,
  };
}
