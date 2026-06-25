import type { NeedChange } from "./delta.ts";
import type { EntityId, RoomId, TravelogueEntry } from "./entity.ts";

export interface DailyReport {
  playerId: EntityId;
  round: number;
  date: string;
  summary: string;
  statusChanges: NeedChange[];
  encounters: Encounter[];
  worldNews: string[];
  availableLocations: RoomId[];
  notableNPCs: { id: EntityId; name: string; relation: number }[];
  travelogue?: TravelogueEntry;
}

export interface Encounter {
  id: string;
  type: "dialogue" | "choice" | "event";
  npcId?: EntityId;
  npcName?: string;
  trigger: string;
  context: Record<string, unknown>;
  resolved: boolean;
}
