import { getQuestInteractionsForEntity } from "../../core/quest-utils.ts";
import type { EntityId, NPCEntity, PlayerEntity, WorldState } from "../../core/types.ts";
import type { DialogueOption } from "../../shared/protocol.ts";
import { isNpc, makeContinueOption } from "./helpers.ts";

export function getFunctionalActions(
  world: WorldState,
  npc: NPCEntity,
): Array<{ actionId: string; label: string }> {
  const tags = npc.tags ?? [];
  const seen = new Set<string>();
  const result: Array<{ actionId: string; label: string }> = [];
  for (const tag of tags) {
    const actions = world.contentPool.entityActionsByTag[tag] ?? [];
    for (const actionId of actions) {
      if (seen.has(actionId)) continue;
      seen.add(actionId);
      result.push({
        actionId,
        label: world.contentPool.entityActionLabels[actionId] ?? actionId,
      });
    }
  }
  return result;
}

export function getFunctionalLabel(world: WorldState, npc: NPCEntity): string {
  const tags = npc.tags ?? [];
  for (const tag of tags) {
    const label = world.contentPool.entityTagLabels[tag];
    if (label) return label;
  }
  return "功能";
}

export function generateFixedChatMenu(
  world: WorldState,
  playerId: EntityId,
  npcId: EntityId,
): DialogueOption[] {
  const player = world.entities.get(playerId);
  const npc = world.entities.get(npcId);
  if (!player || !isNpc(npc)) return [];

  const options: DialogueOption[] = [];

  const functionalActions = getFunctionalActions(world, npc);
  if (functionalActions.length > 0) {
    options.push(
      makeContinueOption("menu:functional", getFunctionalLabel(world, npc), "functional_menu"),
    );
  }

  if (player.type === "player") {
    const interactions = getQuestInteractionsForEntity(world, player as PlayerEntity, npc.id);
    for (const interaction of interactions) {
      if (!interaction.isPending) continue;
      options.push(
        makeContinueOption(
          interaction.optionId,
          interaction.objectiveDescription,
          interaction.optionType,
          {
            tag: "quest",
            meta: {
              questId: interaction.questId,
              objectiveIndex: interaction.objectiveIndex,
            },
          },
        ),
      );
    }
  }

  return options;
}
