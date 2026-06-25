/**
 * @module ContentPool 演化物化器 | 将 ContentPoolMutation 应用到 ContentPool，实现 LLM 驱动的世界演化
 */

import { writeEvolveDeltas } from "../core/content-pool-loader.ts";
import type { ContentPool, ContentPoolMutation } from "../core/types.ts";
import { logWrite } from "../shared/log.ts";

// ============================================================
// ContentPoolMaterializer: 将 LLM 产出应用到 ContentPool
// 规则层，不调LLM。验证 + 合并。
// ============================================================

export function applyContentPoolMutation(
  pool: ContentPool,
  mutation: ContentPoolMutation,
  poolDir?: string,
): string[] {
  const log: string[] = [];

  if (mutation.addActionEffects) {
    for (const eff of mutation.addActionEffects) {
      const exists = pool.actionEffects.find((e) => e.action === eff.action);
      if (exists) {
        Object.assign(exists.needDeltas, eff.needDeltas);
        log.push(`更新动作效果: ${eff.action}`);
      } else {
        pool.actionEffects.push(eff);
        log.push(`新动作效果: ${eff.action}`);
      }
    }
  }

  if (mutation.addScheduleTemplates) {
    for (const tmpl of mutation.addScheduleTemplates) {
      const exists = pool.scheduleTemplates.find((t) => t.role === tmpl.role);
      if (exists) {
        exists.schedule = tmpl.schedule;
        log.push(`更新调度: ${tmpl.role}`);
      } else {
        pool.scheduleTemplates.push(tmpl);
        log.push(`新调度: ${tmpl.role}`);
      }
    }
  }

  if (mutation.addBookContents) {
    for (const book of mutation.addBookContents) {
      const index = pool.bookContents.findIndex(
        (candidate) => candidate.id === book.id || candidate.itemTemplateId === book.itemTemplateId,
      );
      if (index >= 0) {
        pool.bookContents[index] = book;
        log.push(`更新书籍内容: ${book.id}`);
      } else {
        pool.bookContents.push(book);
        log.push(`新书籍内容: ${book.id}`);
      }
    }
  }

  if (mutation.addRoomTemplates) {
    for (const tmpl of mutation.addRoomTemplates) {
      const exists = pool.roomTemplates.find((t) => t.culture === tmpl.culture);
      if (exists) {
        exists.rooms = tmpl.rooms;
        exists.names = tmpl.names;
        exists.personalities = tmpl.personalities;
        log.push(`更新探索模板: ${tmpl.culture}`);
      } else {
        pool.roomTemplates.push(tmpl);
        log.push(`新探索模板: ${tmpl.culture}`);
      }
    }
  }

  if (mutation.addNamePools) {
    for (const np of mutation.addNamePools) {
      const exists = pool.namePools.find((n) => n.culture === np.culture);
      if (exists) {
        Object.assign(exists, np);
        log.push(`更新命名池: ${np.culture}`);
      } else {
        pool.namePools.push(np);
        log.push(`新命名池: ${np.culture}`);
      }
    }
  }

  if (mutation.replaceNarrativeTemplates) {
    // Only overwrite non-empty values
    const newTemplates = mutation.replaceNarrativeTemplates;
    for (const [key, value] of Object.entries(newTemplates)) {
      if (value !== undefined && value !== null && value !== "") {
        // biome-ignore lint/suspicious/noExplicitAny: dynamic field assignment on NarrativeTemplates
        (pool.narrativeTemplates as any)[key] = value;
      }
    }
    log.push("更新叙事模板");
  }

  if (mutation.replaceCalendar) {
    Object.assign(pool.calendar, mutation.replaceCalendar);
    log.push("更新日历");
  }

  if (mutation.replaceDayNightConfig) {
    pool.dayNightConfig = mutation.replaceDayNightConfig;
    log.push("更新昼夜配置");
  }

  if (mutation.replaceSeasonConfig) {
    pool.seasonConfig = mutation.replaceSeasonConfig;
    log.push("更新季节配置");
  }

  if (mutation.replaceWeatherConfig) {
    pool.weatherConfig = mutation.replaceWeatherConfig;
    log.push("更新天气配置");
  }

  if (mutation.replaceWarmthComfortConfig) {
    pool.warmthComfortConfig = mutation.replaceWarmthComfortConfig;
    log.push("更新保暖舒适配置");
  }

  if (mutation.replaceNeedLabels) {
    Object.assign(pool.needLabels, mutation.replaceNeedLabels);
    log.push("更新需求标签");
  }

  if (mutation.replaceTraitLabels) {
    Object.assign(pool.traitLabels, mutation.replaceTraitLabels);
    log.push("更新特质标签");
  }

  if (mutation.replaceItemPropertyLabels) {
    Object.assign(pool.itemPropertyLabels, mutation.replaceItemPropertyLabels);
    log.push("更新物品属性标签");
  }

  if (mutation.replaceCombatConfig) {
    Object.assign(pool.combatConfig, mutation.replaceCombatConfig);
    log.push("更新战斗配置");
  }

  if (mutation.addCombatSkills) {
    for (const skill of mutation.addCombatSkills) {
      const exists = pool.combatSkills.find((s) => s.id === skill.id);
      if (exists) {
        Object.assign(exists, skill);
        log.push(`更新战斗技能: ${skill.id}`);
      } else {
        pool.combatSkills.push(skill);
        log.push(`新战斗技能: ${skill.id}`);
      }
    }
  }

  if (mutation.replaceEntityActionsByTag) {
    Object.assign(pool.entityActionsByTag, mutation.replaceEntityActionsByTag);
    log.push("更新实体动作标签");
  }

  if (mutation.replaceEntityActionLabels) {
    Object.assign(pool.entityActionLabels, mutation.replaceEntityActionLabels);
    log.push("更新实体动作名标签");
  }

  if (mutation.replaceEntityTagLabels) {
    Object.assign(pool.entityTagLabels, mutation.replaceEntityTagLabels);
    log.push("更新实体标签名");
  }

  if (mutation.addQuestTemplates) {
    for (const q of mutation.addQuestTemplates) {
      const exists = pool.questTemplates.find((t) => t.id === q.id);
      if (exists) {
        Object.assign(exists, q);
        log.push(`更新任务模板: ${q.id}`);
      } else {
        pool.questTemplates.push(q);
        log.push(`新任务模板: ${q.id}`);
      }
    }
  }

  if (mutation.replaceSocialRippleConfig) {
    Object.assign(pool.socialRippleConfig, mutation.replaceSocialRippleConfig);
    log.push("更新社交涟漪配置");
  }

  if (mutation.replaceDialogueEffectMapping) {
    Object.assign(pool.dialogueEffectMapping, mutation.replaceDialogueEffectMapping);
    log.push("更新对话效果映射");
  }

  if (mutation.replaceEmotionLabels) {
    Object.assign(pool.emotionLabels, mutation.replaceEmotionLabels);
    log.push("更新情绪标签");
  }

  if (mutation.replaceLlmTriggerConfig) {
    Object.assign(pool.llmTriggerConfig, mutation.replaceLlmTriggerConfig);
    log.push("更新LLM触发配置");
  }

  if (mutation.addClueDefinitions?.length) {
    for (const clue of mutation.addClueDefinitions) {
      const exists = pool.clueDefinitions.find((c) => c.id === clue.id);
      if (exists) {
        Object.assign(exists, clue);
        log.push(`更新线索定义: ${clue.id}`);
      } else {
        pool.clueDefinitions.push(clue);
        log.push(`新增线索定义: ${clue.id}`);
      }
    }
  }

  if (mutation.replaceTerrainConfig) {
    pool.terrainConfig = mutation.replaceTerrainConfig;
    log.push("更新地形配置");
  }

  // 持久化到 evolve YAML (如果有 poolDir)
  if (poolDir && log.length > 0) {
    writeEvolveDeltas(poolDir, mutation, pool);
    logWrite("srv", "info", `ContentPool evolve persisted: ${poolDir}/evolve/`);
    for (const msg of log) {
      logWrite("srv", "info", `[ContentPoolMaterializer] ${msg}`);
    }
  }

  return log;
}
