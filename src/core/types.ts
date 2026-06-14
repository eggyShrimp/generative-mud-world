import type { CombatConfig, CombatHpChange, CombatSkill, CombatState } from "../combat/types.ts";
import type { Exit, TerrainConfigEntry, TerrainType } from "./schemas/index.ts";

export type { CombatConfig, CombatHpChange, CombatSkill, CombatState } from "../combat/types.ts";

// 基础类型
export type EntityId = string;
export type RoomId = string;
export type RegionId = string;
export type Tick = number;

// 重新导出 schema 类型
export type {
  Exit,
  GraphConfig,
  LayoutConfig,
  RegionLink,
  TerrainConfigEntry,
  TerrainType,
} from "./schemas/index.ts";

// 需求系统
// NeedType 是引擎内部已知的需求类型。
// 新增类型需同步更新此联合：在 ContentPool.needDefinitions 中添加定义后，
// 将新 type 追加到此联合中。引擎不支持 LLM 运行时动态新增 need 类型。
export type NeedType = "hunger" | "safety" | "social" | "achievement" | "rest";

export interface Need {
  type: NeedType;
  value: number; // 0 (极度匮乏) ~ 100 (完全满足)
  baseUrgency: number;
  decayRate: number; // 每个 tick 衰减量
}

// Trait 系统
export interface Trait {
  name: string;
  value: number; // -100 ~ 100
}

// 关系系统
export interface Relation {
  targetId: EntityId;
  level: number; // -100 (深仇) ~ 100 (挚友/忠诚)
  label: string; // "兄弟" / "仇敌" / "冷漠的邻居" / "感激的债主"
  lastInteractionTick: Tick;
}

// 记忆系统
export interface Memory {
  tick: Tick;
  content: string;
  importance: number; // 0 ~ 1
  type: "observation" | "conversation" | "reflection" | "event";
  entityIds?: EntityId[]; // 此记忆涉及的实际实体（可选，用于结构化引用）
}

// Entity 基类
export type EntityType = "npc" | "player" | "item" | "faction";

export interface BaseEntity {
  id: EntityId;
  type: EntityType;
  name: string;
  roomId: RoomId | null;
  description: string;
}

// NPC
export interface NPCEntity extends BaseEntity {
  type: "npc";
  personality: string; // 自然语言人格描述
  traits: Trait[];
  needs: Need[];
  relations: Relation[];
  memories: Memory[];
  schedule: ScheduleEntry[];
  npcTier: "core" | "regional" | "background";
  mood: number; // -100 ~ 100
  availableActions: string[];
  inventory: ItemEntity[];
  combatState: CombatState;
  equipment: { weapon: ItemEntity | null; armor: ItemEntity | null };
  tags?: string[]; // 实体能力标签（如 tavern_keeper, blacksmith），用于功能交互路由
}

// 游记入口
export interface TravelogueEntry {
  day: number;
  month: number;
  year: number;
  date: string;
  title: string;
  location: RoomId | null;
  locations: RoomId[];
  narrative: string;
  keyEvents: string[];
  createdAt: Tick;
}

// Player
export interface PlayerEntity extends BaseEntity {
  type: "player";
  traits: Trait[];
  needs: Need[];
  relations: Relation[];
  memories: Memory[];
  inventory: ItemEntity[];
  knownRooms: RoomId[];
  combatState: CombatState;
  equipment: { weapon: ItemEntity | null; armor: ItemEntity | null };
  activeQuests: ActiveQuest[];
  completedQuests: string[];
  failedQuests: Array<{ templateId: string; failedDay: number; reason?: string }>;
  activeStorylines: StorylineState[];
  questCooldowns: Record<string, number>;
  travelogue: TravelogueEntry[];
}

// Item
export interface ItemEntity extends BaseEntity {
  type: "item";
  ownerId: EntityId | null;
  containerId: RoomId | EntityId | null;
  templateId: string; // ContentPool.itemTemplates 的 id → 类型归属
  properties: Record<string, unknown>;
  tags?: string[]; // 实体能力标签（如 forge, cooking_tool），用于功能交互路由
}

// Faction
export interface FactionEntity extends BaseEntity {
  type: "faction";
  memberIds: EntityId[];
  leaderId: EntityId;
  governanceForm: string;
  identityLabel: string;
  economicBasis: string;
  traits: Trait[];
  needs: Need[];
  relations: Relation[];
  population: number;
  wealth: number;
  militaryPower: number;
  recognition: number;
  cohesion: number;
  influenceRadius: number;
  availableActions: string[];
}

export type Entity = NPCEntity | PlayerEntity | ItemEntity | FactionEntity;

// 房间
export interface Room {
  id: RoomId;
  name: string;
  description: string;
  regionId: RegionId;
  terrain: TerrainType;
  exits: Map<string, Exit>; // direction → Exit
  entities: Set<EntityId>;
  tags?: string[];
}

export interface RoomNode {
  roomId: RoomId;
  x: number;
  y: number;
  regionId: RegionId;
}

export interface RegionLinkInfo {
  fromRegion: RegionId;
  toRegion: RegionId;
  direction: string;
  distance: number;
  terrain: string;
}

export interface RoomGraph {
  nodes: Map<RoomId, RoomNode>;
  regionBounds: Map<RegionId, { minX: number; maxX: number; minY: number; maxY: number }>;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  regionLinks: RegionLinkInfo[];
}

// Schedule
export interface ScheduleEntry {
  startHour: number;
  endHour: number;
  action: string; // "work_at_smithy" / "eat_at_tavern" / "sleep_at_home"
  targetRoomId: RoomId | null;
  priority: number;
  deviationAllowed: boolean;
}

// Action
export interface Action {
  id: string;
  type: string; // "move" | "say" | "take" | "drop" | "use" | "trade" | "attack" | ...
  actorId: EntityId;
  targetId?: EntityId;
  targetRoomId?: RoomId;
  payload: Record<string, unknown>;
  tick: Tick;
}

// Event
export interface WorldEvent {
  id: string;
  type: string;
  title: string;
  description: string;
  scope: RoomId | RegionId | "global";
  tick: Tick;
  source: "simulation" | "llm" | "player";
  data: Record<string, unknown>;
}

// SimulationDelta – LLM 产出的统一数据格式
export interface SimulationDelta {
  // 实体状态变更
  traitModifiers?: TraitModifier[];
  needChanges?: NeedChange[];
  relationChanges?: RelationChange[];
  combatHpChanges?: CombatHpChange[];
  questChanges?: QuestChange[];
  itemChanges?: ItemChange[];
  revealRooms?: RevealRoom[];
  // 叙事记录
  worldEvents?: WorldEvent[];
  dialogues?: DialogueLine[];
}

export interface TraitModifier {
  targetId: EntityId;
  trait: string;
  delta: number;
}

export interface NeedChange {
  targetId: EntityId;
  needType: NeedType;
  delta: number;
}

export interface RelationChange {
  fromId: EntityId;
  toId: EntityId;
  delta: number;
  newLabel?: string;
}

export interface DialogueLine {
  speakerId: EntityId;
  content: string;
  roomId: RoomId;
  tick: Tick;
}

export interface CulturalTag {
  name: string;
  description: string;
  regionId: RegionId;
}

export interface RevealRoom {
  entityId: EntityId;
  roomId: RoomId;
}

// ItemChange — 物品变更
export interface ItemChange {
  targetId: EntityId;
  templateId: string;
  operation: "add" | "remove";
  qty: number;
  itemId?: EntityId;
  name?: string;
}

// ============================================================
// Quest / Storyline 系统
// ============================================================

export interface QuestObjective {
  groupId: number;
  type: "explore" | "collect" | "talk" | "deliver" | "fetch";
  targetId: EntityId;
  count: number;
  description: string;
}

export interface QuestReward {
  narrative?: string;
  traitModifiers?: Array<{ trait: string; delta: number }>;
  needChanges?: Array<{ needType: string; delta: number }>;
  relationDelta?: { targetId: EntityId; delta: number };
  items?: Array<{ itemId: string; quantity: number; name?: string }>;
}

export interface QuestAbandonPenalty {
  relationDelta?: { targetId: EntityId; delta: number };
  traitModifiers?: Array<{ trait: string; delta: number }>;
  needChanges?: Array<{ needType: string; delta: number }>;
}

export interface MinRelationCondition {
  npcId: EntityId;
  minValue: number;
}

export interface QuestPrerequisite {
  conditions: (string | QuestPrerequisite)[];
  logic: "and" | "or";
}

export interface TriggerCondition {
  day?: number;
  trait?: string;
  value?: number;
  operator?: ">=" | "<=" | "==" | "!=";
  relationWith?: EntityId;
  eventType?: string;
  action?: string;
  targetId?: EntityId;
}

export interface QuestAutoDiscover {
  triggerRoomId?: string;
  triggerItemId?: string;
  triggerText?: string;
}

export interface QuestStage {
  id: string;
  title: string;
  questIds: string[];
  completionCondition: "all" | "any";
  narrativeGuide: string;
}

export interface QuestAutoTrigger {
  type: "time" | "trait" | "relation" | "world_event" | "player_action";
  conditions: TriggerCondition[];
}

export interface QuestTemplate {
  id: string;
  title: string;
  description: string;
  giverNpcId: EntityId | null;
  objectives: QuestObjective[];
  rewards: QuestReward;
  repeatable: boolean;
  deadlineDays: number | null;
  prerequisites?: QuestPrerequisite;
  minRelation?: MinRelationCondition;
  autoDiscover?: QuestAutoDiscover;
  autoTrigger?: QuestAutoTrigger;
  stages?: QuestStage[];
  cooldownDays?: number;
  abandonPenalty?: QuestAbandonPenalty;
}

export interface ActiveQuest {
  templateId: string;
  status: "active" | "completed" | "failed";
  acceptedDay: number;
  deadlineDay: number | null;
  groupCompleted: boolean[];
  objectiveProgress: number[];
}

export interface StorylineState {
  storylineId: string;
  currentStage: number;
  activeQuestIdsOfCurrentStage: string[];
  startedAt: number;
}

export interface QuestChange {
  type: "accept" | "progress" | "complete" | "fail";
  playerId: EntityId;
  templateId: string;
  objectiveIndex?: number;
  count?: number;
  reason?: string;
}

// 世界状态
export interface WorldState {
  tick: Tick;
  entities: Map<EntityId, Entity>;
  rooms: Map<RoomId, Room>;
  regions: Map<RegionId, Region>;
  eventLog: WorldEvent[];
  time: GameTime;
  round: number;
  contentPool: ContentPool; // 可演化数据
  poolDir?: string; // ContentPool YAML 目录路径 (用于 LLM 演化写回)
  graph?: RoomGraph;
  completedStorylines: string[];
}

export interface Region {
  id: RegionId;
  name: string;
  dominantCulture: string;
  prosperity: number;
  threatLevel: number;
}

export interface GameTime {
  tick: Tick;
  hour: number; // 0-23
  day: number;
  month: number;
  year: number;
}

// ============================================================
// ContentPool — 可演化数据 (LLM 可读写)
// 规则引擎的"内容池"，全部是声明式数据，无逻辑代码
// ============================================================

export interface ContentPool {
  // 需求定义: 世界中有哪些需求类型
  needDefinitions: NeedDefinition[];

  // 行为效果: 每种 action 对 needs 的影响 (替代硬编码 switch/case)
  actionEffects: ActionEffect[];

  // 需求→行为关联: 哪些行为可以满足哪些需求
  needActionMap: NeedActionMapping[];

  // 角色→调度模板: 每种角色的默认日程序 (LLM 可为新角色生成新的)
  scheduleTemplates: RoleScheduleTemplate[];

  // 行为原子池 (未来的 Level 3 复合行为)
  behaviorAtoms: BehaviorAtom[];

  // 命名池 (规则生成，不调LLM)
  namePools: NamePool[];

  // 叙事模板 (LLM 可演化)
  narrativeTemplates: NarrativeTemplates;

  // 日历系统 (LLM 可演化)
  calendar: CalendarConfig;

  // 探索模板 (规则降级，LLM 可演化)
  roomTemplates: RoomTemplatePool[];

  // LLM 触发频率配置 (可从 YAML 覆盖)
  llmTriggerConfig: LLMTriggerConfig;

  // 对话效果映射: LLM tool_calls → 数值 (规则引擎查表，不在 LLM 决定)
  dialogueEffectMapping: DialogueEffectMapping;

  // 社会涟漪配置: 任何交互的社会信号 → 观察者反应
  socialRippleConfig: SocialRippleConfig;

  // 情绪标签: 情绪标识 → 中文显示名 (LLM 可演化)
  emotionLabels: Record<string, string>;

  // 需求标签: 需求标识 → 中文显示名 (LLM 可演化)
  needLabels: Record<string, string>;

  // 特质标签: 特质标识 → 中文显示名 (LLM 可演化)
  traitLabels: Record<string, string>;

  // 敏感特质: 有此特质的 NPC 在被人观察时会产生记忆
  sensitiveTraitNames: string[];

  // 物品属性标签: 属性键名 → 中文显示名 (LLM 可演化)
  itemPropertyLabels: Record<string, string>;

  // 物品模板: 稳定的物品定义 (LLM 可演化)
  itemTemplates: ItemTemplate[];

  // 书籍内容: 可阅读物品模板 → 分页文本 (LLM 可演化)
  bookContents: BookContent[];

  // 任务模板: 任务/剧情定义 (LLM 可演化)
  questTemplates: QuestTemplate[];

  // 战斗配置 (LLM 可演化)
  combatConfig: CombatConfig;

  // 战斗技能 (LLM 可演化)
  combatSkills: CombatSkill[];

  // 剧情配置
  storylineConfig: StorylineConfig;

  // 地形配置: 地形类型 → 移动消耗/速度/危险度/通行条件
  terrainConfig: TerrainConfigEntry[];

  // 房间动作: 房间 tag → 可用动作 ID 列表 (LLM 可演化)
  entityActionsByTag: Record<string, string[]>;

  // 房间动作标签: 动作 ID → 中文显示名 (LLM 可演化)
  entityActionLabels: Record<string, string>;

  // 房间标签标签: 房间 tag → 中文显示名 (LLM 可演化)
  entityTagLabels: Record<string, string>;

  // 对话方向池: 闲聊话题建议方向 (LLM 可演化)
  conversationDirections: ConversationDirection[];
}

export interface ConversationDirection {
  key: string;
  instruction: string;
}

export interface RoomTemplatePool {
  culture: string;
  rooms: Array<{ name: string; desc: string }>;
  names: string[];
  personalities: string[];
}

// LLM 可更新 ContentPool 本身 (Level 2 演化)
export interface ContentPoolMutation {
  /** 离线世界生成专用 — 运行时演化不应使用此字段（Need 是引擎概念，LLM 不应动态新增） */
  addNeedDefinitions?: NeedDefinition[];
  addActionEffects?: ActionEffect[];
  addScheduleTemplates?: RoleScheduleTemplate[];
  addNamePools?: NamePool[];
  addRoomTemplates?: RoomTemplatePool[];
  addQuestTemplates?: QuestTemplate[];
  addBookContents?: BookContent[];
  addCombatSkills?: CombatSkill[];
  replaceNarrativeTemplates?: Partial<NarrativeTemplates>;
  replaceCalendar?: Partial<CalendarConfig>;
  replaceNeedLabels?: Record<string, string>;
  replaceTraitLabels?: Record<string, string>;
  replaceItemPropertyLabels?: Record<string, string>;
  replaceCombatConfig?: CombatConfig;
  replaceEntityActionsByTag?: Record<string, string[]>;
  replaceEntityActionLabels?: Record<string, string>;
  replaceEntityTagLabels?: Record<string, string>;
  replaceSocialRippleConfig?: SocialRippleConfig;
  replaceDialogueEffectMapping?: DialogueEffectMapping;
  replaceEmotionLabels?: Record<string, string>;
  replaceLlmTriggerConfig?: LLMTriggerConfig;
  replaceTerrainConfig?: TerrainConfigEntry[];
  narrativeContext?: string;
}

export interface NamePool {
  culture: string; // "西境农耕文化"
  surnames: string[]; // ["赵", "钱", "孙", "李"]
  maleGiven: string[]; // ["行舟", "铁", "大山"]
  femaleGiven: string[]; // ["秀", "兰", "春芽"]
  neutralGiven: string[]; // ["石头", "小河"]
  epithetPatterns: string[]; // ["{role}{name}", "老{char}", "小{char}"]
}

export interface BookContent {
  id: string;
  itemTemplateId: string;
  title: string;
  pages: string[];
}

export interface MemoryTemplates {
  take: { self: string; observer: string }; // self: "拿起了{item}", observer: "看到 {actor} 拿起了{item}"
  drop: { self: string; observer: string }; // self: "放下了{item}", observer: "看到 {actor} 放下了{item}"
  move: {
    self: string; // "到达了{room}"
    observerLeave: string; // "看到 {actor} 离开了{room}"
    observerArrive: string; // "{actor} 来到了{room}"
  };
  talk: {
    self: string; // "与 {target} 在{room}交谈"
    target: string; // "与 {actor} 在{room}交谈。{text}"
    observer: string; // "注意到 {actor} 和 {target} 在{room}{action}"
    observerNoTarget: string; // "注意到 {actor} 在{room}{action}"
  };
  look: { self: string }; // "{actor} 打量了我"
  say: { observer: string }; // "听到 {actor} 在{room}说了话"
  dailyRoutine: string; // "度过了日常的一天"
  fallbackItemName: string; // "东西"
}

export interface CombatTemplates {
  attackStart: string;
  hit: string;
  crit: string;
  playerDown: string;
  npcDefeated: string;
  npcDeath: string;
  npcFlee: string;
  fleeSuccess: string;
  fleeFail: string;
  defend: string;
}

export interface CommandMessages {
  lookRoom: string;
  lookEntity: string;
  take: string;
  drop: string;
  useWithEffect: string;
  useNoEffect: string;
  rest: string;
  status: string;
  statusWithTraits: string;
  inventoryEmpty: string;
  inventoryList: string;
  say: string;
  endDay: string;
  equip: string;
  equipWithSwap: string;
  unequip: string;
  eatWithEffect: string;
  eatNoEffect: string;
  readWithEffect: string;
  readNoEffect: string;
  readMissingContent: string;
  readNotReadable: string;
  readSpecifyItem: string;
  readItemNotFound: string;
  roomAction: string;
  roomActionWithEffect: string;
}

export interface SettlementMessages {
  dialogue: string;
  relation: string;
  playerNeed: string;
  npcNeed: string;
  item: string;
}

export interface QuestMessages {
  completeTitle: string;
  completeDescription: string;
  failTitle: string;
  failDescription: string;
  discoverTitle: string;
  discoverDescription: string;
}

export interface NarrativeTemplates {
  eventTitles: Record<string, string>; // { move: "移动", talk: "对话", wait: "等待" }
  moveNarrative: string; // "{actor} 到达了 {room}。"
  talkNarrative: string; // "{actor} 与 {target} 交谈。{target}: \"{response}\""
  waitNarrative: string; // "{actor} 在原地逗留了一会。"
  npcNotFound: string; // "{npcName}不在这里。"
  npcSilentFallback: string; // "{target}点了点头，没有多说什么。"
  emptyDaySummary: string; // "平淡的一天。"
  moodLabels: Array<{ threshold: number; label: string }>; // [{threshold:0, label:"低落"}, {threshold:50, label:"平静"}, {threshold:70, label:"愉快"}]
  relationLabels: Array<{ threshold: number; label: string }>; // [{threshold:0, label:"冷淡"}, {threshold:20, label:"普通"}, {threshold:50, label:"友好"}]
  endingCommands: string[]; // ["结束今天", "休息", "过完这天"]
  chatPattern: string; // "(和|跟|问|找|与)(?<npc>[^，。\\s]{1,6})(聊天|说话|讲话|打听|问话)"
  directionNames: Record<string, string>; // { 北: "north", 南: "south" }
  spectatorFallbackName: string; // "旁观者" — 玩家未绑定实体时的显示名
  regionStatusLabels: {
    prosperityLow: string; // "经济困难"
    threatHigh: string; // "军事紧张"
    stable: string; // "稳定"
  };
  defaultTheme: string; // "边疆" — LLM prompt 中的默认世界观主题
  memoryTemplates: MemoryTemplates;
  combatTemplates: CombatTemplates;
  commandMessages: CommandMessages;
  settlementMessages: SettlementMessages;
  questMessages: QuestMessages;
  traveloguePrompt: string;
  conversationSummaryLabel: string;
  conversationSummaryPrompt: string;
}

export interface CalendarConfig {
  hourStart: number;
  daysPerMonth: number;
  monthsPerYear: number;
  monthNames: string[];
  eraName: string; // "铁器纪元" / "帝国纪元"
  yearFormat: string; // "第{year}年" / "{era}第{year}年"
}

export interface NeedDefinition {
  type: string;
  baseUrgency: number; // 基础紧迫度
  decayRate: number; // 每回合自然衰减量
  description: string; // LLM 生成的描述
  bornFrom: string; // "baseline" | "cultural:xxx" | "religion:xxx" | "llm:xxx"
}

export interface ActionEffect {
  action: string; // "work_at_smithy" | "eat_at_tavern" | ...
  needDeltas: Record<string, number>; // { hunger: -10, rest: -5 }
  itemCosts?: Record<string, number>; // { copper_coin: 3 } — 消耗物品 (templateId → qty)
  itemDeltas?: Record<string, number>; // { iron_ore: 1 } — 产出物品 (templateId → qty)
  endsDay?: boolean; // true → 执行此操作会结束当天（如 sleep_at_inn, rest_at_camp）
}

export interface ItemTemplate {
  id: string; // "copper_coin" — 稳定 key，用于 itemCosts/itemDeltas 引用
  name: string; // "铜币" — 显示名
  properties: Record<string, unknown>; // { currency: true } — 物品属性
  tradeable?: boolean; // false → 不可交易（剧情物品），默认 true
}

export interface NeedActionMapping {
  needType: string;
  actionNames: string[]; // 哪些 action 能满足这个 need
}

export interface RoleScheduleTemplate {
  role: string; // "blacksmith" | "guard" | ...
  schedule: ScheduleEntry[];
}

export interface BehaviorAtom {
  id: string;
  name: string; // LLM 命名的复合行为
  trigger: string; // 触发条件表达式
  responses: BehaviorResponse[];
  bornFrom: string;
}

export interface BehaviorResponse {
  action: string;
  target: string | null;
  params: Record<string, unknown>;
}

// ============================================================
// LLM 触发频率配置 (从 ContentPool 读取，不在 dispatcher 中硬编码)
// ============================================================

export interface LLMTriggerConfig {
  worldEvent: {
    perSettlement: number; // 每次结算生成事件数 (默认 1)
    enabled: boolean;
  };
  memoryCompression: {
    maxCandidates: number; // 每回合最多压缩 NPC 数 (默认 3)
    minMemoriesToTrigger: number; // 最低记忆数触发门槛 (默认 3)
    enabled: boolean;
  };
  settlementGrowth: {
    npcToRoomRatio: number; // NPC/房间 比例触发 (默认 4)
    prosperityThreshold: number; // 繁荣度触发 (默认 70)
    threatThreshold: number; // 威胁度低于此触发 (默认 30)
    enabled: boolean;
  };
  contentPoolEvolve: {
    checkDay: number; // 每月第几天检查 (默认 1)
    enabled: boolean;
  };
  narrativeDirection: {
    intervalMonths: number; // 每 N 月触发 (默认 1)
    enabled: boolean;
  };
  culturalEvolution: {
    adoptionThreshold: number; // 观点占比触发 (默认 0.3)
    enabled: boolean;
  };
  discoveryGeneration: {
    activityThreshold: number; // 活动累积触发 (默认 1000)
    enabled: boolean;
  };
  dialogueOptions: {
    optionCount: number; // 每次生成选项数 (默认 4)
    enabled: boolean;
  };
}

// ============================================================
// 剧情配置
// ============================================================

export interface StorylineConfig {
  eventLookbackWindow: number;
}

// ============================================================
// 对话效果映射 (LLM tool_calls → ContentPool 查表 → 数值)
// ============================================================

export interface DialogueEffectMapping {
  // 关系变化: "slight_positive" → { delta: 1 }
  relation: Record<string, { delta: number }>;

  // 需求影响: "slight_positive" → { delta: 3 }
  needImpact: Record<string, { delta: number }>;

  // 信息类型: "rumor" → { memoryImportance, spreadChance }
  information: Record<string, { memoryImportance: number; spreadChance: number }>;

  // 物品交换: "trivial" → { valueRange: [min, max] }
  itemExchange: Record<string, { valueRange: [number, number] }>;
}

// ============================================================
// 社会涟漪配置 (交互 → 社会信号 → 观察者评价 → 关系变化)
// ============================================================

export interface SocialRippleConfig {
  enabled: boolean;

  // 每种行为的社会信号强度 (正=善意, 负=恶意)
  signalStrength: Record<string, number>;

  // 关系权重断点: observer ↔ participant 的关系水平 → 放大系数
  // 断点和乘数数组等长, 线性插值
  relationWeightPoints: number[]; // e.g. [-100, -50, -20, 20, 50, 100]
  relationWeightMultipliers: number[]; // e.g. [-2, -1, 0.3, 1, 1.5, 2]

  // 性格乘数: trait name → 信号放大系数 (1.0=中性)
  traitMultipliers: Record<string, number>;

  // 分数低于此值不产生反应
  threshold: number;

  // 产生的关系变化上限
  maxDelta: number;
}

// ============================================================

// 日报 & 遭遇
export interface DailyReport {
  playerId: EntityId;
  round: number;
  date: string;
  summary: string;
  statusChanges: NeedChange[];
  encounters: Encounter[];
  worldNews: string[];
  availableLocations: RoomId[];
  notableNPCs: { id: EntityId; name: string; relation: number }[];
  travelogue?: TravelogueEntry;
}

export interface Encounter {
  id: string;
  type: "dialogue" | "choice" | "event";
  npcId?: EntityId;
  npcName?: string;
  trigger: string; // "披斗篷的人拍了拍你的肩"
  context: Record<string, unknown>;
  resolved: boolean;
}

// ============================================================
// SaveData: 运行时持久层 — 跨重启存档（非 ContentPool 配置）
// ============================================================

export interface SaveMeta {
  slotId: string;
  worldId: string;
  savedAt: number;
  gameTick: number;
  round: number;
}

export interface ConversationSummaryEntry {
  summary: string;
  lastTick: number;
}

export interface SaveData {
  version: 1;
  meta: SaveMeta;
  conversations: {
    summaries: Record<string, ConversationSummaryEntry[]>;
  };
}

// ============================================================
// WorldMutation: LLM 产出新实体 (创造新房间/NPC/派系)
// 类型定义从 schemas 重新导出（Zod 推断为唯一数据源）
// ============================================================

export type { NewFactionDef, NewNPCDef, NewRoomDef, WorldMutation } from "./schemas/index.ts";
