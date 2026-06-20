import type { Accessor, Setter } from "solid-js";
import type { CommandEvent, EntityState } from "../../shared/protocol.ts";
import type { CombatLogEntry } from "./game-client.ts";

export interface CombatDeps {
  entity: Accessor<EntityState | null>;
  combatLog: Setter<CombatLogEntry[]>;
  combatRound: Accessor<number>;
  setCombatRound: Setter<number>;
  setSelectedEntityId: (id: string | null) => void;
  hasActiveRequest: () => boolean;
  pushEvents: (events: CommandEvent[]) => void;
  pushLayer: (id: string) => void;
  popLayer: (id: string) => void;
  execute: (action: string, params?: Record<string, unknown>) => void;
}

export interface CombatSystem {
  combatLog: Setter<CombatLogEntry[]>;
  combatRound: Accessor<number>;
  startCombat: (targetId: string, targetName: string) => void;
  endCombat: () => void;
  checkCombatEnd: () => void;
  ensureCombatTimer: () => void;
  pushCombatLog: (events: CommandEvent[], round: number) => void;
  /** cleanup — clears timer, usable as connect/disconnect cleanup */
  destroy: () => void;
}

export function createCombatSystem(deps: CombatDeps): CombatSystem {
  let combatTargetId: string | null = null;
  let combatTimer: ReturnType<typeof setInterval> | null = null;

  const endCombat = () => {
    combatTargetId = null;
    deps.popLayer("combat");
    if (combatTimer) {
      clearInterval(combatTimer);
      combatTimer = null;
    }
  };

  const sendAutoAttack = () => {
    if (!combatTargetId || deps.hasActiveRequest()) return;
    const ent = deps.entity();
    if (!ent?.combatState) return;
    if (ent.combatState.isIncapacitated || !ent.combatState.combatTarget) {
      endCombat();
      return;
    }
    deps.setCombatRound((r) => r + 1);
    deps.execute("attack", { targetId: combatTargetId });
  };

  const ensureCombatTimer = () => {
    if (combatTimer) clearInterval(combatTimer);
    combatTimer = setInterval(sendAutoAttack, 1200);
  };

  const startCombat = (targetId: string, targetName: string) => {
    combatTargetId = targetId;
    deps.setCombatRound(0);
    deps.setSelectedEntityId(null);
    deps.pushLayer("combat");
    deps.combatLog([]);
    deps.pushEvents([{ type: "system", description: `\u2694 进入战斗！对手：${targetName}` }]);
    ensureCombatTimer();
  };

  const checkCombatEnd = () => {
    const ent = deps.entity();
    if (!ent?.combatState) return;
    if (ent.combatState.isIncapacitated) {
      deps.pushEvents([{ type: "combat_defeat", description: "你倒下了……" }]);
      endCombat();
      return;
    }
    if (!ent.combatState.combatTarget) {
      deps.pushEvents([{ type: "combat_victory", description: "战斗结束！" }]);
      endCombat();
      return;
    }
  };

  const pushCombatLog = (events: CommandEvent[], round: number) => {
    const entries = events
      .filter((e) => e.type && (e.type.startsWith("combat_") || e.type === "defend"))
      .map((e) => ({ round, type: e.type, description: e.description }));
    if (entries.length > 0) {
      deps.combatLog((prev) => [...prev, ...entries]);
    }
  };

  const destroy = () => {
    combatTargetId = null;
    if (combatTimer) {
      clearInterval(combatTimer);
      combatTimer = null;
    }
  };

  return {
    combatLog: deps.combatLog,
    combatRound: deps.combatRound,
    startCombat,
    endCombat,
    checkCombatEnd,
    ensureCombatTimer,
    pushCombatLog,
    destroy,
  };
}
