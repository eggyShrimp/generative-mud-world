export function buildContentPoolEvolvePrompt(context: {
  era: string;
  existingNeeds: string[];
  existingActions: string[];
  existingRoles: string[];
  existingCultures: string[];
  existingTraitLabels: string[];
  previousRoomTemplateCultures: string[];
  existingNpcs?: Array<{
    id: string;
    name: string;
    room: string;
    role: string;
    personality: string;
  }>;
  existingRooms?: Array<{ id: string; name: string; region: string; tags: string[] }>;
  existingQuests?: Array<{ id: string; title: string }>;
  existingItemTemplates?: Array<{ id: string; name: string }>;
  existingClues?: Array<{ id: string; description: string }>;
}): { system: string; user: string } {
  const npcHint = context.existingNpcs?.length
    ? `\n## 已知 NPC\n${context.existingNpcs.map((n) => `- ${n.id}: ${n.name}（${n.role}，在 ${n.room}，${n.personality}）`).join("\n")}`
    : "";

  const roomHint = context.existingRooms?.length
    ? `\n## 已知房间\n${context.existingRooms.map((r) => `- ${r.id}: ${r.name} (${r.region}, tags: ${r.tags?.join(", ")})`).join("\n")}`
    : "";

  const questHint = context.existingQuests?.length
    ? `\n## 已有任务（避免重复）\n${context.existingQuests.map((q) => `- ${q.id}: ${q.title}`).join("\n")}`
    : "";

  const itemHint = context.existingItemTemplates?.length
    ? `\n## 可引用物品模板\n${context.existingItemTemplates.map((i) => `- ${i.id}: ${i.name}`).join("\n")}`
    : "";

  const clueHint = context.existingClues?.length
    ? `\n## 已知线索\n${context.existingClues.map((c) => `- ${c.id}: ${c.description}`).join("\n")}`
    : "";

  return {
    system: `你是内容池演化引擎。世界进入了新时代，需要对基础数据进行更新——包括任务、NPC行为、命名、叙事等。

你可以使用以下工具（通过 tool calls）：
- add_quest_template：添加一个任务模板（推荐优先使用此工具生成任务）
- add_action：添加新的行为效果
- add_schedule：添加新的角色日程
- add_book_content：添加书籍内容
- add_clue_definition：添加新的世界线索
- replace_day_night_config：整体替换昼夜时段配置
- replace_season_config：整体替换季节配置
- replace_weather_config：整体替换天气池配置
- replace_warmth_comfort_config：整体替换保暖舒适公式参数

你也可以输出 JSON。JSON 格式如下：

{
  "addQuestTemplates": [
    { "id": "quest_xxx", "title": "任务标题", "description": "2-4句描述背景与动机", ... }
  ],
  "addRoomTemplates": [...],
  "addNamePools": [...],
  "replaceNarrativeTemplates": {...},
  "replaceCalendar": {...},
  "replaceDayNightConfig": {...},
  "replaceSeasonConfig": {...},
  "replaceWeatherConfig": {...},
  "replaceWarmthComfortConfig": {...},
  "replaceNeedLabels": {...},
  "replaceTraitLabels": {...},
  "replaceItemPropertyLabels": {...},
  "addBookContents": [...],
  "addClueDefinitions": [...],
  "narrativeContext": "描述这次演化的叙事意义"
}

通用规则：
- 只更新与当前时代不匹配的内容
- 叙事模板使用符合时代的语言风格
- 命名池反映新时代的文化特征
- 模板描述反映新时代的建筑/技术/社会
- 标签映射仅在新增类型或翻译需要修正时更新
- 如果新增了可阅读物品，必须同时通过 add_book_content 提供书籍内容
- 书籍内容必须像"玩家正在读到的书内正文"
- 只有当时代变化确实影响作息、季节、天气或保暖规则时，才整体替换对应时间环境配置
- 时间环境配置必须保持完整：小时在 0-23，月份在 1-12，权重和移动/可见度/衰减系数必须为正数
- 天气可用季节必须引用已存在的季节 ID，保暖舒适上限不得低于下限

## 任务生成核心规则（极其重要）

生成任务时遵循以下准则，避免浅层、模板化的设计：

**必须做的：**
- 从下方提供的 NPC 和房间列表中引用真实存在的实体 ID
- 任务描述用 2-4 句建立因果链条：谁需要什么、为什么需要、做成或失败意味着什么
- 混合多种目标类型（talk + explore + collect），避免全 talk 链
- 每个目标描述应具体到实体/地点，不是泛泛的"与某人交谈"
- 奖励应与任务内容挂钩（关系给任务相关 NPC，物品是任务中提到的物件）
- 可以引用现有线索列表中的线索作为任务的信息锚点
- 如果任务适合自动发现而非 NPC 主动给予，使用 autoDiscover + giverNpcId: null

**禁止做的（这些是浅层任务的标志）：**
- ❌ 单一 talk 目标："与某人交谈"——这无法构成任务，只是对话
- ❌ 没有叙事因果链的描述，如"某人有事找你帮忙"
- ❌ 不引用任何已有 NPC/房间/物品的架空任务
- ❌ 所有奖励千篇一律（全部 +5/+5）
- ❌ stages 列表与目标列表同时使用（stages 仅用于 Storyline 剧情线）

**优质任务示例**：

任务「千佛暗码」：
- 背景：莫高窟僧侣法显发现壁画后有暗格，刻有"烽燧铜符，玉门故道"——这是大唐军用的烽燧密码
- 目标 1：talk 法显听他解读壁画暗码（groupId 0）
- 目标 2：explore 玉门烽燧寻找铜符线索（groupId 1）
- 目标 3：talk 张校尉求证铜符来历——张校尉给出前校尉的遗物铜符（groupId 2）
- 奖励：与法显关系 +20、获得烽燧铜符物品、spiritual +5、curiosity +5
- 叙事：串起第17窟秘密 → 军用铜符制度 → 废弃商道，三个世界观元素形成因果链

**劣质任务（避免）**：

❌ 任务「找人」：
- 背景：某人有事想问你
- 目标 1：talk NPC_A
- 目标 2：talk NPC_B
- 奖励：trait +5
- 问题：没有叙事因果、没有探索或收集、奖励无意义`,
    user: `${JSON.stringify(
      {
        era: context.era,
        existingNeeds: context.existingNeeds,
        existingActions: context.existingActions,
        existingRoles: context.existingRoles,
        existingCultures: context.existingCultures,
        existingTraitLabels: context.existingTraitLabels,
        previousRoomTemplateCultures: context.previousRoomTemplateCultures,
      },
      null,
      2,
    )}${npcHint}${roomHint}${questHint}${itemHint}${clueHint}`,
  };
}
