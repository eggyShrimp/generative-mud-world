/**
 * @module ContentPool LLM 演化工具 | LLM 通过 tool_calls 提议 ContentPool 变更的接口
 */

import { listQuestObjectiveDefinitions } from "../../core/quest-objective-registry.ts";
import type { ToolDefinition } from "../adapter.ts";
import { ADD_NPC_TOOL, CREATE_ROOM_TOOL } from "./room-mutation.ts";

export const SETTLEMENT_GROWTH_TOOLS: ToolDefinition[] = [CREATE_ROOM_TOOL, ADD_NPC_TOOL];

const QUEST_OBJECTIVE_DEFINITIONS = listQuestObjectiveDefinitions();
const QUEST_OBJECTIVE_TYPES = QUEST_OBJECTIVE_DEFINITIONS.map((definition) => definition.type);
const QUEST_OBJECTIVE_DESCRIPTION = QUEST_OBJECTIVE_DEFINITIONS.map(
  (definition) =>
    `${definition.type}=${definition.llmSchemaHint.description}，target.kind=${definition.llmSchemaHint.targetKind}`,
).join("; ");

export const ADD_ACTION_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "add_action",
    description: "向内容池添加一种新的行为效果",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "行为标识" },
        needDeltas: {
          type: "object",
          description: "对各需求的影响值",
          additionalProperties: { type: "number" },
        },
      },
      required: ["action", "needDeltas"],
    },
  },
};

export const ADD_SCHEDULE_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "add_schedule",
    description: "向内容池添加一种新的角色日程模板",
    parameters: {
      type: "object",
      properties: {
        role: { type: "string", description: "角色标识" },
        schedule: {
          type: "array",
          items: {
            type: "object",
            properties: {
              startHour: { type: "number", minimum: 0, maximum: 23 },
              endHour: { type: "number", minimum: 0, maximum: 23 },
              action: { type: "string" },
              priority: { type: "number", minimum: 0 },
              deviationAllowed: { type: "boolean" },
            },
            required: ["startHour", "endHour", "action", "priority", "deviationAllowed"],
          },
        },
      },
      required: ["role", "schedule"],
    },
  },
};

export const ADD_BOOK_CONTENT_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "add_book_content",
    description: "向内容池添加或更新一本可阅读物品对应的书籍内容",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "书籍内容稳定 ID" },
        itemTemplateId: { type: "string", description: "关联的可阅读物品模板 ID" },
        title: { type: "string", description: "阅读器标题" },
        pages: {
          type: "array",
          description:
            "书内正文的分页文本。每页应是玩家实际读到的正文，不是第三方介绍；建议每页 300-600 个中文字符。",
          items: { type: "string", minLength: 120 },
          minItems: 1,
        },
      },
      required: ["id", "itemTemplateId", "title", "pages"],
    },
  },
};

export const ADD_QUEST_TEMPLATE_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "add_quest_template",
    description:
      "向内容池添加或更新一个任务模板。任务必须引用已有 NPC/房间/物品 ID，具备多步骤目标、与世界观一致的叙事描述和合理的奖励。避免生成仅有单一 talk 目标的浅层任务。",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "任务模板唯一 ID，如 quest_mogao_cipher" },
        title: { type: "string", description: "任务标题，应具有叙事吸引力" },
        description: {
          type: "string",
          description:
            "任务描述，说明背景与动机，用 2-4 句交代为什么 NPC 需要玩家、事成或事败的后果",
        },
        giverNpcId: {
          type: "string",
          nullable: true,
          description: "发布任务的 NPC ID；若为 null 表示自动发现任务",
        },
        objectives: {
          type: "array",
          description:
            "任务目标列表。每个 groupId 相同的目标属于同一完成组（组内至少完成一项即视为该组完成）。应混合使用多种目标类型以增加玩法深度，避免全 talk 链。",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              groupId: { type: "integer", minimum: 0, description: "所属目标组 ID" },
              condition: {
                type: "object",
                description: `目标条件。可用类型：${QUEST_OBJECTIVE_DESCRIPTION}`,
                properties: {
                  type: {
                    type: "string",
                    enum: QUEST_OBJECTIVE_TYPES,
                    description: "目标条件类型，必须使用注册表公开的类型",
                  },
                  target: {
                    type: "object",
                    properties: {
                      kind: {
                        type: "string",
                        enum: ["npc", "room", "item", "entity", "none"],
                        description: "目标 ID 的种类，必须与 condition.type 的说明一致",
                      },
                      id: {
                        type: "string",
                        description: "目标 NPC ID / 房间 ID / 物品 templateId / 实体 ID",
                      },
                    },
                    required: ["kind", "id"],
                  },
                  params: {
                    type: "object",
                    additionalProperties: true,
                    description: "目标类型的扩展参数；没有需要时省略",
                  },
                },
                required: ["type", "target"],
              },
              count: { type: "integer", minimum: 1, description: "所需次数" },
              description: { type: "string", description: "目标文本描述" },
            },
            required: ["groupId", "condition", "count", "description"],
          },
        },
        rewards: {
          type: "object",
          description: "任务完成奖励",
          properties: {
            narrative: { type: "string", description: "任务完成时的叙事文本，交代结局和后果" },
            traitModifiers: {
              type: "array",
              description: "玩家性格特质变化",
              items: {
                type: "object",
                properties: { trait: { type: "string" }, delta: { type: "integer" } },
                required: ["trait", "delta"],
              },
            },
            needChanges: {
              type: "array",
              description: "玩家需求值变化 (hunger/safety/social/rest)",
              items: {
                type: "object",
                properties: { needType: { type: "string" }, delta: { type: "integer" } },
                required: ["needType", "delta"],
              },
            },
            relationDelta: {
              type: "object",
              description: "与某 NPC 的关系变化",
              properties: { targetId: { type: "string" }, delta: { type: "integer" } },
              required: ["targetId", "delta"],
            },
            items: {
              type: "array",
              description: "奖励物品列表",
              items: {
                type: "object",
                properties: {
                  itemId: { type: "string" },
                  name: { type: "string" },
                  quantity: { type: "integer", minimum: 1 },
                },
                required: ["itemId", "name", "quantity"],
              },
            },
          },
        },
        repeatable: { type: "boolean", description: "是否可重复完成", default: false },
        deadlineDays: {
          type: "integer",
          nullable: true,
          minimum: 1,
          description: "完成期限（游戏内天数），null 为无期限",
        },
        prerequisites: {
          type: "object",
          description: "前置任务条件",
          properties: {
            conditions: { type: "array", items: {}, description: "前置 quest ID 列表或嵌套条件" },
            logic: { type: "string", enum: ["and", "or"], description: "条件逻辑" },
          },
          required: ["conditions", "logic"],
        },
        minRelation: {
          type: "object",
          description: "触发此任务所需的最小 NPC 好感度",
          properties: { npcId: { type: "string" }, minValue: { type: "integer" } },
          required: ["npcId", "minValue"],
        },
        autoDiscover: {
          type: "object",
          description:
            "自动发现条件（giverNpcId 为 null 且此处有值时，玩家进入对应房间或持有对应物品时自动发现）",
          properties: {
            triggerRoomId: { type: "string", description: "触发自动发现的房间 ID" },
            triggerItemId: { type: "string", description: "触发自动发现的物品 ID" },
            triggerText: { type: "string", description: "触发时展示的叙事文本" },
          },
        },
        autoTrigger: {
          type: "object",
          description: "自动触发条件（满足条件时自动激活，无需手动接受）",
          properties: {
            type: {
              type: "string",
              enum: ["time", "trait", "relation", "world_event", "player_action"],
            },
            conditions: { type: "array", items: { type: "object" } },
          },
          required: ["type", "conditions"],
        },
        stages: {
          type: "array",
          description: "多阶段剧情线（用于 Storyline 类型任务，非 Storyline 任务留空）",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              questIds: { type: "array", items: { type: "string" } },
              completionCondition: { type: "string", enum: ["all", "any"] },
              narrativeGuide: { type: "string" },
            },
            required: ["id", "title", "questIds", "completionCondition", "narrativeGuide"],
          },
        },
        cooldownDays: { type: "integer", minimum: 1, description: "冷却天数" },
        abandonPenalty: {
          type: "object",
          description: "放弃任务的惩罚",
          properties: {
            relationDelta: {
              type: "object",
              properties: { targetId: { type: "string" }, delta: { type: "integer" } },
              required: ["targetId", "delta"],
            },
            traitModifiers: {
              type: "array",
              items: {
                type: "object",
                properties: { trait: { type: "string" }, delta: { type: "integer" } },
                required: ["trait", "delta"],
              },
            },
            needChanges: {
              type: "array",
              items: {
                type: "object",
                properties: { needType: { type: "string" }, delta: { type: "integer" } },
                required: ["needType", "delta"],
              },
            },
          },
        },
      },
      required: [
        "id",
        "title",
        "description",
        "giverNpcId",
        "objectives",
        "rewards",
        "repeatable",
        "deadlineDays",
      ],
    },
  },
};

export const ADD_CLUE_DEFINITION_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "add_clue_definition",
    description: "向内容池添加一条新的世界线索定义，NPC 可在对话中分享此线索给玩家",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "线索稳定 ID，如 cave_17_secret" },
        description: {
          type: "string",
          description: "线索的自然语言描述，NPC 在对话中引用此线索时使用",
        },
        knownByNpcIds: {
          type: "array",
          items: { type: "string" },
          description: "知道此线索的 NPC ID 列表",
          minItems: 1,
        },
        relatedRoomId: {
          type: "string",
          description: "线索关联的房间 ID（可选）",
        },
      },
      required: ["id", "description", "knownByNpcIds"],
    },
  },
};

const DAY_NIGHT_CONFIG_PARAMETERS = {
  type: "object",
  properties: {
    periods: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        properties: {
          id: { type: "string", minLength: 1 },
          startHour: { type: "integer", minimum: 0, maximum: 23 },
          label: { type: "string", minLength: 1 },
          visibilityModifier: { type: "number", exclusiveMinimum: 0, maximum: 1 },
        },
        required: ["id", "startHour", "label", "visibilityModifier"],
      },
    },
  },
  required: ["periods"],
};

const SEASON_CONFIG_PARAMETERS = {
  type: "object",
  properties: {
    seasons: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        properties: {
          id: { type: "string", minLength: 1 },
          name: { type: "string", minLength: 1 },
          months: {
            type: "array",
            minItems: 1,
            items: { type: "integer", minimum: 1, maximum: 12 },
          },
          label: { type: "string", minLength: 1 },
          comfortTemp: { type: "number" },
          needDecayMultiplier: { type: "number", exclusiveMinimum: 0 },
          narrativePrefix: { type: "string" },
        },
        required: [
          "id",
          "name",
          "months",
          "label",
          "comfortTemp",
          "needDecayMultiplier",
          "narrativePrefix",
        ],
      },
    },
  },
  required: ["seasons"],
};

const WEATHER_CONFIG_PARAMETERS = {
  type: "object",
  properties: {
    weatherTypes: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        properties: {
          id: { type: "string", minLength: 1 },
          label: { type: "string", minLength: 1 },
          movementMultiplier: { type: "number", exclusiveMinimum: 0 },
          visibilityMultiplier: { type: "number", exclusiveMinimum: 0, maximum: 1 },
          narrativeDesc: { type: "string" },
          availableInSeasons: {
            type: "array",
            minItems: 1,
            items: { type: "string", minLength: 1 },
          },
          weight: { type: "number", exclusiveMinimum: 0 },
        },
        required: [
          "id",
          "label",
          "movementMultiplier",
          "visibilityMultiplier",
          "narrativeDesc",
          "availableInSeasons",
          "weight",
        ],
      },
    },
  },
  required: ["weatherTypes"],
};

const WARMTH_COMFORT_CONFIG_PARAMETERS = {
  type: "object",
  properties: {
    baselineTemp: { type: "number" },
    maxIdealWarmth: { type: "number", minimum: 0 },
    minIdealWarmth: { type: "number", minimum: 0 },
    penaltyPerWarmthPoint: { type: "number", exclusiveMinimum: 0 },
  },
  required: ["baselineTemp", "maxIdealWarmth", "minIdealWarmth", "penaltyPerWarmthPoint"],
};

export const REPLACE_DAY_NIGHT_CONFIG_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "replace_day_night_config",
    description: "整体替换昼夜时段配置。必须保留完整 periods 列表，startHour 为 0-23。",
    parameters: DAY_NIGHT_CONFIG_PARAMETERS,
  },
};

export const REPLACE_SEASON_CONFIG_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "replace_season_config",
    description: "整体替换季节配置。月份必须在 1-12，衰减系数必须为正数。",
    parameters: SEASON_CONFIG_PARAMETERS,
  },
};

export const REPLACE_WEATHER_CONFIG_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "replace_weather_config",
    description: "整体替换天气池配置。权重、移动系数和可见度系数必须为正数。",
    parameters: WEATHER_CONFIG_PARAMETERS,
  },
};

export const REPLACE_WARMTH_COMFORT_CONFIG_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "replace_warmth_comfort_config",
    description: "整体替换保暖舒适公式参数。maxIdealWarmth 不得小于 minIdealWarmth。",
    parameters: WARMTH_COMFORT_CONFIG_PARAMETERS,
  },
};

export const CONTENT_POOL_EVOLVE_TOOLS: ToolDefinition[] = [
  ADD_QUEST_TEMPLATE_TOOL,
  ADD_ACTION_TOOL,
  ADD_SCHEDULE_TOOL,
  ADD_BOOK_CONTENT_TOOL,
  ADD_CLUE_DEFINITION_TOOL,
  REPLACE_DAY_NIGHT_CONFIG_TOOL,
  REPLACE_SEASON_CONFIG_TOOL,
  REPLACE_WEATHER_CONFIG_TOOL,
  REPLACE_WARMTH_COMFORT_CONFIG_TOOL,
];
