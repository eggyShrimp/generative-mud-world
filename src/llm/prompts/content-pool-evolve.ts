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
	  "addBookContents": [
	    {
	      "id": "stable_book_content_id",
	      "itemTemplateId": "matching_readable_item_template_id",
	      "title": "书名",
	      "pages": ["第一页正文", "第二页正文", "第三页正文"]
	    }
	  ],
	  "addClueDefinitions": [
	    {
	      "id": "clue_stable_id",
	      "description": "线索的自然语言描述，NPC 在对话中引用此线索时使用",
	      "knownByNpcIds": ["npc_id_who_knows"],
	      "relatedRoomId": "optional_room_id"
	    }
	  ],
	  "narrativeContext": "描述这次演化的叙事意义"
	}

规则:
- 只更新与当前时代不匹配的内容
- 叙事模板使用符合时代的语言风格
- 命名池反映新时代的文化特征
- 模板描述反映新时代的建筑/技术/社会
	- 标签映射 (needLabels/traitLabels/itemPropertyLabels) 仅在新增类型或翻译需要修正时更新
	- 如果新增或更新了 properties.readable === true 的物品，必须同时通过 add_book_content 提供对应 itemTemplateId 的书籍内容
	- 书籍内容必须像“玩家正在读到的书内正文”，不要写成第三方介绍、策展说明、旁白评论或物品描述
	- 不要使用“作者显然”“这本书写着”“页边画着”“旁注说”“看起来像”等外部观察语气，除非这些句子本身就是书中正文的一部分
	- 根据书的类型选择文体：经卷用经文/偈语/训诫体；行路札记用第一手路书、条目、告诫；医药手册用药性、用法、禁忌条目
	- 每本书建议 2-5 页；每页建议 300-600 个中文字符，允许分段；pages 数组顺序就是阅读器页码
	- 每页都应有可读的完整内容，不要只写标题、摘要、占位符或一两句短文本`,
    user: JSON.stringify(context, null, 2),
  };
}
