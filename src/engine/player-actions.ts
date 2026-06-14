/**
 * 玩家可执行动作的唯一数据源。
 *
 * 新增动作时，TS 会强制要求同步修改：
 * 1. 本数组
 * 2. command-executor.ts 的 switch（无 default 分支，缺 case 编译报错）
 * 3. capability-provider.ts 的 deriveCapabilities
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
