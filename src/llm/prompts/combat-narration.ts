/**
 * 战斗叙述生成器
 *
 * LLM 角色：根据战斗事件数据生成叙述文本
 * 边界：不决定战斗结果（结果由规则引擎计算），只负责文本生成
 */
export function buildCombatNarrationPrompt(
  events: Array<{
    attacker: string;
    defender: string;
    damage: number;
    hitType: "normal" | "critical" | "miss";
    defenderHpAfter: number;
  }>,
): { system: string; user: string } {
  return {
    system: `你是武侠风格战斗的叙述生成器。根据战斗事件数据，为每个事件生成简短的叙述文本。

规则：
- 每个事件 1-2 句话，描述攻击动作和结果
- 武侠风格：刀光剑影、内力、身法等
- critical 时描述要害命中或内力爆发
- miss 时描述闪避或格挡
- damage 为 0 时表示完全格挡或闪避
- 不要改变战斗结果，只描述已发生的事实
- 输出 JSON 数组，不要用 markdown 代码块包裹

输出格式：
[
  {"narration": "叙述文本"}
]`,
    user: JSON.stringify(events, null, 2),
  };
}
