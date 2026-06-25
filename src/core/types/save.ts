import type { WeatherState } from "./environment.ts";

export interface SaveMeta {
  slotId: string;
  worldId: string;
  savedAt: number;
  gameTick: number;
  round: number;
}

export interface ConversationSummaryEntry {
  summary: string;
  lastTick: number;
}

export interface SaveData {
  version: 1;
  meta: SaveMeta;
  conversations: {
    summaries: Record<string, ConversationSummaryEntry[]>;
  };
  weatherByRegion: Record<string, WeatherState>;
}
