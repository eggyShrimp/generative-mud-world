import type { CombatConfig, CombatSkill } from "../../combat/types.ts";
import type { TerrainConfigEntry } from "../schemas/index.ts";
import type {
  DayNightConfig,
  SeasonConfig,
  WarmthComfortConfig,
  WeatherConfig,
} from "./environment.ts";
import type {
  DialogueEffectMapping,
  LLMTriggerConfig,
  SocialRippleConfig,
  StorylineConfig,
} from "./llm-config.ts";
import type { ClueDefinition, QuestTemplate } from "./quest-storyline.ts";
import type { ScheduleEntry } from "./world-room.ts";

export interface ContentPool {
  needDefinitions: NeedDefinition[];
  actionEffects: ActionEffect[];
  needActionMap: NeedActionMapping[];
  scheduleTemplates: RoleScheduleTemplate[];
  behaviorAtoms: BehaviorAtom[];
  namePools: NamePool[];
  narrativeTemplates: NarrativeTemplates;
  calendar: CalendarConfig;
  dayNightConfig: DayNightConfig;
  seasonConfig: SeasonConfig;
  weatherConfig: WeatherConfig;
  warmthComfortConfig: WarmthComfortConfig;
  roomTemplates: RoomTemplatePool[];
  llmTriggerConfig: LLMTriggerConfig;
  dialogueEffectMapping: DialogueEffectMapping;
  socialRippleConfig: SocialRippleConfig;
  emotionLabels: Record<string, string>;
  needLabels: Record<string, string>;
  traitLabels: Record<string, string>;
  sensitiveTraitNames: string[];
  itemPropertyLabels: Record<string, string>;
  itemTemplates: ItemTemplate[];
  bookContents: BookContent[];
  questTemplates: QuestTemplate[];
  combatConfig: CombatConfig;
  combatSkills: CombatSkill[];
  storylineConfig: StorylineConfig;
  terrainConfig: TerrainConfigEntry[];
  entityActionsByTag: Record<string, string[]>;
  entityActionLabels: Record<string, string>;
  entityTagLabels: Record<string, string>;
  conversationDirections: ConversationDirection[];
  clueDefinitions: ClueDefinition[];
}

export interface ContentPoolMutation {
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
  replaceDayNightConfig?: DayNightConfig;
  replaceSeasonConfig?: SeasonConfig;
  replaceWeatherConfig?: WeatherConfig;
  replaceWarmthComfortConfig?: WarmthComfortConfig;
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
  addClueDefinitions?: ClueDefinition[];
  narrativeContext?: string;
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

export interface NamePool {
  culture: string;
  surnames: string[];
  maleGiven: string[];
  femaleGiven: string[];
  neutralGiven: string[];
  epithetPatterns: string[];
}

export interface BookContent {
  id: string;
  itemTemplateId: string;
  title: string;
  pages: string[];
}

export interface CalendarConfig {
  hourStart: number;
  daysPerMonth: number;
  monthsPerYear: number;
  monthNames: string[];
  eraName: string;
  yearFormat: string;
  dayFormat: string;
}

export interface NeedDefinition {
  type: string;
  baseUrgency: number;
  decayRate: number;
  description: string;
  bornFrom: string;
}

export interface ActionEffect {
  action: string;
  needDeltas: Record<string, number>;
  itemCosts?: Record<string, number>;
  itemDeltas?: Record<string, number>;
  endsDay?: boolean;
  durationMinutes?: number;
}

export interface ItemTemplate {
  id: string;
  name: string;
  properties: Record<string, unknown>;
  tradeable?: boolean;
}

export interface NeedActionMapping {
  needType: string;
  actionNames: string[];
}

export interface RoleScheduleTemplate {
  role: string;
  schedule: ScheduleEntry[];
}

export interface BehaviorAtom {
  id: string;
  name: string;
  trigger: string;
  responses: BehaviorResponse[];
  bornFrom: string;
}

export interface BehaviorResponse {
  action: string;
  target: string | null;
  params: Record<string, unknown>;
}

export interface MemoryTemplates {
  take: { self: string; observer: string };
  drop: { self: string; observer: string };
  move: {
    self: string;
    observerLeave: string;
    observerArrive: string;
  };
  talk: {
    self: string;
    target: string;
    observer: string;
    observerNoTarget: string;
  };
  look: { self: string };
  say: { observer: string };
  dailyRoutine: string;
  fallbackItemName: string;
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
  lookRoomTarget: string;
  lookRoom: string;
  lookEntity: string;
  lookTargetNotFound: string;
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
  endDayRestItem: string;
  endDayRestGround: string;
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
  goodbyeOptionLabel: string;
  goodbyeNarrative: string;
  deferReply: string;
  deferReplyFallback: string;
  acceptLabelTemplate: string;
  deferLabel: string;
}

export interface NarrativeTemplates {
  eventTitles: Record<string, string>;
  moveNarrative: string;
  talkNarrative: string;
  waitNarrative: string;
  npcNotFound: string;
  npcSilentFallback: string;
  emptyDaySummary: string;
  moodLabels: Array<{ threshold: number; label: string }>;
  relationLabels: Array<{ threshold: number; label: string }>;
  endingCommands: string[];
  chatPattern: string;
  directionNames: Record<string, string>;
  spectatorFallbackName: string;
  regionStatusLabels: {
    prosperityLow: string;
    threatHigh: string;
    stable: string;
  };
  defaultTheme: string;
  memoryTemplates: MemoryTemplates;
  combatTemplates: CombatTemplates;
  commandMessages: CommandMessages;
  settlementMessages: SettlementMessages;
  questMessages: QuestMessages;
  traveloguePrompt: string;
  conversationSummaryLabel: string;
  conversationSummaryPrompt: string;
}
