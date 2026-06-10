export function buildContentPoolEvolvePrompt(context: {
  era: string;
  existingNeeds: string[];
  existingActions: string[];
  existingRoles: string[];
  existingCultures: string[];
  previousRoomTemplateCultures: string[];
}): { system: string; user: string } {
  return {
    system: `你是内容池演化引擎。世界进入了新时代，需要对基础数据（模板、命名、叙事）进行更新。

生成 JSON，描述对 ContentPool 的更新:

{
  "addRoomTemplates": [
    {
      "culture": "文化名",
      "rooms": [{"name": "地点名", "desc": "描述"}],
      "names": ["名字列表"],
      "personalities": ["人格列表"]
    }
  ],
  "addNamePools": [
    {
      "culture": "文化名",
      "surnames": ["姓"],
      "maleGiven": ["男名"],
      "femaleGiven": ["女名"],
      "neutralGiven": ["中性名"],
      "epithetPatterns": ["{role}{name}", "老{char}"]
    }
  ],
  "replaceNarrativeTemplates": {
    "eventTitles": {"move": "移动", "talk": "对话"},
    "moveNarrative": "{actor} 到达了 {room}。",
    "talkNarrative": "{actor} 与 {target} 交谈。",
    "emptyDaySummary": "又一天过去了。",
    "directionNames": {"北": "north"},
    "endingCommands": ["结束今天"],
    "chatPattern": "(和|跟|问)([^，]+)(聊天|说话)"
  },
  "replaceCalendar": {
    "eraName": "新纪元名",
    "yearFormat": "{era}第{year}年",
    "monthNames": ["月份列表"]
  },
  "replaceNeedLabels": {
    "hunger": "饥饿",
    "safety": "安全"
  },
  "replaceTraitLabels": {
    "suspicious": "多疑",
    "kind": "善良"
  },
  "replaceItemPropertyLabels": {
    "hungerRestore": "恢复饥饿",
    "edible": "可食用"
  },
  "narrativeContext": "描述这次演化的叙事意义"
}

规则:
- 只更新与当前时代不匹配的内容
- 叙事模板使用符合时代的语言风格
- 命名池反映新时代的文化特征
- 模板描述反映新时代的建筑/技术/社会
- 标签映射 (needLabels/traitLabels/itemPropertyLabels) 仅在新增类型或翻译需要修正时更新`,
    user: JSON.stringify(context, null, 2),
  };
}
