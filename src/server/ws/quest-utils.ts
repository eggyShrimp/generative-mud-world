import type { ActiveQuest, QuestTemplate } from "../../core/types.ts";
import type { QuestInfo } from "../../shared/protocol.ts";

export function enrichQuests(quests: ActiveQuest[], templates: QuestTemplate[]): QuestInfo[] {
  return quests.map((aq) => {
    const tpl = templates.find((t) => t.id === aq.templateId);
    if (!tpl) {
      return {
        templateId: aq.templateId,
        title: aq.templateId,
        description: "",
        status: aq.status,
        acceptedDay: aq.acceptedDay,
        deadlineDay: aq.deadlineDay,
        objectives: [],
      };
    }
    return {
      templateId: tpl.id,
      title: tpl.title,
      description: tpl.description,
      status: aq.status,
      acceptedDay: aq.acceptedDay,
      deadlineDay: aq.deadlineDay,
      objectives: tpl.objectives.map((obj, i) => ({
        groupId: obj.groupId,
        type: obj.condition.type,
        count: obj.count,
        current: aq.objectiveProgress[i] ?? 0,
        description: obj.description,
        completed: aq.groupCompleted[obj.groupId] ?? false,
      })),
      giverNpcId: tpl.giverNpcId ?? undefined,
      narrative: aq.status === "completed" ? tpl.rewards.narrative : undefined,
    };
  });
}
