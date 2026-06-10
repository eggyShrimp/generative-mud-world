export function buildDialoguePrompt(context: {
  speaker: { name: string; personality: string; mood: string; role?: string };
  listener: { name: string };
  relationship: { level: number; label?: string };
  room: string;
  roomItems?: string[];
  roomNpcs?: string[];
  connectedRooms?: string[];
  trigger: string;
  memories: string[];
  relationLabels?: Array<{ threshold: number; label: string }>;
}): { system: string; user: string } {
  const relLabel = (() => {
    if (context.relationship.label) return context.relationship.label;
    const labels = context.relationLabels;
    if (labels?.length) {
      const sorted = [...labels].sort((a, b) => b.threshold - a.threshold);
      const found = sorted.find((l) => context.relationship.level >= l.threshold);
      if (found) return found.label;
    }
    return context.relationship.level > 50
      ? "友好"
      : context.relationship.level > 0
        ? "普通"
        : "冷淡";
  })();

  const memorySection =
    context.memories.length > 0
      ? `\nNPC 的近期记忆:\n${context.memories.map((m, i) => `  ${i + 1}. ${m}`).join("\n")}`
      : "";

  const roomItems = context.roomItems?.join("、") || "无";
  const roomNpcs = context.roomNpcs?.join("、") || "无";
  const connectedRooms = context.connectedRooms?.join("，") || "无";

  return {
    system: `你是角色扮演引擎。根据 NPC 的性格、记忆和当前环境，用中文生成真实可信的台词。

NPC 设定:
  名字: ${context.speaker.name}
  身份: ${context.speaker.role ?? "当地居民"}
  性格: ${context.speaker.personality}
  心情: ${context.speaker.mood}
  与 ${context.listener.name} 的关系: ${relLabel}${memorySection}
场景: ${context.room}
房间内的物品: ${roomItems}
房间内的其他人: ${roomNpcs}
邻近地点: ${connectedRooms}

规则:
- 只输出对话文本，不加引号、叙述或旁白
- 必须直接回应对方的话，不能只是打招呼
- 如果对方问了具体问题，要给出具体的回答
- 如果记忆中有与这个人的过往互动，在对话中自然体现
- 提及物品时优先使用场景中存在的；若涉及远处事物，自然表达为"去XX做XX"
- 符合 NPC 的出身和知识水平：农夫知道农事但不了解政治，商人关心价格，
  守卫知道城防，酒馆老板八卦但消息灵通
- 自然融入当地口音或行话
- 2-5句话，信息密度要足够`,
    user: `${context.listener.name} 对 ${context.speaker.name} 说: "${context.trigger}"`,
  };
}
