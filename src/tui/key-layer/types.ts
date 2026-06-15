import type { GameClient } from "../client/types.ts";

export interface KeyBinding {
  key: string | string[];
  action?: string;
  labelAction?: string;
  params?: Record<string, unknown>;
  handler?: (client: GameClient, keyName: string) => void;
  label: string;
  color?: string;
  group?: "direction" | "room-action" | "global" | "entity-select";
  enabled?: (client: GameClient) => boolean;
}

export interface KeyLayer {
  id: string;
  priority: number;
  passthrough?: boolean;
  bindings: KeyBinding[];
}
