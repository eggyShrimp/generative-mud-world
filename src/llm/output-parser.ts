import type { NeedType, SimulationDelta } from "../core/types.ts";

export function parseWorldEventOutput(text: string): SimulationDelta | null {
  try {
    // 尝试从 LLM 输出中提取 JSON
    const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) ?? text.match(/(\{[\s\S]*\})/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[1] ?? jsonMatch[0]);

    if (parsed.event) {
      const e = parsed.event;
      return {
        worldEvents: [
          {
            id: `llm_${Date.now()}`,
            type: e.type ?? "world_event",
            title: e.title ?? "",
            description: e.description ?? "",
            scope: e.scope ?? "global",
            tick: 0,
            source: "llm",
            data: { rumor_seed: e.rumor_seed, duration_days: e.duration_days },
          },
        ],
        needChanges: (e.effects ?? [])
          .filter((fx: Record<string, unknown>) => fx.need_change)
          .flatMap((fx: Record<string, unknown>) =>
            Object.entries(fx.need_change as Record<string, number>).map(([k, v]) => ({
              targetId: fx.target,
              needType: k as unknown as NeedType,
              delta: v as number,
            })),
          ),
        traitModifiers: (e.effects ?? [])
          .filter((fx: Record<string, unknown>) => fx.trait_modifier)
          .flatMap((fx: Record<string, unknown>) =>
            Object.entries(fx.trait_modifier as Record<string, number>).map(([k, v]) => ({
              targetId: fx.target,
              trait: k,
              delta: v as number,
            })),
          ),
        relationChanges: (e.effects ?? [])
          .filter((fx: Record<string, unknown>) => fx.relation_change)
          .map((fx: Record<string, unknown>) => ({
            fromId: fx.target,
            toId: (fx.relation_change as Record<string, unknown>).target,
            delta: (fx.relation_change as Record<string, unknown>).delta,
          })),
      };
    }

    return null;
  } catch {
    return null;
  }
}

// 解析记忆压缩输出
export function parseMemoryCompressionOutput(text: string): SimulationDelta | null {
  try {
    const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) ?? text.match(/(\{[\s\S]*\})/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[1] ?? jsonMatch[0]);

    if (parsed.insights) {
      const modifiers = parsed.insights
        .filter(
          (i: Record<string, unknown>) =>
            i.effect && (i.effect as Record<string, unknown>).trait_modifier,
        )
        .flatMap((i: Record<string, unknown>) =>
          Object.entries(
            (i.effect as Record<string, unknown>).trait_modifier as Record<string, number>,
          ).map(([k, v]) => ({
            trait: k,
            delta: v as number,
          })),
        );

      return { traitModifiers: modifiers };
    }

    return null;
  } catch {
    return null;
  }
}
