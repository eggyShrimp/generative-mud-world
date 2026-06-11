import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";
import { logWrite } from "../shared/log.ts";
import {
  ActionEffectSchema,
  CalendarConfigSchema,
  CombatConfigSchema,
  CombatSkillSchema,
  ConversationDirectionSchema,
  DialogueEffectMappingSchema,
  EmotionLabelsSchema,
  EntityActionLabelsSchema,
  EntityActionsByTagSchema,
  EntityTagLabelsSchema,
  ItemPropertyLabelsSchema,
  ItemTemplateSchema,
  LLMTriggerConfigSchema,
  NamePoolSchema,
  NarrativeTemplatesSchema,
  NeedActionMappingSchema,
  NeedDefinitionSchema,
  NeedLabelsSchema,
  QuestTemplateSchema,
  RoleScheduleTemplateSchema,
  RoomTemplatePoolSchema,
  SocialRippleConfigSchema,
  StorylineConfigSchema,
  TerrainConfigSchema,
  TraitLabelsSchema,
} from "./schemas/index.ts";
import type { ContentPool, ContentPoolMutation } from "./types";
import { validateWithSchema } from "./validate.ts";
import { createDefaultContentPool } from "./world";

// ============================================================
// ContentPoolLoader: 从 YAML 目录加载 ContentPool
//
// 加载顺序 (3 层 deep-merge):
//   1. createDefaultContentPool() — 硬编码兜底
//   2. worlds/content-pool/*.yaml — 基础数据 (手写/设计师维护)
//   3. worlds/content-pool/evolve/*.yaml — LLM 演化增量 (重启可恢复)
// ============================================================

// 每个 YAML 文件包含的 ContentPool 字段
const DOMAIN_FIELDS: Record<string, (keyof ContentPool)[]> = {
  "needs-actions": ["needDefinitions", "actionEffects", "needActionMap", "itemTemplates"],
  schedules: ["scheduleTemplates", "behaviorAtoms"],
  "social-dialogue": [
    "dialogueEffectMapping",
    "socialRippleConfig",
    "narrativeTemplates",
    "emotionLabels",
    "needLabels",
    "traitLabels",
    "itemPropertyLabels",
    "conversationDirections",
  ],
  "culture-narrative": ["namePools", "narrativeTemplates", "calendar"],
  "room-templates": ["roomTemplates"],
  triggers: ["llmTriggerConfig"],
  terrain: ["terrainConfig"],
  combat: ["combatConfig", "combatSkills"],
  "entity-actions": ["entityActionsByTag", "entityActionLabels", "entityTagLabels"],
  quests: ["questTemplates"],
  storyline: ["storylineConfig"],
};

// 每个域名对应每个字段的 zod schema (用于加载时校验)
const DOMAIN_SCHEMAS: Record<string, Record<string, unknown>> = {
  "needs-actions": {
    needDefinitions: z.array(NeedDefinitionSchema),
    actionEffects: z.array(ActionEffectSchema),
    needActionMap: z.array(NeedActionMappingSchema),
    itemTemplates: z.array(ItemTemplateSchema),
  },
  schedules: {
    scheduleTemplates: z.array(RoleScheduleTemplateSchema),
  },
  "social-dialogue": {
    dialogueEffectMapping: DialogueEffectMappingSchema,
    socialRippleConfig: SocialRippleConfigSchema,
    emotionLabels: EmotionLabelsSchema,
    needLabels: NeedLabelsSchema,
    traitLabels: TraitLabelsSchema,
    itemPropertyLabels: ItemPropertyLabelsSchema,
    conversationDirections: z.array(ConversationDirectionSchema),
  },
  "culture-narrative": {
    namePools: z.array(NamePoolSchema),
    narrativeTemplates: NarrativeTemplatesSchema,
    calendar: CalendarConfigSchema,
  },
  "room-templates": {
    roomTemplates: z.array(RoomTemplatePoolSchema),
  },
  terrain: {
    terrainConfig: TerrainConfigSchema,
  },
  triggers: {
    llmTriggerConfig: LLMTriggerConfigSchema,
  },
  combat: {
    combatConfig: CombatConfigSchema,
    combatSkills: z.array(CombatSkillSchema),
  },
  "entity-actions": {
    entityActionsByTag: EntityActionsByTagSchema,
    entityActionLabels: EntityActionLabelsSchema,
    entityTagLabels: EntityTagLabelsSchema,
  },
  quests: {
    questTemplates: z.array(QuestTemplateSchema),
  },
  storyline: {
    storylineConfig: StorylineConfigSchema,
  },
};

/**
 * 交叉字段一致性校验：entityActionsByTag 中引用的每个动作必须在 actionEffects 中存在条目
 * 门禁级别 — 不通过直接抛错，拒绝加载
 */
function validateActionEffectsConsistency(pool: ContentPool): void {
  const validActions = new Set(pool.actionEffects.map((e) => e.action));
  const violations: string[] = [];

  for (const [tag, actions] of Object.entries(pool.entityActionsByTag)) {
    for (const action of actions) {
      if (!validActions.has(action)) {
        violations.push(`entityActionsByTag["${tag}"] 中的 "${action}" 在 actionEffects 中不存在`);
      }
    }
  }

  if (violations.length > 0) {
    throw new Error(
      `ContentPool 交叉字段一致性校验失败 — 以下 room action 缺少 actionEffects 条目:\n${violations.map((v) => `  - ${v}`).join("\n")}`,
    );
  }
}

/**
 * 从 YAML 目录加载 ContentPool
 * @param poolDir worlds/content-pool/ 目录路径
 * @returns 合并后的 ContentPool
 */
export function loadContentPoolFromDir(poolDir: string): ContentPool {
  const defaults = createDefaultContentPool();
  let nBase = 0;
  let nEvolve = 0;

  // 2. 基础 YAML
  const baseDir = poolDir;
  if (existsSync(baseDir)) {
    for (const file of listYamlFiles(baseDir)) {
      const name = basename(file, ".yaml");
      if (name === "evolve") continue;
      const data = loadYamlFile(file, true);
      if (data) {
        applyYamlToContentPool(defaults, name, data);
        logWrite("srv", "info", `[ContentPoolLoader]   loaded base: ${basename(file)} → ${name}`);
        nBase++;
      }
    }
  }

  // 3. evolve YAML
  const evolveDir = join(poolDir, "evolve");
  if (existsSync(evolveDir)) {
    for (const file of listYamlFiles(evolveDir)) {
      const data = loadYamlFile(file);
      if (data) {
        applyYamlToContentPool(defaults, basename(file, ".yaml"), data);
        logWrite(
          "srv",
          "info",
          `[ContentPoolLoader]   loaded evolve: ${basename(file)} → ${basename(file, ".yaml")}`,
        );
        nEvolve++;
      }
    }
  }

  // 4. 交叉字段一致性校验（门禁）
  validateActionEffectsConsistency(defaults);

  logWrite("srv", "info", `[ContentPoolLoader] Loading from: ${poolDir}`);
  logWrite(
    "srv",
    "info",
    `[ContentPoolLoader] Done: ${nBase} base + ${nEvolve} evolve YAML files loaded`,
  );
  logWrite(
    "srv",
    "info",
    `ContentPool loaded: ${nBase} base + ${nEvolve} evolve YAML files from ${poolDir}`,
  );

  return defaults;
}

/**
 * 从单个 YAML 文件加载 ContentPool
 * @param poolPath worlds/content-pool/ 目录路径
 * @returns 合并后的 ContentPool
 */
export function loadContentPool(poolPath: string): ContentPool {
  return loadContentPoolFromDir(poolPath);
}

/**
 * 将 ContentPoolMutation 写回 evolve YAML (增量持久化)
 * 只写受影响的字段，不影响基础 YAML
 */
export function writeEvolveDeltas(
  poolDir: string,
  mutation: ContentPoolMutation,
  currentPool: ContentPool,
): void {
  const evolveDir = join(poolDir, "evolve");
  if (!existsSync(evolveDir)) {
    mkdirSync(evolveDir, { recursive: true });
  }

  // 按 domain 聚合受影响的字段
  const affectedDomains = new Map<string, Record<string, unknown>>();

  if (mutation.addNeedDefinitions?.length || mutation.addActionEffects?.length) {
    affectedDomains.set("needs-actions", {
      needDefinitions: currentPool.needDefinitions,
      actionEffects: currentPool.actionEffects,
      needActionMap: currentPool.needActionMap,
    });
  }

  if (mutation.addScheduleTemplates?.length) {
    affectedDomains.set("schedules", {
      scheduleTemplates: currentPool.scheduleTemplates,
      behaviorAtoms: currentPool.behaviorAtoms,
    });
  }

  if (mutation.addNamePools?.length) {
    affectedDomains.set("culture-narrative", {
      namePools: currentPool.namePools,
    });
  }

  if (mutation.replaceNarrativeTemplates) {
    const existing = affectedDomains.get("culture-narrative") ?? {};
    affectedDomains.set("culture-narrative", {
      ...existing,
      narrativeTemplates: currentPool.narrativeTemplates,
    });
  }

  if (mutation.replaceCalendar) {
    const existing = affectedDomains.get("culture-narrative") ?? {};
    affectedDomains.set("culture-narrative", {
      ...existing,
      calendar: currentPool.calendar,
    });
  }

  if (mutation.addRoomTemplates?.length) {
    affectedDomains.set("room-templates", {
      roomTemplates: currentPool.roomTemplates,
    });
  }

  if (
    mutation.replaceNeedLabels ||
    mutation.replaceTraitLabels ||
    mutation.replaceItemPropertyLabels ||
    mutation.replaceSocialRippleConfig ||
    mutation.replaceDialogueEffectMapping ||
    mutation.replaceEmotionLabels
  ) {
    const existing = affectedDomains.get("social-dialogue") ?? {};
    affectedDomains.set("social-dialogue", {
      ...existing,
      ...(mutation.replaceNeedLabels ? { needLabels: currentPool.needLabels } : {}),
      ...(mutation.replaceTraitLabels ? { traitLabels: currentPool.traitLabels } : {}),
      ...(mutation.replaceItemPropertyLabels
        ? { itemPropertyLabels: currentPool.itemPropertyLabels }
        : {}),
      ...(mutation.replaceSocialRippleConfig
        ? { socialRippleConfig: currentPool.socialRippleConfig }
        : {}),
      ...(mutation.replaceDialogueEffectMapping
        ? { dialogueEffectMapping: currentPool.dialogueEffectMapping }
        : {}),
      ...(mutation.replaceEmotionLabels ? { emotionLabels: currentPool.emotionLabels } : {}),
    });
  }

  if (mutation.replaceCombatConfig || mutation.addCombatSkills?.length) {
    affectedDomains.set("combat", {
      combatConfig: currentPool.combatConfig,
      combatSkills: currentPool.combatSkills,
    });
  }

  if (mutation.replaceLlmTriggerConfig) {
    affectedDomains.set("triggers", {
      llmTriggerConfig: currentPool.llmTriggerConfig,
    });
  }

  if (mutation.replaceTerrainConfig) {
    affectedDomains.set("terrain", {
      terrainConfig: currentPool.terrainConfig,
    });
  }

  if (mutation.addQuestTemplates?.length) {
    affectedDomains.set("quests", {
      questTemplates: currentPool.questTemplates,
    });
  }

  if (
    mutation.replaceEntityActionsByTag ||
    mutation.replaceEntityActionLabels ||
    mutation.replaceEntityTagLabels
  ) {
    const existing = affectedDomains.get("entity-actions") ?? {};
    affectedDomains.set("entity-actions", {
      ...existing,
      ...(mutation.replaceEntityActionsByTag
        ? { entityActionsByTag: currentPool.entityActionsByTag }
        : {}),
      ...(mutation.replaceEntityActionLabels
        ? { entityActionLabels: currentPool.entityActionLabels }
        : {}),
      ...(mutation.replaceEntityTagLabels ? { entityTagLabels: currentPool.entityTagLabels } : {}),
    });
  }

  // 写入 evolve YAML
  for (const [domain, data] of affectedDomains) {
    const filePath = join(evolveDir, `${domain}.yaml`);
    const header = `# LLM 演化增量 — ${domain}\n# 自动生成，重启时合并到 ContentPool\n\n`;
    writeFileSync(filePath, header + stringifyYamlValue(data), "utf-8");
    logWrite("srv", "info", `[ContentPoolLoader] wrote evolve: ${filePath}`);
    logWrite("srv", "info", `ContentPool evolve: wrote ${filePath}`);
  }

  if (affectedDomains.size === 0) {
    logWrite("srv", "info", "[ContentPoolLoader] no evolve deltas to write (empty mutation)");
  }
}

// --- 内部工具函数 ---

function listYamlFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .map((f) => join(dir, f));
}

function loadYamlFile(path: string, strict = false): Record<string, unknown> | null {
  try {
    const raw = readFileSync(path, "utf-8");
    const data = parseYaml(raw);
    return typeof data === "object" && data !== null ? (data as Record<string, unknown>) : null;
  } catch (err) {
    if (strict) {
      throw new Error(`[ContentPoolLoader] YAML 解析失败: ${path} — ${String(err)}`);
    }
    logWrite("srv", "warn", `[ContentPoolLoader] Failed to parse YAML: ${path} — ${String(err)}`);
    return null;
  }
}

/**
 * 将 YAML 数据的字段 deep-merge 到 ContentPool
 * - 对象字段: 递归合并
 * - 数组字段: 直接替换
 * - 基本类型: 直接替换
 */
function applyYamlToContentPool(
  pool: ContentPool,
  domainName: string,
  data: Record<string, unknown>,
): void {
  const fields = DOMAIN_FIELDS[domainName];
  if (!fields) return;

  const schemas = DOMAIN_SCHEMAS[domainName] ?? {};

  for (const field of fields) {
    if (!(field in data)) continue;
    let yamlValue = data[field as string];
    const poolValue = pool[field];

    if (yamlValue === null || yamlValue === undefined) continue;

    // Schema 校验 (只对数组字段严格校验，对象字段是 partial 深合并，跳过)
    const fieldSchema = schemas[field as string];
    if (fieldSchema && Array.isArray(yamlValue)) {
      const result = validateWithSchema(
        fieldSchema as Parameters<typeof validateWithSchema>[0],
        yamlValue,
        `${domainName}.${field}`,
        "throw",
      );
      // 使用校验后的数据 (有默认值填充)
      yamlValue = result.data;
    }

    if (Array.isArray(yamlValue)) {
      // 数组字段: 直接替换
      // biome-ignore lint/suspicious/noExplicitAny: dynamic field assignment on ContentPool
      (pool as any)[field] = yamlValue;
    } else if (
      typeof yamlValue === "object" &&
      typeof poolValue === "object" &&
      poolValue !== null
    ) {
      // 对象字段: deep-merge
      deepMergeObject(poolValue as Record<string, unknown>, yamlValue as Record<string, unknown>);
    } else {
      // 基本类型: 直接替换
      // biome-ignore lint/suspicious/noExplicitAny: dynamic field assignment on ContentPool
      (pool as any)[field] = yamlValue;
    }
  }
}

/**
 * 递归合并 source 到 target (mutates target)
 */
function deepMergeObject(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const [key, sourceVal] of Object.entries(source)) {
    const targetVal = target[key];
    if (
      typeof sourceVal === "object" &&
      sourceVal !== null &&
      !Array.isArray(sourceVal) &&
      typeof targetVal === "object" &&
      targetVal !== null &&
      !Array.isArray(targetVal)
    ) {
      deepMergeObject(targetVal as Record<string, unknown>, sourceVal as Record<string, unknown>);
    } else {
      target[key] = sourceVal;
    }
  }
}

function stringifyYamlValue(data: Record<string, unknown>): string {
  return stringifyYaml(data, { indent: 2 });
}
