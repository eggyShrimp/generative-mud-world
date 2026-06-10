/**
 * 命令注册表
 *
 * 从 ContentPool.actionEffects 派生命令定义。
 * 不包含任何硬编码的动作效果。
 */

import type { ContentPool } from "../core/types.ts";
import { isPlayerAction } from "./player-actions.ts";

export interface CommandDef {
  action: string;
  needDeltas: Record<string, number>;
}

export function getCommandDefs(pool: ContentPool): CommandDef[] {
  return pool.actionEffects
    .filter((e) => isPlayerAction(e.action))
    .map((e) => ({ action: e.action, needDeltas: { ...e.needDeltas } }));
}

export function getCommandDef(pool: ContentPool, action: string): CommandDef | undefined {
  const effect = pool.actionEffects.find((e) => e.action === action);
  if (!effect || !isPlayerAction(effect.action)) return undefined;
  return { action: effect.action, needDeltas: { ...effect.needDeltas } };
}
