/**
 * @module 玩家动作注册 | PLAYER_ACTIONS 字典，定义 TUI 按钮与命令的映射
 */

export const PLAYER_ACTIONS = [
  "move",
  "talk",
  "wait",
  "rest",
  "look",
  "take",
  "drop",
  "use",
  "eat",
  "read",
  "say",
  "inventory",
  "status",
  "end_day",
  "attack",
  "flee",
  "defend",
  "equip",
  "unequip",
  "operate",
] as const;

export type PlayerAction = (typeof PLAYER_ACTIONS)[number];

export const PLAYER_ACTION_SET = new Set<string>(PLAYER_ACTIONS);

export function isPlayerAction(action: string): action is PlayerAction {
  return PLAYER_ACTION_SET.has(action);
}
