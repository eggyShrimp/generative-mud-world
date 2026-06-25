import { z } from "zod";
import { validateQuestObjectiveCondition } from "../quest-objective-registry.ts";

// needDefinitions
export const NeedDefinitionSchema = z.object({
  type: z.string().min(1),
  baseUrgency: z.number().min(0).max(1),
  decayRate: z.number().min(0),
  description: z.string(),
  bornFrom: z.string(),
});

// actionEffects
export const ActionEffectSchema = z.object({
  action: z.string().min(1),
  needDeltas: z.record(z.string(), z.number()),
  itemCosts: z.record(z.string(), z.number()).optional(),
  itemDeltas: z.record(z.string(), z.number()).optional(),
  endsDay: z.boolean().optional(),
  durationMinutes: z.number().int().min(0).optional(),
});

// itemTemplates
export const ItemTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  properties: z.record(z.string(), z.unknown()).default({}),
  tradeable: z.boolean().optional(),
});

// bookContents
export const BookContentSchema = z.object({
  id: z.string().min(1),
  itemTemplateId: z.string().min(1),
  title: z.string().min(1),
  pages: z.array(z.string().min(1)).min(1),
});

// needActionMap
export const NeedActionMappingSchema = z.object({
  needType: z.string().min(1),
  actionNames: z.array(z.string()),
});

// scheduleTemplates
export const ScheduleEntrySchema = z.object({
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(0).max(24),
  action: z.string().min(1),
  targetRoomId: z.string().nullable().optional(),
  priority: z.number().int().min(0),
  deviationAllowed: z.boolean(),
});

export const RoleScheduleTemplateSchema = z.object({
  role: z.string().min(1),
  schedule: z.array(ScheduleEntrySchema),
});

// namePools
export const NamePoolSchema = z.object({
  culture: z.string().min(1),
  surnames: z.array(z.string()),
  maleGiven: z.array(z.string()),
  femaleGiven: z.array(z.string()),
  neutralGiven: z.array(z.string()),
  epithetPatterns: z.array(z.string()),
});

// narrativeTemplates
const MemoryTemplatesSchema = z.object({
  take: z.object({ self: z.string(), observer: z.string() }),
  drop: z.object({ self: z.string(), observer: z.string() }),
  move: z.object({
    self: z.string(),
    observerLeave: z.string(),
    observerArrive: z.string(),
  }),
  talk: z.object({
    self: z.string(),
    target: z.string(),
    observer: z.string(),
    observerNoTarget: z.string(),
  }),
  look: z.object({ self: z.string() }),
  say: z.object({ observer: z.string() }),
  dailyRoutine: z.string(),
  fallbackItemName: z.string(),
});

const CombatTemplatesSchema = z.object({
  attackStart: z.string(),
  hit: z.string(),
  crit: z.string(),
  playerDown: z.string(),
  npcDefeated: z.string(),
  npcDeath: z.string(),
  npcFlee: z.string(),
  fleeSuccess: z.string(),
  fleeFail: z.string(),
  defend: z.string(),
});

const CommandMessagesSchema = z.object({
  lookRoomTarget: z.string(),
  lookRoom: z.string(),
  lookEntity: z.string(),
  lookTargetNotFound: z.string(),
  take: z.string(),
  drop: z.string(),
  useWithEffect: z.string(),
  useNoEffect: z.string(),
  rest: z.string(),
  status: z.string(),
  statusWithTraits: z.string(),
  inventoryEmpty: z.string(),
  inventoryList: z.string(),
  say: z.string(),
  endDay: z.string(),
  equip: z.string(),
  equipWithSwap: z.string(),
  unequip: z.string(),
  eatWithEffect: z.string(),
  eatNoEffect: z.string(),
  readWithEffect: z.string(),
  readNoEffect: z.string(),
  readMissingContent: z.string(),
  readNotReadable: z.string(),
  readSpecifyItem: z.string(),
  readItemNotFound: z.string(),
  roomAction: z.string(),
  roomActionWithEffect: z.string(),
});

const SettlementMessagesSchema = z.object({
  dialogue: z.string(),
  relation: z.string(),
  playerNeed: z.string(),
  npcNeed: z.string(),
  item: z.string(),
});

const QuestMessagesSchema = z.object({
  completeTitle: z.string(),
  completeDescription: z.string(),
  failTitle: z.string(),
  failDescription: z.string(),
  discoverTitle: z.string(),
  discoverDescription: z.string(),
  goodbyeOptionLabel: z.string(),
  goodbyeNarrative: z.string(),
  deferReply: z.string(),
  deferReplyFallback: z.string(),
  acceptLabelTemplate: z.string(),
  deferLabel: z.string(),
});

export const NarrativeTemplatesSchema = z.object({
  eventTitles: z.record(z.string(), z.string()),
  moveNarrative: z.string(),
  talkNarrative: z.string(),
  waitNarrative: z.string(),
  npcNotFound: z.string(),
  npcSilentFallback: z.string(),
  emptyDaySummary: z.string(),
  moodLabels: z.array(z.object({ threshold: z.number(), label: z.string() })),
  relationLabels: z.array(z.object({ threshold: z.number(), label: z.string() })),
  endingCommands: z.array(z.string()),
  chatPattern: z.string(),
  directionNames: z.record(z.string(), z.string()),
  spectatorFallbackName: z.string(),
  regionStatusLabels: z.object({
    prosperityLow: z.string(),
    threatHigh: z.string(),
    stable: z.string(),
  }),
  defaultTheme: z.string(),
  memoryTemplates: MemoryTemplatesSchema,
  combatTemplates: CombatTemplatesSchema,
  commandMessages: CommandMessagesSchema,
  settlementMessages: SettlementMessagesSchema,
  questMessages: QuestMessagesSchema,
  traveloguePrompt: z.string(),
  conversationSummaryLabel: z.string(),
  conversationSummaryPrompt: z.string(),
});

// calendar
export const CalendarConfigSchema = z.object({
  hourStart: z.number().int().min(0).max(23),
  daysPerMonth: z.number().int().min(1),
  monthsPerYear: z.number().int().min(1),
  monthNames: z.array(z.string()),
  eraName: z.string(),
  yearFormat: z.string(),
  dayFormat: z.string(),
});

// dayNightConfig
export const DayNightPeriodDefSchema = z.object({
  id: z.string().min(1),
  startHour: z.number().int().min(0).max(23),
  label: z.string().min(1),
  visibilityModifier: z.number().min(0).max(1),
});

export const DayNightConfigSchema = z.object({
  periods: z.array(DayNightPeriodDefSchema).min(1),
});

// seasonConfig
export const SeasonDefSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  months: z.array(z.number().int().min(1).max(12)).min(1),
  label: z.string().min(1),
  comfortTemp: z.number(),
  needDecayMultiplier: z.number().min(0),
  narrativePrefix: z.string(),
});

export const SeasonConfigSchema = z.object({
  seasons: z.array(SeasonDefSchema).min(1),
});

// weatherConfig
export const WeatherTypeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  movementMultiplier: z.number().min(0),
  visibilityMultiplier: z.number().min(0).max(1),
  narrativeDesc: z.string(),
  availableInSeasons: z.array(z.string().min(1)).min(1),
  weight: z.number().min(0),
});

export const WeatherConfigSchema = z.object({
  weatherTypes: z.array(WeatherTypeSchema).min(1),
});

// warmthComfortConfig
export const WarmthComfortConfigSchema = z
  .object({
    baselineTemp: z.number(),
    maxIdealWarmth: z.number().min(0),
    minIdealWarmth: z.number().min(0),
    penaltyPerWarmthPoint: z.number().min(0),
  })
  .superRefine((config, ctx) => {
    if (config.maxIdealWarmth < config.minIdealWarmth) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxIdealWarmth"],
        message: "maxIdealWarmth must be greater than or equal to minIdealWarmth",
      });
    }
  });

// roomTemplates
export const RoomTemplatePoolSchema = z.object({
  culture: z.string().min(1),
  rooms: z.array(z.object({ name: z.string(), desc: z.string() })),
  names: z.array(z.string()),
  personalities: z.array(z.string()),
});

// dialogueEffectMapping
export const DialogueEffectMappingSchema = z.object({
  relation: z.record(z.string(), z.object({ delta: z.number() })),
  needImpact: z.record(z.string(), z.object({ delta: z.number() })),
  information: z.record(
    z.string(),
    z.object({
      memoryImportance: z.number(),
      spreadChance: z.number(),
    }),
  ),
  itemExchange: z.record(
    z.string(),
    z.object({
      valueRange: z.tuple([z.number(), z.number()]),
    }),
  ),
});

// socialRippleConfig
export const SocialRippleConfigSchema = z.object({
  enabled: z.boolean(),
  signalStrength: z.record(z.string(), z.number()),
  relationWeightPoints: z.array(z.number()),
  relationWeightMultipliers: z.array(z.number()),
  traitMultipliers: z.record(z.string(), z.number()),
  threshold: z.number().min(0),
  maxDelta: z.number().min(0),
});

// emotionLabels
export const EmotionLabelsSchema = z.record(z.string(), z.string());

// needLabels
export const NeedLabelsSchema = z.record(z.string(), z.string());

// traitLabels
export const TraitLabelsSchema = z.record(z.string(), z.string());

// itemPropertyLabels
export const ItemPropertyLabelsSchema = z.record(z.string(), z.string());

// entityActionsByTag — tag → action ID list
export const EntityActionsByTagSchema = z.record(z.string(), z.array(z.string()));

// entityActionLabels — action ID → 中文显示名
export const EntityActionLabelsSchema = z.record(z.string(), z.string());

// entityTagLabels — tag → 中文显示名
export const EntityTagLabelsSchema = z.record(z.string(), z.string());

// conversationDirections — 闲聊话题方向指导
export const ConversationDirectionSchema = z.object({
  key: z.string().min(1),
  instruction: z.string().min(1),
});

// questTemplates
export const QuestObjectiveConditionSchema = z.object({
  type: z.string().min(1),
  target: z
    .object({
      kind: z.enum(["npc", "room", "item", "entity", "none"]),
      id: z.string().min(1).optional(),
    })
    .optional(),
  params: z.record(z.string(), z.unknown()).optional(),
});

export const QuestObjectiveSchema = z
  .object({
    groupId: z.number().int().min(0),
    condition: QuestObjectiveConditionSchema,
    count: z.number().int().min(1),
    description: z.string(),
  })
  .superRefine((objective, ctx) => {
    for (const message of validateQuestObjectiveCondition(objective.condition)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message,
        path: ["condition"],
      });
    }
  });

export const QuestRewardSchema = z.object({
  narrative: z.string().optional(),
  traitModifiers: z.array(z.object({ trait: z.string(), delta: z.number() })).optional(),
  needChanges: z.array(z.object({ needType: z.string(), delta: z.number() })).optional(),
  relationDelta: z.object({ targetId: z.string(), delta: z.number() }).optional(),
  items: z
    .array(
      z.object({
        itemId: z.string(),
        quantity: z.number().int().min(1),
        name: z.string().optional(),
      }),
    )
    .optional(),
});

export const QuestAbandonPenaltySchema = z.object({
  relationDelta: z.object({ targetId: z.string(), delta: z.number() }).optional(),
  traitModifiers: z.array(z.object({ trait: z.string(), delta: z.number() })).optional(),
  needChanges: z.array(z.object({ needType: z.string(), delta: z.number() })).optional(),
});

export const MinRelationConditionSchema = z.object({
  npcId: z.string().min(1),
  minValue: z.number(),
});

export const TriggerConditionSchema = z.object({
  day: z.number().optional(),
  period: z.string().optional(),
  season: z.string().optional(),
  trait: z.string().optional(),
  value: z.number().optional(),
  operator: z.enum([">=", "<=", "==", "!="]).optional(),
  relationWith: z.string().optional(),
  eventType: z.string().optional(),
  action: z.string().optional(),
  targetId: z.string().optional(),
});

export const QuestAutoDiscoverSchema = z.object({
  triggerRoomId: z.string().optional(),
  triggerItemId: z.string().optional(),
  triggerText: z.string().optional(),
});

export const QuestStageSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  questIds: z.array(z.string()),
  completionCondition: z.enum(["all", "any"]),
  narrativeGuide: z.string(),
});

export const QuestAutoTriggerSchema = z.object({
  type: z.enum(["time", "trait", "relation", "world_event", "player_action"]),
  conditions: z.array(TriggerConditionSchema),
});

export const ClueDefinitionSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  knownByNpcIds: z.array(z.string()),
  relatedRoomId: z.string().optional(),
});

export const QuestTemplateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  giverNpcId: z.string().nullable(),
  objectives: z.array(QuestObjectiveSchema),
  rewards: QuestRewardSchema,
  repeatable: z.boolean(),
  deadlineDays: z.number().int().min(0).nullable(),
  prerequisites: z
    .object({
      conditions: z.array(z.union([z.string(), z.lazy(() => QuestPrerequisiteSchema)])),
      logic: z.enum(["and", "or"]),
    })
    .optional(),
  minRelation: MinRelationConditionSchema.optional(),
  autoDiscover: QuestAutoDiscoverSchema.optional(),
  autoTrigger: QuestAutoTriggerSchema.optional(),
  stages: z.array(QuestStageSchema).optional(),
  cooldownDays: z.number().int().min(0).optional(),
  abandonPenalty: QuestAbandonPenaltySchema.optional(),
});

// storylinConfig
export const StorylineConfigSchema = z.object({
  eventLookbackWindow: z.number().int().min(1),
});

// llmTriggerConfig
export const LLMTriggerConfigSchema = z.object({
  worldEvent: z.object({
    perSettlement: z.number().int().min(0),
    enabled: z.boolean(),
  }),
  memoryCompression: z.object({
    maxCandidates: z.number().int().min(0),
    minMemoriesToTrigger: z.number().int().min(0),
    enabled: z.boolean(),
  }),
  settlementGrowth: z.object({
    npcToRoomRatio: z.number().min(0),
    prosperityThreshold: z.number(),
    threatThreshold: z.number(),
    enabled: z.boolean(),
  }),
  contentPoolEvolve: z.object({
    checkDay: z.number().int().min(1),
    enabled: z.boolean(),
  }),
  narrativeDirection: z.object({
    intervalMonths: z.number().int().min(1),
    enabled: z.boolean(),
  }),
  culturalEvolution: z.object({
    adoptionThreshold: z.number().min(0).max(1),
    enabled: z.boolean(),
  }),
  discoveryGeneration: z.object({
    activityThreshold: z.number().min(0),
    enabled: z.boolean(),
  }),
  dialogueOptions: z.object({
    optionCount: z.number().int().min(1),
    enabled: z.boolean(),
  }),
});

// biome-ignore lint/suspicious/noExplicitAny: recursive zod self-reference requires any
export const QuestPrerequisiteSchema: z.ZodType<any> = z.object({
  conditions: z.array(z.union([z.string(), z.lazy(() => QuestPrerequisiteSchema)])),
  logic: z.enum(["and", "or"]),
});
