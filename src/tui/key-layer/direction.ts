import type { Capability } from "../../shared/protocol.ts";
import type { GameClient } from "../client/types.ts";

// ── Direction Key Map ──
// 键盘按键 → 游戏内方向值的映射。每个键对应中英文两个候选值。

export const DIRECTION_KEYS: Record<string, string[]> = {
  w: ["north", "北"],
  a: ["west", "西"],
  s: ["south", "南"],
  d: ["east", "东"],
  u: ["up", "上"],
  x: ["down", "下"],
};

// ── Helpers ──

export function findDirectionValue(capabilities: Capability[], key: string): string | null {
  const values = capabilities.find((c) => c.action === "move")?.params?.values ?? [];
  const candidates = DIRECTION_KEYS[key] ?? [];
  return candidates.find((v) => values.includes(v)) ?? null;
}

export function hasCapability(capabilities: Capability[], action: string): boolean {
  return capabilities.some((c) => c.action === action);
}

export function directionEnabled(key: string) {
  return (client: GameClient) => findDirectionValue(client.capabilities(), key) !== null;
}

export function capEnabled(action: string) {
  return (client: GameClient) => hasCapability(client.capabilities(), action);
}

export function makeDirectionHandler(key: string) {
  return (client: GameClient) => {
    const value = findDirectionValue(client.capabilities(), key);
    if (value) client.execute("move", { direction: value });
  };
}

export function directionKeyChar(direction: string): string {
  const KEY_HINTS: Record<string, string> = {
    w: "W",
    a: "A",
    s: "S",
    d: "D",
    u: "U",
    x: "X",
  };
  const entry = Object.entries(DIRECTION_KEYS).find(([, vals]) => vals.includes(direction));
  return entry ? (KEY_HINTS[entry[0]] ?? direction) : direction;
}
